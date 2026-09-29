import DecisionsTable from '@/components/shared/DecisionsTable'
import StageTabs from '@/components/shared/StageTabs'
import { PageContainer, PageHeader, StatGrid } from '@/components/shared/ui-kit'
import { monthSplit, statMoney } from '@/components/shared/stat-presets'
import { getStageDecisions, getStageInbox } from '@/lib/review'
import { STAGES, type Stage } from '@/lib/workflow'
import type { ResolvedUser } from '@/lib/auth/server'
import { ClipboardCheck, Check, RotateCcw, CalendarCheck } from 'lucide-react'

/**
 * What a stage has already decided.
 *
 * A queue only ever answers "what is waiting on me". The moment a reviewer
 * approves, the requisition moves on and leaves their screen, taking the
 * decision and the comment with it — and the comment is the part people come
 * back looking for weeks later. This is the other half: a searchable, sortable,
 * paginated record of everything this stage has touched, exportable to Excel,
 * PDF or CSV.
 *
 * Every role but the engineer gets one, from the same component, so the four
 * Reviewed tabs cannot drift apart.
 */
export default async function ReviewedView({
  stage,
  user,
  hrefBase,
  /** Where this stage's own queue lives, for the tab back to it. */
  queueHref,
  /** This page's own href, for the active tab. */
  reviewedHref,
  /** Limit the record to this person's own decisions rather than the stage's. */
  mineOnly = false,
}: {
  stage: Stage
  user: ResolvedUser
  hrefBase: string
  queueHref?: string
  reviewedHref?: string
  mineOnly?: boolean
}) {
  const label = STAGES[stage].label
  const [decisions, pending] = await Promise.all([
    getStageDecisions(stage, { limit: 500, actorId: mineOnly ? user.id : undefined }),
    queueHref && reviewedHref ? getStageInbox(stage) : Promise.resolve([]),
  ])

  const approved = decisions.filter((d) => d.action === 'approved' || d.action === 'completed')
  const sentBack = decisions.filter((d) => d.action === 'sent_back')
  const urgent = decisions.filter((d) => d.action === 'marked_urgent')
  const month = monthSplit(decisions.map((d) => d.created_at))
  const approvedValue = approved.reduce((sum, d) => sum + (Number(d.total_amount) || 0), 0)

  const previousStageLabel = sentBack.length > 0 ? 'Returned for correction' : 'Nothing returned'

  return (
    <PageContainer className="space-y-6">
      {queueHref && reviewedHref && (
        <StageTabs
          tabs={[
            { label: 'Awaiting review', href: queueHref, count: pending.length },
            { label: 'Reviewed', href: reviewedHref, count: decisions.length, active: true },
          ]}
        />
      )}

      <PageHeader
        title={`${label} — Reviewed`}
        subtitle={`Every requisition ${mineOnly ? 'you have' : 'this stage has'} decided on, with the comment that travelled with it. Search, sort and filter the record, then export it.`}
      />

      <StatGrid
        stats={[
          {
            label: 'Decisions recorded',
            value: decisions.length,
            icon: <ClipboardCheck size={18} />,
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
            compare: `${statMoney(approvedValue)} passed on`,
          },
          {
            label: 'Sent back',
            value: sentBack.length,
            icon: <RotateCcw size={18} />,
            tone: 'amber',
            share: decisions.length > 0 ? sentBack.length / decisions.length : 0,
            compare: previousStageLabel,
          },
          {
            label: urgent.length > 0 ? 'Urgent escalations' : 'This month',
            value: urgent.length > 0 ? urgent.length : month.thisMonth,
            icon: <CalendarCheck size={18} />,
            tone: urgent.length > 0 ? 'red' : 'purple',
            compare:
              urgent.length > 0
                ? 'Emergency approvals raised'
                : month.lastMonth > 0
                  ? `vs. ${month.lastMonth} last month`
                  : 'No decisions last month',
          },
        ]}
      />

      <DecisionsTable
        rows={decisions}
        hrefBase={hrefBase}
        storageKey={`${stage}-reviewed`}
        stageLabel={label}
        exportSection={`${stage}-reviewed`}
        exportedBy={user.name || user.email}
      />
    </PageContainer>
  )
}
