'use client'

import { useMemo, useState } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ChartTray,
  EmptyChart,
  Headline,
  INK,
  LABEL,
  PillSelect,
  TooltipCard,
  fmtFull,
  fmtShort,
  median,
  pct,
  plural,
  seriesColor,
  type Slice,
  type ValueFormat,
} from './kit'

/**
 * Charts of shares and comparisons: how a whole splits, how things rank,
 * where work sits and how far it has travelled.
 */

/* ── Breakdown doughnut ─────────────────────────────────────────────────── */

export function BreakdownDonut<D extends string>({
  label,
  info,
  measure,
  format,
  noun,
  slices,
  insight,
  dimension,
  dimensions,
  onDimension,
}: {
  label: string
  info: string
  /** What the whole is, e.g. "Committed" — read as "Committed by project". */
  measure: string
  format: ValueFormat
  noun: string
  slices: Slice[]
  insight: string | null
  dimension?: D
  dimensions?: { value: D; label: string }[]
  onDimension?: (d: D) => void
}) {
  const [active, setActive] = useState<string | null>(null)
  const total = slices.reduce((s, x) => s + x.value, 0)
  const count = slices.reduce((s, x) => s + x.count, 0)
  const focus = slices.find((s) => s.key === active) ?? null
  const by = dimensions?.find((d) => d.value === dimension)?.label.toLowerCase()

  const R = 78
  const SW = 20
  const C = 2 * Math.PI * R
  const gap = slices.length > 1 ? 3 : 0
  const starts = slices.map((_, i) => slices.slice(0, i).reduce((sum, x) => sum + (x.value / total) * C, 0))

  return (
    <ChartTray label={label} info={info}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            {measure}
            {by ? ` by ${by}` : ''}
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-tight text-foreground tabular-nums" title={fmtFull(format, total)}>
            {fmtShort(format, total)}
          </p>
        </div>
        {dimensions && dimension && onDimension && (
          <PillSelect
            label="Break down by"
            value={dimension}
            options={dimensions}
            onChange={(d) => {
              onDimension(d)
              setActive(null)
            }}
          />
        )}
      </div>

      {insight && (
        <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-muted/70 px-3 py-2.5 text-xs text-foreground dark:bg-muted/50">
          <Sparkles size={14} className="mt-px shrink-0 text-muted-foreground" aria-hidden />
          <span>{insight}</span>
        </p>
      )}

      {total === 0 ? (
        <EmptyChart>Nothing to break down for these filters.</EmptyChart>
      ) : (
        <div className="mt-4 flex flex-1 flex-col items-center gap-5 sm:flex-row lg:flex-col 2xl:flex-row">
          <div className="relative w-44 shrink-0 sm:w-48" onPointerLeave={() => setActive(null)}>
            <svg viewBox="0 0 200 200" className="block h-auto w-full -rotate-90" role="group" aria-label={`${measure} share`}>
              <circle cx={100} cy={100} r={R} fill="none" strokeWidth={SW} className="stroke-muted" />
              {slices.map((s, i) => {
                const dash = Math.max((s.value / total) * C - gap, 0.75)
                return (
                  <circle
                    key={s.key}
                    cx={100}
                    cy={100}
                    r={R}
                    fill="none"
                    stroke={seriesColor(s.slot)}
                    strokeWidth={active === s.key ? SW + 6 : SW}
                    strokeDasharray={`${dash} ${C - dash}`}
                    strokeDashoffset={-starts[i]}
                    opacity={active && active !== s.key ? 0.3 : 1}
                    tabIndex={0}
                    role="img"
                    aria-label={`${s.label}: ${fmtFull(format, s.value)}, ${pct(s.value, total)}%`}
                    className="cursor-pointer outline-none transition-[stroke-width,opacity] duration-200"
                    onPointerEnter={() => setActive(s.key)}
                    onPointerDown={() => setActive(s.key)}
                    onFocus={() => setActive(s.key)}
                    onBlur={() => setActive(null)}
                  />
                )
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-9 text-center">
              <span className="max-w-full truncate text-[11px] text-muted-foreground">{focus ? focus.label : 'Total'}</span>
              <span className="font-mono text-lg font-semibold tracking-tight text-foreground tabular-nums">
                {fmtShort(format, focus ? focus.value : total)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {focus ? `${pct(focus.value, total)}% · ${plural(focus.count, noun)}` : plural(count, noun)}
              </span>
            </div>
          </div>

          <ul className="w-full min-w-0 flex-1 space-y-0.5">
            {slices.map((s) => (
              <li
                key={s.key}
                onPointerEnter={() => setActive(s.key)}
                onPointerLeave={() => setActive(null)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs transition-colors',
                  active === s.key ? 'bg-muted' : active ? 'opacity-60' : ''
                )}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: seriesColor(s.slot) }} />
                <span className="min-w-0 flex-1 truncate text-foreground" title={s.label}>
                  {s.label}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">{fmtShort(format, s.value)}</span>
                <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">{pct(s.value, total)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartTray>
  )
}

/* ── Stage bars: how far value has travelled ────────────────────────────── */

export interface StageBar {
  label: string
  note: string
  value: number
}

export function StageBars({
  label,
  info,
  stages,
  format,
  footer,
}: {
  label: string
  info: string
  /** First stage is the 100% base; later ones are shares of it. */
  stages: StageBar[]
  format: ValueFormat
  footer?: { label: string; value: string }[]
}) {
  const base = stages[0]?.value ?? 0
  // Ink deepens as value travels further, so the last stage reads as "done".
  const inks = stages.map((_, i) => `color-mix(in oklch, var(--foreground) ${Math.round(30 + (70 * i) / Math.max(1, stages.length - 1))}%, transparent)`)
  return (
    <ChartTray label={label} info={info}>
      <ul className="space-y-4">
        {stages.map((s, i) => {
          const share = base > 0 ? Math.min(1, s.value / base) : 0
          return (
            <li key={s.label} tabIndex={0} aria-label={`${s.label}: ${fmtFull(format, s.value)}, ${Math.round(share * 100)}%`} className="outline-none">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">{s.label}</span> · {s.note}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground" title={fmtFull(format, s.value)}>
                  <span className="font-semibold text-foreground">{fmtShort(format, s.value)}</span> · {Math.round(share * 100)}%
                </span>
              </div>
              <div className="mt-1.5 h-2.5 w-full rounded-r-[4px] bg-foreground/[0.06]">
                <div
                  className="h-full rounded-r-[4px] transition-[width] duration-500"
                  style={{ width: `${s.value > 0 ? Math.max(share * 100, 1.5) : 0}%`, background: inks[i] }}
                />
              </div>
            </li>
          )
        })}
      </ul>
      {footer && footer.length > 0 && (
        <div className="mt-auto pt-5">
          <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs">
            {footer.map((f) => (
              <div key={f.label}>
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="mt-0.5 font-mono text-base font-semibold text-foreground tabular-nums">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </ChartTray>
  )
}

/* ── Diverging bars: above or below a reference ─────────────────────────── */

export interface DivergingRow {
  label: string
  /** Signed difference from the reference. */
  delta: number
  /** The reference itself, for the percentage. */
  base: number
  count: number
}

export function DivergingBars({
  label,
  info,
  rows,
  reference,
  noun,
  empty,
  lowLabel = 'Under',
  highLabel = 'Over',
}: {
  label: string
  info: string
  rows: DivergingRow[]
  /** What the reference is, e.g. "requisitioned". */
  reference: string
  noun: string
  empty: string
  lowLabel?: string
  highLabel?: string
}) {
  const net = rows.reduce((s, r) => s + r.delta, 0)
  const netBase = rows.reduce((s, r) => s + r.base, 0)
  const shown = [...rows].filter((r) => Math.abs(r.delta) >= 0.5).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 6)
  const max = Math.max(1, ...shown.map((r) => Math.abs(r.delta)))
  return (
    <ChartTray label={label} info={info}>
      <Headline
        value={`${net > 0 ? '+' : ''}${fmtShort('money', net)}`}
        caption={`net · ${netBase > 0 ? ((net / netBase) * 100).toFixed(1) : '0.0'}% ${net > 0 ? 'above' : net < 0 ? 'below' : 'against'} ${reference}`}
      />
      {shown.length === 0 ? (
        <EmptyChart>{empty}</EmptyChart>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {shown.map((r) => {
              const w = (Math.abs(r.delta) / max) * 50
              const over = r.delta > 0
              const share = r.base > 0 ? (r.delta / r.base) * 100 : 0
              return (
                <li
                  key={r.label}
                  tabIndex={0}
                  className="outline-none"
                  title={`${r.label}: ${fmtFull('money', r.delta)} on ${fmtFull('money', r.base)} ${reference} · ${plural(r.count, noun)}`}
                >
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="truncate text-foreground">{r.label}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-foreground">
                      {over ? '+' : ''}
                      {fmtShort('money', r.delta)}{' '}
                      <span className="font-normal text-muted-foreground">
                        ({share > 0 ? '+' : ''}
                        {share.toFixed(1)}%)
                      </span>
                    </span>
                  </div>
                  <div className="relative mt-1.5 h-2">
                    <span className="absolute inset-y-[-3px] left-1/2 w-px bg-border" aria-hidden />
                    <span
                      className={cn('absolute inset-y-0', over ? 'left-1/2 rounded-r-[4px]' : 'right-1/2 rounded-l-[4px]')}
                      style={{ width: `${Math.max(w, r.delta ? 1 : 0)}%`, background: over ? 'var(--diverge-over)' : 'var(--diverge-under)' }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="mt-auto flex justify-between gap-3 pt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: 'var(--diverge-under)' }} /> {lowLabel}
            </span>
            <span className="inline-flex items-center gap-1.5">
              {highLabel} <span className="h-2 w-2 rounded-[2px]" style={{ background: 'var(--diverge-over)' }} />
            </span>
          </div>
        </>
      )}
    </ChartTray>
  )
}

/* ── Day histogram ──────────────────────────────────────────────────────── */

export const DAY_BUCKETS = [
  { label: 'Same day', max: 0 },
  { label: '1–3d', max: 3 },
  { label: '4–7d', max: 7 },
  { label: '8–14d', max: 14 },
  { label: '15–30d', max: 30 },
  { label: '30d+', max: Infinity },
]

/** How long things took (or have waited), in buckets; the column holding the median is dark. */
export function DayHistogram({
  label,
  info,
  days,
  noun,
  caption,
}: {
  label: string
  info: string
  days: number[]
  noun: string
  /** Words after the median, e.g. "median days to verify". */
  caption: string
}) {
  const sorted = [...days].sort((a, b) => a - b)
  const mid = median(sorted)
  const counts = DAY_BUCKETS.map((b, i) => {
    const min = i === 0 ? -Infinity : DAY_BUCKETS[i - 1].max
    return sorted.filter((d) => d > min && d <= b.max).length
  })
  const midBucket = mid === null ? -1 : DAY_BUCKETS.findIndex((b) => mid <= b.max)
  const max = Math.max(1, ...counts)

  return (
    <ChartTray label={label} info={info}>
      <Headline
        value={mid === null ? '—' : String(mid)}
        caption={mid === null ? `No ${noun}s to measure` : `${caption} · longest ${sorted[sorted.length - 1]}`}
      />
      {sorted.length > 0 && (
        <div className="mt-4 flex flex-1 flex-col justify-end">
          <div className="flex h-32 items-end gap-2 border-b border-border sm:gap-3">
            {counts.map((c, i) => (
              <div
                key={DAY_BUCKETS[i].label}
                tabIndex={0}
                aria-label={`${DAY_BUCKETS[i].label}: ${plural(c, noun)}, ${pct(c, sorted.length)}%`}
                title={`${DAY_BUCKETS[i].label}: ${plural(c, noun)} · ${pct(c, sorted.length)}%`}
                className="group flex h-full flex-1 flex-col items-center justify-end outline-none"
              >
                <span className="mb-1 text-[10px] font-semibold tabular-nums text-foreground">{c || ''}</span>
                <div
                  className={cn(
                    'w-full max-w-9 rounded-t-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80',
                    i === midBucket ? 'bg-foreground' : 'bg-foreground/25'
                  )}
                  style={{ height: `${c ? Math.max((c / max) * 100, 4) : 0}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-2 sm:gap-3">
            {DAY_BUCKETS.map((b, i) => (
              <span key={b.label} className={cn('flex-1 text-center text-[10px]', i === midBucket ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                {b.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </ChartTray>
  )
}

/* ── Ranked bars ────────────────────────────────────────────────────────── */

export interface RankedItem {
  label: string
  value: number
  /** Muted words after the value, e.g. "4 requisitions". */
  note?: string
}

export function RankedList({
  label,
  info,
  items,
  format,
  headline,
  limit = 7,
  empty = 'Nothing to rank for these filters.',
}: {
  label: string
  info: string
  items: RankedItem[]
  format: ValueFormat
  headline?: { value: string; caption: string }
  limit?: number
  empty?: string
}) {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  const shown = sorted.slice(0, limit)
  const rest = sorted.slice(limit)
  const max = Math.max(1, ...shown.map((r) => r.value))
  return (
    <ChartTray label={label} info={info}>
      {headline && <Headline value={headline.value} caption={headline.caption} />}
      {shown.length === 0 ? (
        <EmptyChart>{empty}</EmptyChart>
      ) : (
        <ol className={cn('space-y-3', headline && 'mt-4')}>
          {shown.map((r, i) => (
            <li key={r.label} tabIndex={0} className="outline-none" aria-label={`${r.label}: ${fmtFull(format, r.value)}${r.note ? `, ${r.note}` : ''}`}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="w-4 shrink-0 font-mono text-[10px] text-muted-foreground">{i + 1}</span>
                  <span className="truncate text-foreground" title={r.label}>
                    {r.label}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">{fmtShort(format, r.value)}</span>
                  {r.note && ` · ${r.note}`}
                </span>
              </div>
              <div className="ml-6 mt-1.5 h-2 rounded-r-[4px] bg-foreground/[0.06]">
                <div
                  className={cn('h-full rounded-r-[4px]', i === 0 ? 'bg-foreground' : 'bg-foreground/45')}
                  style={{ width: `${r.value > 0 ? Math.max((r.value / max) * 100, 1.5) : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
      {rest.length > 0 && (
        <p className="mt-auto pt-4 text-[11px] text-muted-foreground">
          + {rest.length} more · {fmtShort(format, rest.reduce((s, r) => s + r.value, 0))}
        </p>
      )}
    </ChartTray>
  )
}

/* ── Stage flow: where open work sits ───────────────────────────────────── */

export interface FlowStage {
  key: string
  label: string
  count: number
  value: number
  /** Average days items have sat at this stage. */
  avgDays: number | null
  /** Items over the waiting threshold. */
  stuck: number
}

export function StageFlow({
  label,
  info,
  stages,
  noun,
  stuckAfter,
}: {
  label: string
  info: string
  stages: FlowStage[]
  noun: string
  stuckAfter: number
}) {
  const open = stages.reduce((s, x) => s + x.count, 0)
  const stuck = stages.reduce((s, x) => s + x.stuck, 0)
  const bottleneck = stages.reduce((best, s) => (s.count > (best?.count ?? 0) ? s : best), null as FlowStage | null)
  const max = Math.max(1, ...stages.map((s) => s.count))

  return (
    <ChartTray label={label} info={info}>
      <Headline
        value={open.toLocaleString('en-GB')}
        caption={
          open === 0
            ? `nothing in the chain`
            : `${noun}s in the chain${bottleneck ? ` · most wait at ${bottleneck.label}` : ''}${stuck ? ` · ${stuck} over ${stuckAfter} days` : ''}`
        }
      />
      <ol className="mt-5 grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:items-stretch lg:gap-0">
        {stages.map((s, i) => {
          const isNeck = bottleneck?.key === s.key && s.count > 0
          return (
            <li key={s.key} className="flex min-w-0 items-stretch lg:flex-1">
              <div
                tabIndex={0}
                aria-label={`${s.label}: ${plural(s.count, noun)}, ${fmtFull('money', s.value)}${s.avgDays !== null ? `, averaging ${s.avgDays} days` : ''}${s.stuck ? `, ${s.stuck} over ${stuckAfter} days` : ''}`}
                className={cn(
                  'flex w-full min-w-0 flex-col rounded-xl border p-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  isNeck ? 'border-foreground/30 bg-foreground/[0.04]' : 'border-border'
                )}
              >
                <p className={cn(LABEL, 'truncate text-[10px]')}>{s.label}</p>
                <p className="mt-2 font-mono text-2xl font-semibold leading-none tracking-tight text-foreground tabular-nums">{s.count}</p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{fmtShort('money', s.value)}</p>
                <div className="mt-3 h-1.5 rounded-full bg-foreground/[0.06]">
                  <div
                    className={cn('h-full rounded-full', isNeck ? 'bg-foreground' : 'bg-foreground/35')}
                    style={{ width: `${s.count ? Math.max((s.count / max) * 100, 4) : 0}%` }}
                  />
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3 text-[11px]">
                  <span className="text-muted-foreground">{s.avgDays === null ? '—' : `avg ${s.avgDays}d here`}</span>
                  {s.stuck > 0 && (
                    <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">{s.stuck} &gt; {stuckAfter}d</span>
                  )}
                </div>
              </div>
              {i < stages.length - 1 && (
                <ChevronRight size={16} aria-hidden className="mx-0.5 hidden shrink-0 self-center text-muted-foreground/60 lg:block" />
              )}
            </li>
          )
        })}
      </ol>
    </ChartTray>
  )
}

/* ── Stacked share: one whole, in ordered steps ─────────────────────────── */

export interface ShareStep {
  label: string
  note: string
  count: number
  /** Optional money carried by the step. */
  value?: number
}

/**
 * One bar for one whole, split into steps that run in order (received →
 * recorded → verified). Ink deepens step by step, so "done" reads darkest.
 */
export function StackedShare({ label, info, steps, noun, doneLabel }: { label: string; info: string; steps: ShareStep[]; noun: string; doneLabel: string }) {
  const [active, setActive] = useState<number | null>(null)
  const total = steps.reduce((s, x) => s + x.count, 0)
  const inks = steps.map((_, i) => `color-mix(in oklch, var(--foreground) ${Math.round(22 + (78 * i) / Math.max(1, steps.length - 1))}%, transparent)`)
  const done = steps[steps.length - 1]

  return (
    <ChartTray label={label} info={info}>
      <Headline value={`${pct(done?.count ?? 0, total)}%`} caption={`${doneLabel} · ${plural(total, noun)} in all`} />
      {total === 0 ? (
        <EmptyChart>Nothing to show for these filters.</EmptyChart>
      ) : (
        <>
          <div className="mt-5 flex h-4 w-full gap-[3px]" onPointerLeave={() => setActive(null)}>
            {steps.map((s, i) =>
              s.count > 0 ? (
                <div
                  key={s.label}
                  tabIndex={0}
                  aria-label={`${s.label}: ${plural(s.count, noun)}, ${pct(s.count, total)}%`}
                  className={cn('h-full outline-none transition-opacity first:rounded-l-[4px] last:rounded-r-[4px]', active !== null && active !== i && 'opacity-40')}
                  style={{ width: `${(s.count / total) * 100}%`, background: inks[i] }}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                />
              ) : null
            )}
          </div>
          <ul className="mt-5 space-y-1">
            {steps.map((s, i) => (
              <li
                key={s.label}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs transition-colors', active === i && 'bg-muted')}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: inks[i] }} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{s.label}</span> <span className="text-muted-foreground">· {s.note}</span>
                </span>
                {s.value !== undefined && <span className="hidden shrink-0 tabular-nums text-muted-foreground sm:inline">{fmtShort('money', s.value)}</span>}
                <span className="shrink-0 font-semibold tabular-nums text-foreground">{s.count}</span>
                <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">{pct(s.count, total)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </ChartTray>
  )
}

/* ── Pareto ─────────────────────────────────────────────────────────────── */

export interface ParetoItem {
  label: string
  value: number
}

/**
 * How concentrated a total is: each item's share as a column, the running
 * share as a line, both on the same 0–100% scale — one axis, no second
 * scale to misread. Columns inside the first 80% are dark.
 */
export function Pareto({
  label,
  info,
  items,
  format,
  nounPlural,
  action,
  limit = 12,
}: {
  label: string
  info: string
  items: ParetoItem[]
  format: ValueFormat
  nounPlural: string
  action?: React.ReactNode
  limit?: number
}) {
  const [active, setActive] = useState<number | null>(null)
  const model = useMemo(() => {
    const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value)
    const total = sorted.reduce((s, i) => s + i.value, 0)
    const head = sorted.slice(0, limit)
    const tail = sorted.slice(limit)
    const bars = tail.length ? [...head, { label: `Others (${tail.length})`, value: tail.reduce((s, i) => s + i.value, 0) }] : head
    const rows = bars.map((b, i) => {
      const run = bars.slice(0, i + 1).reduce((s, x) => s + x.value, 0)
      return { ...b, share: total ? b.value / total : 0, cumulative: total ? run / total : 0 }
    })
    // How many of the named items it takes to reach 80%.
    let acc = 0
    let toEighty = 0
    for (const i of sorted) {
      acc += i.value
      toEighty += 1
      if (acc / total >= 0.8) break
    }
    return { rows, total, toEighty, count: sorted.length }
  }, [items, limit])

  const W = 600
  const H = 200
  const n = model.rows.length
  const slot = n ? W / n : W
  const y = (f: number) => H - f * H
  const cur = active !== null ? model.rows[active] : null

  return (
    <ChartTray label={label} info={info} action={action}>
      <Headline
        value={model.count ? `${model.toEighty} of ${model.count}` : '—'}
        caption={model.count ? `${nounPlural} account for 80% of ${fmtShort(format, model.total)}` : `no ${nounPlural} to rank yet`}
      />
      {n === 0 ? (
        <EmptyChart>Nothing to rank yet.</EmptyChart>
      ) : (
        <div className="mt-5 flex min-h-56 flex-1 gap-2">
          {/* mb-6 clears the label row (mt-2 + h-4) so the scale tracks the plot only. */}
          <div className="relative mb-6 w-8 shrink-0" aria-hidden>
            {[0, 0.5, 0.8, 1].map((f) => (
              <span key={f} className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground" style={{ top: `${(1 - f) * 100}%` }}>
                {Math.round(f * 100)}%
              </span>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {/* The plot fills whatever height the card has; marks are placed in percentages. */}
            <div className="relative min-h-0 flex-1" onPointerLeave={() => setActive(null)}>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="group" aria-label={label}>
                <line x1={0} x2={W} y1={y(0.8)} y2={y(0.8)} stroke="var(--foreground)" strokeOpacity={0.35} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
                {model.rows.map((r, i) => {
                  const inHead = r.cumulative - r.share < 0.8
                  const h = Math.max(r.share * H, 1.5)
                  return (
                    <rect
                      key={r.label}
                      x={i * slot + slot * 0.18}
                      y={H - h}
                      width={slot * 0.64}
                      height={h}
                      fill={active === i ? 'var(--foreground)' : inHead ? INK.mid : INK.soft}
                    />
                  )
                })}
                <polyline
                  points={model.rows.map((r, i) => `${i * slot + slot / 2},${y(r.cumulative)}`).join(' ')}
                  fill="none"
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                />
                {model.rows.map((r, i) => (
                  <rect
                    key={`hit-${r.label}`}
                    x={i * slot}
                    y={0}
                    width={slot}
                    height={H}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${r.label}: ${fmtFull(format, r.value)}, ${Math.round(r.share * 100)}% · running ${Math.round(r.cumulative * 100)}%`}
                    className="outline-none"
                    onPointerEnter={() => setActive(i)}
                    onPointerDown={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                  />
                ))}
              </svg>
              {/* Round markers in HTML, so the stretched SVG cannot squash them. */}
              {model.rows.map((r, i) => (
                <span
                  key={`dot-${r.label}`}
                  aria-hidden
                  className={cn('pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground', active === i ? 'h-3 w-3' : 'h-2 w-2')}
                  style={{ left: `${((i + 0.5) / n) * 100}%`, top: `${(1 - r.cumulative) * 100}%` }}
                />
              ))}
              {cur && active !== null && (
                <TooltipCard
                  title={cur.label}
                  side={active > n / 2 ? 'left' : 'right'}
                  className="top-2"
                  style={{ left: `${((active + 0.5) / n) * 100}%` }}
                  rows={[
                    { label: 'Value', value: fmtShort(format, cur.value) },
                    { label: 'Share', value: `${Math.round(cur.share * 100)}%`, swatch: INK.mid },
                    { label: 'Running total', value: `${Math.round(cur.cumulative * 100)}%`, swatch: INK.full },
                  ]}
                />
              )}
            </div>
            <div className="mt-2 flex h-4" aria-hidden>
              {model.rows.map((r, i) => (
                <span
                  key={r.label}
                  className={cn('min-w-0 flex-1 truncate px-0.5 text-center text-[10px]', active === i ? 'font-semibold text-foreground' : 'text-muted-foreground', i > 5 && 'hidden md:block')}
                  title={r.label}
                >
                  {r.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-x-5 gap-y-1 pt-4">
        <span className={cn(LABEL, 'inline-flex items-center gap-1.5 text-[10px]')}>
          <span className="h-2 w-2 rounded-[2px]" style={{ background: INK.mid }} /> Share
        </span>
        <span className={cn(LABEL, 'inline-flex items-center gap-1.5 text-[10px]')}>
          <span className="h-0.5 w-3 rounded-full bg-foreground" /> Running total
        </span>
        <span className={cn(LABEL, 'inline-flex items-center gap-1.5 text-[10px]')}>
          <span className="h-0 w-3 border-t border-dashed border-foreground/50" /> 80%
        </span>
      </div>
    </ChartTray>
  )
}

/* ── Treemap ────────────────────────────────────────────────────────────── */

export interface TreeItem {
  key: string
  label: string
  value: number
  /** One muted line under the label in larger cells. */
  sub?: string
}

type Rect = { x: number; y: number; w: number; h: number }

/** Squarified treemap layout (Bruls et al.): rows of cells kept as square as possible. */
function squarify<T extends { value: number }>(items: T[], box: Rect): (T & Rect)[] {
  const total = items.reduce((s, i) => s + i.value, 0)
  if (!total) return []
  const scale = (box.w * box.h) / total
  const queue = items.map((i) => ({ item: i, area: i.value * scale }))
  const out: (T & Rect)[] = []
  let { x, y, w, h } = box

  const worst = (row: number[], side: number) => {
    const sum = row.reduce((a, b) => a + b, 0)
    const max = Math.max(...row)
    const min = Math.min(...row)
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
  }

  while (queue.length) {
    const side = Math.min(w, h)
    const row: typeof queue = [queue.shift()!]
    while (queue.length && worst([...row, queue[0]].map((r) => r.area), side) <= worst(row.map((r) => r.area), side)) {
      row.push(queue.shift()!)
    }
    const sum = row.reduce((s, r) => s + r.area, 0)
    const thick = sum / side
    let offset = 0
    for (const r of row) {
      const len = r.area / thick
      out.push(w >= h ? { ...r.item, x, y: y + offset, w: thick, h: len } : { ...r.item, x: x + offset, y, w: len, h: thick })
      offset += len
    }
    if (w >= h) {
      x += thick
      w -= thick
    } else {
      y += thick
      h -= thick
    }
  }
  return out
}

/**
 * Each item a tile whose area is its value. Ink deepens with size so the big
 * tiles read first; labels appear only where a tile has room for them.
 */
export function Treemap({
  label,
  info,
  items,
  format,
  subLabel = 'Detail',
  headline,
  action,
}: {
  label: string
  info: string
  items: TreeItem[]
  format: ValueFormat
  /** What each item's `sub` line describes, for the tooltip. */
  subLabel?: string
  headline: { value: string; caption: string }
  action?: React.ReactNode
}) {
  const [active, setActive] = useState<string | null>(null)
  const sorted = useMemo(() => [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value), [items])
  const total = sorted.reduce((s, i) => s + i.value, 0)
  const tiles = useMemo(() => squarify(sorted, { x: 0, y: 0, w: 100, h: 100 }), [sorted])
  const top = sorted[0]?.value ?? 1
  const cur = tiles.find((t) => t.key === active)

  return (
    <ChartTray label={label} info={info} action={action}>
      <Headline value={headline.value} caption={headline.caption} />
      {tiles.length === 0 ? (
        <EmptyChart>Nothing to map yet.</EmptyChart>
      ) : (
        <div className="relative mt-5 h-64 flex-1 sm:h-72" onPointerLeave={() => setActive(null)} role="group" aria-label={label}>
          {tiles.map((t) => {
            const strength = 0.18 + 0.82 * Math.sqrt(t.value / top)
            const dark = strength > 0.5
            const roomy = t.w > 14 && t.h > 16
            return (
              <div
                key={t.key}
                tabIndex={0}
                aria-label={`${t.label}: ${fmtFull(format, t.value)}, ${pct(t.value, total)}%`}
                onPointerEnter={() => setActive(t.key)}
                onPointerDown={() => setActive(t.key)}
                onFocus={() => setActive(t.key)}
                onBlur={() => setActive(null)}
                className="absolute p-[1.5px] outline-none"
                style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}%`, height: `${t.h}%` }}
              >
                <div
                  className={cn(
                    'flex h-full w-full flex-col justify-between overflow-hidden rounded-lg p-2 transition-[filter,opacity] duration-200',
                    active && active !== t.key && 'opacity-50',
                    dark ? 'text-background' : 'text-foreground'
                  )}
                  style={{ background: `color-mix(in oklch, var(--foreground) ${Math.round(strength * 100)}%, transparent)` }}
                >
                  {roomy && (
                    <>
                      <span className="line-clamp-2 text-[11px] font-medium leading-tight">{t.label}</span>
                      <span className="font-mono text-xs font-semibold tabular-nums">
                        {fmtShort(format, t.value)}
                        <span className="ml-1 font-normal opacity-70">{pct(t.value, total)}%</span>
                      </span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
          {cur && (
            <TooltipCard
              title={cur.label}
              side={cur.x + cur.w / 2 > 55 ? 'left' : 'right'}
              style={{ left: `${cur.x + cur.w / 2}%`, top: `${Math.min(cur.y + cur.h / 2, 70)}%` }}
              rows={[
                { label: 'Value', value: fmtShort(format, cur.value) },
                { label: 'Share', value: `${pct(cur.value, total)}%` },
                ...(cur.sub ? [{ label: subLabel, value: cur.sub }] : []),
              ]}
            />
          )}
        </div>
      )}
    </ChartTray>
  )
}

/* ── Waffle ─────────────────────────────────────────────────────────────── */

/**
 * A hundred squares, each one percent: composition you can count. Squares are
 * handed out by largest remainder so the hundred always add up.
 */
export function Waffle({
  label,
  info,
  slices,
  noun,
  nounPlural = `${noun}s`,
  headline,
}: {
  label: string
  info: string
  slices: Slice[]
  noun: string
  nounPlural?: string
  headline: { value: string; caption: string }
}) {
  const [active, setActive] = useState<string | null>(null)
  const total = slices.reduce((s, x) => s + x.value, 0)

  const cells = useMemo(() => {
    if (!total) return []
    const exact = slices.map((s) => (s.value / total) * 100)
    const floors = exact.map(Math.floor)
    let left = 100 - floors.reduce((a, b) => a + b, 0)
    const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r)
    for (const { i } of order) {
      if (left <= 0) break
      floors[i] += 1
      left -= 1
    }
    return slices.flatMap((s, i) => Array.from({ length: floors[i] }, () => s))
  }, [slices, total])

  return (
    <ChartTray label={label} info={info}>
      <Headline value={headline.value} caption={headline.caption} />
      {total === 0 ? (
        <EmptyChart>Nothing to show yet.</EmptyChart>
      ) : (
        <div className="mt-5 flex flex-1 flex-col items-center gap-5 sm:flex-row sm:items-start lg:flex-col lg:items-center 2xl:flex-row 2xl:items-start">
          <div className="grid w-48 shrink-0 grid-cols-10 gap-[3px] sm:w-52" role="img" aria-label={slices.map((s) => `${s.label} ${pct(s.value, total)}%`).join(', ')} onPointerLeave={() => setActive(null)}>
            {cells.map((s, i) => (
              <span
                key={i}
                className={cn('aspect-square rounded-[3px] transition-opacity duration-200', active && active !== s.key && 'opacity-20')}
                style={{ background: seriesColor(s.slot) }}
                onPointerEnter={() => setActive(s.key)}
              />
            ))}
          </div>
          <ul className="w-full min-w-0 flex-1 space-y-0.5">
            {slices.map((s) => (
              <li
                key={s.key}
                tabIndex={0}
                onPointerEnter={() => setActive(s.key)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(s.key)}
                onBlur={() => setActive(null)}
                className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs outline-none transition-colors', active === s.key && 'bg-muted')}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: seriesColor(s.slot) }} />
                <span className="min-w-0 flex-1 truncate text-foreground" title={s.label}>
                  {s.label}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">{plural(s.count, noun, nounPlural)}</span>
                <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">{pct(s.value, total)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartTray>
  )
}

/* ── Meters: several independent ratios ─────────────────────────────────── */

export interface Meter {
  label: string
  have: number
  of: number
  /** Muted words after the count, e.g. "have a phone number". */
  note: string
}

/** Each a ratio against its own whole — completeness, coverage. Full is dark. */
export function MeterList({ label, info, meters, headline }: { label: string; info: string; meters: Meter[]; headline: { value: string; caption: string } }) {
  return (
    <ChartTray label={label} info={info}>
      <Headline value={headline.value} caption={headline.caption} />
      <ul className="mt-5 space-y-4">
        {meters.map((m) => {
          const share = m.of > 0 ? m.have / m.of : 0
          return (
            <li key={m.label} tabIndex={0} className="outline-none" aria-label={`${m.label}: ${m.have} of ${m.of}`}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">{m.label}</span> · {m.note}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">{m.have}</span>/{m.of}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-foreground/[0.06]">
                <div className={cn('h-full rounded-full', share >= 1 ? 'bg-foreground' : 'bg-foreground/45')} style={{ width: `${Math.max(share * 100, m.have ? 2 : 0)}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
    </ChartTray>
  )
}
