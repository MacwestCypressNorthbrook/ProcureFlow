import { Check, Clock, RotateCcw, XCircle } from 'lucide-react'
import { STAGE_ORDER, STAGES, currentStage, type Stage } from '@/lib/workflow'
import type { ApprovalEntry } from '@/components/shared/ApprovalPanel'
import { cn } from '@/lib/utils'

/** Actions that mean a stage signed off and handed the requisition onward. */
const CLEARING_ACTIONS = new Set(['approved', 'po_created', 'paid'])

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

const daysSince = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))

/**
 * Where a requisition actually is, stage by stage, from the recorded trail.
 *
 * Nothing here is inferred from the status alone: each stage shows the person
 * who cleared it, when, and the comment they left. The requester should be able
 * to answer "who is sitting on this and for how long" without asking anyone.
 */
export default function RequisitionTimeline({
  status,
  sentBackTo,
  sentBackAt,
  createdAt,
  history,
  className,
}: {
  status: string
  sentBackTo?: string | null
  sentBackAt?: string | null
  createdAt: string
  history: ApprovalEntry[]
  className?: string
}) {
  const here = currentStage(status, sentBackTo)
  const hereIndex = here ? STAGE_ORDER.indexOf(here) : -1
  const bounced = status === 'sent_back'
  const closed = status === 'completed'
  const rejected = status === 'rejected'

  // Oldest first reads as a history; the API returns newest first.
  const ordered = [...history].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const clearedAt = new Map<string, ApprovalEntry>()
  const bounceAt = new Map<string, ApprovalEntry>()
  for (const entry of ordered) {
    if (CLEARING_ACTIONS.has(entry.action)) clearedAt.set(entry.stage, entry)
    if (entry.action === 'sent_back') bounceAt.set(entry.stage, entry)
  }

  // An edit changes the form, not where it sits, so it does not restart the wait.
  const moves = ordered.filter((entry) => entry.action !== 'edited')
  const lastMoved = moves.length > 0 ? moves[moves.length - 1].created_at : createdAt
  const waitingDays = daysSince(sentBackAt ?? lastMoved)

  const headline = rejected
    ? 'This requisition was rejected.'
    : closed
      ? 'Paid and closed — nothing further is needed.'
      : bounced
        ? here === 'requester'
          ? `Sent back to you${waitingDays > 0 ? ` ${waitingDays} day${waitingDays === 1 ? '' : 's'} ago` : ' today'} — fix it and resubmit.`
          : `Sent back to ${STAGES[here as Stage].label} — waiting on them to fix it.`
        : here
          ? `Waiting with ${STAGES[here].label}${waitingDays > 0 ? ` for ${waitingDays} day${waitingDays === 1 ? '' : 's'}` : ' since today'}.`
          : 'Not yet submitted.'

  return (
    <div className={className}>
      <p className="mb-4 text-sm text-foreground">{headline}</p>

      <ol className="space-y-0">
        {STAGE_ORDER.map((stage, i) => {
          const cleared = clearedAt.get(stage)
          const bounce = bounceAt.get(stage)
          const isHere = stage === here && !closed
          const isDone = closed || Boolean(cleared) || (hereIndex > i && !bounced)
          const isLast = i === STAGE_ORDER.length - 1

          return (
            <li key={stage} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                    isHere && bounced
                      ? 'border-orange-500 bg-orange-500 text-white'
                      : isHere
                        ? 'border-primary bg-primary text-primary-foreground'
                        : isDone
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-border bg-card'
                  )}
                >
                  {isHere && bounced ? (
                    <RotateCcw size={11} />
                  ) : isDone ? (
                    <Check size={11} />
                  ) : isHere ? (
                    <Clock size={11} />
                  ) : null}
                </span>
                {!isLast && (
                  <span
                    className={cn(
                      'min-h-[26px] w-px flex-1',
                      isDone ? 'bg-emerald-500/40' : 'bg-border'
                    )}
                  />
                )}
              </div>

              <div className="min-w-0 pb-5">
                <p
                  className={cn(
                    'text-xs font-semibold',
                    isHere ? 'text-foreground' : isDone ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {STAGES[stage].label}
                  {isHere && (
                    <span
                      className={cn(
                        'ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        bounced
                          ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                          : 'bg-primary/10 text-primary'
                      )}
                    >
                      {bounced ? 'Needs changes' : 'Here now'}
                    </span>
                  )}
                </p>

                {cleared ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Approved{cleared.performer_name ? ` by ${cleared.performer_name}` : ''} ·{' '}
                    {when(cleared.created_at)}
                  </p>
                ) : isHere ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {bounced ? 'Returned here' : 'Waiting since'} {when(sentBackAt ?? lastMoved)}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{STAGES[stage].blurb}</p>
                )}

                {(cleared?.comment || bounce?.comment) && (
                  <p className="mt-1 rounded-md bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
                    “{bounce?.comment ?? cleared?.comment}”
                  </p>
                )}
              </div>
            </li>
          )
        })}

        {rejected && (
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-red-500 bg-red-500 text-white">
              <XCircle size={11} />
            </span>
            <p className="text-xs font-semibold text-foreground">Rejected</p>
          </li>
        )}
      </ol>
    </div>
  )
}
