import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, EmptyState } from '@/components/shared/ui-kit'
import { CheckCircle } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export default async function FinancePendingPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()
  let pos: PurchaseOrder[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('status', 'pending_payment')
      .order('sam_approved_at', { ascending: true })
    pos = (data as PurchaseOrder[]) ?? []
  } catch {}

  return (
    <DashboardLayout
      title="Pending Payment"
      subtitle="Approved purchase orders awaiting payment"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'finance'}
    >
      <PageContainer>
        {pos.length > 0 ? (
          <POTable pos={pos} hrefBase="/finance" />
        ) : (
          <EmptyState icon={<CheckCircle size={20} />} title="All paid up" description="No purchase orders pending payment." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
