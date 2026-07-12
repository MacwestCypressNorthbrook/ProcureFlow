import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, SectionHeader, EmptyState } from '@/components/shared/ui-kit'
import { CheckCircle } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export default async function MintahPOsCompletedPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let completedPOs: Record<string, unknown>[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('created_by', user?.id ?? '')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
    completedPOs = (data as Record<string, unknown>[]) ?? []
  } catch {}

  return (
    <DashboardLayout
      title="Completed POs"
      subtitle="Successfully completed purchase orders"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'mintah'}
    >
      <PageContainer>
        <SectionHeader title="Completed Purchase Orders" count={completedPOs.length} />
        {completedPOs.length > 0 ? (
          <POTable pos={completedPOs as unknown as PurchaseOrder[]} hrefBase="/mintah/po" />
        ) : (
          <EmptyState icon={<CheckCircle size={20} />} title="Nothing completed yet" description="Completed purchase orders will appear here." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
