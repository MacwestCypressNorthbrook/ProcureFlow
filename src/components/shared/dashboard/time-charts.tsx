'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  ChartTray,
  EmptyChart,
  Headline,
  INK,
  LABEL,
  Segmented,
  TooltipCard,
  compact,
  fmtFull,
  fmtShort,
  pct,
  plural,
  type ValueFormat,
} from './kit'

/**
 * Charts over time: the dot-matrix trend, the activity calendar, the growth
 * line and the weekday × hour punch card. Each is one series in ink — the
 * shape is the story, so nothing competes with it for colour.
 */

/* ── Dot-matrix trend ───────────────────────────────────────────────────── */

export type Grain = 'week' | 'month' | 'quarter'

export interface TrendItem {
  at: string
  value: number
  /** The settled part of `value`, drawn dark; the rest is drawn light. */
  part: number
}

/**
 * Each period splits into a few columns of squares, so the texture inside a
 * month shows *when* in the month things happened. Each square is a round
 * amount, so the chart can be read by counting.
 */
const GRAINS: Record<Grain, { bins: number; subs: number; slice: string; every: [number, number] }> = {
  week: { bins: 26, subs: 2, slice: 'half a week', every: [4, 2] },
  month: { bins: 12, subs: 4, slice: 'one week', every: [2, 1] },
  quarter: { bins: 8, subs: 6, slice: 'two weeks', every: [2, 1] },
}

const ROWS = 16
const grainNoun: Record<Grain, string> = { week: 'week', month: 'month', quarter: 'quarter' }
const PITCH = 12
const GAP = 2
const BIN_GAP = 4

