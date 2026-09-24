import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import RequestTable from '@/components/shared/RequestTable'
import POTable from '@/components/shared/POTable'
import { PageContainer, SectionHeader, StatGrid, DashboardHero, EmptyState } from '@/components/shared/ui-kit'
import { FileText, ShoppingBag, AlertTriangle, CheckCircle, Eye, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { monthSplit, statMoney } from '@/components/shared/stat-presets'
import Link from 'next/link'
import type { PurchaseOrder } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function MintahPage() {
  const user = await requirePageRole('supply_chain')

  let incomingRequests: Record<string, unknown>[] = []
  let reviewingRequests: Record<string, unknown>[] = []
  let myPOs: Record<string, unknown>[] = []

  try {
    const [incomingRes, reviewingRes, poRes] = await Promise.all([
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
          WHERE r.status IN ('pending_supply_chain')
          ORDER BY r.created_at DESC LIMIT 8`
      ),
      query<Record<string, unknown>>(
        `SELECT * FROM public.purchase_orders WHERE created_by = $1 ORDER BY created_at DESC`,
        [user?.id || '']
      ),
    ])
    incomingRequests = incomingRes
    reviewingRequests = reviewingRes
    myPOs = poRes
  } catch (err) {
    console.error('Failed to query Mintah data from Neon:', err)
  }

  const stats = {
    newRequests: incomingRequests.length,
    underReview: reviewingRequests.length,
    myPOs: myPOs.length,
    pendingSam: myPOs.filter((po) => po.status === 'pending_cost_control').length,
    completed: myPOs.filter((po) => po.status === 'paid').length,
  }

  const allIncoming = [...incomingRequests, ...reviewingRequests].slice(0, 8)
  const recentPOs = myPOs.slice(0, 8)
  const poShare = (n: number) => (stats.myPOs > 0 ? n / stats.myPOs : 0)
  const poMonth = monthSplit(myPOs.map((p) => (p.created_at as string | null) ?? null))
  const poValue = myPOs.reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0)
  const queue = stats.newRequests + stats.underReview
  const firstName = user?.name?.split(' ')[0]

  return (
    <>
      <PageContainer className="space-y-6">
        <DashboardHero
          eyebrow="Procurement desk"
          title={firstName ? `Good to see you, ${firstName}` : 'Procurement overview'}
          description={
            queue === 0
              ? 'Nothing is waiting on you right now. New requisitions will land here the moment they are raised.'
              : `${queue} requisition${queue === 1 ? '' : 's'} need your attention before they can become purchase orders.`
          }
          meta={[
            { label: `${stats.newRequests} new`, tone: stats.newRequests > 0 ? 'blue' : 'slate' },
            { label: `${stats.underReview} under review`, tone: 'amber' },
            { label: `${stats.pendingSam} awaiting approval`, tone: stats.pendingSam > 0 ? 'amber' : 'emerald' },
          ]}
          actions={
            <Link href="/mintah/requests">
              <Button className="h-10 gap-1.5 px-4">
                Review queue <ArrowRight size={15} />
              </Button>
            </Link>
          }
        />

        <StatGrid
          stats={[
            {
              label: 'New requests',
              value: stats.newRequests,
              icon: <FileText size={18} />,
              tone: 'blue',
              hint: 'Fresh from requesters',
              badge: stats.newRequests > 0 ? 'Needs action' : undefined,
              href: '/mintah/requests',
            },
            {
              label: 'Under review',
              value: stats.underReview,
              icon: <Eye size={18} />,
              tone: 'amber',
              hint: 'Being specced out',
              href: '/mintah/reviewing',
            },
            {
              label: 'My purchase orders',
              value: stats.myPOs,
              icon: <ShoppingBag size={18} />,
              tone: 'indigo',
              delta: poMonth.delta,
              compare:
                poMonth.lastMonth > 0
                  ? `vs. ${poMonth.lastMonth} last month · ${statMoney(poValue)} total`
                  : `${statMoney(poValue)} across all orders`,
              href: '/mintah/pos',
            },
            {
              label: 'Awaiting approval',
              value: stats.pendingSam,
              icon: <AlertTriangle size={18} />,
              tone: 'amber',
              hint: 'Sitting with Sam',
              share: poShare(stats.pendingSam),
              href: '/mintah/pos/pending',
            },
            {
              label: 'Completed',
              value: stats.completed,
              icon: <CheckCircle size={18} />,
              tone: 'emerald',
              hint: 'Paid and closed',
              share: poShare(stats.completed),
              href: '/mintah/pos/completed',
            },
          ]}
        />

        <section>
          <SectionHeader
            title="Recent Requests"
            count={allIncoming.length}
            action={<Link href="/mintah/requests" className="text-xs font-medium text-primary hover:underline">View all</Link>}
          />
          {allIncoming.length > 0 ? (
            <RequestTable requests={allIncoming as never} hrefBase="/mintah/requests" compact />
          ) : (
            <EmptyState icon={<FileText size={20} />} title="No incoming requests" description="New requisitions to review will appear here." />
          )}
        </section>

        <section>
          <SectionHeader
            title="My Purchase Orders"
            count={recentPOs.length}
            action={<Link href="/mintah/pos" className="text-xs font-medium text-primary hover:underline">View all</Link>}
          />
          {recentPOs.length > 0 ? (
            <POTable pos={recentPOs as unknown as PurchaseOrder[]} hrefBase="/mintah/po" showRejection compact />
          ) : (
            <EmptyState icon={<ShoppingBag size={20} />} title="No purchase orders yet" description="Convert a request to create your first PO." />
          )}
        </section>
      </PageContainer>
    </>
  )
}
