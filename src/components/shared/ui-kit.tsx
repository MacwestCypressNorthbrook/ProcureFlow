import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ArrowLeft, TrendingDown, TrendingUp } from 'lucide-react'

/* ============================================================
   Layout primitives — full-bleed, minimalist page scaffolding
   ============================================================ */

/**
 * Full-width padded page body, with a ceiling.
 *
 * Full-bleed is right up to about a 1600px viewport. Past that the columns keep
 * stretching, line lengths get uncomfortable and a two-column layout leaves a
 * void where the narrower column runs out of content. The cap only engages
 * above `2xl`, so nothing below a very large desktop changes.
 */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto w-full max-w-[1600px] px-5 py-6 sm:px-7 lg:px-9', className)}>
      {children}
    </div>
  )
}

/** Page-level header row: optional back link, title, subtitle, right-aligned actions. */
export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel = 'Back',
  actions,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  backHref?: string
  backLabel?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-6', className)}>
      {backHref && (
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

/** Section heading with optional count pill and a right-aligned slot (e.g. "View all"). */
export function SectionHeader({
  title,
  count,
  action,
  className,
}: {
  title: React.ReactNode
  count?: number
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  )
}

/* ============================================================
   Stat strip — one full-width, segmented KPI bar
   ============================================================ */

const ACCENTS: Record<string, string> = {
  primary: 'text-primary bg-primary/10',
  blue: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
  emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  amber: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  red: 'text-red-600 dark:text-red-400 bg-red-500/10',
  indigo: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10',
  purple: 'text-purple-600 dark:text-purple-400 bg-purple-500/10',
  slate: 'text-muted-foreground bg-muted',
}

export interface Stat {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
  href?: string
  accent?: keyof typeof ACCENTS
}

export function StatStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <div
      className={cn(
        'surface grid divide-x divide-y divide-border overflow-hidden rounded-xl [&>*:nth-child(-n+2)]:border-t-0 sm:[&>*]:border-t-0',
        stats.length >= 5
          ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
          : stats.length === 4
            ? 'grid-cols-2 lg:grid-cols-4'
            : stats.length === 3
              ? 'grid-cols-1 sm:grid-cols-3'
              : 'grid-cols-1 sm:grid-cols-2',
        className
      )}
    >
      {stats.map((s, i) => {
        const inner = (
          <div className="flex items-center gap-3 px-4 py-3.5">
            {s.icon && (
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  ACCENTS[s.accent ?? 'slate']
                )}
              >
                {s.icon}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-2xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
                {s.value}
              </p>
              <p className="mt-1 truncate text-xs font-medium text-muted-foreground">
                {s.label}
              </p>
            </div>
          </div>
        )
        return s.href ? (
          <Link key={i} href={s.href} className="transition-colors hover:bg-muted/40">
            {inner}
          </Link>
        ) : (
          <div key={i}>{inner}</div>
        )
      })}
    </div>
  )
}

/* ============================================================
   Detail panels — minimalist titled sections + labelled fields
   ============================================================ */

export function Panel({
  title,
  icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('surface overflow-hidden rounded-xl', className)}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            {icon && <span className="text-muted-foreground">{icon}</span>}
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          </div>
          {action}
        </div>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

export function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  )
}

/* ============================================================
   Empty state
   ============================================================ */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-14 text-center',
        className
      )}
    >
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ============================================================
   Stat cards — KPI grid (label + figure + delta + comparison)
   ============================================================ */

type Tone = 'primary' | 'blue' | 'emerald' | 'amber' | 'red' | 'indigo' | 'purple' | 'slate'

