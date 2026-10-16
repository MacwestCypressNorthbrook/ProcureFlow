import { requirePageRole } from '@/lib/auth-guard'
import QueueTable from '@/components/shared/QueueTable'
import { Button } from '@/components/ui/button'
import {
  PageContainer,
  SectionHeader,
  DashboardHero,
  EmptyState,
} from '@/components/shared/ui-kit'
import { statMoney } from '@/components/shared/stat-presets'
import { getStageDecisions, getStageInbox, getStageQueue } from '@/lib/review'
import { statusForStage } from '@/lib/workflow'
import ReviewerHomeDashboard from '@/components/dashboards/ReviewerHomeDashboard'
import { CheckCircle, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function SamPage() {
  const user = await requirePageRole('project_lead')

  // The Project Lead is the first review in the chain; everything downstream is
  // shown only as context for what they have already cleared.
  const [waiting, downstream, decisions] = await Promise.all([
    getStageInbox('lead'),
    getStageQueue([
      statusForStage('supply_chain'),
      statusForStage('admin'),
      statusForStage('cost_control'),
      statusForStage('finance'),
    ]),
    // This lead's own decisions, for the dashboard's month-by-month view.
    getStageDecisions('lead', { limit: 1000, actorId: user.id }),
  ])

  const queueValue = waiting.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0)
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

        <ReviewerHomeDashboard role="lead" queue={waiting} decisions={decisions} hrefBase="/sam/requests" />

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
