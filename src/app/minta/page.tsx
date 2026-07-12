import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import RequestTable from '@/components/shared/RequestTable'
import { Button } from '@/components/ui/button'
import { PageContainer, SectionHeader, StatStrip, EmptyState } from '@/components/shared/ui-kit'
import { FileText, Eye, CheckCircle, XCircle, Plus, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default async function MintaPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let myRequests: Record<string, unknown>[] = []
  try {
    const { data } = await supabase
      .from('requests')
      .select('*')
      .eq('created_by', user?.id ?? '')
      .order('created_at', { ascending: false })
    myRequests = (data as Record<string, unknown>[]) ?? []
  } catch {}

  const stats = {
    total: myRequests?.length ?? 0,
    pending: myRequests?.filter((r) => r.status === 'new').length ?? 0,
    reviewing: myRequests?.filter((r) => r.status === 'reviewing').length ?? 0,
    converted: myRequests?.filter((r) => r.status === 'converted').length ?? 0,
    rejected: myRequests?.filter((r) => r.status === 'rejected').length ?? 0,
  }

  const recentRequests = myRequests.slice(0, 8)

  return (
    <DashboardLayout
      title="My Dashboard"
      subtitle="Track your submitted requisitions and their current status"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'minta'}
    >
      <PageContainer className="space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Overview</h2>
            <p className="text-xs text-muted-foreground">Your procurement request summary</p>
          </div>
          <Link href="/request">
            <Button className="gap-1.5"><Plus size={15} /> New Request</Button>
          </Link>
        </div>

        <StatStrip
          stats={[
            { label: 'Total', value: stats.total, icon: <FileText size={18} />, accent: 'blue' },
            { label: 'New', value: stats.pending, icon: <FileText size={18} />, accent: 'blue' },
            { label: 'Reviewing', value: stats.reviewing, icon: <Eye size={18} />, accent: 'amber' },
            { label: 'Converted', value: stats.converted, icon: <CheckCircle size={18} />, accent: 'emerald' },
            { label: 'Rejected', value: stats.rejected, icon: <XCircle size={18} />, accent: 'red' },
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
            <RequestTable requests={recentRequests as never} hrefBase="/minta/requests" />
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
