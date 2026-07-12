import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import RequestTable from '@/components/shared/RequestTable'
import POTable from '@/components/shared/POTable'
import { PageContainer, SectionHeader, StatStrip, EmptyState } from '@/components/shared/ui-kit'
import { FileText, ShoppingBag, AlertTriangle, CheckCircle, Eye } from 'lucide-react'
import Link from 'next/link'
import type { PurchaseOrder } from '@/lib/types'

export default async function MintahPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let incomingRequests: Record<string, unknown>[] = []
  let reviewingRequests: Record<string, unknown>[] = []
  let myPOs: Record<string, unknown>[] = []

  try {
    const [incomingRes, reviewingRes, poRes] = await Promise.all([
      supabase.from('requests').select('*').eq('status', 'new').order('created_at', { ascending: false }).limit(8),
      supabase.from('requests').select('*').eq('status', 'reviewing').order('created_at', { ascending: false }).limit(8),
      supabase.from('purchase_orders').select('*').eq('created_by', user?.id ?? '').order('created_at', { ascending: false }),
    ])
    incomingRequests = (incomingRes.data as Record<string, unknown>[]) ?? []
    reviewingRequests = (reviewingRes.data as Record<string, unknown>[]) ?? []
    myPOs = (poRes.data as Record<string, unknown>[]) ?? []
  } catch {}

  const stats = {
    newRequests: incomingRequests.length,
    underReview: reviewingRequests.length,
    myPOs: myPOs.length,
    pendingSam: myPOs.filter((po) => po.status === 'pending_sam').length,
    completed: myPOs.filter((po) => po.status === 'completed').length,
  }

  const allIncoming = [...incomingRequests, ...reviewingRequests].slice(0, 8)
  const recentPOs = myPOs.slice(0, 8)

  return (
    <DashboardLayout
      title="Mintah Dashboard"
      subtitle="Review requisitions and manage purchase orders"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'mintah'}
    >
      <PageContainer className="space-y-8">
        <StatStrip
          stats={[
            { label: 'New Requests', value: stats.newRequests, icon: <FileText size={18} />, accent: 'blue', href: '/mintah/requests' },
            { label: 'Under Review', value: stats.underReview, icon: <Eye size={18} />, accent: 'amber', href: '/mintah/reviewing' },
            { label: 'My POs', value: stats.myPOs, icon: <ShoppingBag size={18} />, accent: 'indigo', href: '/mintah/pos' },
            { label: 'Awaiting Sam', value: stats.pendingSam, icon: <AlertTriangle size={18} />, accent: 'amber', href: '/mintah/pos/pending' },
            { label: 'Completed', value: stats.completed, icon: <CheckCircle size={18} />, accent: 'emerald', href: '/mintah/pos/completed' },
          ]}
        />

        <section>
          <SectionHeader
            title="Recent Requests"
            count={allIncoming.length}
            action={<Link href="/mintah/requests" className="text-xs font-medium text-primary hover:underline">View all</Link>}
          />
          {allIncoming.length > 0 ? (
            <RequestTable requests={allIncoming as never} hrefBase="/mintah/requests" />
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
            <POTable pos={recentPOs as unknown as PurchaseOrder[]} hrefBase="/mintah/po" showRejection />
          ) : (
            <EmptyState icon={<ShoppingBag size={20} />} title="No purchase orders yet" description="Convert a request to create your first PO." />
          )}
        </section>
      </PageContainer>
    </DashboardLayout>
  )
}
