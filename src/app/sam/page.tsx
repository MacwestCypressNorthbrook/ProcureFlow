import { requirePageRole } from '@/lib/auth-guard'
import QueueTable from '@/components/shared/QueueTable'
import { Button } from '@/components/ui/button'
import {
  PageContainer,
  SectionHeader,
  StatGrid,
  DashboardHero,
  EmptyState,
} from '@/components/shared/ui-kit'
import { monthSplit, statMoney } from '@/components/shared/stat-presets'
import { getStageQueue } from '@/lib/review'
import { statusForStage } from '@/lib/workflow'
import { ClipboardCheck, CheckCircle, Clock, Wallet, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

/** Whole days since the oldest item in a queue; null when the queue is empty. */
function oldestWaitingDays(dates: string[]): number | null {
  const times = dates.map((d) => new Date(d).getTime()).filter((t) => !Number.isNaN(t))
  if (times.length === 0) return null
  return Math.max(0, Math.floor((Date.now() - Math.min(...times)) / 86_400_000))
}

export default async function SamPage() {
  const user = await requirePageRole('project_lead')

  // The Project Lead is the first review in the chain; everything downstream is
  // shown only as context for what they have already cleared.
  const [waiting, downstream] = await Promise.all([
    getStageQueue([statusForStage('lead')]),
    getStageQueue([
      statusForStage('supply_chain'),
      statusForStage('admin'),
      statusForStage('cost_control'),
      statusForStage('finance'),
    ]),
  ])

  const month = monthSplit(waiting.map((r) => r.created_at))
  const queueValue = waiting.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0)
  const oldestDays = oldestWaitingDays(waiting.map((r) => r.created_at))
  const firstName = user.name?.split(' ')[0]

  return (
    <>
      <PageContainer className="space-y-6">
        <DashboardHero
          eyebrow="Review queue"
          title={
            waiting.length === 0
              ? 'You are all caught up'
              : `${waiting.length} requisition${waiting.length === 1 ? '' : 's'} waiting on you`
          }
          description={
            waiting.length === 0
              ? firstName
                ? `Nothing needs your review right now, ${firstName}. New requisitions land here the moment they are raised.`
                : 'Nothing needs your review right now. New requisitions land here the moment they are raised.'
              : 'Nothing moves past you until each one is approved or sent back — both carry your comment.'
          }
          meta={[
            { label: `${statMoney(queueValue)} in the queue`, tone: 'indigo' },
            { label: `${downstream.length} moving downstream`, tone: 'emerald' },
          ]}
          actions={
            waiting.length > 0 ? (
              <Link href="/sam/requests">
                <Button className="h-10 gap-1.5 px-4">
                  Start reviewing <ArrowRight size={15} />
                </Button>
              </Link>
            ) : undefined
          }
        />

        <StatGrid
          stats={[
            {
              label: 'Awaiting your review',
              value: waiting.length,
              icon: <ClipboardCheck size={18} />,
              tone: 'indigo',
              delta: month.delta,
              badge: waiting.length > 0 ? 'Needs action' : undefined,
              compare:
                month.lastMonth > 0
                  ? `vs. ${month.lastMonth} last month`
                  : `${month.thisMonth} raised this month`,
              href: '/sam/requests',
            },
            {
              label: 'Queue value',
              value: statMoney(queueValue),
              icon: <Wallet size={18} />,
              tone: 'purple',
              compare: `Across ${waiting.length} requisition${waiting.length === 1 ? '' : 's'}`,
            },
            {
              label: 'Longest waiting',
              value: oldestDays !== null ? `${oldestDays}d` : '—',
              icon: <Clock size={18} />,
              tone: oldestDays !== null && oldestDays > 7 ? 'red' : 'amber',
              compare: oldestDays !== null ? 'Since it was raised' : 'Nothing in the queue',
            },
            {
              label: 'Cleared by you',
              value: downstream.length,
              icon: <CheckCircle size={18} />,
              tone: 'emerald',
              compare: 'Now with later stages',
            },
          ]}
        />

        <section>
          <SectionHeader title="Awaiting your review" count={waiting.length} />
          {waiting.length > 0 ? (
            <QueueTable rows={waiting} hrefBase="/sam/requests" storageKey="lead-dashboard-queue" />
          ) : (
            <EmptyState
              icon={<CheckCircle size={20} />}
              title="All caught up"
              description="No requisitions are waiting on your review."
            />
          )}
        </section>
      </PageContainer>
    </>
  )
}
