/**
 * Notification scope.
 *
 * The rule: a stage hears about a requisition when it ARRIVES at that stage,
 * and not before. Cost Control is the fourth stage and Administration the
 * fifth, so neither should be told anything while a requisition is still with
 * the Project Lead or Supply Chain.
 *
 * This asserts the rule against the real user table, resolving recipients the
 * same way the routes do, so a stage being added or moved cannot quietly widen
 * who gets mailed.
 */
import { query } from './src/lib/db'
import { STAGES, STAGE_ORDER, nextStage, type Stage } from './src/lib/workflow'
import { normalizeRole } from './src/lib/roles'

let pass = 0, fail = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${detail}`) }
}

/** Exactly what `notifyStage` and the dispatcher's role fan-out resolve to. */
async function recipientsForStage(stage: Stage): Promise<Set<string>> {
  const rows = await query<{ id: string; role: string | null }>(
    `SELECT id, role FROM public.users
      WHERE role = ANY($1::text[])
        AND COALESCE(is_active, true)
        AND auth_id NOT LIKE 'pending:%'`,
    [STAGES[stage].roles]
  )
  return new Set(rows.map((r) => normalizeRole(r.role) ?? '').filter(Boolean))
}

console.log('\n── Each stage notifies only its own holders')
for (const stage of STAGE_ORDER) {
  const got = await recipientsForStage(stage)
  const expected = new Set(STAGES[stage].roles)
  const extra = [...got].filter((r) => !expected.has(r as never))
  check(
    `${STAGES[stage].label} notifies ${[...expected].join(', ')}`,
    extra.length === 0,
    `leaked to ${extra.join(', ')}`
  )
}

console.log('\n── Cost Control and Administration stay out of the early chain')
const early: Stage[] = ['requester', 'lead', 'supply_chain']
for (const stage of early) {
  const got = await recipientsForStage(stage)
  check(`${STAGES[stage].label} does not notify Cost Control`, !got.has('cost_control'))
  check(`${STAGES[stage].label} does not notify the Administrator`, !got.has('administrator'))
}

console.log('\n── …and are reached exactly when the chain gets to them')
const ccRecipients = await recipientsForStage('cost_control')
check('Cost Control is notified at its own stage', ccRecipients.has('cost_control'))
const adminRecipients = await recipientsForStage('admin')
check('Administration is notified at its own stage', adminRecipients.has('administrator'))
check('Administration is not notified at Cost Control', !ccRecipients.has('administrator'))
check('Cost Control is not notified at Administration', !adminRecipients.has('cost_control'))

console.log('\n── A new requisition reaches the first reviewer only')
const first = nextStage('requester')!
const onSubmit = await recipientsForStage(first)
check(`a submission goes to the ${STAGES[first].label}`, onSubmit.has('project_lead'))
check('a submission does not go to Cost Control', !onSubmit.has('cost_control'))
check('a submission does not go to the Administrator', !onSubmit.has('administrator'))
check('a submission does not go to Supply Chain', !onSubmit.has('supply_chain'))
check('a submission does not go to Finance', !onSubmit.has('finance'))

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
