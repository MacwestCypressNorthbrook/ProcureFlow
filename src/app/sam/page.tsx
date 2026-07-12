import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, SectionHeader, StatStrip, EmptyState } from '@/components/shared/ui-kit'
import { ClipboardCheck, Clock, CheckCircle, Archive } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export default async function SamPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()
  let allPos: PurchaseOrder[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .order('created_at', { ascending: false })
    allPos = (data as PurchaseOrder[]) ?? []
  } catch {}

  const pendingCount = allPos.filter((p) => p.status === 'pending_sam').length
  const revisionCount = allPos.filter((p) => p.status === 'revision_required').length
  const approvedToday = allPos.filter((p) => {
    if (!p.sam_approved_at) return false
    const today = new Date()
    const approved = new Date(p.sam_approved_at)
    return approved.toDateString() === today.toDateString()
  }).length
  const totalReviewed = allPos.filter((p) => p.sam_approved_by === user?.id).length

  const recentPending = allPos.filter((p) => p.status === 'pending_sam' || p.status === 'revision_required')

  return (
    <DashboardLayout
      title="Sam's Dashboard"
      subtitle="Review and approve purchase orders"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'sam'}
    >
      <PageContainer className="space-y-8">
        <StatStrip
          stats={[
            { label: 'Pending Approval', value: pendingCount, icon: <ClipboardCheck size={18} />, accent: 'amber', href: '/sam/pending' },
            { label: 'Needs Revision', value: revisionCount, icon: <Clock size={18} />, accent: 'red', href: '/sam/revision' },
            { label: 'Approved Today', value: approvedToday, icon: <CheckCircle size={18} />, accent: 'emerald', href: '/sam/approved' },
            { label: 'Total Reviewed', value: totalReviewed, icon: <Archive size={18} />, accent: 'blue', href: '/sam/all' },
          ]}
        />

        <section>
          <SectionHeader title="Awaiting Your Review" count={recentPending.length} />
          {recentPending.length > 0 ? (
            <POTable pos={recentPending} hrefBase="/sam" showRejection />
          ) : (
            <EmptyState icon={<CheckCircle size={20} />} title="All caught up" description="No purchase orders awaiting your review." />
          )}
        </section>
      </PageContainer>
    </DashboardLayout>
  )
}
