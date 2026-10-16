import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import RequestTable from '@/components/shared/RequestTable'
import { PageContainer, SectionHeader, DashboardHero, EmptyState } from '@/components/shared/ui-kit'
import { FileText, ArrowRight, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { getStageDecisions, getStageInbox, type QueueRow, type StageDecision } from '@/lib/review'
import ReviewerHomeDashboard from '@/components/dashboards/ReviewerHomeDashboard'

export const dynamic = 'force-dynamic'

export default async function MintahPage() {
  const user = await requirePageRole('supply_chain')

  let reviewingRequests: QueueRow[] = []
  let decisions: StageDecision[] = []
  let withLeads = 0
  let withCostControl = 0

  try {
    // The queue comes from the shared inbox so it carries supplier names; the
    // stages either side are only counted, never listed here.
    const [queueRes, decisionsRes, counts] = await Promise.all([
      getStageInbox('supply_chain'),
      getStageDecisions('supply_chain', { limit: 1000, actorId: user.id }),
      query<{ lead: number; cost_control: number }>(
        `SELECT COUNT(*) FILTER (WHERE status = 'pending_lead')::int AS lead,
                COUNT(*) FILTER (WHERE status = 'pending_cost_control')::int AS cost_control
           FROM public.requests`
      ),
    ])
    reviewingRequests = queueRes
    decisions = decisionsRes
    withLeads = counts[0]?.lead ?? 0
    withCostControl = counts[0]?.cost_control ?? 0
  } catch (err) {
    console.error('Failed to query Mintah data from Neon:', err)
  }

  const sentBackRequests = reviewingRequests.filter((r) => r.status === 'sent_back')
  const sentBackCount = sentBackRequests.length

  const stats = {
    upstreamLead: withLeads,
    awaitingReview: reviewingRequests.length,
    sentBack: sentBackCount,
    withCostControl,
  }

  const recentRequests = reviewingRequests.slice(0, 8)
  const queue = stats.awaitingReview
  const firstName = user?.name?.split(' ')[0]

  return (
    <>
      <PageContainer className="space-y-6">
        <DashboardHero
          eyebrow="Procurement desk"
          title={firstName ? `Good to see you, ${firstName}` : 'Procurement overview'}
          description={
            queue === 0
              ? 'Nothing is waiting on you right now. New requisitions cleared by Project Leads will appear in your queue.'
              : `${queue} requisition${queue === 1 ? '' : 's'} in your active queue awaiting pricing or revisions.`
          }
          meta={[
            { label: `${stats.awaitingReview} in your queue`, tone: stats.awaitingReview > 0 ? 'amber' : 'slate' },
            ...(sentBackCount > 0 ? [{ label: `${sentBackCount} returned by Cost Control`, tone: 'red' as const }] : []),
            { label: `${stats.withCostControl} under Cost Control audit`, tone: 'indigo' as const },
            { label: `${stats.upstreamLead} with project leads`, tone: 'blue' as const },
          ]}
          actions={
            <Link href="/mintah/queue">
              <Button className="h-10 gap-1.5 px-4 font-semibold cursor-pointer">
                Open Review Queue <ArrowRight size={15} />
              </Button>
            </Link>
          }
        />

        {sentBackCount > 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-orange-500/35 bg-orange-500/[0.06] p-4 text-xs shadow-xs">
            <div className="flex items-center gap-2.5">
              <RotateCcw size={18} className="text-orange-600 dark:text-orange-400 shrink-0" />
              <div>
                <p className="font-bold text-foreground text-sm">
                  {sentBackCount} Requisition{sentBackCount === 1 ? '' : 's'} Returned by Cost Control
                </p>
                <p className="text-muted-foreground mt-0.5">
                  Cost Control requested rate adjustments or revised supplier invoices. Open to update and resubmit.
                </p>
              </div>
            </div>
            <Link href="/mintah/queue">
              <Button size="sm" variant="outline" className="border-orange-500/40 text-orange-700 dark:text-orange-300 hover:bg-orange-500/10 font-bold shrink-0 cursor-pointer">
                Fix & Resubmit →
              </Button>
            </Link>
          </div>
        )}

        <ReviewerHomeDashboard
          role="supply_chain"
          queue={reviewingRequests}
          decisions={decisions}
          hrefBase="/mintah/queue"
          neighbours={{
            before: { label: 'With Project Leads', count: stats.upstreamLead },
            returned: stats.sentBack,
            after: { label: 'With Cost Control', count: stats.withCostControl },
          }}
        />

        <section>
          <SectionHeader
            title="Requisitions Awaiting Your Review"
            count={recentRequests.length}
            action={<Link href="/mintah/queue" className="text-xs font-medium text-primary hover:underline">View queue</Link>}
          />
          {recentRequests.length > 0 ? (
            <RequestTable requests={recentRequests as never} hrefBase="/mintah/queue" compact />
          ) : (
            <EmptyState icon={<FileText size={20} />} title="No incoming requests" description="New requisitions to review will appear here." />
          )}
        </section>
      </PageContainer>
    </>
  )
}
