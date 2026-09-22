import { requirePageCapability } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import DashboardLayout from '@/components/layout/DashboardLayout'
import RequestTable from '@/components/shared/RequestTable'
import { monthSplit } from '@/components/shared/stat-presets'
import { PageContainer, SectionHeader, StatGrid, EmptyState } from '@/components/shared/ui-kit'
import { CalendarCheck, Clock, Eye, FileText } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function MintahRequestsPage() {
  const user = await requirePageCapability('request:review')

  let newRequests: Record<string, unknown>[] = []
  let reviewingRequests: Record<string, unknown>[] = []

  try {
    const [newRes, reviewingRes] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT * FROM public.requests WHERE status IN ('pending_lead') ORDER BY created_at DESC`
      ),
      query<Record<string, unknown>>(
        `SELECT * FROM public.requests WHERE status IN ('pending_supply_chain') ORDER BY created_at DESC`
      ),
    ])
    newRequests = newRes
    reviewingRequests = reviewingRes
  } catch (err) {
    console.error('Failed to load requests from Neon:', err)
  }

  const allRequests = [...newRequests, ...reviewingRequests]
  const month = monthSplit(allRequests.map((r) => (r.created_at as string | null) ?? null))
  const oldestRaised = allRequests
    .map((r) => new Date((r.created_at as string) ?? '').getTime())
    .filter((t) => !Number.isNaN(t))
  const oldest =
    oldestRaised.length > 0
      ? Math.max(0, Math.floor((Date.now() - Math.min(...oldestRaised)) / 86_400_000))
      : null

  return (
    <DashboardLayout
      title="Incoming Requests"
      subtitle="Review and process incoming requisitions"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'supply_chain'}
    >
      <PageContainer className="space-y-6">
        <StatGrid
          stats={[
            {
              label: 'New requests',
              value: newRequests.length,
              icon: <FileText size={18} />,
              tone: 'blue',
              badge: newRequests.length > 0 ? 'Needs action' : undefined,
              compare: 'Nobody has picked these up yet',
            },
            {
              label: 'Under review',
              value: reviewingRequests.length,
              icon: <Eye size={18} />,
              tone: 'amber',
              compare: 'Being specced out by procurement',
              href: '/mintah/reviewing',
            },
            {
              label: 'Raised this month',
              value: month.thisMonth,
              icon: <CalendarCheck size={18} />,
              tone: 'emerald',
              delta: month.delta,
              compare: month.lastMonth > 0 ? `vs. ${month.lastMonth} last month` : 'No activity last month',
            },
            {
              label: 'Longest waiting',
              value: oldest ? `${oldest}d` : '—',
              icon: <Clock size={18} />,
              tone: oldest !== null && oldest > 7 ? 'red' : 'amber',
              compare: oldest !== null ? 'Since the request was raised' : 'Nothing in the queue',
            },
          ]}
        />

        <section>
          <SectionHeader title="All Incoming Requests" count={allRequests.length} />
          {allRequests.length > 0 ? (
            <RequestTable requests={allRequests as never} hrefBase="/mintah/requests" storageKey="mintah-requests" />
          ) : (
            <EmptyState icon={<FileText size={20} />} title="No incoming requests" description="New requisitions will appear here." />
          )}
        </section>
      </PageContainer>
    </DashboardLayout>
  )
}
