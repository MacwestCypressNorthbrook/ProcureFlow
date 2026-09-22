import { STAGE_ORDER, STAGES, currentStage } from '@/lib/workflow'
import { cn } from '@/lib/utils'
import { Check, RotateCcw } from 'lucide-react'

/**
 * The six-stage chain with the item's position on it.
 *
 * A sent-back item shows the stage holding it as active and the stage that
 * bounced it as waiting, so the bounce reads as a step backwards rather than
 * progress.
 */
export default function StageProgress({
  status,
  sentBackTo,
  className,
}: {
  status: string
  sentBackTo?: string | null
  className?: string
}) {
  const here = currentStage(status, sentBackTo)
  const hereIndex = here ? STAGE_ORDER.indexOf(here) : -1
  const bounced = status === 'sent_back'
  const done = status === 'completed'
  const rejected = status === 'rejected'

  return (
    <div className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-2', className)}>
      {STAGE_ORDER.map((stage, i) => {
        const isHere = i === hereIndex && !done
        const isPast = done || i < hereIndex
        return (
          <div key={stage} className="flex items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide',
                isHere && bounced
                  ? 'bg-orange-500 text-white'
                  : isHere
                    ? 'bg-primary text-primary-foreground'
                    : isPast
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-muted text-muted-foreground'
              )}
              title={STAGES[stage].blurb}
            >
              {isPast && <Check size={11} />}
              {isHere && bounced && <RotateCcw size={11} />}
              {STAGES[stage].label}
            </span>
            {i < STAGE_ORDER.length - 1 && (
              <span className="h-px w-3 bg-border" aria-hidden />
            )}
          </div>
        )
      })}
      {rejected && (
        <span className="rounded-md bg-red-500 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
          Rejected
        </span>
      )}
    </div>
  )
}
