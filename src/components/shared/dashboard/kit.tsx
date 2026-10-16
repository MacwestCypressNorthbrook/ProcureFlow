'use client'

import { ArrowDownRight, ArrowUpRight, ChevronDown, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The dashboard kit every report and home page is built from.
 *
 * Every panel is a "tray": a muted shell carrying a mono, upper-case label,
 * with the content on a raised card inside it. Charts are ink-first — the
 * foreground colour at full strength for what is settled, faded for what is
 * still open — and reach for the categorical `--series-*` slots only where
 * identity is the point. Every mark answers hover and keyboard focus.
 *
 * This file holds the shell, formatting, KPI tiles, controls and the data
 * helpers; the charts live in `./charts`.
 */

/* ── Formatting ─────────────────────────────────────────────────────────── */

export const compact = (n: number) =>
  new Intl.NumberFormat('en-GH', {
    notation: Math.abs(n) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(n) >= 10_000 ? 1 : Number.isInteger(n) ? 0 : 1,
  }).format(n)

export const ghsShort = (n: number) => `${n < 0 ? '−' : ''}GHS ${compact(Math.abs(n))}`

export const ghsFull = (n: number) =>
  new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 2 }).format(n)

/** What a chart's numbers are: cedis, or a count of things. */
export type ValueFormat = 'money' | 'count'

export const fmtShort = (format: ValueFormat, n: number) => (format === 'money' ? ghsShort(n) : compact(n))
export const fmtFull = (format: ValueFormat, n: number) =>
  format === 'money' ? ghsFull(n) : n.toLocaleString('en-GB', { maximumFractionDigits: 1 })

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

export const plural = (n: number, word: string, many = `${word}s`) =>
  `${n.toLocaleString('en-GB')} ${n === 1 ? word : many}`

export const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export const LABEL = 'font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground'

/* ── Time helpers ───────────────────────────────────────────────────────── */

export const monthKeyOf = (d: string | Date) => {
  const date = typeof d === 'string' ? new Date(d) : d
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export const monthLabel = (ym: string, style: 'short' | 'long' = 'short') => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(
    'en-GB',
    style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short', year: 'numeric' }
  )
}

/** The last `months` calendar months, oldest first, as YYYY-MM keys. */
export function lastMonths(months: number, now = new Date()) {
  return Array.from({ length: months }, (_, i) => monthKeyOf(new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1)))
}

export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
}

export const daysBetween = (from: string | null | undefined, to: string | null | undefined) => {
  if (!from || !to) return null
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

/**
 * A metric per month for the last `months` months — the sparkline under a
 * KPI. `reduce` turns that month's rows into one number.
 */
export function monthlySpark<T>(
  rows: T[],
  date: (row: T) => string | null | undefined,
  reduce: (rows: T[]) => number,
  display: (n: number) => string,
  months = 8
): SparkPoint[] {
  const keys = lastMonths(months)
  const groups = new Map<string, T[]>(keys.map((k) => [k, []]))
  for (const row of rows) {
    const raw = date(row)
    if (!raw) continue
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) continue
    groups.get(monthKeyOf(d))?.push(row)
  }
  return keys.map((k) => {
    const value = reduce(groups.get(k) ?? [])
    return { label: monthLabel(k), value, display: display(value) }
  })
}

/** This month against last month, as a KPI trend; undefined when there is no base. */
export function monthOverMonth(spark: SparkPoint[], opts: { percent?: boolean; upIsGood: boolean | null; suffix?: string }): KpiTrend | undefined {
  if (spark.length < 2) return undefined
  const now = spark[spark.length - 1].value
  const prev = spark[spark.length - 2].value
  if (opts.percent) {
    if (prev <= 0) return undefined
    const change = ((now - prev) / prev) * 100
    return trendOf(change, `${Math.abs(Math.round(change))}%`, opts.upIsGood)
  }
  const change = Math.round((now - prev) * 10) / 10
  return trendOf(change, `${Math.abs(change)}${opts.suffix ?? ''}`, opts.upIsGood)
}

export function trendOf(change: number, text: string, upIsGood: boolean | null): KpiTrend {
  return {
    text,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
    good: upIsGood === null ? null : upIsGood ? change > 0 : change < 0,
  }
}

/* ── Stable categorical slices ──────────────────────────────────────────── */

export interface Slice {
  key: string
  label: string
  value: number
  count: number
  /** Categorical slot 1–5; null for the folded "Other" remainder. */
  slot: number | null
}

/**
 * Group rows into at most five coloured slices plus "Other".
 *
 * Colours follow the entity, not its rank in the current filter: the five
 * largest across *all* rows hold their slot, so filtering never repaints them.
 * An entity outside that five borrows a slot only while its owner is absent.
 */
