import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import RequestTable from '@/components/shared/RequestTable'
import { PageContainer, SectionHeader, StatStrip, EmptyState } from '@/components/shared/ui-kit'
import { FileText, Eye } from 'lucide-react'

export default async function MintahRequestsPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let newRequests: Record<string, unknown>[] = []
  let reviewingRequests: Record<string, unknown>[] = []

  try {
    const [newRes, reviewingRes] = await Promise.all([
      supabase.from('requests').select('*').eq('status', 'new').order('created_at', { ascending: false }),
      supabase.from('requests').select('*').eq('status', 'reviewing').order('created_at', { ascending: false }),
    ])
    newRequests = (newRes.data as Record<string, unknown>[]) ?? []
    reviewingRequests = (reviewingRes.data as Record<string, unknown>[]) ?? []
  } catch {}

  const allRequests = [...newRequests, ...reviewingRequests]

  return (
    <DashboardLayout
      title="Incoming Requests"
      subtitle="Review and process incoming requisitions"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'mintah'}
    >
      <PageContainer className="space-y-8">
        <StatStrip
          stats={[
            { label: 'New', value: newRequests.length, icon: <FileText size={18} />, accent: 'blue' },
            { label: 'Under Review', value: reviewingRequests.length, icon: <Eye size={18} />, accent: 'amber' },
          ]}
        />

        <section>
          <SectionHeader title="All Incoming Requests" count={allRequests.length} />
          {allRequests.length > 0 ? (
            <RequestTable requests={allRequests as never} hrefBase="/mintah/requests" />
          ) : (
            <EmptyState icon={<FileText size={20} />} title="No incoming requests" description="New requisitions will appear here." />
          )}
        </section>
      </PageContainer>
    </DashboardLayout>
  )
}
