import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'

/* ============================================================
   Layout primitives — full-bleed, minimalist page scaffolding
   ============================================================ */

/** Full-width padded page body. Replaces the old centered `mx-auto max-w-*`. */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('w-full px-5 py-6 sm:px-7 lg:px-9', className)}>
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
