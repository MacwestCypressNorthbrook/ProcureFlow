import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import RequestTable from '@/components/shared/RequestTable'
import { Button } from '@/components/ui/button'
import {
  PageContainer,
  SectionHeader,
  DashboardHero,
  EmptyState,
} from '@/components/shared/ui-kit'
import EngineerHomeDashboard, { type MyRequisition } from '@/components/dashboards/EngineerHomeDashboard'
import { FileText, Plus, ArrowRight, RotateCcw } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function MintaPage() {
  const user = await requirePageRole('engineer')
  let myRequests: Record<string, unknown>[] = []

  if (user?.id) {
    try {
      myRequests = await query<Record<string, unknown>>(
        `SELECT r.*, pr.name AS project_name,
                (po.id IS NOT NULL) AS has_po,
                po.po_number,
                po.status AS po_status
           FROM public.requests r
           LEFT JOIN public.projects pr ON pr.id = r.project_id
           LEFT JOIN LATERAL (
                SELECT id, po_number, status
                  FROM public.purchase_orders
                 WHERE request_id = r.id
                 ORDER BY created_at DESC
                 LIMIT 1
           ) po ON true
          WHERE r.created_by = $1
          ORDER BY r.created_at DESC`,
        [user.id]
      )
    } catch (err) {
      console.error('Failed to query requests from Neon:', err)
    }
  }

  const stats = {
    total: myRequests?.length ?? 0,
    pending: myRequests?.filter((r) => r.status === 'pending_lead').length ?? 0,
    reviewing: myRequests?.filter((r) => r.status === 'pending_supply_chain').length ?? 0,
    converted: myRequests?.filter((r) => r.status === 'completed' || r.status === 'pending_finance' || r.status === 'pending_cost_control').length ?? 0,
    rejected: myRequests?.filter((r) => r.status === 'rejected').length ?? 0,
    sentBack: myRequests?.filter((r) => r.status === 'sent_back').length ?? 0,
  }

  // Anything a reviewer bounced back is the requester's to fix — it blocks the
  // whole chain until they resubmit, so it leads the page.
  const sentBackRequests = myRequests.filter((r) => r.status === 'sent_back')

  const inFlight = stats.pending + stats.reviewing
  const firstName = user?.name?.split(' ')[0]
  const recentRequests = myRequests.slice(0, 8)

  return (
    <>
      <PageContainer className="space-y-6">
        <DashboardHero
          eyebrow="Overview"
          title={firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
          description={
            stats.total === 0
              ? 'Raise your first requisition and follow it from review through to payment.'
              : `You have ${stats.total} requisition${stats.total === 1 ? '' : 's'} on record, ${inFlight} still moving through the loop.`
          }
          meta={[
            ...(stats.sentBack > 0
              ? ([{ label: `${stats.sentBack} need your attention`, tone: 'red' }] as const)
              : []),
            { label: `${inFlight} in flight`, tone: inFlight > 0 ? 'amber' : 'emerald' },
            { label: `${stats.converted} converted`, tone: 'emerald' },
            ...(stats.rejected > 0
              ? ([{ label: `${stats.rejected} rejected`, tone: 'red' }] as const)
              : []),
          ]}
          actions={
            <Link href="/request">
              <Button className="h-10 gap-1.5 px-4">
                <Plus size={15} /> New Request
              </Button>
            </Link>
          }
        />

        {sentBackRequests.length > 0 && (
          <section className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <RotateCcw size={15} className="text-orange-500" />
                  {sentBackRequests.length} requisition{sentBackRequests.length === 1 ? '' : 's'} sent back to you
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  A reviewer needs changes before {sentBackRequests.length === 1 ? 'it' : 'they'} can continue.
                  Nothing moves until you resubmit.
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {sentBackRequests.slice(0, 5).map((r) => (
                <li key={String(r.id)}>
                  <Link
                    href={`/minta/requests/${String(r.id)}`}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 transition-colors hover:border-ring"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {String(r.purpose ?? 'Untitled requisition')}
                    </span>
                    <span className="shrink-0 text-xs font-medium text-orange-600 dark:text-orange-400">
                      Fix and resubmit
                    </span>
                    <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <EngineerHomeDashboard requests={myRequests as unknown as MyRequisition[]} />

        <section>
          <SectionHeader
            title="Recent Requests"
            count={recentRequests.length}
            action={
              myRequests.length > 0 && (
                <Link href="/minta/requests" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  View all <ArrowRight size={13} />
                </Link>
              )
            }
          />
          {recentRequests.length > 0 ? (
            <RequestTable requests={recentRequests as never} hrefBase="/minta/requests" compact />
          ) : (
            <EmptyState
              icon={<FileText size={20} />}
              title="No requests yet"
              description="You haven't submitted any requests yet."
              action={
                <Link href="/request">
                  <Button size="sm" className="gap-1.5"><Plus size={14} /> Submit your first request</Button>
                </Link>
              }
            />
          )}
        </section>
      </PageContainer>
    </>
  )
}
