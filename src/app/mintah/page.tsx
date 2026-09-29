import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import RequestTable from '@/components/shared/RequestTable'
import POTable from '@/components/shared/POTable'
import { PageContainer, SectionHeader, StatGrid, DashboardHero, EmptyState } from '@/components/shared/ui-kit'
import { FileText, ShoppingBag, AlertTriangle, CheckCircle, Eye, ArrowRight, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { monthSplit, statMoney } from '@/components/shared/stat-presets'
import Link from 'next/link'
import type { PurchaseOrder } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function MintahPage() {
  const user = await requirePageRole('supply_chain')

  let incomingRequests: Record<string, unknown>[] = []
  let reviewingRequests: Record<string, unknown>[] = []
  let costControlRequests: Record<string, unknown>[] = []

  try {
    const [incomingRes, reviewingRes, costControlRes] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT r.*, pr.name AS project_name
           FROM public.requests r
           LEFT JOIN public.projects pr ON pr.id = r.project_id
          WHERE r.status IN ('pending_lead')
          ORDER BY r.created_at DESC LIMIT 8`
      ),
      query<Record<string, unknown>>(
        `SELECT r.*, pr.name AS project_name
           FROM public.requests r
           LEFT JOIN public.projects pr ON pr.id = r.project_id
          WHERE r.status = 'pending_supply_chain'
             OR (r.status = 'sent_back' AND r.sent_back_to = 'supply_chain')
          ORDER BY r.created_at DESC`
      ),
      query<Record<string, unknown>>(
        `SELECT r.*, pr.name AS project_name
           FROM public.requests r
           LEFT JOIN public.projects pr ON pr.id = r.project_id
          WHERE r.status = 'pending_cost_control'
          ORDER BY r.created_at DESC LIMIT 8`
      ),
    ])
    incomingRequests = incomingRes
    reviewingRequests = reviewingRes
    costControlRequests = costControlRes
  } catch (err) {
    console.error('Failed to query Mintah data from Neon:', err)
  }

  const sentBackRequests = reviewingRequests.filter((r) => r.status === 'sent_back')
  const sentBackCount = sentBackRequests.length

  const stats = {
    upstreamLead: incomingRequests.length,
    awaitingReview: reviewingRequests.length,
    sentBack: sentBackCount,
    withCostControl: costControlRequests.length,
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

        <StatGrid
          stats={[
            {
              label: 'Awaiting your review',
              value: stats.awaitingReview,
              icon: <Eye size={18} />,
              tone: 'amber',
              hint: 'Ready for pricing & invoices',
              badge: stats.awaitingReview > 0 ? 'Action needed' : undefined,
              href: '/mintah/queue',
            },
            ...(sentBackCount > 0
              ? [
                  {
                    label: 'Returned by Cost Control',
                    value: sentBackCount,
                    icon: <RotateCcw size={18} />,
                    tone: 'red' as const,
                    hint: 'Cost revision required',
                    badge: 'Action Needed',
                    href: '/mintah/queue',
                  },
                ]
              : []),
            {
              label: 'Under Cost Control Audit',
              value: stats.withCostControl,
              icon: <ShoppingBag size={18} />,
              tone: 'indigo',
              hint: 'Invoices under audit',
              href: '/mintah/requests',
            },
            {
              label: 'With Project Leads',
              value: stats.upstreamLead,
              icon: <FileText size={18} />,
              tone: 'blue',
              hint: 'Pending lead sign-off',
              href: '/mintah/requests',
            },
          ]}
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
