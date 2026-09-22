import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, StatGrid, SectionHeader, EmptyState } from '@/components/shared/ui-kit'
import { poSummaryStats } from '@/components/shared/stat-presets'
import { Send } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function MintahPOsPendingPage() {
  const user = await requirePageRole('supply_chain')
  let pendingPOs: PurchaseOrder[] = []

  if (user?.id) {
    try {
      pendingPOs = await query<PurchaseOrder>(
        `SELECT * FROM public.purchase_orders
         WHERE created_by = $1 AND status IN ('pending_cost_control')
         ORDER BY created_at DESC`,
        [user.id]
      )
    } catch (err) {
      console.error('Failed to load pending POs from Neon:', err)
    }
  }

  return (
    <DashboardLayout
      title="Awaiting Approval"
      subtitle="Purchase orders pending executive review"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'supply_chain'}
    >
      <PageContainer className="space-y-6">
        <StatGrid
          stats={poSummaryStats({
            pos: pendingPOs,
            label: 'Awaiting approval',
            icon: <Send size={18} />,
            tone: 'amber',
            trailing: 'age',
            ageLabel: 'Longest waiting',
          })}
        />
        <SectionHeader title="Pending Approval" count={pendingPOs.length} />
        {pendingPOs.length > 0 ? (
          <POTable pos={pendingPOs} hrefBase="/mintah/po" storageKey="mintah-pos-pending" />
        ) : (
          <EmptyState icon={<Send size={20} />} title="Nothing pending" description="No purchase orders awaiting approval." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