/** A round step at or above `x`: 1, 2, 2.5 or 5 × 10ⁿ — never 2.5 when counting whole things. */
function niceStep(x: number, whole = false) {
  if (x <= 0) return 1
  const exp = 10 ** Math.floor(Math.log10(x))
  const f = x / exp
  const quarter = !whole || exp >= 10
  return (f <= 1 ? 1 : f <= 2 ? 2 : quarter && f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp
}

function periods(grain: Grain, now = new Date()) {
  const { bins } = GRAINS[grain]
  const out: { start: Date; end: Date; short: string; long: string }[] = []
  for (let i = bins - 1; i >= 0; i--) {
    let start: Date
    let end: Date
    if (grain === 'week') {
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
      start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - i * 7)
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
    } else if (grain === 'month') {
      start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    } else {
      const q = Math.floor(now.getMonth() / 3)
      start = new Date(now.getFullYear(), (q - i) * 3, 1)
      end = new Date(start.getFullYear(), start.getMonth() + 3, 1)
    }
    const quarter = Math.floor(start.getMonth() / 3) + 1
    out.push({
      start,
      end,
      short:
        grain === 'week'
          ? start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : grain === 'month'
            ? start.toLocaleDateString('en-GB', { month: 'short' })
            : `Q${quarter} ’${String(start.getFullYear()).slice(2)}`,
      long:
        grain === 'week'
          ? `Week of ${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
          : grain === 'month'
            ? start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
            : `Q${quarter} ${start.getFullYear()}`,
    })
  }
  return out
}

export function PixelTrend({
  label,
  info,
  items,
  format,
  noun,
  partLabel,
  restLabel,
  rangeLabel,
}: {
  label: string
  info: string
  items: TrendItem[]
  format: ValueFormat
  /** What one item is, singular — "PO", "invoice". */
  noun: string
  /** The dark squares, e.g. "Invoiced"; the light ones, e.g. "Awaiting invoice". */
  partLabel: string
  restLabel: string
  /** The headline's caption, e.g. "Committed in range". */
  rangeLabel: string
}) {
  const [grain, setGrain] = useState<Grain>('month')
  const [active, setActive] = useState<number | null>(null)
  const { subs, slice, every } = GRAINS[grain]

  const model = useMemo(() => {
    const bins = periods(grain).map((p) => ({
      ...p,
      value: 0,
      part: 0,
      count: 0,
      slices: Array.from({ length: GRAINS[grain].subs }, () => ({ value: 0, part: 0 })),
    }))
    for (const item of items) {
      const t = new Date(item.at).getTime()
      if (Number.isNaN(t)) continue
      const bin = bins.find((b) => t >= b.start.getTime() && t < b.end.getTime())
      if (!bin) continue
      const span = bin.end.getTime() - bin.start.getTime()
      const s = Math.min(bin.slices.length - 1, Math.floor(((t - bin.start.getTime()) / span) * bin.slices.length))
      bin.value += item.value
      bin.part += item.part
      bin.count += 1
      bin.slices[s].value += item.value
      bin.slices[s].part += item.part
    }
    const peak = Math.max(0, ...bins.flatMap((b) => b.slices.map((s) => s.value)))
    // A square is never a fraction of one thing when counting things.
    const cell = format === 'count' ? Math.max(1, niceStep(peak / ROWS, true)) : niceStep(peak / ROWS)
    return {
      bins,
      cell,
      peak,
      peakBin: bins.reduce((best, b) => (b.value > best.value ? b : best), bins[0]),
      latest: bins[bins.length - 1],
      total: bins.reduce((s, b) => s + b.value, 0),
      part: bins.reduce((s, b) => s + b.part, 0),
      count: bins.reduce((s, b) => s + b.count, 0),
    }
  }, [items, grain, format])

  const binW = subs * PITCH + BIN_GAP
  const W = model.bins.length * binW - BIN_GAP - GAP
  const H = ROWS * PITCH - GAP
  const center = (b: number) => b * binW + (subs * PITCH - GAP) / 2
  const current = active !== null ? model.bins[active] : null

  return (
    <ChartTray label={label} info={info}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-xs text-muted-foreground">{rangeLabel}</span>
          <Headline
            value={fmtShort(format, model.total)}
            title={fmtFull(format, model.total)}
            caption={`${plural(model.count, noun)} · ${pct(model.part, model.total)}% ${partLabel.toLowerCase()}`}
          />
        </div>
        <Segmented
          label="Period"
          value={grain}
          onChange={(g) => {
            setGrain(g)
            setActive(null)
          }}
          options={[
            { value: 'week', label: 'Weekly' },
            { value: 'month', label: 'Monthly' },
            { value: 'quarter', label: 'Quarterly' },
          ]}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        <span className={cn(LABEL, 'inline-flex items-center gap-1.5 text-[10px]')}>
          <span className="h-2 w-2 rounded-[2px]" style={{ background: INK.full }} /> {partLabel}
        </span>
        <span className={cn(LABEL, 'inline-flex items-center gap-1.5 text-[10px]')}>
          <span className="h-2 w-2 rounded-[2px]" style={{ background: INK.soft }} /> {restLabel}
        </span>
      </div>

      {model.peak === 0 ? (
        <EmptyChart>Nothing in this range for these filters.</EmptyChart>
      ) : (
        <>
          <div className="mt-5 flex gap-2 sm:gap-3">
            {/* Y axis: a label every four squares. mb-6 clears the x-axis row below the plot. */}
            <div className="relative mb-6 w-9 shrink-0 sm:w-11" aria-hidden>
              {[0, 4, 8, 12, 16].map((k) => (
                <span
                  key={k}
                  className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                  style={{ top: `${100 - ((k * PITCH - (k ? GAP / 2 : 0)) / H) * 100}%` }}
                >
                  {k === 0 ? '0' : compact(k * model.cell)}
                </span>
              ))}
            </div>

            <div className="relative min-w-0 flex-1" onPointerLeave={() => setActive(null)}>
              <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-label={label}>
                {model.bins.map((bin, b) =>
                  bin.slices.map((s, i) => {
                    const filled = s.value > 0 ? Math.min(ROWS, Math.ceil(s.value / model.cell)) : 0
                    const dark = s.part > 0 ? Math.min(filled, Math.max(1, Math.round(s.part / model.cell))) : 0
                    const x = b * binW + i * PITCH
                    return Array.from({ length: ROWS }, (_, r) => (
                      <rect
                        key={`${b}-${i}-${r}`}
                        x={x}
                        y={(ROWS - 1 - r) * PITCH}
                        width={PITCH - GAP}
                        height={PITCH - GAP}
                        rx={1.5}
                        className={cn(
                          'transition-[fill] duration-200',
                          r < dark
                            ? 'fill-foreground'
                            : r < filled
                              ? 'fill-foreground/30'
                              : active === b
                                ? 'fill-foreground/[0.09]'
                                : 'fill-foreground/[0.045]'
                        )}
                      />
                    ))
                  })
                )}

                {active !== null && (
                  <line
                    x1={center(active)}
                    x2={center(active)}
                    y1={0}
                    y2={H}
                    strokeDasharray="2 3"
                    className="stroke-foreground/60"
                    strokeWidth={1}
                    pointerEvents="none"
                  />
                )}

                {/* Hit targets: a whole period, taller and wider than its marks. */}
                {model.bins.map((bin, b) => (
                  <rect
                    key={`hit-${b}`}
                    x={b * binW - BIN_GAP / 2}
                    y={0}
                    width={binW}
                    height={H}
                    fill="transparent"
                    tabIndex={0}
                    role="img"
                    aria-label={`${bin.long}: ${fmtFull(format, bin.value)} across ${plural(bin.count, noun)}, ${fmtFull(format, bin.part)} ${partLabel.toLowerCase()}`}
                    className="cursor-crosshair outline-none"
                    onPointerEnter={() => setActive(b)}
                    onPointerDown={() => setActive(b)}
                    onFocus={() => setActive(b)}
                    onBlur={() => setActive(null)}
                  />
                ))}
              </svg>

              {current && active !== null && (
                <TooltipCard
                  title={current.long}
                  side={active > model.bins.length / 2 ? 'left' : 'right'}
                  className="top-1"
                  style={{ left: `${(center(active) / W) * 100}%` }}
                  rows={[
                    { label: partLabel, value: fmtShort(format, current.part), swatch: INK.full },
                    { label: restLabel, value: fmtShort(format, current.value - current.part), swatch: INK.soft },
                    { label: plural(current.count, noun), value: fmtShort(format, current.value) },
                  ]}
                />
              )}

              {/* X axis: the latest period is always labelled; fewer labels on phones. */}
              <div className="relative mt-2 h-4" aria-hidden>
                {model.bins.map((bin, b) => {
                  const fromEnd = model.bins.length - 1 - b
                  const desktop = fromEnd % every[1] === 0
                  const mobile = fromEnd % every[0] === 0
                  if (!desktop && !mobile) return null
                  return (
                    <span
                      key={b}
                      className={cn(
                        'absolute -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-wider',
                        active === b ? 'font-semibold text-foreground' : 'text-muted-foreground',
                        !mobile && 'hidden sm:inline'
                      )}
                      style={{ left: `${(center(b) / W) * 100}%` }}
                    >
                      {bin.short}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="mt-auto pt-5">
            <dl className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs">
              {[
                { label: `Peak ${grainNoun[grain]}`, value: fmtShort(format, model.peakBin.value), sub: model.peakBin.long },
                { label: `Average ${grainNoun[grain]}`, value: fmtShort(format, model.total / model.bins.length), sub: `over ${model.bins.length} ${grainNoun[grain]}s` },
                {
                  label: `This ${grainNoun[grain]}`,
                  value: fmtShort(format, model.latest.value),
                  sub: model.total ? `${pct(model.latest.value, model.total / model.bins.length)}% of average` : '—',
                },
              ].map((x) => (
                <div key={x.label} className="min-w-0">
                  <dt className="truncate text-muted-foreground">{x.label}</dt>
                  <dd className="mt-0.5 truncate font-mono text-sm font-semibold text-foreground tabular-nums sm:text-base">{x.value}</dd>
                  <dd className="truncate text-[11px] text-muted-foreground">{x.sub}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="pt-3 text-[11px] text-muted-foreground">
            Each square = {format === 'money' ? `GHS ${compact(model.cell)}` : plural(model.cell, noun)} · each column of squares ≈ {slice}
          </p>
        </>
      )}
    </ChartTray>
  )
}

/* ── Activity calendar ──────────────────────────────────────────────────── */

export interface DatedValue {
  at: string
  value: number
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAY_NAMES = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/**
 * One square per day for the last half-year, darker the busier — the rhythm
 * of the work at a glance: which weekdays carry it, and which weeks went quiet.
 */
export function CalendarHeatmap({
  label,
  info,
  items,
  noun,
  valueFormat,
  weeks = 26,
}: {
  label: string
  info: string
  items: DatedValue[]
  noun: string
  /** When set, a toggle switches the shading between count and this value. */
  valueFormat?: ValueFormat
  weeks?: number
}) {
  const [measure, setMeasure] = useState<'count' | 'value'>('count')
  const [active, setActive] = useState<{ col: number; row: number } | null>(null)

  const model = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
    const start = new Date(monday)
    start.setDate(monday.getDate() - (weeks - 1) * 7)

    const days = new Map<string, { count: number; value: number }>()
    for (const item of items) {
      const d = new Date(item.at)
      if (Number.isNaN(d.getTime()) || d < start) continue
      const k = dayKey(d)
      const e = days.get(k) ?? { count: 0, value: 0 }
      e.count += 1
      e.value += item.value
      days.set(k, e)
    }
    const cells = Array.from({ length: weeks }, (_, col) =>
      Array.from({ length: 7 }, (_, row) => {
        const date = new Date(start)
        date.setDate(start.getDate() + col * 7 + row)
        const e = days.get(dayKey(date)) ?? { count: 0, value: 0 }
        return { date, future: date > today, ...e }
      })
    )
    const flat = cells.flat().filter((c) => !c.future)
    const busiest = flat.reduce((best, c) => (c.count > best.count ? c : best), flat[0])
    const weekdayTotals = WEEKDAYS.map((_, row) => cells.reduce((s, col) => s + col[row].count, 0))
    return {
      cells,
      busiest,
      total: flat.reduce((s, c) => s + c.count, 0),
      totalValue: flat.reduce((s, c) => s + c.value, 0),
      activeDays: flat.filter((c) => c.count > 0).length,
      weekdayTotals,
      topWeekday: weekdayTotals.indexOf(Math.max(...weekdayTotals)),
    }
  }, [items, weeks])

  const metric = (c: { count: number; value: number }) => (measure === 'count' ? c.count : c.value)
  const max = Math.max(1, ...model.cells.flat().map(metric))
  const shade = (v: number) =>
    v <= 0 ? INK.faint : `color-mix(in oklch, var(--foreground) ${Math.round(18 + (v / max) * 82)}%, transparent)`

  const P = 14
  const G = 3
  const W = weeks * P - G
  const H = 7 * P - G
  const cur = active ? model.cells[active.col][active.row] : null
  const fullDate = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <ChartTray
      label={label}
      info={info}
      action={
        valueFormat && (
          <Segmented
            label="Shade by"
            value={measure}
            onChange={setMeasure}
            options={[
              { value: 'count', label: 'Count' },
              { value: 'value', label: 'Value' },
            ]}
          />
        )
      }
    >
      <Headline
        value={model.total.toLocaleString('en-GB')}
        caption={`${noun}s in ${weeks} weeks · active on ${model.activeDays} days${valueFormat ? ` · ${fmtShort(valueFormat, model.totalValue)}` : ''}`}
      />
      {model.total > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Busiest day: <span className="font-medium text-foreground">{fullDate(model.busiest.date)}</span> ({plural(model.busiest.count, noun)}) ·
          most work lands on <span className="font-medium text-foreground">{WEEKDAY_NAMES[model.topWeekday]}</span>
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <div className="relative mt-5 w-7 shrink-0" aria-hidden>
          {[0, 2, 4].map((row) => (
            <span
              key={row}
              className="absolute right-0 -translate-y-1/2 text-[10px] text-muted-foreground"
              style={{ top: `${((row * P + (P - G) / 2) / H) * 100}%` }}
            >
              {WEEKDAYS[row]}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" onPointerLeave={() => setActive(null)}>
          {/* Month labels where a month's first week begins. */}
          <div className="relative h-5" aria-hidden>
            {model.cells.map((col, i) =>
              col[0].date.getDate() <= 7 ? (
                <span
                  key={i}
                  className="absolute top-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                  style={{ left: `${((i * P) / W) * 100}%` }}
                >
                  {col[0].date.toLocaleDateString('en-GB', { month: 'short' })}
                </span>
              ) : null
            )}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-label={label}>
            {model.cells.map((col, c) =>
              col.map((cell, r) =>
                cell.future ? null : (
                  <rect
                    key={`${c}-${r}`}
                    x={c * P}
                    y={r * P}
                    width={P - G}
                    height={P - G}
                    rx={2.5}
                    fill={shade(metric(cell))}
                    stroke={active?.col === c && active.row === r ? 'var(--foreground)' : 'none'}
                    strokeWidth={1.5}
                    tabIndex={0}
                    role="img"
                    aria-label={`${fullDate(cell.date)}: ${plural(cell.count, noun)}`}
                    className="cursor-pointer outline-none"
                    onPointerEnter={() => setActive({ col: c, row: r })}
                    onPointerDown={() => setActive({ col: c, row: r })}
                    onFocus={() => setActive({ col: c, row: r })}
                    onBlur={() => setActive(null)}
                  />
                )
              )
            )}
          </svg>
          {cur && active && (
            <TooltipCard
              title={fullDate(cur.date)}
              side={active.col > weeks / 2 ? 'left' : 'right'}
              style={{ left: `${(((active.col + 0.5) * P) / W) * 100}%`, top: `calc(20px + ${((active.row * P) / H) * 100}%)` }}
              rows={[
                { label: `${noun}s`, value: cur.count.toLocaleString('en-GB') },
                ...(valueFormat ? [{ label: 'Value', value: fmtShort(valueFormat, cur.value) }] : []),
              ]}
            />
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-6">
        {/* The same days folded onto the week: which weekdays carry the work. */}
        <div role="img" aria-label={`By weekday: ${WEEKDAYS.map((d, i) => `${d} ${model.weekdayTotals[i]}`).join(', ')}`}>
          <p className={cn(LABEL, 'text-[10px]')}>By weekday</p>
          <div className="mt-2 flex items-end gap-2 sm:gap-3">
            {WEEKDAYS.map((d, i) => {
              const n = model.weekdayTotals[i]
              const top = Math.max(1, ...model.weekdayTotals)
              return (
                <div key={d} className="flex w-6 flex-col items-center gap-1 sm:w-7" title={`${d}: ${plural(n, noun)}`}>
                  <span className="text-[10px] font-semibold tabular-nums text-foreground">{n}</span>
                  <span
                    className="w-full rounded-t-[3px]"
                    style={{ height: `${Math.max(2, (n / top) * 40)}px`, background: i === model.topWeekday ? INK.full : INK.soft }}
                  />
                  <span className={cn('text-[10px]', i === model.topWeekday ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{d.slice(0, 2)}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground" aria-hidden>
          Less
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <span key={f} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: f === 0 ? INK.faint : shade(f * max) }} />
          ))}
          More
        </div>
      </div>
    </ChartTray>
  )
}

/* ── Growth line ────────────────────────────────────────────────────────── */

export interface GrowthPoint {
  label: string
  /** Running total at the end of the period. */
  total: number
  /** Added during the period. */
  added: number
}

export function GrowthLine({
  label,
  info,
  points,
  noun,
}: {
  label: string
  info: string
  points: GrowthPoint[]
  noun: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const W = 600
  const H = 180
  const max = Math.max(1, ...points.map((p) => p.total))
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * W : W / 2)
  const y = (v: number) => H - (v / max) * (H - 8) - 2
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.total)}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`
  const last = points[points.length - 1]
  const recent = points.slice(-3).reduce((s, p) => s + p.added, 0)
  const cur = active !== null ? points[active] : null

  return (
    <ChartTray label={label} info={info}>
      <Headline value={(last?.total ?? 0).toLocaleString('en-GB')} caption={`${noun}s · +${recent} in the last three months`} />
      <div className="mt-5 flex min-h-44 flex-1 flex-col">
        {/* The plot fills whatever height the card has; the marker is placed in percentages. */}
        <div className="relative min-h-0 flex-1" onPointerLeave={() => setActive(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={label}>
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <line key={f} x1={0} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={area} fill="color-mix(in oklch, var(--foreground) 7%, transparent)" />
            <path d={line} fill="none" stroke="var(--foreground)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            {active !== null && (
              <line x1={x(active)} x2={x(active)} y1={0} y2={H} stroke="var(--foreground)" strokeOpacity={0.5} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
            )}
            {points.map((p, i) => (
              <rect
                key={p.label}
                x={x(i) - W / points.length / 2}
                y={0}
                width={W / points.length}
                height={H}
                fill="transparent"
                tabIndex={0}
                aria-label={`${p.label}: ${p.total} ${noun}s, ${p.added} added`}
                className="outline-none"
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            ))}
          </svg>
          {/* The marker sits in HTML so it stays round under the stretched SVG. */}
          {active !== null && cur && (
            <>
              <span
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground"
                style={{ left: `${(x(active) / W) * 100}%`, top: `${(y(cur.total) / H) * 100}%` }}
              />
              <TooltipCard
                title={cur.label}
                side={active > points.length / 2 ? 'left' : 'right'}
                className="top-0"
                style={{ left: `${(x(active) / W) * 100}%` }}
                rows={[
                  { label: 'Total', value: cur.total.toLocaleString('en-GB') },
                  { label: 'Added', value: `+${cur.added}` },
                ]}
              />
            </>
          )}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground" aria-hidden>
          {points.map((p, i) => (
            <span key={p.label} className={cn(i % 2 === 1 && 'hidden sm:inline', active === i && 'font-semibold text-foreground')}>
              {p.label.split(' ')[0]}
            </span>
          ))}
        </div>
      </div>
    </ChartTray>
  )
}

/* ── Punch card ─────────────────────────────────────────────────────────── */

/**
 * When the work happens: one dot per weekday and hour, sized by how much
 * happened then. Area, not radius, follows the count, so a dot twice as big
 * means twice as much.
 */
export function PunchCard({ label, info, times, noun }: { label: string; info: string; times: string[]; noun: string }) {
  const [active, setActive] = useState<{ d: number; h: number } | null>(null)

  const model = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
    for (const t of times) {
      const d = new Date(t)
      if (Number.isNaN(d.getTime())) continue
      grid[(d.getDay() + 6) % 7][d.getHours()] += 1
    }
    let peak = { d: 0, h: 0, n: 0 }
    grid.forEach((row, d) => row.forEach((n, h) => n > peak.n && (peak = { d, h, n })))
    const office = grid.reduce((s, row, d) => s + (d < 5 ? row.slice(8, 18).reduce((a, b) => a + b, 0) : 0), 0)
    const byDay = grid.map((row) => row.reduce((a, b) => a + b, 0))
    const byHour = Array.from({ length: 24 }, (_, h) => grid.reduce((s, row) => s + row[h], 0))
    return {
      grid,
      peak,
      total: grid.flat().reduce((a, b) => a + b, 0),
      office,
      topDay: byDay.indexOf(Math.max(...byDay)),
      topDayCount: Math.max(...byDay),
      topHour: byHour.indexOf(Math.max(...byHour)),
      topHourCount: Math.max(...byHour),
    }
  }, [times])

  const max = Math.max(1, model.peak.n)
  const CW = 24
  const RH = 26
  const W = 24 * CW
  const H = 7 * RH
  const hour = (h: number) => `${String(h).padStart(2, '0')}:00`
  const cur = active ? model.grid[active.d][active.h] : 0

  return (
    <ChartTray label={label} info={info}>
      <Headline
        value={model.total ? `${WEEKDAYS[model.peak.d]} ${hour(model.peak.h)}` : '—'}
        caption={model.total ? `busiest hour · ${pct(model.office, model.total)}% of ${noun}s land in office hours` : `no ${noun}s yet`}
      />
      {model.total === 0 ? (
        <EmptyChart>Nothing recorded yet.</EmptyChart>
      ) : (
        // Twenty-four hours need room: on a phone the grid scrolls sideways rather than shrink unreadably.
        <div className="-mx-1 mt-5 overflow-x-auto px-1 pb-1">
        <div className="flex min-w-[540px] gap-2">
          {/* mb-6 clears the hour labels (mt-2 + h-4) so weekdays line up with their rows. */}
          <div className="relative mb-6 w-8 shrink-0" aria-hidden>
            {WEEKDAYS.map((d, i) => (
              <span key={d} className="absolute right-0 -translate-y-1/2 text-[10px] text-muted-foreground" style={{ top: `${((i + 0.5) / 7) * 100}%` }}>
                {d}
              </span>
            ))}
          </div>
          <div className="relative min-w-0 flex-1" onPointerLeave={() => setActive(null)}>
            <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-label={label}>
              {model.grid.map((row, d) =>
                row.map((n, h) => (
                  <g key={`${d}-${h}`}>
                    <circle cx={h * CW + CW / 2} cy={d * RH + RH / 2} r={1.2} fill="var(--border)" />
                    {n > 0 && (
                      <circle
                        cx={h * CW + CW / 2}
                        cy={d * RH + RH / 2}
                        r={Math.max(2.5, Math.sqrt(n / max) * 10.5)}
                        fill={active?.d === d && active.h === h ? 'var(--foreground)' : INK.mid}
                      />
                    )}
                    <rect
                      x={h * CW}
                      y={d * RH}
                      width={CW}
                      height={RH}
                      fill="transparent"
                      tabIndex={n > 0 ? 0 : -1}
                      aria-label={`${WEEKDAYS[d]} ${hour(h)}: ${plural(n, noun)}`}
                      className="outline-none"
                      onPointerEnter={() => setActive({ d, h })}
                      onFocus={() => setActive({ d, h })}
                      onBlur={() => setActive(null)}
                    />
                  </g>
                ))
              )}
            </svg>
            {active && (
              <TooltipCard
                title={`${WEEKDAYS[active.d]} · ${hour(active.h)}–${hour((active.h + 1) % 24)}`}
                side={active.h > 12 ? 'left' : 'right'}
                style={{ left: `${((active.h + 0.5) / 24) * 100}%`, top: `${((active.d + 0.5) / 7) * 100}%` }}
                rows={[{ label: `${noun}s`, value: cur.toLocaleString('en-GB') }]}
              />
            )}
            <div className="relative mt-2 h-4" aria-hidden>
              {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
                <span
                  key={h}
                  className={cn('absolute -translate-x-1/2 font-mono text-[10px] text-muted-foreground', h % 6 !== 0 && 'hidden sm:inline')}
                  style={{ left: `${((h + 0.5) / 24) * 100}%` }}
                >
                  {hour(h)}
                </span>
              ))}
            </div>
          </div>
        </div>
        </div>
      )}
      {model.total > 0 && (
        <div className="mt-auto pt-5">
          <dl className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs">
            {[
              { label: 'Busiest day', value: `${WEEKDAYS[model.topDay]}`, sub: `${plural(model.topDayCount, noun)} · ${pct(model.topDayCount, model.total)}%` },
              { label: 'Busiest hour', value: hour(model.topHour), sub: `${plural(model.topHourCount, noun)} across the week` },
              { label: 'After hours', value: `${100 - pct(model.office, model.total)}%`, sub: 'evenings and weekends' },
            ].map((x) => (
              <div key={x.label} className="min-w-0">
                <dt className="truncate text-muted-foreground">{x.label}</dt>
                <dd className="mt-0.5 truncate font-mono text-sm font-semibold text-foreground tabular-nums sm:text-base">{x.value}</dd>
                <dd className="truncate text-[11px] text-muted-foreground">{x.sub}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </ChartTray>
  )
}
