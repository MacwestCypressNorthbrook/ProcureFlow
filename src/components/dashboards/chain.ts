import { STAGE_LABEL, currentStage } from '@/lib/workflow'
import { num } from '@/components/shared/dashboard/kit'
import type { FlowStage } from '@/components/shared/dashboard/share-charts'
import type { StackCategory } from '@/components/shared/dashboard/queue-charts'

/** The approval chain in order — where an open requisition can be sitting. */
export const CHAIN = ['requester', 'lead', 'supply_chain', 'cost_control', 'admin'] as const

/** Waiting longer than this at one stage counts as stuck. */
export const STUCK_DAYS = 7

/** The fields every requisition row carries, however its page queried it. */
export interface ChainRow {
  status: string
  sent_back_to?: string | null
  total_amount?: number | string | null
  created_at: string
}

export const isOpen = (r: ChainRow) => currentStage(r.status, r.sent_back_to) !== null

/**
 * Open requisitions grouped by the stage they sit at, in chain order, with
 * their value, average wait and how many are stuck. `waited` says how long a
 * row has sat where it is; pages differ in which timestamp they have for that.
 */
export function chainFlow<T extends ChainRow>(rows: T[], waited: (r: T) => number | null): FlowStage[] {
  return CHAIN.map((stage) => {
    const here = rows.filter((r) => currentStage(r.status, r.sent_back_to) === stage)
    const days = here.map(waited).filter((d): d is number => d !== null)
    return {
      key: stage,
      label: STAGE_LABEL(stage),
      count: here.length,
      value: here.reduce((s, r) => s + num(r.total_amount), 0),
      avgDays: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
      stuck: days.filter((d) => d > STUCK_DAYS).length,
    }
  })
}

/** Whole days since a timestamp, or null when it is missing or unreadable. */
export function daysSince(at: string | Date | null | undefined, now = new Date()) {
  if (!at) return null
  const t = new Date(at).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000))
}

/**
 * A reviewer's three outcomes, in the three categorical slots validated
 * together (every pair clears the colour-vision checks). The green slot goes
 * to approval so the colour does not argue with the label.
 */
export const OUTCOMES: StackCategory[] = [
  { key: 'approved', label: 'Approved', slot: 3 },
  { key: 'sent_back', label: 'Sent back', slot: 2 },
  { key: 'rejected', label: 'Rejected', slot: 1 },
]

export const isOutcome = (action: string) => OUTCOMES.some((o) => o.key === action)
