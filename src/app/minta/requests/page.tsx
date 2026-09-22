import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import DashboardLayout from '@/components/layout/DashboardLayout'
import RequestTable from '@/components/shared/RequestTable'
import { Button } from '@/components/ui/button'
import { monthSplit } from '@/components/shared/stat-presets'
import { PageContainer, SectionHeader, StatGrid, EmptyState } from '@/components/shared/ui-kit'
import { CheckCircle, Clock, Eye, FileText, Plus, XCircle } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function MintaRequestsPage() {
  const user = await requirePageRole('engineer')
  let requests: Record<string, unknown>[] = []

  if (user?.id) {
    try {
      requests = await query<Record<string, unknown>>(
        `SELECT * FROM public.requests
         WHERE created_by = $1
         ORDER BY created_at DESC`,
        [user.id]
      )
    } catch (err) {
      console.error('Failed to load requests from Neon:', err)
    }
  }

  const stats = {
    total: requests.length,
    new: requests.filter((r) => r.status === 'pending_lead').length,
    reviewing: requests.filter((r) => r.status === 'pending_supply_chain').length,
    converted: requests.filter((r) => r.status === 'completed' || r.status === 'pending_finance' || r.status === 'pending_cost_control').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  }

  const share = (n: number) => (stats.total > 0 ? n / stats.total : 0)
  const month = monthSplit(requests.map((r) => (r.created_at as string | null) ?? null))

  return (
    <DashboardLayout
      title="My Requests"
      subtitle="View and manage all your submitted requisitions"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'engineer'}
    >
      <PageContainer className="space-y-6">
        <StatGrid
          stats={[
            {
              label: 'Total requests',
              value: stats.total,
              icon: <FileText size={18} />,
              tone: 'indigo',
              delta: month.delta,
              compare: month.lastMonth > 0 ? `vs. ${month.lastMonth} last month` : `${month.thisMonth} raised this month`,
            },
            {
              label: 'Awaiting pickup',
              value: stats.new,
              icon: <Clock size={18} />,
              tone: 'blue',
              share: share(stats.new),
              compare: 'Not yet opened by procurement',
            },
            {
              label: 'Under review',
              value: stats.reviewing,
              icon: <Eye size={18} />,
              tone: 'amber',
              share: share(stats.reviewing),
              compare: 'Being specced out',
            },
            {
              label: 'Converted',
              value: stats.converted,
              icon: <CheckCircle size={18} />,
              tone: 'emerald',
              share: share(stats.converted),
              compare: `${Math.round(share(stats.converted) * 100)}% of everything you raised`,
            },
            {
              label: 'Rejected',
              value: stats.rejected,
              icon: <XCircle size={18} />,
              tone: 'red',
              share: share(stats.rejected),
              compare: stats.rejected > 0 ? 'Check the notes before resubmitting' : 'Nothing rejected',
            },
          ]}
        />

        <section>
          <SectionHeader
            title="All Requests"
            count={requests.length}
            action={
              <Link href="/request">
                <Button size="sm" className="gap-1.5"><Plus size={14} /> New Request</Button>
              </Link>
            }
          />
          {requests.length > 0 ? (
            <RequestTable requests={requests as never} hrefBase="/minta/requests" storageKey="minta-requests" />
          ) : (
            <EmptyState
              icon={<FileText size={20} />}
              title="No requests found"
              description="Submit your first requisition to get started."
              action={
                <Link href="/request">
                  <Button size="sm" className="gap-1.5"><Plus size={14} /> Submit a request</Button>
                </Link>
              }
            />
          )}
        </section>
      </PageContainer>
    </DashboardLayout>
  )
}
