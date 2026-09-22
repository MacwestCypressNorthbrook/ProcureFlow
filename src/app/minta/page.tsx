import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import DashboardLayout from '@/components/layout/DashboardLayout'
import RequestTable from '@/components/shared/RequestTable'
import { Button } from '@/components/ui/button'
import {
  PageContainer,
  SectionHeader,
  StatGrid,
  DashboardHero,
  EmptyState,
} from '@/components/shared/ui-kit'
import { monthSplit } from '@/components/shared/stat-presets'
import { FileText, Eye, CheckCircle, XCircle, Plus, ArrowRight, Clock } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function MintaPage() {
  const user = await requirePageRole('engineer')
  let myRequests: Record<string, unknown>[] = []

  if (user?.id) {
    try {
      myRequests = await query<Record<string, unknown>>(
        `SELECT * FROM public.requests
         WHERE created_by = $1
         ORDER BY created_at DESC`,
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
  }

  const share = (n: number) => (stats.total > 0 ? n / stats.total : 0)
  const month = monthSplit(myRequests.map((r) => (r.created_at as string | null) ?? null))
  const inFlight = stats.pending + stats.reviewing
  const firstName = user?.name?.split(' ')[0]
  const recentRequests = myRequests.slice(0, 8)

  return (
    <DashboardLayout
      title="My Dashboard"
      subtitle="Track your submitted requisitions and their current status"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'engineer'}
    >
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

        <StatGrid
          stats={[
            {
              label: 'Total requests',
              value: stats.total,
              icon: <FileText size={18} />,
              tone: 'indigo',
              delta: month.delta,
              compare:
                month.lastMonth > 0
                  ? `vs. ${month.lastMonth} last month`
                  : `${month.thisMonth} raised this month`,
              href: '/minta/requests',
            },
            {
              label: 'Pending',
              value: stats.pending,
              icon: <Clock size={18} />,
              tone: 'blue',
              hint: 'Waiting to be picked up',
              share: share(stats.pending),
              href: '/minta/tracking',
            },
            {
              label: 'Under review',
              value: stats.reviewing,
              icon: <Eye size={18} />,
              tone: 'amber',
              hint: 'With procurement',
              share: share(stats.reviewing),
              href: '/minta/tracking',
            },
            {
              label: 'Converted',
              value: stats.converted,
              icon: <CheckCircle size={18} />,
              tone: 'emerald',
              hint: 'Turned into purchase orders',
              share: share(stats.converted),
            },
            {
              label: 'Rejected',
              value: stats.rejected,
              icon: <XCircle size={18} />,
              tone: 'red',
              hint: stats.rejected > 0 ? 'Review the notes and resubmit' : 'Nothing rejected',
              share: share(stats.rejected),
            },
          ]}
        />

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
    </DashboardLayout>
  )
}
