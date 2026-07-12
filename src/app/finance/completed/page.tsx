import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, EmptyState } from '@/components/shared/ui-kit'
import { CheckCircle } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export default async function FinanceCompletedPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()
  let pos: PurchaseOrder[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('status', 'completed')
      .order('paid_at', { ascending: false })
    pos = (data as PurchaseOrder[]) ?? []
  } catch {}

  return (
    <DashboardLayout
      title="Completed Payments"
      subtitle="Purchase orders that have been fully processed"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'finance'}
    >
      <PageContainer>
        {pos.length > 0 ? (
          <POTable pos={pos} hrefBase="/finance" />
        ) : (
          <EmptyState icon={<CheckCircle size={20} />} title="No completed payments" description="Processed payments will appear here." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
