import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, SectionHeader, EmptyState } from '@/components/shared/ui-kit'
import { Send } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export default async function MintahPOsPendingPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let pendingPOs: Record<string, unknown>[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('created_by', user?.id ?? '')
      .eq('status', 'pending_sam')
      .order('created_at', { ascending: false })
    pendingPOs = (data as Record<string, unknown>[]) ?? []
  } catch {}

  return (
    <DashboardLayout
      title="Awaiting Sam's Approval"
      subtitle="Purchase orders pending Sam's review"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'mintah'}
    >
      <PageContainer>
        <SectionHeader title="Pending Sam's Approval" count={pendingPOs.length} />
        {pendingPOs.length > 0 ? (
          <POTable pos={pendingPOs as unknown as PurchaseOrder[]} hrefBase="/mintah/po" />
        ) : (
          <EmptyState icon={<Send size={20} />} title="Nothing pending" description="No purchase orders awaiting Sam's approval." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
