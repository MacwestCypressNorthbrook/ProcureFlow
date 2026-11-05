import { query } from '@/lib/db'

/** One recorded action on a purchase order, resolved to the person who took it. */
export interface PoAuditEntry {
  id: string
  po_id: string
  action: string
  notes: string | null
  created_at: string
  performed_by: string | null
  actor_name: string | null
  actor_email: string | null
  actor_role: string | null
}

/**
 * The audit trail for a purchase order, oldest first.
 *
 * `performed_by` is a bare UUID on the table, which is useless to a reviewer —
 * the join is what makes the trail an actual record of who did what. Order is
 * fixed here rather than at each call site so every view tells the same story.
 */
export async function getPoAuditTrail(poId: string): Promise<PoAuditEntry[]> {
  return await query<PoAuditEntry>(
    `SELECT a.id,
            a.po_id,
            a.action,
            a.notes,
            a.created_at,
            a.performed_by,
            u.name  AS actor_name,
            u.email AS actor_email,
            u.role  AS actor_role
       FROM public.po_audit_trail a
       LEFT JOIN public.users u ON u.id = a.performed_by
      WHERE a.po_id = $1
      ORDER BY a.created_at ASC, a.id ASC`,
    [poId]
  )
}

/** An action the PO routes write to `po_audit_trail`. */
export type PoAuditAction =
  | 'created'
  | 'approved'
  | 'rejected'
  | 'sent_back'
  | 'edited'
  | 'resubmitted'
  | 'part_paid'
  | 'paid'
  | 'cancelled'
  | 'voided'

/**
 * The INSERT for one audit entry, as a [sql, params] pair for `transaction()`.
 *
 * Returned rather than executed so the entry commits in the same transaction
 * as the change it records — a status that moved without its audit row, or an
 * audit row for a change that rolled back, is exactly what a trail must not show.
 *
 * Stamped with clock_timestamp() rather than the column default now(), which is
 * fixed for the whole transaction — two entries written together (an edit and
 * the resubmission it caused) would otherwise tie and sort by random id.
 */
export function poAuditStatement(
  poId: string,
  action: PoAuditAction,
  performedBy: string,
  notes: string | null = null
): [string, unknown[]] {
  return [
    `INSERT INTO public.po_audit_trail (po_id, action, performed_by, notes, created_at)
     VALUES ($1, $2, $3, $4, clock_timestamp())`,
    [poId, action, performedBy, notes],
  ]
}

/**
 * Human labels for every {@link PoAuditAction}.
 * The *_by_sam / payment_completed keys are legacy spellings kept so older
 * rows still render a proper label rather than raw snake_case.
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  created: 'Purchase order created',
  approved: 'Approved',
  rejected: 'Rejected',
  sent_back: 'Sent back for revision',
  edited: 'Purchase order edited',
  resubmitted: 'Resubmitted for approval',
  part_paid: 'Part payment recorded',
  paid: 'Payment completed',
  cancelled: 'Cancelled',
  voided: 'Voided',
  // requisition actions (request_approvals), shown in the admin audit log
  submitted: 'Requisition submitted',
  requisition_edited: 'Requisition edited',
  items_removed: 'Items removed',
  marked_urgent: 'Marked urgent',
  completed: 'Authorized and closed',
  // legacy
  approved_by_sam: 'Approved',
  rejected_by_sam: 'Rejected',
  sent_back_by_sam: 'Sent back for revision',
  payment_completed: 'Payment completed',
  po_attached: 'PO document attached',
  comment_added: 'Comment added',
}

export type AuditTone = 'positive' | 'negative' | 'neutral'

const POSITIVE_ACTIONS = new Set(['approved', 'completed', 'paid', 'part_paid', 'approved_by_sam', 'payment_completed'])
const NEGATIVE_ACTIONS = new Set(['rejected', 'sent_back', 'rejected_by_sam', 'sent_back_by_sam', 'cancelled', 'voided'])

export function auditTone(action: string): AuditTone {
  if (POSITIVE_ACTIONS.has(action)) return 'positive'
  if (NEGATIVE_ACTIONS.has(action)) return 'negative'
  return 'neutral'
}

/** "3 hours ago" — the at-a-glance read; the exact timestamp sits beside it. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 60) return 'just now'

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, secondsInUnit] of units) {
    if (Math.abs(seconds) >= secondsInUnit) {
      return rtf.format(-Math.round(seconds / secondsInUnit), unit)
    }
  }
  return 'just now'
}
