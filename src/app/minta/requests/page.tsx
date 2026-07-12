import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import RequestTable from '@/components/shared/RequestTable'
import { Button } from '@/components/ui/button'
import { PageContainer, SectionHeader, StatStrip, EmptyState } from '@/components/shared/ui-kit'
import { FileText, Eye, CheckCircle, XCircle, Plus } from 'lucide-react'
import Link from 'next/link'

export default async function MintaRequestsPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let requests: Record<string, unknown>[] = []
  try {
    const { data } = await supabase
      .from('requests')
      .select('*')
      .eq('created_by', user?.id ?? '')
      .order('created_at', { ascending: false })
    requests = (data as Record<string, unknown>[]) ?? []
  } catch {}

  const stats = {
    total: requests.length,
    new: requests.filter((r) => r.status === 'new').length,
    reviewing: requests.filter((r) => r.status === 'reviewing').length,
    converted: requests.filter((r) => r.status === 'converted').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  }

  return (
    <DashboardLayout
      title="My Requests"
      subtitle="View and manage all your submitted requisitions"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'minta'}
    >
      <PageContainer className="space-y-8">
        <StatStrip
          stats={[
            { label: 'Total', value: stats.total, icon: <FileText size={18} />, accent: 'blue' },
            { label: 'New', value: stats.new, icon: <FileText size={18} />, accent: 'blue' },
            { label: 'Reviewing', value: stats.reviewing, icon: <Eye size={18} />, accent: 'amber' },
            { label: 'Converted', value: stats.converted, icon: <CheckCircle size={18} />, accent: 'emerald' },
            { label: 'Rejected', value: stats.rejected, icon: <XCircle size={18} />, accent: 'red' },
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
            <RequestTable requests={requests as never} hrefBase="/minta/requests" />
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
