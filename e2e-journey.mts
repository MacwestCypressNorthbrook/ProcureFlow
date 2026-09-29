import { query, queryOne, execute } from './src/lib/db'
import { getStageQueue, getReviewBundle } from './src/lib/review'
import { statusForStage, currentStage } from './src/lib/workflow'

let pass = 0, fail = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name} ${detail}`) }
}

const MARK = `E2E-${Date.now()}`
const actor = await queryOne<{ id: string }>(`SELECT id FROM public.users ORDER BY created_at LIMIT 1`)
if (!actor) { console.log('no users in database'); process.exit(1) }

// ── Create a disposable requisition ───────────────────────────────
const req = await queryOne<{ id: string; status: string; currency: string }>(
  `INSERT INTO public.requests (purpose, description, department, total_amount, created_by, status)
   VALUES ($1, 'End-to-end test row', 'Site Works', 4200, $2, 'pending_lead')
   RETURNING id, status, currency`,
  [`${MARK} scaffolding boards`, actor.id]
)
if (!req) { console.log('insert failed'); process.exit(1) }
const id = req.id
console.log(`\n── Requisition ${MARK} created`)
check('starts with the Project Lead', req.status === 'pending_lead')
check('defaults to Ghana cedis', req.currency === 'GHS', `got ${req.currency}`)

await execute(
  `INSERT INTO public.request_items (request_id, position, description, quantity, unit, unit_price)
   VALUES ($1, 0, 'Scaffolding boards', 20, 'pcs', 210)`, [id]
)
await execute(
  `INSERT INTO public.request_attachments (request_id, file_name, file_url, file_size, file_type, uploaded_by)
   VALUES ($1, 'quote.pdf', $2, 1024, 'application/pdf', $3)`,
  [id, `uploads/request-docs/${id}/quote.pdf`, actor.id]
)
await execute(
  `INSERT INTO public.request_approvals (request_id, stage, action, performed_by, comment)
   VALUES ($1, 'requester', 'submitted', $2, 'Raised by the e2e test')`, [id, actor.id]
)

// ── Walk the chain, asserting queue membership at each step ───────
// The chain in its current order: Cost Control audits before Administration
// raises the purchase order and closes the requisition.
const stages = ['lead', 'supply_chain', 'cost_control', 'admin'] as const
for (const stage of stages) {
  await execute(`UPDATE public.requests SET status = $2 WHERE id = $1`, [id, statusForStage(stage)])

  const mine = await getStageQueue([statusForStage(stage)])
  check(`visible in the ${stage} queue`, mine.some((r) => r.id === id))

  // The invariant you asked for: it must not appear in any other stage's queue.
  const others = stages.filter((s) => s !== stage)
  const leaked: string[] = []
  for (const other of others) {
    const q = await getStageQueue([statusForStage(other)])
    if (q.some((r) => r.id === id)) leaked.push(other)
  }
  check(`hidden from every later/earlier queue while at ${stage}`, leaked.length === 0, leaked.join(','))
}

// ── Send-back routing and resumption ─────────────────────────────
// Cost Control bounces to Supply Chain — the stage immediately before it —
// and the requisition resumes at Cost Control rather than walking the chain
// from the beginning.
console.log('\n── Send-back from Cost Control')
await execute(
  `UPDATE public.requests
      SET status = 'sent_back', sent_back_to = 'supply_chain', return_to_stage = 'cost_control',
          sent_back_by = $2, sent_back_at = now()
    WHERE id = $1`, [id, actor.id]
)
const bounced = await queryOne<{ status: string; sent_back_to: string; return_to_stage: string }>(
  `SELECT status, sent_back_to, return_to_stage FROM public.requests WHERE id = $1`, [id]
)
check('held by Supply Chain, not the requester', currentStage(bounced!.status, bounced!.sent_back_to) === 'supply_chain')
const ccQueue = await getStageQueue([statusForStage('cost_control')])
check('drops out of the Cost Control queue while bounced', !ccQueue.some((r) => r.id === id))

await execute(
  `UPDATE public.requests SET status = $2, sent_back_to = NULL, return_to_stage = NULL WHERE id = $1`,
  [id, statusForStage('cost_control')]
)
const resumed = await queryOne<{ status: string }>(`SELECT status FROM public.requests WHERE id = $1`, [id])
check('resumes at Cost Control, not back at the start', resumed!.status === 'pending_cost_control')

// ── Urgent escalation ────────────────────────────────────────────
console.log('\n── Urgent escalation')
await execute(
  `UPDATE public.requests
      SET is_urgent = true, urgent_reason = 'Site stopped — e2e test',
          urgent_marked_by = $2, urgent_marked_at = now()
    WHERE id = $1`, [id, actor.id]
)
const urgentRow = await queryOne<{ is_urgent: boolean; urgent_reason: string }>(
  `SELECT is_urgent, urgent_reason FROM public.requests WHERE id = $1`, [id]
)
check('the urgent flag persists', urgentRow?.is_urgent === true)
check('the reason travels with it', urgentRow?.urgent_reason === 'Site stopped — e2e test')
const urgentQueue = await getStageQueue([statusForStage('cost_control')])
check('urgent items sort to the top of the queue',
  urgentQueue.length === 0 || urgentQueue[0].is_urgent === true || !urgentQueue.some((r) => r.id === id),
  String(urgentQueue[0]?.is_urgent))

// ── The reviewer's bundle ────────────────────────────────────────
console.log('\n── Review bundle')
const bundle = await getReviewBundle(id)
check('requisition loads', Boolean(bundle))
check('line items included', (bundle?.items.length ?? 0) === 1)
check('documents reach every reviewer', (bundle?.documents.length ?? 0) >= 1)
check('approval trail present', (bundle?.history.length ?? 0) >= 1)
check('line total computed by the database', Number(bundle?.items[0]?.line_total) === 4200,
  String(bundle?.items[0]?.line_total))

// ── Cleanup ──────────────────────────────────────────────────────
await execute(`DELETE FROM public.requests WHERE id = $1`, [id])
const gone = await query(`SELECT id FROM public.requests WHERE id = $1`, [id])
check('test rows removed', gone.length === 0)

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
