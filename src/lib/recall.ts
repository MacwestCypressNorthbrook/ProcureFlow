import { query } from '@/lib/db'
import { isElevated } from '@/lib/roles'
import { currentStage, nextStage, statusForStage, STAGES, type Stage } from '@/lib/workflow'

/**
 * Recalling a decision that moved a requisition forward.
 *
 * Whoever moved it on may pull it back while the next stage has not touched it
 * yet. Once that stage does anything at all (approves, sends it back, edits a
 * line, saves pricing, attaches a PO) the requisition is theirs and a recall is
 * refused. A completed requisition is never recalled: closing it is reversed by
 * a Void (see `cancellation.ts`), which also handles its POs.
 *
 * What can be recalled, and where it lands:
 *
 * | Trail action    | By                 | Lands back as                                   |
 * |-----------------|--------------------|-------------------------------------------------|
 * | `approved`      | a reviewer         | `pending_<their stage>` — every option open      |
 * | `marked_urgent` | the Project Lead   | `pending_lead`, urgent flag cleared             |
 * | `submitted`     | the requester      | sent back to the requester (edit + resubmit)    |
 * | `resubmitted`   | whoever resubmitted| sent back to them again, exactly as before      |
 *
 * The rules live here so the API that enforces them and the pages that decide
 * whether to show the button cannot drift apart.
 */

/** Trail actions that hand a requisition forward and can therefore be recalled. */
export const RECALLABLE_ACTIONS = ['approved', 'marked_urgent', 'submitted', 'resubmitted'] as const
type RecallableAction = (typeof RECALLABLE_ACTIONS)[number]

export const MIN_RECALL_REASON = 10

export interface RecallCandidate {
  requestId: string
  /** The trail row being recalled. */
  approvalId: string
  approvalAt: string
  action: RecallableAction
  /** The stage that acted and gets the requisition back. */
  fromStage: Stage
  /** The stage that currently holds it and loses it. */
  heldBy: Stage
  /** The status the requisition must still be in for the recall to apply. */
  expectedStatus: string
  /** `requests.updated_at::text` as read — the write is refused if it has moved. */
  seenUpdatedAt: string
  /**
   * Returns to a "sent back" state (submission / resubmission) rather than to
   * the recaller's own pending queue (approval / urgent escalation).
   */
  restoresSentBack: boolean
}

export type RecallCheck =
  | { ok: true; candidate: RecallCandidate }
  | { ok: false; reason: string }

interface Row {
  request_id: string
  status: string
  sent_back_to: string | null
  updated_at: string
  approval_id: string | null
  approval_stage: string | null
  approval_action: string | null
  approval_by: string | null
  approval_at: string | null
  /** Trail rows after the decision, other than the decider's own edits. */
  later_events: number
  /** Did the requisition change after the decision (pricing saves leave no trail row)? */
  touched_after: boolean
}

/**
 * Recall eligibility for many requisitions in one query — the Reviewed list
 * asks for a whole page at once.
 *
 * The answer is advisory for pages; the recall route re-checks it inside the
 * same statement that performs the recall, so a decision taken by the next
 * stage in between still wins.
 */
export async function checkRecallMany(
  requestIds: string[],
  user: { id: string; role?: string | null }
): Promise<Map<string, RecallCheck>> {
  const out = new Map<string, RecallCheck>()
  if (requestIds.length === 0) return out

  const rows = await query<Row>(
    // Timestamps travel as text: a JS Date drops Postgres's microseconds, and
    // the recall compares updated_at for exact equality.
    `WITH a AS (
       SELECT DISTINCT ON (request_id) id, request_id, stage, action, performed_by, created_at
         FROM public.request_approvals
        WHERE request_id = ANY($1::uuid[]) AND action = ANY($2::text[])
        ORDER BY request_id, created_at DESC, id DESC
     )
     SELECT r.id              AS request_id,
            r.status,
            r.sent_back_to,
            r.updated_at::text AS updated_at,
            a.id               AS approval_id,
            a.stage            AS approval_stage,
            a.action           AS approval_action,
            a.performed_by     AS approval_by,
            a.created_at::text AS approval_at,
            (SELECT COUNT(*)::int
               FROM public.request_approvals x
              WHERE x.request_id = r.id
                AND a.id IS NOT NULL
                AND x.created_at > a.created_at
                AND NOT (x.action = 'edited' AND x.performed_by = a.performed_by)) AS later_events,
            (a.id IS NOT NULL AND r.updated_at > a.created_at) AS touched_after
       FROM public.requests r
       LEFT JOIN a ON a.request_id = r.id
      WHERE r.id = ANY($1::uuid[])`,
    [requestIds, RECALLABLE_ACTIONS]
  )

  for (const row of rows) out.set(row.request_id, evaluate(row, user))
  for (const id of requestIds) if (!out.has(id)) out.set(id, { ok: false, reason: 'Requisition not found.' })
  return out
}

/** Can this user recall this requisition right now? */
export async function checkRecall(
  requestId: string,
  user: { id: string; role?: string | null }
): Promise<RecallCheck> {
  return (await checkRecallMany([requestId], user)).get(requestId)!
}

function evaluate(row: Row, user: { id: string; role?: string | null }): RecallCheck {
  if (!row.approval_id || !row.approval_stage || !row.approval_at || !row.approval_action) {
    return { ok: false, reason: 'There is nothing on this requisition to recall.' }
  }

  const fromStage = row.approval_stage as Stage
  if (!(fromStage in STAGES)) return { ok: false, reason: 'This decision cannot be recalled.' }
  const action = row.approval_action as RecallableAction

  // A resubmission resumes wherever the send-back came from, not at the next
  // stage — so who holds it now is read from its status, which must still be a
  // stage's own (not sent back again, not closed).
  const heldBy: Stage | null =
    action === 'resubmitted'
      ? row.status === 'sent_back'
        ? null
        : currentStage(row.status, row.sent_back_to)
      : nextStage(fromStage)

  if (!heldBy) {
    return {
      ok: false,
      reason:
        row.status === 'completed'
          ? 'A completed requisition cannot be recalled — void it instead.'
          : 'This requisition has moved on and can no longer be recalled.',
    }
  }

  if (row.approval_by !== user.id && !isElevated(user.role)) {
    return { ok: false, reason: 'Only the person who made that decision can recall it.' }
  }

  const expectedStatus = statusForStage(heldBy)
  const untouched =
    row.status === expectedStatus &&
    row.later_events === 0 &&
    // A requester may keep editing their own requisition while it waits; those
    // edits move updated_at but are not the next stage acting.
    (fromStage === 'requester' || !row.touched_after)

  if (!untouched) {
    return {
      ok: false,
      reason: `${STAGES[heldBy].label} has already started on it, so it can no longer be recalled.`,
    }
  }

  return {
    ok: true,
    candidate: {
      requestId: row.request_id,
      approvalId: row.approval_id,
      approvalAt: row.approval_at,
      action,
      fromStage,
      heldBy,
      expectedStatus,
      seenUpdatedAt: row.updated_at,
      restoresSentBack: action === 'submitted' || action === 'resubmitted',
    },
  }
}
