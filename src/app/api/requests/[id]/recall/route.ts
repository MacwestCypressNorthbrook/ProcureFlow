import { query, queryOne } from '@/lib/db'
import { getUserFromSession } from '@/lib/auth/server'
import { checkRecall, MIN_RECALL_REASON } from '@/lib/recall'
import { STAGES, statusForStage } from '@/lib/workflow'
import { createNotification } from '@/lib/notifications'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { NextResponse } from 'next/server'

/** Stages whose send-back also sends the purchase order back (mirrors the transition route). */
const PO_SEND_BACK_STAGES = new Set(['cost_control', 'admin', 'finance'])

/**
 * Recall a decision that moved a requisition forward, before the next stage
 * acts on it. Where it lands depends on what is recalled — see lib/recall.ts.
 *
 * The eligibility check is repeated inside the single statement that performs
 * the recall (status, updated_at and "no later trail rows" are all in its
 * WHERE), because Neon's HTTP driver cannot hold a transaction open across a
 * read and a write. If the next stage acted in between, nothing is written and
 * the caller gets a 409.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromSession()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const limit = await rateLimit(`recall:${user.id}`, { max: 20, windowSeconds: 60 })
  if (!limit.ok) return tooManyRequests('Too many recalls at once. Give it a moment.', limit.retryAfter)

  const { id } = await params

  let body: { reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const reason = body.reason?.trim() ?? ''
  if (reason.length < MIN_RECALL_REASON) {
    return NextResponse.json(
      { error: `Give a reason of at least ${MIN_RECALL_REASON} characters — it is recorded and sent to the next stage.` },
      { status: 400 }
    )
  }

  const check = await checkRecall(id, user)
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 409 })
  const c = check.candidate

  const po = await queryOne<{ id: string }>(
    `SELECT id FROM public.purchase_orders WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [id]
  )

  // Where the requisition lands.
  const landing = c.restoresSentBack
    ? { status: 'sent_back', sentBackTo: c.fromStage as string | null, returnTo: c.heldBy as string | null }
    : { status: statusForStage(c.fromStage) as string, sentBackTo: null, returnTo: null }

  // And its purchase order, following the same rules the forward moves used.
  let poChange: { status: string; sentBackTo: string | null; returnTo: string | null } | null = null
  if (po) {
    if (c.action === 'resubmitted' && PO_SEND_BACK_STAGES.has(c.heldBy)) {
      // The send-back being restored had sent the PO back too.
      poChange = { status: 'sent_back', sentBackTo: c.fromStage, returnTo: c.heldBy }
    } else if (c.action === 'approved' && c.fromStage === 'cost_control') {
      // Cost Control's approval moved the PO to awaiting final sign-off.
      poChange = { status: 'pending_cost_control', sentBackTo: null, returnTo: null }
    }
  }

  const rows = await query<{ id: string }>(
    `WITH approval AS (
       SELECT created_at, performed_by FROM public.request_approvals WHERE id = $8
     ),
     last_send_back AS (
       SELECT performed_by, created_at
         FROM public.request_approvals
        WHERE request_id = $1 AND action = 'sent_back'
        ORDER BY created_at DESC
        LIMIT 1
     ),
     r AS (
       UPDATE public.requests
          SET status          = $2,
              sent_back_to    = $3,
              return_to_stage = $4,
              -- A restored send-back keeps who sent it and when; a recalled
              -- submission is "sent back" by the requester themself, now.
              sent_back_by    = CASE WHEN $3::text IS NULL THEN NULL
                                     WHEN $9::boolean THEN (SELECT performed_by FROM last_send_back)
                                     ELSE $5::uuid END,
              sent_back_at    = CASE WHEN $3::text IS NULL THEN NULL
                                     WHEN $9::boolean THEN (SELECT created_at FROM last_send_back)
                                     ELSE now() END,
              is_urgent        = CASE WHEN $10::boolean THEN false ELSE is_urgent END,
              urgent_reason    = CASE WHEN $10::boolean THEN NULL ELSE urgent_reason END,
              urgent_marked_by = CASE WHEN $10::boolean THEN NULL ELSE urgent_marked_by END,
              urgent_marked_at = CASE WHEN $10::boolean THEN NULL ELSE urgent_marked_at END,
              updated_at      = now()
        WHERE id = $1
          AND status = $6
          AND updated_at::text = $7
          AND NOT EXISTS (
                SELECT 1
                  FROM public.request_approvals x, approval a
                 WHERE x.request_id = $1
                   AND x.created_at > a.created_at
                   AND NOT (x.action = 'edited' AND x.performed_by = a.performed_by)
              )
       RETURNING id
     ),
     -- A forward approval may be waiting in the next stage's email digest;
     -- they should not be emailed about something no longer theirs.
     d AS (
       DELETE FROM public.stage_digest_queue
        WHERE request_id = $1 AND stage = $11 AND EXISTS (SELECT 1 FROM r)
     ),
     p AS (
       UPDATE public.purchase_orders
          SET status = $12, sent_back_to = $13, return_to_stage = $14, updated_at = now()
        WHERE $12::text IS NOT NULL AND id = $15::uuid AND EXISTS (SELECT 1 FROM r)
     )
     INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
     SELECT $1, $15::uuid, $16, 'recalled', $5::uuid, $17 FROM r
     RETURNING id`,
    [
      id, // $1
      landing.status, // $2
      landing.sentBackTo, // $3
      landing.returnTo, // $4
      user.id, // $5
      c.expectedStatus, // $6
      c.seenUpdatedAt, // $7
      c.approvalId, // $8
      c.action === 'resubmitted', // $9 restore the original send-back's author/time
      c.action === 'marked_urgent', // $10 clear the urgent flag
      c.heldBy, // $11
      poChange?.status ?? null, // $12
      poChange?.sentBackTo ?? null, // $13
      poChange?.returnTo ?? null, // $14
      po?.id ?? null, // $15
      c.fromStage, // $16
      reason, // $17
    ]
  )

  if (rows.length === 0) {
    return NextResponse.json(
      { error: `${STAGES[c.heldBy].label} acted on it a moment ago, so it was not recalled. Refresh to see where it stands.` },
      { status: 409 }
    )
  }

  // Tell the stage that lost it — it may already be open in their queue. In-app
  // only, except for an urgent escalation: that was emailed to them instantly,
  // so its withdrawal is emailed too, or they will drop everything for nothing.
  const who = user.name || user.email
  const req = await queryOne<{ purpose: string; created_by: string | null }>(
    `SELECT purpose, created_by FROM public.requests WHERE id = $1`,
    [id]
  )
  const purpose = req?.purpose ?? 'A requisition'
  const holders = await query<{ id: string }>(
    `SELECT id FROM public.users
      WHERE role = ANY($1::text[])
        AND COALESCE(is_active, true)
        AND auth_id NOT LIKE 'pending:%'
        AND id <> $2`,
    [STAGES[c.heldBy].roles, user.id]
  )
  const urgent = c.action === 'marked_urgent'
  await Promise.all(
    holders.map((h) =>
      createNotification({
        userId: h.id,
        title: urgent ? 'Urgent escalation withdrawn' : `Recalled by ${STAGES[c.fromStage].label}`,
        message: `"${purpose}" was recalled by ${who} and is no longer waiting on you. Reason: ${reason}`,
        type: 'info',
        link: STAGES[c.heldBy].route(id),
        sendEmailAlert: urgent,
      })
    )
  )

  if (c.fromStage !== 'requester' && req?.created_by && req.created_by !== user.id) {
    await createNotification({
      userId: req.created_by,
      title: urgent ? 'Urgent escalation withdrawn' : `Recalled by ${STAGES[c.fromStage].label}`,
      message: `"${purpose}" is back with ${STAGES[c.fromStage].label}. Reason: ${reason}`,
      type: 'info',
      link: `/minta/requests/${id}`,
      sendEmailAlert: false,
    })
  }

  return NextResponse.json({ success: true, status: landing.status })
}
