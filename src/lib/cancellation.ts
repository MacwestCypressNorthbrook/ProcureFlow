import { can } from '@/lib/roles'

/**
 * Cancelling and voiding a requisition.
 *
 * Both end in the `cancelled` status; they differ in what they undo. A cancel
 * withdraws a requisition before any purchase order exists. A void reverses one
 * the Administrator already closed, and cancels its purchase orders with it, so
 * it is the Administrator's (and Super User's) alone.
 */
export type CancelMode = 'cancel' | 'void'

/** Statuses from which nothing can be cancelled — already ended. */
const ENDED = new Set(['cancelled', 'rejected'])

/**
 * What, if anything, this person may do to a requisition in this status.
 *
 * The requester may withdraw their own until it is completed. Holders of
 * `request:cancel` (Administrator, Supply Chain, Cost Control, and elevated
 * roles) may cancel at any stage; only `request:void` may void a completed
 * one. Anything with money already paid is refused by the API regardless — that needs a refund, not a status change.
 */
export function cancelModeFor(
  role: string | null | undefined,
  status: string,
  isOwner: boolean
): CancelMode | null {
  if (ENDED.has(status)) return null
  const privileged = can(role, 'request:cancel')
  if (status === 'completed') return can(role, 'request:void') ? 'void' : null
  return privileged || isOwner ? 'cancel' : null
}
