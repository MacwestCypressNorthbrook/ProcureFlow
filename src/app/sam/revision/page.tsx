import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, EmptyState } from '@/components/shared/ui-kit'
import { CheckCircle } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export default async function SamRevisionPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()
  let pos: PurchaseOrder[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('status', 'revision_required')
      .order('updated_at', { ascending: false })
    pos = (data as PurchaseOrder[]) ?? []
  } catch {}

  return (
    <DashboardLayout
      title="Needs Revision"
      subtitle="Purchase orders returned for correction"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'sam'}
    >
      <PageContainer>
        {pos.length > 0 ? (
          <POTable pos={pos} hrefBase="/sam" showRejection />
        ) : (
          <EmptyState icon={<CheckCircle size={20} />} title="Nothing to revise" description="No purchase orders need revision." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
