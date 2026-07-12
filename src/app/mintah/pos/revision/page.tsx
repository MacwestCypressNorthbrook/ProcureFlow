import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, SectionHeader, EmptyState } from '@/components/shared/ui-kit'
import { CheckCircle } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export default async function MintahPOsRevisionPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let revisionPOs: Record<string, unknown>[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('created_by', user?.id ?? '')
      .eq('status', 'revision_required')
      .order('created_at', { ascending: false })
    revisionPOs = (data as Record<string, unknown>[]) ?? []
  } catch {}

  return (
    <DashboardLayout
      title="Revisions Needed"
      subtitle="Purchase orders sent back by Sam for revision"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'mintah'}
    >
      <PageContainer>
        <SectionHeader title="Revisions Needed" count={revisionPOs.length} />
        {revisionPOs.length > 0 ? (
          <POTable pos={revisionPOs as unknown as PurchaseOrder[]} hrefBase="/mintah/po" showRejection />
        ) : (
          <EmptyState icon={<CheckCircle size={20} />} title="Nothing to revise" description="No purchase orders need revision." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
