import type { RoleId } from '@/lib/roles'
import { normalizeRole, isElevated } from '@/lib/roles'

/**
 * The approval chain, in order.
 *
 * Requester → Project Lead → Supply Chain → Cost Control → Administrator.
 *
 * Cost Control audits the rates and the vendor invoices Supply Chain attached,
 * and only once that passes does the Administrator raise the purchase order and
 * close the requisition. Administration is terminal — nothing follows it.
 *
 * Finance remains defined because paid purchase orders and their routes still
 * exist, but it is no longer part of the chain: it is off `STAGE_ORDER`, so
 * `nextStage` never routes to it.
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
    blurb: 'Prices each line, attaches vendor quotes and invoices, then submits.',
    roles: ['supply_chain'],
    status: 'pending_supply_chain',
    route: (id) => `/mintah/requests/${id}`,
  },
  admin: {
    id: 'admin',
    label: 'Administrator',
    blurb: 'Final authorization — raises the purchase order and closes the requisition.',
    roles: ['administrator'],
    status: 'pending_admin',
    route: (id) => `/admin/requests/${id}`,
  },
  cost_control: {
    id: 'cost_control',
    label: 'Cost Control',
    blurb: 'Audits rates and vendor invoices against budget before Administration.',
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
  'cost_control',
  'admin',
]

/** Stages that review rather than raise — used for queue pages. */
export const REVIEW_STAGES: Stage[] = ['lead', 'supply_chain', 'cost_control', 'admin']

/**
 * Stages with a "Reviewed" list of their own.
 *
 * Every stage but the requester keeps a record of what it decided; the
 * requester's own requisitions are already their dashboard.
 */
export const REVIEWED_STAGES: Stage[] = ['lead', 'supply_chain', 'cost_control', 'admin']

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
  if (stage === 'requester') return 'lead'
  if (stage === 'lead') return 'supply_chain'
  if (stage === 'supply_chain') return 'cost_control'
  if (stage === 'cost_control') return 'admin'
  // The Administrator closes the requisition, so there is nothing after them.
  if (stage === 'admin') return null
  // Finance is off the chain; a legacy row still sitting there is terminal.
  if (stage === 'finance') return null
  return null
}

export function previousStage(stage: Stage): Stage | null {
  if (stage === 'admin') return 'cost_control'
  if (stage === 'cost_control') return 'supply_chain'
  if (stage === 'supply_chain') return 'lead'
  if (stage === 'lead') return 'requester'
  // legacy fallback for rows written before Finance left the chain
  if (stage === 'finance') return 'cost_control'
  return null
}

/**
 * Where a stage may send a requisition back to, nearest first.
 *
 * Normally only the stage immediately before. Supply Chain is the exception:
 * what it finds wrong — a missing specification, a quantity nobody can source —
 * is usually the requester's to fix, and routing that through the Project Lead
 * only made the Lead forward it unchanged. It may return it straight to the
 * requester, whose resubmission then comes straight back to Supply Chain.
 */
export function sendBackTargets(stage: Stage): Stage[] {
  if (stage === 'supply_chain') return ['lead', 'requester']
  const prev = previousStage(stage)
  return prev ? [prev] : []
}

/** The stage that closes a requisition — the only one whose approval completes it. */
export const TERMINAL_STAGE: Stage = 'admin'

/** Does approving at this stage complete the requisition outright? */
export function isTerminalStage(stage: Stage): boolean {
  return nextStage(stage) === null
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
 * Who sees the purchase order: everyone.
 *
 * A purchase order can be attached at any point in the chain, and once it is,
 * it is the single most important document on the requisition — the engineer
 * who raised it, the Project Lead who justified it, Supply Chain, Cost Control
 * and Administration all need to see the same PO. Gating it by stage index
 * meant whoever opened the requisition before the attaching stage saw nothing,
 * so the gate is gone. The parameter stays so existing call sites still read.
 */
export function stageSeesPurchaseOrder(): boolean {
  return true
}

export const STAGE_LABEL = (stage: string): string =>
  stage in STAGES ? STAGES[stage as Stage].label : stage
