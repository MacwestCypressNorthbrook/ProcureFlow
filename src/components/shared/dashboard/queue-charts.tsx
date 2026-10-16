'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  ChartTray,
  EmptyChart,
  Headline,
  INK,
  LABEL,
  TooltipCard,
  fmtFull,
  fmtShort,
  lastMonths,
  median,
  monthKeyOf,
  monthLabel,
  pct,
  plural,
  seriesColor,
  type ValueFormat,
} from './kit'

/**
 * Charts for the role home pages: a gauge for one rate that matters, an
 * ageing strip for a queue, and stacked columns for decisions over time.
 */

/* ── Gauge ──────────────────────────────────────────────────────────────── */

export interface GaugePart {
  label: string
  count: number
  slot: number | null
}

/**
 * One rate on a half-dial — approval rate, pass rate, share settled — with
 * the counts it is made of listed underneath, so the needle is never the only
 * way to read it. A dashed tick marks the target when there is one.
 */
export function GaugeRing({
  label,
  info,
  rate,
  title,
  caption,
  parts,
  noun,
  target,
}: {
  label: string
  info: string
  /** 0–1, or null when there is nothing to rate yet. */
  rate: number | null
  /** What the rate is, under the figure — "approved first time". */
  title: string
  caption: string
  parts: GaugePart[]
  noun: string
  target?: number
}) {
  const R = 80
  const SW = 16
  const C = Math.PI * R
  const v = Math.max(0, Math.min(1, rate ?? 0))
  const total = parts.reduce((s, p) => s + p.count, 0)
  const point = (f: number, r: number) => {
    const a = Math.PI * (1 - f)
    return { x: 100 + r * Math.cos(a), y: 100 - r * Math.sin(a) }
  }
  const tickIn = target !== undefined ? point(target, R - SW / 2 - 4) : null
  const tickOut = target !== undefined ? point(target, R + SW / 2 + 4) : null

  return (
    <ChartTray label={label} info={info}>
      <div className="flex flex-1 flex-col justify-center">
        <div className="relative mx-auto w-full max-w-[260px]">
          <svg viewBox="0 0 200 112" className="block h-auto w-full" role="img" aria-label={`${title}: ${rate === null ? 'no data' : `${Math.round(v * 100)}%`}`}>
            <path d={`M${100 - R},100 A${R},${R} 0 0 1 ${100 + R},100`} fill="none" stroke={INK.faint} strokeWidth={SW} strokeLinecap="round" />
            {rate !== null && v > 0 && (
              <path
                d={`M${100 - R},100 A${R},${R} 0 0 1 ${100 + R},100`}
                fill="none"
                stroke="var(--foreground)"
                strokeWidth={SW}
                strokeLinecap="round"
                strokeDasharray={`${v * C} ${C}`}
                className="transition-[stroke-dasharray] duration-700"
              />
            )}
            {tickIn && tickOut && (
              <line x1={tickIn.x} y1={tickIn.y} x2={tickOut.x} y2={tickOut.y} stroke="var(--foreground)" strokeOpacity={0.7} strokeWidth={2.5} strokeLinecap="round" />
            )}
          </svg>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
            <span className="font-mono text-3xl font-semibold tracking-tight text-foreground tabular-nums">{rate === null ? '—' : `${Math.round(v * 100)}%`}</span>
            <span className="text-[11px] text-muted-foreground">{title}</span>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {caption}
          {target !== undefined && <span className="text-muted-foreground/80"> · target {Math.round(target * 100)}%</span>}
        </p>
      </div>
      {total > 0 ? (
        <ul className="space-y-0.5 pt-4">
          {parts.map((p) => (
            <li key={p.label} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: seriesColor(p.slot) }} />
              <span className="min-w-0 flex-1 truncate text-foreground">{p.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-foreground">{p.count}</span>
              <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">{pct(p.count, total)}%</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyChart>No {noun}s to rate yet.</EmptyChart>
      )}
    </ChartTray>
  )
}

/* ── Ageing strip ───────────────────────────────────────────────────────── */

export interface AgeingItem {
  id: string
  label: string
  /** Days it has waited. */
  days: number
  value: number
  urgent?: boolean
  href?: string
}

const LANE = 26
/** Lanes spread out to this pitch when the card has the height to spare. */
const MAX_PITCH = 46
const MAX_LANES = 7
/** Days to a left offset, inset so a dot at day 0 or at the far end is never cut in half. */
const toX = (days: number, span: number) => 3 + (days / span) * 94

/**
 * A queue at a glance: every waiting item a dot, left to right by how long it
 * has waited, sized by its value. Dashed lines mark three days, a week and a
 * fortnight; urgent items carry a ring. Selecting a dot opens the item.
 */
export function AgeingStrip({
  label,
  info,
  items,
  format,
  noun,
  empty,
}: {
  label: string
  info: string
  items: AgeingItem[]
  format: ValueFormat
  noun: string
  empty: string
}) {
  const [active, setActive] = useState<string | null>(null)

  const model = useMemo(() => {
    const span = Math.max(14, ...items.map((i) => i.days)) * 1.06
    const maxValue = Math.max(1, ...items.map((i) => i.value))
    // Greedy lanes: each dot takes the first lane where it clears the last one.
    const lanes: number[] = []
    const placed = [...items]
      .sort((a, b) => a.days - b.days)
      .map((item) => {
        const x = toX(item.days, span)
        let lane = lanes.findIndex((end) => x - end > 3.2)
        if (lane === -1) lane = lanes.length < MAX_LANES ? lanes.length : lanes.indexOf(Math.min(...lanes))
        lanes[lane] = x
        return { ...item, x, lane, size: 9 + Math.sqrt(item.value / maxValue) * 15 }
      })
    const days = items.map((i) => i.days)
    return {
      placed,
      span,
      lanes: Math.max(1, lanes.length),
      median: median(days),
      oldest: days.length ? Math.max(...days) : null,
      overWeek: days.filter((d) => d > 7).length,
      value: items.reduce((s, i) => s + i.value, 0),
      urgent: items.filter((i) => i.urgent).length,
      bands: [
        { label: 'Under 3 days', test: (d: number) => d < 3 },
        { label: '3–7 days', test: (d: number) => d >= 3 && d <= 7 },
        { label: 'Over a week', test: (d: number) => d > 7 },
      ].map(({ label, test }) => {
        const inBand = items.filter((i) => test(i.days))
        return { label, count: inBand.length, value: inBand.reduce((s, i) => s + i.value, 0) }
      }),
    }
  }, [items])

  const cur = model.placed.find((p) => p.id === active)
  const height = model.lanes * LANE + 12
  // Lane centres as a share of the band, so the band can stretch with the card.
  const laneTop = (lane: number) => `${((lane + 0.5) / model.lanes) * 100}%`

  return (
    <ChartTray label={label} info={info}>
      <Headline
        value={items.length.toLocaleString('en-GB')}
        caption={
          items.length
            ? `${noun}s waiting · ${fmtShort(format, model.value)} · median ${model.median}d, oldest ${model.oldest}d${model.urgent ? ` · ${model.urgent} urgent` : ''}`
            : `nothing waiting`
        }
      />
      {items.length === 0 ? (
        <EmptyChart>{empty}</EmptyChart>
      ) : (
        <>
          <div className="relative mt-6 flex-1" style={{ minHeight: height }} onPointerLeave={() => setActive(null)}>
            {[3, 7, 14].map((d) => (
              <div key={d} className="absolute inset-y-0 border-l border-dashed border-foreground/20" style={{ left: `${toX(d, model.span)}%` }} aria-hidden>
                <span className="absolute -top-5 -translate-x-1/2 font-mono text-[10px] text-muted-foreground">{d}d</span>
              </div>
            ))}
            {/* Past a week is the part that needs chasing; it sits on a faint wash. */}
            <div className="absolute inset-y-0 right-0 rounded-r-lg bg-amber-500/[0.06]" style={{ left: `${toX(7, model.span)}%` }} aria-hidden />
            {/* The dots sit in a band centred in whatever height the card gives the strip. */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2" style={{ height: `min(100% - 16px, ${model.lanes * MAX_PITCH}px)` }}>
              {model.placed.map((p) => {
                const dot = (
                  <span
                    className={cn(
                      'block rounded-full border-2 border-card transition-transform duration-200',
                      active === p.id && 'scale-125',
                      p.urgent && 'ring-2 ring-[var(--diverge-over)] ring-offset-1 ring-offset-card'
                    )}
                    style={{ width: p.size, height: p.size, background: p.days > 7 ? INK.full : INK.mid }}
                  />
                )
                const common = {
                  className: 'absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  style: { left: `${p.x}%`, top: laneTop(p.lane) },
                  'aria-label': `${p.label}: ${p.days} days, ${fmtFull(format, p.value)}${p.urgent ? ', urgent' : ''}`,
                  onPointerEnter: () => setActive(p.id),
                  onFocus: () => setActive(p.id),
                  onBlur: () => setActive(null),
                }
                return p.href ? (
                  <Link key={p.id} {...common} href={p.href}>
                    {dot}
                  </Link>
                ) : (
                  <span key={p.id} {...common} tabIndex={0}>
                    {dot}
                  </span>
                )
              })}
              {cur && (
                <TooltipCard
                  title={cur.label}
                  side={cur.x > 55 ? 'left' : 'right'}
                  style={{ left: `${cur.x}%`, top: laneTop(cur.lane) }}
                  rows={[
                    { label: 'Waiting', value: `${cur.days} day${cur.days === 1 ? '' : 's'}` },
                    { label: 'Value', value: fmtShort(format, cur.value) },
                    ...(cur.urgent ? [{ label: 'Flag', value: 'Urgent', swatch: 'var(--diverge-over)' }] : []),
                  ]}
                />
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground" aria-hidden>
            <span>Today</span>
            <span>{Math.round(model.span)} days</span>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs">
            {model.bands.map((band) => (
              <div key={band.label} className="min-w-0">
                <dt className="truncate text-muted-foreground">{band.label}</dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold text-foreground tabular-nums sm:text-base">{band.count}</dd>
                <dd className="truncate text-[11px] text-muted-foreground">{fmtShort(format, band.value)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            <span className={cn(LABEL, 'inline-flex items-center gap-1.5 text-[10px]')}>
              <span className="h-2 w-2 rounded-full" style={{ background: INK.mid }} /> A week or less
            </span>
            <span className={cn(LABEL, 'inline-flex items-center gap-1.5 text-[10px]')}>
              <span className="h-2 w-2 rounded-full" style={{ background: INK.full }} /> Over a week · {model.overWeek}
            </span>
            {model.urgent > 0 && (
              <span className={cn(LABEL, 'inline-flex items-center gap-1.5 text-[10px]')}>
                <span className="h-2 w-2 rounded-full ring-2 ring-[var(--diverge-over)]" /> Urgent
              </span>
            )}
            <span className={cn(LABEL, 'text-[10px]')}>Size = value</span>
          </div>
        </>
      )}
    </ChartTray>
  )
}

/* ── Stacked columns ────────────────────────────────────────────────────── */

export interface StackCategory {
  key: string
  label: string
  slot: number | null
}

export interface StackItem {
  at: string
  key: string
}

/**
 * Counts per month, split by category — decisions by outcome, intake by where
 * it ended up. Segments stack in the categories' order with a 2px gap, the
 * first category at the base so its trend is the easiest to follow.
 */
export function StackedColumns({
  label,
  info,
  items,
  categories,
  noun,
  headlineKey,
  headlineWord,
  months = 12,
}: {
  label: string
  info: string
  items: StackItem[]
  categories: StackCategory[]
  noun: string
  /** The category the headline reports a share of, e.g. "approved". */
  headlineKey: string
  headlineWord: string
  months?: number
}) {
  const [active, setActive] = useState<number | null>(null)

  const model = useMemo(() => {
    const keys = lastMonths(months)
    const cols = keys.map((m) => ({ month: m, counts: Object.fromEntries(categories.map((c) => [c.key, 0])) as Record<string, number>, total: 0 }))
    const index = new Map(keys.map((k, i) => [k, i]))
    for (const it of items) {
      const d = new Date(it.at)
      if (Number.isNaN(d.getTime())) continue
      const i = index.get(monthKeyOf(d))
      if (i === undefined || !(it.key in cols[i].counts)) continue
      cols[i].counts[it.key] += 1
      cols[i].total += 1
    }
    const totals = Object.fromEntries(categories.map((c) => [c.key, cols.reduce((s, col) => s + col.counts[c.key], 0)]))
    const all = cols.reduce((s, c) => s + c.total, 0)
    return { cols, totals, all, max: Math.max(1, ...cols.map((c) => c.total)) }
  }, [items, categories, months])

  const cur = active !== null ? model.cols[active] : null

  return (
    <ChartTray label={label} info={info}>
      <Headline
        value={model.all.toLocaleString('en-GB')}
        caption={`${noun}s in ${months} months · ${pct(model.totals[headlineKey] ?? 0, model.all)}% ${headlineWord}`}
      />
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {categories.map((c) => (
          <span key={c.key} className={cn(LABEL, 'inline-flex items-center gap-1.5 text-[10px]')}>
            <span className="h-2 w-2 rounded-[2px]" style={{ background: seriesColor(c.slot) }} /> {c.label} · {model.totals[c.key]}
          </span>
        ))}
      </div>
      {model.all === 0 ? (
        <EmptyChart>Nothing in the last {months} months.</EmptyChart>
      ) : (
        <>
          <div className="relative mt-5 flex min-h-44 flex-1 items-end gap-1.5 border-b border-border sm:gap-2" onPointerLeave={() => setActive(null)}>
            {model.cols.map((col, i) => (
              <div
                key={col.month}
                tabIndex={0}
                aria-label={`${monthLabel(col.month, 'long')}: ${categories.map((c) => `${c.label} ${col.counts[c.key]}`).join(', ')}`}
                className="group flex h-full flex-1 flex-col items-center justify-end outline-none"
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                <div className={cn('flex w-full max-w-8 flex-col-reverse gap-[2px] transition-opacity', active !== null && active !== i && 'opacity-50')} style={{ height: `${(col.total / model.max) * 100}%` }}>
                  {categories.map((c, j) =>
                    col.counts[c.key] > 0 ? (
                      <span
                        key={c.key}
                        className={cn('w-full', j === categories.length - 1 || categories.slice(j + 1).every((n) => col.counts[n.key] === 0) ? 'rounded-t-[4px]' : '')}
                        style={{ flexGrow: col.counts[c.key], flexBasis: 0, minHeight: 2, background: seriesColor(c.slot) }}
                      />
                    ) : null
                  )}
                </div>
              </div>
            ))}
            {cur && active !== null && (
              <TooltipCard
                title={monthLabel(cur.month, 'long')}
                side={active > model.cols.length / 2 ? 'left' : 'right'}
                className="top-0"
                style={{ left: `${((active + 0.5) / model.cols.length) * 100}%` }}
                rows={[
                  ...categories.map((c) => ({ label: c.label, value: String(cur.counts[c.key]), swatch: seriesColor(c.slot) })),
                  { label: 'Total', value: plural(cur.total, noun) },
                ]}
              />
            )}
          </div>
          <div className="mt-1.5 flex gap-1.5 sm:gap-2" aria-hidden>
            {model.cols.map((col, i) => (
              <span
                key={col.month}
                className={cn(
                  'flex-1 text-center font-mono text-[10px] uppercase',
                  active === i ? 'font-semibold text-foreground' : 'text-muted-foreground',
                  (model.cols.length - 1 - i) % 2 === 1 && 'hidden sm:inline'
                )}
              >
                {monthLabel(col.month).split(' ')[0]}
              </span>
            ))}
          </div>
        </>
      )}
    </ChartTray>
  )
}
