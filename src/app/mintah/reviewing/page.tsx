import { requirePageCapability } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import DashboardLayout from '@/components/layout/DashboardLayout'
import RequestTable from '@/components/shared/RequestTable'
import { PageContainer, StatGrid, SectionHeader, EmptyState } from '@/components/shared/ui-kit'
import { requestSummaryStats } from '@/components/shared/stat-presets'
import { Eye } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function MintahReviewingPage() {
  const user = await requirePageCapability('request:review')
  let reviewingRequests: Record<string, unknown>[] = []

  try {
    reviewingRequests = await query<Record<string, unknown>>(
      `SELECT * FROM public.requests
       WHERE status IN ('pending_supply_chain')
       ORDER BY created_at DESC`
    )
  } catch (err) {
    console.error('Failed to load reviewing requests from Neon:', err)
  }

  return (
    <DashboardLayout
      title="Under Review"
      subtitle="Requests currently being reviewed"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'supply_chain'}
    >
      <PageContainer className="space-y-6">
        <StatGrid
          stats={requestSummaryStats({
            requests: reviewingRequests,
            label: 'Under review',
            icon: <Eye size={18} />,
            tone: 'amber',
            trailing: 'age',
            ageLabel: 'Longest in review',
          })}
        />
        <SectionHeader title="Requests Under Review" count={reviewingRequests.length} />
        {reviewingRequests.length > 0 ? (
          <RequestTable requests={reviewingRequests as never} hrefBase="/mintah/requests" storageKey="mintah-reviewing" />
        ) : (
          <EmptyState icon={<Eye size={20} />} title="Nothing under review" description="Requests you mark as reviewing will appear here." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
