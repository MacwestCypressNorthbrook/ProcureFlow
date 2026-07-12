import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, SectionHeader, EmptyState } from '@/components/shared/ui-kit'
import { Archive } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export default async function SamAllPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()
  let pos: PurchaseOrder[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .order('created_at', { ascending: false })
    pos = (data as PurchaseOrder[]) ?? []
  } catch {}

  return (
    <DashboardLayout
      title="All Purchase Orders"
      subtitle="Complete history of purchase orders"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'sam'}
    >
      <PageContainer>
        <SectionHeader title="All Purchase Orders" count={pos.length} />
        {pos.length > 0 ? (
          <POTable pos={pos} hrefBase="/sam" showRejection />
        ) : (
          <EmptyState icon={<Archive size={20} />} title="No purchase orders" description="Purchase orders will appear here." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
