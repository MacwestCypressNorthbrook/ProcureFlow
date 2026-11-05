import { STAGE_LABEL } from '@/lib/workflow'
import { approvalSteps, type ApprovalStep } from '@/lib/approval-trail'

const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })

/** A requisition's sign-offs as a compact list — stage, who, when — with filtered approvers picked out. */
export function ApprovalTrailCell({
  list,
  highlight = [],
  empty = 'Pending',
}: {
  list: ApprovalStep[] | null | undefined
  highlight?: string[]
  empty?: string
}) {
  const steps = approvalSteps(list)
  if (steps.length === 0) return <span className="text-xs text-muted-foreground">{empty}</span>
  return (
    <ol className="space-y-0.5 whitespace-nowrap">
      {steps.map((s, i) => {
        const hit = highlight.length > 0 && s.name !== null && highlight.includes(s.name)
        return (
          <li
            key={`${s.at}-${i}`}
            className={`flex items-baseline gap-1.5 text-[11px] leading-4 ${
              hit ? 'rounded bg-primary/10 px-1 -mx-1 text-foreground' : 'text-muted-foreground'
            } ${highlight.length > 0 && !hit ? 'opacity-60' : ''}`}
          >
            <span className="w-[84px] shrink-0 truncate font-medium text-primary/80">{STAGE_LABEL(s.stage)}</span>
            <span className={hit ? 'font-semibold' : 'font-medium text-foreground'}>{s.name ?? '—'}</span>
            <span className="tabular-nums">{dayMonth(s.at)}</span>
          </li>
        )
      })}
    </ol>
  )
}
