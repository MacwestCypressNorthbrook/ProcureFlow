import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, StatGrid, SectionHeader, EmptyState } from '@/components/shared/ui-kit'
import { poSummaryStats } from '@/components/shared/stat-presets'
import { CheckCircle } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function MintahPOsCompletedPage() {
  const user = await requirePageRole('supply_chain')
  let completedPOs: PurchaseOrder[] = []

  if (user?.id) {
    try {
      completedPOs = await query<PurchaseOrder>(
        `SELECT * FROM public.purchase_orders
         WHERE created_by = $1 AND status IN ('paid')
         ORDER BY updated_at DESC, created_at DESC`,
        [user.id]
      )
    } catch (err) {
      console.error('Failed to load completed POs from Neon:', err)
    }
  }

  return (
    <DashboardLayout
      title="Completed POs"
      subtitle="Successfully processed purchase orders"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'supply_chain'}
    >
      <PageContainer className="space-y-6">
        <StatGrid
          stats={poSummaryStats({
            pos: completedPOs,
            label: 'Completed',
            icon: <CheckCircle size={18} />,
            tone: 'emerald',
            dateField: 'paid_at',
            trailing: 'month',
          })}
        />
        <SectionHeader title="Completed Purchase Orders" count={completedPOs.length} />
        {completedPOs.length > 0 ? (
          <POTable pos={completedPOs} hrefBase="/mintah/po" storageKey="mintah-pos-completed" />
        ) : (
          <EmptyState icon={<CheckCircle size={20} />} title="Nothing completed yet" description="Completed purchase orders will appear here." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
