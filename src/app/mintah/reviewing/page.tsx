import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import RequestTable from '@/components/shared/RequestTable'
import { PageContainer, SectionHeader, EmptyState } from '@/components/shared/ui-kit'
import { Eye } from 'lucide-react'

export default async function MintahReviewingPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let reviewingRequests: Record<string, unknown>[] = []

  try {
    const { data } = await supabase
      .from('requests')
      .select('*')
      .eq('status', 'reviewing')
      .order('created_at', { ascending: false })
    reviewingRequests = (data as Record<string, unknown>[]) ?? []
  } catch {}

  return (
    <DashboardLayout
      title="Under Review"
      subtitle="Requests currently being reviewed"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'mintah'}
    >
      <PageContainer>
        <SectionHeader title="Requests Under Review" count={reviewingRequests.length} />
        {reviewingRequests.length > 0 ? (
          <RequestTable requests={reviewingRequests as never} hrefBase="/mintah/requests" />
        ) : (
          <EmptyState icon={<Eye size={20} />} title="Nothing under review" description="Requests you mark as reviewing will appear here." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