export function stableSlices<T>(
  all: T[],
  visible: T[],
  key: (row: T) => string,
  value: (row: T) => number,
  label: (key: string) => string = (k) => k
): Slice[] {
  const totals = new Map<string, number>()
  for (const r of all) totals.set(key(r), (totals.get(key(r)) ?? 0) + value(r))
  const pinned = new Map([...totals].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k], i) => [k, i + 1]))

  const groups = new Map<string, { value: number; count: number }>()
  for (const r of visible) {
    const g = groups.get(key(r)) ?? { value: 0, count: 0 }
    g.value += value(r)
    g.count += 1
    groups.set(key(r), g)
  }
  const present = [...groups].sort((a, b) => b[1].value - a[1].value)
  const taken = new Set(present.map(([k]) => pinned.get(k)).filter(Boolean))
  const free = [1, 2, 3, 4, 5].filter((s) => !taken.has(s))
  const slices: Slice[] = []
  const other = { value: 0, count: 0, n: 0 }
  for (const [k, g] of present) {
    const slot = pinned.get(k) ?? free.shift()
    if (slot) slices.push({ key: k, label: label(k), value: g.value, count: g.count, slot })
    else {
      other.value += g.value
      other.count += g.count
      other.n += 1
    }
  }
  if (other.n) slices.push({ key: '__other', label: `Other (${other.n})`, value: other.value, count: other.count, slot: null })
  return slices
}

/** One sentence on how concentrated a breakdown is — the line under the doughnut. */
export function concentrationInsight(slices: Slice[], noun: string, nounPlural: string, measure: string): string | null {
  const named = slices.filter((s) => s.slot !== null)
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (named.length === 0 || total === 0) return null
  const top = named[0]
  if (slices.length === 1) return `All ${measure} sits with one ${noun}: ${top.label}.`
  if (named.length >= 4) {
    const three = named.slice(0, 3).reduce((s, x) => s + x.value, 0)
    return `${top.label} holds ${pct(top.value, total)}% of ${measure}; the top three ${nounPlural} together hold ${pct(three, total)}%.`
  }
  return `${top.label} holds ${pct(top.value, total)}% of ${measure}.`
}

/* ── Shell ──────────────────────────────────────────────────────────────── */

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group/tip relative inline-flex">
      <button
        type="button"
        aria-label={text}
        className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info size={13} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-64 max-w-[75vw] rounded-lg border border-border bg-popover px-2.5 py-2 text-[11px] font-normal normal-case leading-snug tracking-normal text-popover-foreground shadow-lg group-focus-within/tip:block group-hover/tip:block"
      >
        {text}
      </span>
    </span>
  )
}

export function Tray({
  label,
  info,
  action,
  footer,
  children,
  className,
  bodyClassName,
}: {
  label?: string
  info?: string
  action?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-2xl border border-border bg-muted/70 p-1 dark:bg-muted/40', className)}>
      {label && (
        <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-1 pl-3 pr-1.5">
          <div className="flex min-w-0 items-center gap-1">
            <h3 className={cn(LABEL, 'truncate')}>{label}</h3>
            {info && <InfoTip text={info} />}
          </div>
          {action}
        </header>
      )}
      <div className={cn('min-w-0 flex-1 rounded-xl border border-border bg-card shadow-xs', bodyClassName)}>{children}</div>
      {footer && <div className="flex min-h-9 items-center justify-between gap-2 py-1 pl-1.5 pr-3 text-xs">{footer}</div>}
    </section>
  )
}

/** A tray whose body is padded and stacks its content — what every chart sits in. */
export function ChartTray({
  children,
  className,
  ...tray
}: Omit<React.ComponentProps<typeof Tray>, 'bodyClassName'>) {
  return (
    <Tray {...tray} className={cn('h-full', className)} bodyClassName="flex flex-col p-4 sm:p-5">
      {children}
    </Tray>
  )
}

/** The big figure at the top of a chart card, with a muted caption beside it. */
export function Headline({ value, title, caption }: { value: string; title?: string; caption?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="font-mono text-2xl font-semibold tracking-tight text-foreground tabular-nums" title={title}>
        {value}
      </span>
      {caption && <span className="text-xs text-muted-foreground">{caption}</span>}
    </div>
  )
}

