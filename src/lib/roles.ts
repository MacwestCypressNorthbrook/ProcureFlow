/**
 * The single source of truth for roles.
 *
 * Everything else — route guards, dashboards, labels, the admin role picker —
 * derives from this file. Previously each of those kept its own list and they
 * disagreed with one another, which is how a Supply Chain user ended up able to
 * approve the purchase orders they had just created.
 */

export type RoleId =
  | 'engineer'
  | 'supply_chain'
  | 'project_lead'
  | 'cost_control'
  | 'finance'
  | 'super_user'
  | 'administrator'

export interface RoleDefinition {
  id: RoleId
  label: string
  /** One line describing what this role does, shown in the admin role picker. */
  description: string
  /** Where this role lands after signing in. */
  dashboard: string
  /** Full access to every area and action. */
  elevated?: boolean
  accent: string
  dot: string
}

export const ROLES: Record<RoleId, RoleDefinition> = {
  engineer: {
    id: 'engineer',
    label: 'Engineer',
    description: 'Raises requisitions from site and tracks them through approval.',
    dashboard: '/minta',
    accent: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
  supply_chain: {
    id: 'supply_chain',
    label: 'Supply Chain',
    description: 'Reviews requisitions for specification, quantity and supplier.',
    dashboard: '/mintah',
    accent: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  project_lead: {
    id: 'project_lead',
    label: 'Project Lead',
    description: 'First review of every requisition raised on their site.',
    dashboard: '/sam',
    accent: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    dot: 'bg-indigo-500',
  },
  cost_control: {
    id: 'cost_control',
    label: 'Cost Control',
    description: 'Reviews purchase orders against budget before payment.',
    dashboard: '/cost-control',
    accent: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  finance: {
    id: 'finance',
    label: 'Finance',
    description: 'Disburses payment for approved purchase orders.',
    dashboard: '/finance',
    accent: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    dot: 'bg-rose-500',
  },
  super_user: {
    id: 'super_user',
    label: 'Super User',
    description: 'Full access to every area, including user management.',
    dashboard: '/admin',
    elevated: true,
    accent: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    dot: 'bg-purple-500',
  },
  administrator: {
    id: 'administrator',
    label: 'Administrator',
    description: 'Raises purchase orders and manages users, projects and suppliers.',
    dashboard: '/admin',
    elevated: true,
    accent: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    dot: 'bg-slate-500',
  },
}

/** Roles an administrator can assign, in workflow order. */
export const ASSIGNABLE_ROLES: RoleId[] = [
  'engineer',
  'supply_chain',
  'project_lead',
  'cost_control',
  'finance',
  'super_user',
  'administrator',
]

/**
 * Historical role values that still exist in the database, mapped to the role
 * they mean today. This mapping is one-way and deliberately unambiguous: the
 * old `sam` value meant the approver, so it resolves to project_lead only.
 */
const LEGACY_ALIASES: Record<string, RoleId> = {
  minta: 'engineer',
  employee: 'engineer',
  mintah: 'supply_chain',
  sam: 'project_lead',
  lead: 'project_lead',
  admin: 'administrator',
  adminstrator: 'administrator', // long-standing typo in the schema's CHECK
  superuser: 'super_user',
}

/** Resolve any stored or supplied role value to a canonical role. */
export function normalizeRole(role: string | null | undefined): RoleId | null {
  if (!role) return null
  const key = role.trim().toLowerCase()
  if (key in ROLES) return key as RoleId
  return LEGACY_ALIASES[key] ?? null
}

export function isElevated(role: string | null | undefined): boolean {
  const id = normalizeRole(role)
  return id ? ROLES[id].elevated === true : false
}

export function roleLabel(role: string | null | undefined): string {
  const id = normalizeRole(role)
  return id ? ROLES[id].label : (role ?? 'Unknown')
}

export function roleDefinition(role: string | null | undefined): RoleDefinition | null {
  const id = normalizeRole(role)
  return id ? ROLES[id] : null
}

export function dashboardPathForRole(role: string | null | undefined): string {
  const id = normalizeRole(role)
  return id ? ROLES[id].dashboard : '/minta'
}

/* ============================================================
   Capabilities — what each stage of the workflow requires.

   Separation of duties is the point: whoever raises a requisition
   does not review it, and whoever creates a purchase order does not
   approve it. Elevated roles bypass all of this.
   ============================================================ */

export type Capability =
  | 'request:create'
  | 'request:edit'
  | 'request:review'
  | 'request:convert'
  | 'po:view'
  | 'po:approve'
  | 'po:pay'
  | 'po:comment'
  | 'admin:manage'

export const CAPABILITIES: Record<Capability, RoleId[]> = {
  // Site staff raise the requisition.
  'request:create': ['engineer'],
  'request:edit': ['engineer'],

  // Reviewed by someone other than the requester, in chain order:
  // Project Lead, then Supply Chain, then Cost Control.
  'request:review': ['project_lead', 'supply_chain', 'cost_control'],

  // The Administrator raises the purchase order once both reviews have passed.
  'request:convert': ['administrator'],

  // Everyone in the chain can read a PO and discuss it.
  'po:view': ['engineer', 'supply_chain', 'project_lead', 'cost_control', 'finance'],
  'po:comment': ['engineer', 'supply_chain', 'project_lead', 'cost_control', 'finance'],

  // Cost Control reviews the purchase order it did not create.
  'po:approve': ['cost_control'],

  // Payment is Finance alone.
  'po:pay': ['finance'],

  'admin:manage': [],
}

/** Does this role satisfy one of the listed roles? Elevated roles always do. */
export function roleSatisfies(role: string | null | undefined, allowed: string[]): boolean {
  const mine = normalizeRole(role)
  if (!mine) return false
  if (ROLES[mine].elevated) return true
  return allowed.some((candidate) => normalizeRole(candidate) === mine)
}

/** Does this role hold the given capability? Elevated roles always do. */
export function can(role: string | null | undefined, capability: Capability): boolean {
  const mine = normalizeRole(role)
  if (!mine) return false
  if (ROLES[mine].elevated) return true
  return CAPABILITIES[capability].includes(mine)
}

/** The roles allowed into a dashboard area, keyed by its route prefix. */
export const AREA_ROLES: Record<string, RoleId[]> = {
  '/minta': ['engineer'],
  '/mintah': ['supply_chain'],
  '/sam': ['project_lead'],
  '/cost-control': ['cost_control'],
  '/finance': ['finance'],
  '/admin': ['super_user', 'administrator'],
  '/request': ['engineer'],
}
