import { normalizeRole, type RoleId } from '@/lib/roles'

/**
 * Deep links resolved against the recipient's role.
 *
 * Each workflow stage lives under a different route prefix, and those prefixes
 * are role-guarded. A notification or email link must therefore point at the
 * area the *recipient* is allowed into — sending a Project Lead to
 * `/minta/requests/:id` just bounces them to their own dashboard.
 */

/** Where this role reads a requisition. */
export function requestLinkForRole(role: string | null | undefined, requestId: string): string {
  const id = normalizeRole(role)
  switch (id) {
    case 'engineer':
      return `/minta/requests/${requestId}`
    case 'supply_chain':
    case 'project_lead':
    case 'cost_control':
      // The review view; `request:review` covers all three.
      return `/mintah/requests/${requestId}`
    case 'finance':
      // Finance has no requisition view — it only ever sees purchase orders —
      // so send them to their own dashboard rather than a guarded area.
      return '/finance'
    default:
      // Administrators stay inside their own panel rather than being dropped
      // into a team's area whose sidebar and branding are not theirs. `focus`
      // opens the list filtered to this record.
      return `/admin?tab=requests&focus=${requestId}`
  }
}

/** Where this role reads a purchase order. */
export function poLinkForRole(role: string | null | undefined, poId: string): string {
  const id = normalizeRole(role)
  switch (id) {
    case 'supply_chain':
      return `/mintah/po/${poId}`
    case 'project_lead':
    case 'cost_control':
      return `/sam/${poId}`
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
