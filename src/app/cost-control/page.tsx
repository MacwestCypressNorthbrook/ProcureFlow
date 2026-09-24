import Link from 'next/link'
import { requirePageRole } from '@/lib/auth-guard'
import QueueTable from '@/components/shared/QueueTable'
import DecisionsTable from '@/components/shared/DecisionsTable'
import { PageContainer, StatGrid } from '@/components/shared/ui-kit'
import { requestSummaryStats, monthSplit, statMoney } from '@/components/shared/stat-presets'
import { getStageQueue, getStageDecisions } from '@/lib/review'
import { statusForStage } from '@/lib/workflow'
import { Scale, Check, RotateCcw, CalendarCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

type View = 'pending' | 'reviewed'

/**
 * Cost Control works two lists: what is waiting, and what it has already
 * decided. The second exists because approving used to make a requisition
 * vanish from this page with no record of the decision or the comment.
 *
 * The view lives in the URL so it can be linked and bookmarked.
 */
export default async function CostControlPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  await requirePageRole('cost_control')

  const { view: rawView } = await searchParams
  const view: View = rawView === 'reviewed' ? 'reviewed' : 'pending'

  const [pending, decisions] = await Promise.all([
    getStageQueue([statusForStage('cost_control')]),
    getStageDecisions('cost_control'),
  ])

  const approved = decisions.filter((d) => d.action === 'approved')
  const sentBack = decisions.filter((d) => d.action === 'sent_back')
  const month = monthSplit(decisions.map((d) => d.created_at))
  const approvedValue = approved.reduce((sum, d) => sum + (Number(d.total_amount) || 0), 0)

  const tabs: { id: View; label: string; count: number; href: string }[] = [
    { id: 'pending', label: 'Awaiting review', count: pending.length, href: '/cost-control' },
    { id: 'reviewed', label: 'Reviewed', count: decisions.length, href: '/cost-control?view=reviewed' },
  ]

  return (
    <PageContainer className="space-y-6">
      <nav className="flex w-fit gap-1 rounded-xl border border-border bg-card p-1" aria-label="Cost control views">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={view === tab.id ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              view === tab.id
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                view === tab.id ? 'bg-background/20' : 'bg-muted text-muted-foreground'
              }`}
            >
              {tab.count}
            </span>
          </Link>
        ))}
      </nav>

      {view === 'pending' ? (
        <>
          <StatGrid
            stats={requestSummaryStats({
              requests: pending as unknown as Record<string, unknown>[],
              label: 'Awaiting your review',
              icon: <Scale size={18} />,
              tone: 'emerald',
              trailing: 'age',
              ageLabel: 'Longest waiting',
            })}
          />
          <QueueTable rows={pending} hrefBase="/cost-control/requests" storageKey="cost-control-queue" />
        </>
      ) : (
        <>
          <StatGrid
            stats={[
              {
                label: 'Decisions made',
                value: decisions.length,
                icon: <Scale size={18} />,
                tone: 'indigo',
                delta: month.delta,
                compare:
                  month.lastMonth > 0
                    ? `vs. ${month.lastMonth} last month`
                    : `${month.thisMonth} this month`,
              },
              {
                label: 'Approved',
                value: approved.length,
                icon: <Check size={18} />,
                tone: 'emerald',
                share: decisions.length > 0 ? approved.length / decisions.length : 0,
                compare: `${statMoney(approvedValue)} cleared for payment`,
              },
              {
                label: 'Sent back',
                value: sentBack.length,
                icon: <RotateCcw size={18} />,
                tone: 'amber',
                share: decisions.length > 0 ? sentBack.length / decisions.length : 0,
                compare: sentBack.length > 0 ? 'Returned to the Administrator' : 'Nothing returned',
              },
              {
                label: 'This month',
                value: month.thisMonth,
                icon: <CalendarCheck size={18} />,
                tone: 'purple',
                compare: month.lastMonth > 0 ? `vs. ${month.lastMonth} last month` : 'No decisions last month',
              },
            ]}
          />
          <DecisionsTable
            rows={decisions}
            hrefBase="/cost-control/requests"
            storageKey="cost-control-decisions"
          />
        </>
      )}
    </PageContainer>
  )
}
