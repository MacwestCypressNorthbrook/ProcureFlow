import { normalizeRole, type RoleId } from '@/lib/roles'

/**
 * Deep links resolved against the recipient's role.
 *
 * Each workflow stage lives under a different route prefix, and those prefixes
 * are role-guarded. A notification or email link must therefore point at the
 * area the *recipient* is allowed into — sending a Project Lead to
 * `/minta/requests/:id` just bounces them to their own dashboard.
 */

/**
 * Where this role reads a requisition.
 *
 * Each area is role-guarded by `AREA_ROLES`, so every branch here must land in
 * an area the *recipient* is actually allowed into. Project Lead and Cost
 * Control used to be pointed at `/mintah/requests/:id`, which only Supply Chain
 * may enter — every notification and email sent to those two roles bounced them
 * to their own dashboard and lost the requisition they were told to look at.
 */
export function requestLinkForRole(role: string | null | undefined, requestId: string): string {
  const id = normalizeRole(role)
  switch (id) {
    case 'engineer':
      return `/minta/requests/${requestId}`
    case 'supply_chain':
      return `/mintah/requests/${requestId}`
    case 'project_lead':
      return `/sam/requests/${requestId}`
    case 'cost_control':
      return `/cost-control/requests/${requestId}`
    case 'finance':
      // Finance has no requisition view — it only ever sees purchase orders —
      // so send them to their own dashboard rather than a guarded area.
      return '/finance'
    default:
      // The Administrator now closes the chain, so they get the requisition
      // itself rather than a filtered list.
      return `/admin/requests/${requestId}`
  }
}

/** Where this role reads a purchase order. */
export function poLinkForRole(role: string | null | undefined, poId: string): string {
  const id = normalizeRole(role)
  switch (id) {
    case 'supply_chain':
      return `/mintah/po/${poId}`
    case 'project_lead':
      return `/sam/${poId}`
    case 'cost_control':
      // `/sam/:id` is the purchase-order view, but it is Project Lead territory
      // and Cost Control has no PO route of its own — their dashboard is the
      // only page they can actually open.
      return '/cost-control'
    case 'finance':
      return `/finance/${poId}`
    case 'engineer':
      // Engineers have no purchase-order area; their view of progress is the
      // tracking pipeline.
      return '/minta/tracking'
    default:
      // Administrators stay inside their own panel — see requestLinkForRole.
      return `/admin?tab=pos&focus=${poId}`
  }
}

export type LinkTarget =
  | { type: 'request'; id: string }
  | { type: 'po'; id: string }

export function linkForRole(role: string | null | undefined, target: LinkTarget): string {
  return target.type === 'request'
    ? requestLinkForRole(role, target.id)
    : poLinkForRole(role, target.id)
}

/** Exported for tests and for callers that already hold a canonical role. */
export type { RoleId }
