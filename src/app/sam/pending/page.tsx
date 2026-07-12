import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, EmptyState } from '@/components/shared/ui-kit'
import { CheckCircle } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export default async function SamPendingPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()
  let pos: PurchaseOrder[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('status', 'pending_sam')
      .order('created_at', { ascending: false })
    pos = (data as PurchaseOrder[]) ?? []
  } catch {}

  return (
    <DashboardLayout
      title="Pending Approval"
      subtitle="Purchase orders awaiting executive sign-off"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'sam'}
    >
      <PageContainer>
        {pos.length > 0 ? (
          <POTable pos={pos} hrefBase="/sam" />
        ) : (
          <EmptyState icon={<CheckCircle size={20} />} title="All caught up" description="No purchase orders pending approval." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
