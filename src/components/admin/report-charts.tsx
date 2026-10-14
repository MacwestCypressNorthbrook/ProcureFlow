'use client'

import { cn } from '@/lib/utils'

/**
 * The two chart forms the procurement reports need, and only those.
 *
 *   RankedBars  — compare magnitude across categories (projects, suppliers,
 *                 engineers). Horizontal, because the labels are long names.
 *   MonthColumns — one series over time.
 *
 * Both are a single series, so a single hue (the theme's primary): colour
 * carries no identity here, length does. Values sit at the bar tip in text ink,
 * never in the bar colour, and every bar answers hover and keyboard focus with
 * its exact figures. The table under each report is the full table view.
 */

const ghsCompact = (n: number) =>
  new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
    notation: n >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: n >= 100_000 ? 1 : 0,
  }).format(n)

export const ghsFull = (n: number) =>
  new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 2 }).format(n)

export interface RankedRow {
  label: string
  value: number
  count: number
}

/** Top N by value; the tail folds into one "Other" row rather than vanishing. */
export function rankRows(rows: RankedRow[], limit = 7): RankedRow[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value)
  if (sorted.length <= limit + 1) return sorted
  const head = sorted.slice(0, limit)
  const tail = sorted.slice(limit)
  return [
    ...head,
    {
      label: `Other (${tail.length})`,
      value: tail.reduce((s, r) => s + r.value, 0),
      count: tail.reduce((s, r) => s + r.count, 0),
    },
  ]
}

export function ChartCard({
  title,
  caption,
  children,
  className,
}: {
  title: string
  caption?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('surface rounded-xl p-4', className)}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {caption && <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function RankedBars({
  rows,
  unit = 'PO',
  empty = 'Nothing to chart for these filters.',
}: {
  rows: RankedRow[]
  /** What `count` counts, singular — "PO", "invoice". */
  unit?: string
  empty?: string
}) {
  if (rows.length === 0) return <p className="py-6 text-center text-xs text-muted-foreground">{empty}</p>
  const max = Math.max(...rows.map((r) => r.value), 1)
  const total = rows.reduce((s, r) => s + r.value, 0)

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const pct = (row.value / max) * 100
        const share = total > 0 ? Math.round((row.value / total) * 100) : 0
        const detail = `${row.label}: ${ghsFull(row.value)} · ${row.count} ${unit}${row.count === 1 ? '' : 's'} · ${share}% of total`
        return (
          <li key={row.label} className="group relative" tabIndex={0} aria-label={detail}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-medium text-foreground" title={row.label}>
                {row.label}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">{ghsCompact(row.value)}</span> · {share}%
              </span>
            </div>
            {/* Thin bar from a single baseline, rounded only at its data end. */}
            <div className="h-2.5 w-full rounded-r-[4px] bg-muted/60">
              <div
                className="h-full rounded-r-[4px] bg-primary transition-[width] duration-300 group-hover:opacity-80"
                style={{ width: `${Math.max(pct, row.value > 0 ? 1.5 : 0)}%` }}
              />
            </div>
            <div
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] text-popover-foreground shadow-lg group-hover:block group-focus-visible:block"
            >
              <p className="font-semibold">{row.label}</p>
              <p className="tabular-nums text-muted-foreground">
                {ghsFull(row.value)} · {row.count} {unit}
                {row.count === 1 ? '' : 's'} · {share}%
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export interface MonthPoint {
  /** YYYY-MM */
  month: string
  value: number
  count: number
}

const monthLabel = (ym: string, long = false) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', long ? { month: 'long', year: 'numeric' } : { month: 'short' })
}

/** The last `months` calendar months, gaps filled with zero so time reads evenly. */
export function monthSeries<T>(
  rows: T[],
  date: (row: T) => string | null | undefined,
  amount: (row: T) => number,
  months = 12
): MonthPoint[] {
  const now = new Date()
  const points: MonthPoint[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    points.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, value: 0, count: 0 })
  }
  const index = new Map(points.map((p, i) => [p.month, i]))
  for (const row of rows) {
    const raw = date(row)
    if (!raw) continue
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) continue
    const i = index.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    if (i === undefined) continue
    points[i].value += amount(row) || 0
    points[i].count += 1
  }
  return points
}

export function MonthColumns({ points, unit = 'PO' }: { points: MonthPoint[]; unit?: string }) {
  const max = Math.max(...points.map((p) => p.value), 0)
  if (max === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">No activity in the last 12 months for these filters.</p>
  }
  // Label selectively: the peak and the latest month carry their value; the
  // rest are read by hover, focus, or the table.
  const peak = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0)
  const last = points.length - 1

  return (
    <div>
      <div className="flex h-40 items-end gap-1.5 border-b border-border">
        {points.map((p, i) => {
          const h = (p.value / max) * 100
          const labelled = (i === peak || i === last) && p.value > 0
          const detail = `${monthLabel(p.month, true)}: ${ghsFull(p.value)} · ${p.count} ${unit}${p.count === 1 ? '' : 's'}`
          return (
            <div
              key={p.month}
              tabIndex={0}
              aria-label={detail}
              className="group relative flex h-full flex-1 flex-col items-center justify-end outline-none"
            >
              {labelled && (
                <span className="mb-1 whitespace-nowrap text-[10px] font-semibold tabular-nums text-foreground">
                  {ghsCompact(p.value)}
                </span>
              )}
              <div
                className="w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80"
                style={{ height: `${p.value > 0 ? Math.max(h, 2) : 0}%` }}
              />
              <div
                role="tooltip"
                className="pointer-events-none absolute bottom-full z-20 mb-1 hidden whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] text-popover-foreground shadow-lg group-hover:block group-focus-visible:block"
              >
                <p className="font-semibold">{monthLabel(p.month, true)}</p>
                <p className="tabular-nums text-muted-foreground">
                  {ghsFull(p.value)} · {p.count} {unit}
                  {p.count === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {points.map((p) => (
          <span key={p.month} className="flex-1 text-center text-[10px] text-muted-foreground">
            {monthLabel(p.month)}
          </span>
        ))}
      </div>
    </div>
  )
}
