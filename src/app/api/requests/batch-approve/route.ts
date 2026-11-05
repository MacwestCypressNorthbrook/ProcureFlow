import { query, transaction } from '@/lib/db'
import { getUserFromSession } from '@/lib/auth/server'
import { STAGES, canActAt, nextStage, statusForStage, type Stage } from '@/lib/workflow'
import { createNotification, enqueueStageDigest } from '@/lib/notifications'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { NextResponse } from 'next/server'

/** Stages whose approval has no checks beyond "is it still with me", so a batch is safe. */
const BATCHABLE: Stage[] = ['lead']

/** One click, one email digest — a reviewer clearing a backlog, not a bulk import. */
const MAX_BATCH = 50

/** Where the next stage works its queue, for a notification covering several requisitions. */
const QUEUE_HREF: Partial<Record<Stage, string>> = { supply_chain: '/mintah/queue' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Approve several requisitions at the Project Lead stage with one comment.
 *
 * The Lead's review is a judgement ("is this justified on site?") with no
 * pricing, PO or invoice rules attached, which is what makes it batchable;
 * other stages keep their one-at-a-time checks in the transition route.
 *
 * Only requisitions freshly waiting on the Lead qualify. One sent BACK to the
 * Lead carries a question for them and must be opened; an urgent one has
 * already been escalated past them. Each approval moves the requisition only
 * if it is still at the Lead's status, in the same statement that records it,
 * so a requisition someone else acted on meanwhile is skipped rather than
 * approved twice.
 */
export async function POST(request: Request) {
  const user = await getUserFromSession()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const limit = await rateLimit(`batch-approve:${user.id}`, { max: 10, windowSeconds: 60 })
  if (!limit.ok) return tooManyRequests('Too many batch approvals at once. Give it a moment.', limit.retryAfter)

  let body: { ids?: unknown; comment?: unknown; stage?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const stage = (typeof body.stage === 'string' ? body.stage : 'lead') as Stage
  if (!BATCHABLE.includes(stage)) {
    return NextResponse.json({ error: `${STAGES[stage]?.label ?? 'This stage'} approves one requisition at a time.` }, { status: 400 })
  }
  if (!canActAt(user.role, stage)) {
    return NextResponse.json({ error: `Only ${STAGES[stage].label} can approve these.` }, { status: 403 })
  }

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((v): v is string => typeof v === 'string' && UUID.test(v)))]
    : []
  if (ids.length === 0) return NextResponse.json({ error: 'Select at least one requisition.' }, { status: 400 })
  if (ids.length > MAX_BATCH) {
    return NextResponse.json({ error: `Approve at most ${MAX_BATCH} at a time.` }, { status: 400 })
  }
  const comment = typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim().slice(0, 2000) : null

  const onward = nextStage(stage)!
  const fromStatus = statusForStage(stage)
  const toStatus = statusForStage(onward)

  // One statement per requisition: it moves only if still waiting at this
  // stage and not urgent, and the approval row is written from what moved.
  type Moved = { id: string; purpose: string; created_by: string | null }
  const results = await transaction<Moved>(
    ids.map(
      (id) =>
        [
          `WITH moved AS (
             UPDATE public.requests
                SET status = $2, sent_back_to = NULL, return_to_stage = NULL, updated_at = now()
              WHERE id = $1 AND status = $3 AND COALESCE(is_urgent, false) = false
              RETURNING id, purpose, created_by
           ), recorded AS (
             INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
             SELECT m.id,
                    (SELECT po.id FROM public.purchase_orders po WHERE po.request_id = m.id ORDER BY po.created_at DESC LIMIT 1),
                    $4, 'approved', $5, $6
               FROM moved m
           )
           SELECT id, purpose, created_by FROM moved`,
          [id, toStatus, fromStatus, stage, user.id, comment],
        ] as [string, unknown[]]
    )
  )

  const approved = results.map((rows) => rows?.[0]).filter((r): r is Moved => Boolean(r))
  const approvedIds = new Set(approved.map((r) => r.id))
  const skipped = ids.filter((id) => !approvedIds.has(id))

  if (approved.length > 0) {
    const by = `${STAGES[stage].label} (${user.name || user.email})`
    const note = comment ? ` Note: ${comment}` : ''

    // The next stage hears once in-app, not once per requisition, and its
    // email comes through the stage digest exactly as single approvals do.
    const holders = await query<{ id: string }>(
      `SELECT id FROM public.users
        WHERE role = ANY($1::text[]) AND COALESCE(is_active, true) AND auth_id NOT LIKE 'pending:%'`,
      [STAGES[onward].roles]
    )
    const single = approved.length === 1 ? approved[0] : null
    await Promise.all([
      ...holders.map((h) =>
        createNotification({
          userId: h.id,
          title: single
            ? `Requisition awaiting ${STAGES[onward].label}`
            : `${approved.length} requisitions awaiting ${STAGES[onward].label}`,
          message: single
            ? `"${single.purpose}" was approved by ${by} and is now with you.${note}`
            : `${by} approved ${approved.length} requisitions and they are now with you.${note}`,
          type: 'approval',
          link: single ? STAGES[onward].route(single.id) : QUEUE_HREF[onward],
        })
      ),
      ...approved.map((r) => enqueueStageDigest(onward, r.id, user.id)),
      ...approved
        .filter((r) => r.created_by)
        .map((r) =>
          createNotification({
            userId: r.created_by!,
            title: `Approved by ${STAGES[stage].label}`,
            message: `"${r.purpose}" cleared ${STAGES[stage].label} and moved to ${STAGES[onward].label}.${note}`,
            type: 'success',
            link: `/minta/requests/${r.id}`,
          })
        ),
    ])
  }

  return NextResponse.json({
    success: true,
    approved: approved.length,
    skipped: skipped.length,
    skippedIds: skipped,
    stage: onward,
  })
}
