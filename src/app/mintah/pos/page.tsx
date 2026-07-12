import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, SectionHeader, StatStrip, EmptyState } from '@/components/shared/ui-kit'
import { ShoppingBag, Send, AlertTriangle, CheckCircle } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export default async function MintahPOsPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let myPOs: Record<string, unknown>[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('created_by', user?.id ?? '')
      .order('created_at', { ascending: false })
    myPOs = (data as Record<string, unknown>[]) ?? []
  } catch {}

  const stats = {
    total: myPOs.length,
    pendingSam: myPOs.filter((po) => po.status === 'pending_sam').length,
    revision: myPOs.filter((po) => po.status === 'revision_required').length,
    completed: myPOs.filter((po) => po.status === 'completed').length,
  }

  return (
    <DashboardLayout
      title="My Purchase Orders"
      subtitle="Manage all your purchase orders"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'mintah'}
    >
      <PageContainer className="space-y-8">
        <StatStrip
          stats={[
            { label: 'Total', value: stats.total, icon: <ShoppingBag size={18} />, accent: 'indigo' },
            { label: 'Pending Sam', value: stats.pendingSam, icon: <Send size={18} />, accent: 'amber', href: '/mintah/pos/pending' },
            { label: 'Revision Needed', value: stats.revision, icon: <AlertTriangle size={18} />, accent: 'red', href: '/mintah/pos/revision' },
            { label: 'Completed', value: stats.completed, icon: <CheckCircle size={18} />, accent: 'emerald', href: '/mintah/pos/completed' },
          ]}
        />

        <section>
          <SectionHeader title="All Purchase Orders" count={myPOs.length} />
          {myPOs.length > 0 ? (
            <POTable pos={myPOs as unknown as PurchaseOrder[]} hrefBase="/mintah/po" showRejection />
          ) : (
            <EmptyState icon={<ShoppingBag size={20} />} title="No purchase orders yet" description="Convert a request to create your first PO." />
          )}
        </section>
      </PageContainer>
    </DashboardLayout>
  )
}
