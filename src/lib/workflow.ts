import type { RoleId } from '@/lib/roles'
import { normalizeRole, isElevated } from '@/lib/roles'

/**
 * The approval chain, in order.
 *
 * Requester → Project Lead → Supply Chain → Administrator (creates the purchase
 * order) → Cost Control → Finance.
 *
 * Every route, guard, dashboard and notification derives from this file. If a
 * stage moves, it moves here and nowhere else.
 */
export type Stage =
  | 'requester'
  | 'lead'
  | 'supply_chain'
  | 'admin'
  | 'cost_control'
  | 'finance'

export type RequestStatus =
  | 'draft'
  | 'pending_lead'
  | 'pending_supply_chain'
  | 'pending_admin'
  | 'pending_cost_control'
  | 'pending_finance'
  | 'sent_back'
  | 'completed'
  | 'rejected'
  | 'cancelled'

export interface StageDefinition {
  id: Stage
  label: string
  /** What this stage is responsible for, shown in the UI. */
  blurb: string
  /** Roles that may act at this stage. Elevated roles may always act. */
  roles: RoleId[]
  /** The request status while the item sits at this stage. */
  status: RequestStatus
  /** Where this stage's holder reviews the item. */
  route: (requestId: string) => string
}

export const STAGES: Record<Stage, StageDefinition> = {
  requester: {
    id: 'requester',
    label: 'Requester',
    blurb: 'Raises the requisition and fixes anything sent back.',
    roles: ['engineer'],
    status: 'draft',
    route: (id) => `/minta/requests/${id}`,
  },
  lead: {
    id: 'lead',
    label: 'Project Lead',
    blurb: 'First review — confirms the requisition is justified on site.',
    roles: ['project_lead'],
    status: 'pending_lead',
    route: (id) => `/sam/requests/${id}`,
  },
  supply_chain: {
    id: 'supply_chain',
    label: 'Supply Chain',
    blurb: 'Checks specifications, quantities and suppliers.',
    roles: ['supply_chain'],
    status: 'pending_supply_chain',
    route: (id) => `/mintah/requests/${id}`,
  },
  admin: {
    id: 'admin',
    label: 'Administrator',
    blurb: 'Raises the purchase order and attaches it to the requisition.',
    roles: ['administrator'],
    status: 'pending_admin',
    route: (id) => `/admin/requests/${id}`,
  },
  cost_control: {
    id: 'cost_control',
    label: 'Cost Control',
    blurb: 'Reviews the purchase order against budget.',
    roles: ['cost_control'],
    status: 'pending_cost_control',
    route: (id) => `/cost-control/requests/${id}`,
  },
  finance: {
    id: 'finance',
    label: 'Finance',
    blurb: 'Disburses payment and closes the requisition.',
    roles: ['finance'],
    status: 'pending_finance',
    route: (id) => `/finance/requests/${id}`,
  },
}

/** The chain in order. Index position drives next/previous. */
export const STAGE_ORDER: Stage[] = [
  'requester',
  'lead',
  'supply_chain',
  'admin',
  'cost_control',
  'finance',
]

/** Stages that review rather than raise — used for queue pages. */
export const REVIEW_STAGES: Stage[] = ['lead', 'supply_chain', 'admin', 'cost_control', 'finance']

const STATUS_TO_STAGE: Partial<Record<RequestStatus, Stage>> = {
  draft: 'requester',
  pending_lead: 'lead',
  pending_supply_chain: 'supply_chain',
  pending_admin: 'admin',
  pending_cost_control: 'cost_control',
  pending_finance: 'finance',
}

/**
 * Which stage currently holds the item.
 *
 * A sent-back item is held by `sent_back_to`, not by its status — the status
 * only says it bounced. Terminal states hold nobody.
 */
export function currentStage(
  status: string,
  sentBackTo?: string | null
): Stage | null {
  if (status === 'sent_back') {
    const stage = sentBackTo as Stage | undefined
    return stage && stage in STAGES ? stage : 'requester'
  }
  return STATUS_TO_STAGE[status as RequestStatus] ?? null
}

export function nextStage(stage: Stage): Stage | null {
  const i = STAGE_ORDER.indexOf(stage)
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null
}

export function previousStage(stage: Stage): Stage | null {
  const i = STAGE_ORDER.indexOf(stage)
  return i > 0 ? STAGE_ORDER[i - 1] : null
}

/** The request status for an item sitting at this stage. */
export function statusForStage(stage: Stage): RequestStatus {
  return STAGES[stage].status
}

/** May this role act at this stage? Elevated roles oversee every stage. */
export function canActAt(role: string | null | undefined, stage: Stage): boolean {
  if (isElevated(role)) return true
  const mine = normalizeRole(role)
  return mine ? STAGES[stage].roles.includes(mine) : false
}

/** Stages this role is responsible for. Elevated roles get the whole chain. */
export function stagesForRole(role: string | null | undefined): Stage[] {
  if (isElevated(role)) return [...REVIEW_STAGES]
  const mine = normalizeRole(role)
  if (!mine) return []
  return STAGE_ORDER.filter((s) => STAGES[s].roles.includes(mine))
}

/** The statuses a role's queue should show. */
export function queueStatusesForRole(role: string | null | undefined): RequestStatus[] {
  return stagesForRole(role).map(statusForStage)
}

/**
 * The purchase order is created at the Administrator stage, so every stage from
 * there on reviews the PO as well as the requisition.
 */
export function stageSeesPurchaseOrder(stage: Stage): boolean {
  return STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf('admin')
}

export const STAGE_LABEL = (stage: string): string =>
  stage in STAGES ? STAGES[stage as Stage].label : stage
