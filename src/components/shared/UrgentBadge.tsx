import { Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The urgent mark, wherever a requisition appears.
 *
 * Red and filled rather than a tinted pill: this is the one label in the app
 * that is meant to break the scan, and a subtle badge sitting among a dozen
 * other subtle badges would be ignored — which is exactly the failure the flag
 * exists to prevent.
 */
export function UrgentBadge({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <span
      title="Escalated by the Project Lead for emergency approval"
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-red-600 font-bold uppercase tracking-wider text-white shadow-xs',
        size === 'sm' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]',
        className
      )}
    >
      <Zap size={size === 'sm' ? 9 : 11} className="shrink-0" />
      Urgent
    </span>
  )
}

/**
 * The full escalation notice, for the top of a requisition.
 *
 * Carries the reason, because "urgent" without a reason is just pressure — the
 * stage being interrupted needs to know what is actually stopped on site.
 */
export function UrgentBanner({
  reason,
  markedBy,
  markedAt,
  className,
}: {
  reason?: string | null
  markedBy?: string | null
  markedAt?: string | null
  className?: string
}) {
  const when = markedAt
    ? new Date(markedAt).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3.5 sm:px-5',
        className
      )}
    >
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-600 text-white">
        <Zap size={16} />
      </span>
      {/*
        One block of reading rather than a card inside a card: the reason is
        the only part that changes what the reader does, so it is set as the
        body text and everything else is a single line of context above it.
      */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-red-700 dark:text-red-400">
          Emergency approval requested
          <span className="font-normal text-muted-foreground">
            {' '}
            · {markedBy ? `by ${markedBy}` : 'by the Project Lead'}
            {when ? ` · ${when}` : ''}
          </span>
        </p>
        {reason && <p className="mt-1 text-sm leading-relaxed text-foreground">{reason}</p>}
      </div>
    </div>
  )
}

export default UrgentBadge
