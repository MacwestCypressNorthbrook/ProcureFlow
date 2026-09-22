import { Clock, Layers, Wallet, CalendarCheck } from 'lucide-react'
import type { StatCardProps } from '@/components/shared/ui-kit'
import type { PurchaseOrder } from '@/lib/types'

/** Money in the same format as `formatCurrency`, without the trailing cents. */
export const statMoney = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)

const DAY = 1000 * 60 * 60 * 24

/**
 * Month-over-month split of a set of dates.
 *
 * `delta` is left undefined when last month has nothing to compare against —
 * a jump from zero is not a percentage, and rendering "+100%" would be a lie.
 */
export function monthSplit(dates: (string | null | undefined)[]): {
  thisMonth: number
  lastMonth: number
  delta?: number
} {
  const now = new Date()
  const thisKey = `${now.getFullYear()}-${now.getMonth()}`
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastKey = `${prev.getFullYear()}-${prev.getMonth()}`

  let thisMonth = 0
  let lastMonth = 0
  for (const d of dates) {
    if (!d) continue
    const date = new Date(d)
    if (Number.isNaN(date.getTime())) continue
    const key = `${date.getFullYear()}-${date.getMonth()}`
    if (key === thisKey) thisMonth++
    else if (key === lastKey) lastMonth++
  }

  return {
    thisMonth,
    lastMonth,
    delta: lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : undefined,
  }
}

/** Whole days since the oldest date in the set, or null when the set is empty. */
function oldestAgeDays(dates: (string | null | undefined)[]): { days: number; on: string } | null {
  const times = dates
    .filter(Boolean)
    .map((d) => new Date(d as string).getTime())
    .filter((t) => !Number.isNaN(t))
  if (times.length === 0) return null
  const oldest = Math.min(...times)
  return {
    days: Math.max(0, Math.floor((Date.now() - oldest) / DAY)),
    on: new Date(oldest).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
  }
}

const sumValue = (pos: PurchaseOrder[]) =>
  pos.reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0)

/**
 * The four-card summary shown above a filtered list of purchase orders.
 *
 * `trailing` picks the last card: how long the oldest item has been waiting
 * (queues) or how many landed this month (archives).
 */
export function poSummaryStats({
  pos,
  label,
  icon,
  tone = 'blue',
  dateField = 'created_at',
  trailing = 'age',
  ageLabel = 'Oldest waiting',
  href,
}: {
  pos: PurchaseOrder[]
  label: string
  icon: React.ReactNode
  tone?: StatCardProps['tone']
  dateField?: 'created_at' | 'paid_at'
  trailing?: 'age' | 'month'
  ageLabel?: string
  href?: string
}): StatCardProps[] {
  const dates = pos.map((p) => (dateField === 'paid_at' ? p.paid_at : p.created_at))
  const { thisMonth, lastMonth, delta } = monthSplit(dates)
  const total = sumValue(pos)
  const average = pos.length > 0 ? total / pos.length : 0
  const age = oldestAgeDays(dates)

  const trailingCard: StatCardProps =
    trailing === 'month'
      ? {
          label: 'This month',
          value: thisMonth,
          icon: <CalendarCheck size={18} />,
          tone: 'emerald',
          compare: lastMonth > 0 ? `vs. ${lastMonth} last month` : 'No activity last month',
        }
      : {
          label: ageLabel,
          value: age ? `${age.days}d` : '—',
          icon: <Clock size={18} />,
          tone: age && age.days > 7 ? 'red' : 'amber',
          compare: age ? `Oldest raised ${age.on}` : 'Nothing in the queue',
        }

  return [
    {
      label,
      value: pos.length,
      icon,
      tone,
      delta,
      compare: lastMonth > 0 ? `vs. ${lastMonth} last month` : `${thisMonth} added this month`,
      href,
    },
    {
      label: 'Total value',
      value: statMoney(total),
      icon: <Wallet size={18} />,
      tone: 'indigo',
      compare: `Across ${pos.length} order${pos.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Average value',
      value: statMoney(average),
      icon: <Layers size={18} />,
      tone: 'purple',
      compare: 'Per purchase order',
    },
    trailingCard,
  ]
}

/** The equivalent summary for a filtered list of requisitions. */
export function requestSummaryStats({
  requests,
  label,
  icon,
  tone = 'blue',
  trailing = 'age',
  ageLabel = 'Oldest waiting',
  href,
}: {
  requests: Record<string, unknown>[]
  label: string
  icon: React.ReactNode
  tone?: StatCardProps['tone']
  trailing?: 'age' | 'month'
  ageLabel?: string
  href?: string
}): StatCardProps[] {
  const dates = requests.map((r) => (r.created_at as string | null) ?? null)
  const { thisMonth, lastMonth, delta } = monthSplit(dates)
  const age = oldestAgeDays(dates)

  return [
    {
      label,
      value: requests.length,
      icon,
      tone,
      delta,
      compare: lastMonth > 0 ? `vs. ${lastMonth} last month` : `${thisMonth} raised this month`,
      href,
    },
    {
      label: 'Raised this month',
      value: thisMonth,
      icon: <CalendarCheck size={18} />,
      tone: 'emerald',
      compare: lastMonth > 0 ? `vs. ${lastMonth} last month` : 'No activity last month',
    },
    trailing === 'month'
      ? {
          label: 'Raised last month',
          value: lastMonth,
          icon: <Layers size={18} />,
          tone: 'purple',
          compare: 'Previous calendar month',
        }
      : {
          label: ageLabel,
          value: age ? `${age.days}d` : '—',
          icon: <Clock size={18} />,
          tone: age && age.days > 7 ? 'red' : 'amber',
          compare: age ? `Oldest raised ${age.on}` : 'Nothing in the queue',
        },
  ]
}