const TONES: Record<Tone, { icon: string; bar: string; dot: string }> = {
  primary: { icon: 'text-primary', bar: 'bg-primary', dot: 'bg-primary' },
  blue: { icon: 'text-blue-500', bar: 'bg-blue-500', dot: 'bg-blue-500' },
  emerald: { icon: 'text-emerald-500', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  amber: { icon: 'text-amber-500', bar: 'bg-amber-500', dot: 'bg-amber-500' },
  red: { icon: 'text-red-500', bar: 'bg-red-500', dot: 'bg-red-500' },
  indigo: { icon: 'text-indigo-500', bar: 'bg-indigo-500', dot: 'bg-indigo-500' },
  purple: { icon: 'text-purple-500', bar: 'bg-purple-500', dot: 'bg-purple-500' },
  slate: { icon: 'text-muted-foreground', bar: 'bg-muted-foreground', dot: 'bg-muted-foreground' },
}

export interface StatCardProps {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
  /** Signed percentage change against the comparison period. */
  delta?: number
  /** Overrides the text inside the delta pill (defaults to the rounded percentage). */
  deltaLabel?: string
  /** True when a rise is bad — e.g. rejections. Flips the pill's colour, not its arrow. */
  invertDelta?: boolean
  /** The muted line under the figure, e.g. "vs. 14,653 last period". */
  compare?: React.ReactNode
  /** Alias for `compare`, kept for callers that describe rather than compare. */
  hint?: React.ReactNode
  /** Optional share of a total, 0–1 — draws a thin progress rail. */
  share?: number
  /** Short pill in place of the icon, e.g. "Needs action". */
  badge?: string
  href?: string
  /** Client-side alternative to `href` — renders the card as a button. */
  onClick?: () => void
  tone?: Tone
  className?: string
}

export function StatCard({
  label,
  value,
  icon,
  delta,
  deltaLabel,
  invertDelta,
  compare,
  hint,
  share,
  badge,
  href,
  onClick,
  tone = 'slate',
  className,
}: StatCardProps) {
  const t = TONES[tone]
  const interactive = Boolean(href || onClick)
  const pct = share === undefined ? undefined : Math.max(0, Math.min(1, share)) * 100
  const sub = compare ?? hint

  const rising = delta !== undefined && delta > 0
  const flat = delta !== undefined && delta === 0
  const good = flat ? false : invertDelta ? !rising : rising

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px] font-medium leading-tight text-foreground">{label}</p>
        {badge ? (
          <span className="shrink-0 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {badge}
          </span>
        ) : icon ? (
          <span className={cn('shrink-0', t.icon)}>{icon}</span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">
          {value}
        </p>
        {delta !== undefined && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
              flat
                ? 'bg-muted text-muted-foreground'
                : good
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400'
            )}
          >
            {!flat && (rising ? <TrendingUp size={11} /> : <TrendingDown size={11} />)}
            {deltaLabel ?? `${Math.abs(delta).toFixed(1).replace(/\.0$/, '')}%`}
          </span>
        )}
      </div>

      {sub && <p className="mt-2 truncate text-xs text-muted-foreground">{sub}</p>}

      {pct !== undefined && (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
          <span className={cn('block h-full rounded-full', t.bar)} style={{ width: `${pct}%` }} />
        </div>
      )}
    </>
  )

  const shell = cn(
    'group relative flex flex-col rounded-2xl surface p-5',
    interactive &&
      'cursor-pointer transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    className
  )

  if (href) {
    return (
      <Link href={href} className={shell}>
        {body}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(shell, 'text-left')}>
        {body}
      </button>
    )
  }

  return <div className={shell}>{body}</div>
}

/** Responsive grid of StatCards. Columns adapt to the number of stats. */
export function StatGrid({
  stats,
  className,
}: {
  stats: StatCardProps[]
  className?: string
}) {
  const cols =
    stats.length === 6
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      : stats.length >= 5
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
      : stats.length === 4
        ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
        : stats.length === 3
          ? 'grid-cols-1 sm:grid-cols-3'
          : 'grid-cols-1 sm:grid-cols-2'

  return (
    <div className={cn('grid gap-3 stagger sm:gap-4', cols, className)}>
      {stats.map((s, i) => (
        <StatCard key={`${s.label}-${i}`} {...s} />
      ))}
    </div>
  )
}

/* ============================================================
   Dashboard hero — greeting band above the KPI grid
   ============================================================ */

export function DashboardHero({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Small pills shown under the description, e.g. today's date or live counts. */
  meta?: { label: string; tone?: Tone }[]
  className?: string
}) {
  return (
    <section
      className={cn(
        'relative isolate overflow-hidden rounded-2xl surface px-5 py-6 sm:px-7 sm:py-7',
        className
      )}
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-primary/15 blur-3xl"
      />

      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
          )}
          <h2 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-foreground sm:text-2xl">
            {title}
          </h2>
          {description && (
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
          {meta && meta.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {meta.map((m) => (
                <span
                  key={m.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', TONES[m.tone ?? 'slate'].dot)} />
                  {m.label}
                </span>
              ))}
            </div>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </section>
  )
}