export function EmptyChart({ children }: { children: React.ReactNode }) {
  return <p className="flex flex-1 items-center justify-center py-12 text-center text-xs text-muted-foreground">{children}</p>
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-muted p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-8 rounded-full px-3 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3.5',
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function PillSelect<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-8 cursor-pointer appearance-none rounded-full border border-border bg-card pl-3 pr-8 text-xs font-medium text-foreground shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

/** Things that deserve a second look, in words — never colour alone. */
export function AttentionStrip({ items }: { items: (string | false | null | undefined)[] }) {
  const shown = items.filter(Boolean) as string[]
  if (shown.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {shown.map((text) => (
        <span
          key={text}
          className="inline-flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="shrink-0">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          {text}
        </span>
      ))}
    </div>
  )
}

/** The table at the foot of a dashboard, in a tray without an inner card. */
export function TableTray({ label, info, children }: { label: string; info: string; children: React.ReactNode }) {
  return (
    <Tray label={label} info={info} bodyClassName="border-0 bg-transparent p-0.5 shadow-none sm:p-1">
      {children}
    </Tray>
  )
}

/* ── KPI tile ───────────────────────────────────────────────────────────── */

export interface SparkPoint {
  label: string
  value: number
  display: string
}

export interface KpiTrend {
  text: string
  direction: 'up' | 'down' | 'flat'
  /** Whether this direction is good news; null when the change is neutral. */
  good: boolean | null
}

function Spark({ points }: { points: SparkPoint[] }) {
  const max = Math.max(...points.map((p) => p.value), 0)
  return (
    <div
      role="img"
      aria-label={points.map((p) => `${p.label}: ${p.display}`).join(', ')}
      className="flex h-12 shrink-0 items-end gap-[5px]"
    >
      {points.map((p, i) => {
        const last = i === points.length - 1
        return (
          <span
            key={p.label}
            title={`${p.label}: ${p.display}`}
            className={cn('rounded-full', last ? 'w-[3px] bg-foreground' : 'w-[2px] bg-foreground/20')}
            style={{ height: `${max > 0 ? Math.max(14, (p.value / max) * 100) : 14}%` }}
          />
        )
      })}
    </div>
  )
}

export function KpiTile({
  label,
  value,
  prefix,
  unit,
  title,
  spark,
  info,
  trend,
  note,
}: {
  label: string
  value: string
  prefix?: string
  unit?: string
  /** The exact figure, for hover. */
  title?: string
  spark: SparkPoint[]
  info: string
  trend?: KpiTrend
  note: string
}) {
  const Arrow = trend?.direction === 'up' ? ArrowUpRight : trend?.direction === 'down' ? ArrowDownRight : null
  return (
    <Tray
      bodyClassName="p-4 sm:p-5"
      footer={
        <>
          <InfoTip text={info} />
          <p className="min-w-0 truncate text-right text-muted-foreground">
            {trend && (
              <span
                className={cn(
                  'mr-1 inline-flex items-center gap-0.5 font-semibold tabular-nums',
                  trend.good === null || trend.direction === 'flat'
                    ? 'text-foreground'
                    : trend.good
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                )}
              >
                {Arrow && <Arrow size={12} aria-hidden />}
                {trend.text}
              </span>
            )}
            {note}
          </p>
        </>
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={LABEL}>{label}</p>
          <p className="mt-3.5 flex items-baseline gap-1.5" title={title}>
            {prefix && <span className="text-xs font-medium text-muted-foreground">{prefix}</span>}
            <span className="font-mono text-[28px] font-semibold leading-none tracking-tight text-foreground tabular-nums sm:text-[30px]">
              {value}
            </span>
            {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
          </p>
        </div>
        <Spark points={spark} />
      </div>
    </Tray>
  )
}

/** Four KPI tiles: one column on phones, two on tablets, four from xl. */
export function KpiRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 stagger sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">{children}</div>
}

/* ── Tooltip ────────────────────────────────────────────────────────────── */

export interface TipRow {
  label: string
  value: string
  /** A CSS colour for the row's swatch; omit for none. */
  swatch?: string
}

/**
 * The hover card every chart shares. The caller positions it (absolute, in
 * the chart's own box) and flips it with `side` so it never leaves the card.
 */
export function TooltipCard({
  title,
  rows,
  side = 'right',
  style,
  className,
}: {
  title: string
  rows: TipRow[]
  side?: 'left' | 'right' | 'center'
  style?: React.CSSProperties
  className?: string
}) {
  return (
    <div
      role="tooltip"
      className={cn(
        'pointer-events-none absolute z-20 w-max min-w-40 max-w-60 rounded-xl border border-border bg-popover/95 p-1 text-popover-foreground shadow-lg backdrop-blur-sm',
        side === 'left' ? '-translate-x-[calc(100%+10px)]' : side === 'right' ? 'translate-x-[10px]' : '-translate-x-1/2',
        className
      )}
      style={style}
    >
      <p className="truncate rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground">{title}</p>
      <dl className="space-y-1 px-2.5 py-2 text-xs">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <dt className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
              {r.swatch && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: r.swatch }} />}
              <span className="truncate">{r.label}</span>
            </dt>
            <dd className="shrink-0 font-semibold tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Ink tokens for the monochrome charts: settled, part-way, open, and the empty grid. */
export const INK = {
  full: 'var(--foreground)',
  mid: 'color-mix(in oklch, var(--foreground) 55%, transparent)',
  soft: 'color-mix(in oklch, var(--foreground) 28%, transparent)',
  faint: 'color-mix(in oklch, var(--foreground) 5%, transparent)',
}

export const seriesColor = (slot: number | null) =>
  slot ? `var(--series-${slot})` : 'color-mix(in oklch, var(--muted-foreground) 45%, transparent)'
