import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, StatGrid, SectionHeader, EmptyState } from '@/components/shared/ui-kit'
import { poSummaryStats } from '@/components/shared/stat-presets'
import { Archive } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function SamAllPage() {
  const user = await requirePageRole('project_lead', 'cost_control')
  let pos: PurchaseOrder[] = []

  try {
    pos = await query<PurchaseOrder>(
      `SELECT * FROM public.purchase_orders ORDER BY created_at DESC`
    )
  } catch (err) {
    console.error('Failed to load all POs from Neon:', err)
  }

  return (
    <DashboardLayout
      title="All Purchase Orders"
      subtitle="Complete history of purchase orders"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'project_lead'}
    >
      <PageContainer className="space-y-6">
        <StatGrid
          stats={poSummaryStats({
            pos,
            label: 'All purchase orders',
            icon: <Archive size={18} />,
            tone: 'indigo',
            trailing: 'month',
          })}
        />
        <SectionHeader title="All Purchase Orders" count={pos.length} />
        {pos.length > 0 ? (
          <POTable pos={pos} hrefBase="/sam" showRejection storageKey="sam-all" />
        ) : (
          <EmptyState icon={<Archive size={20} />} title="No purchase orders" description="Purchase orders will appear here." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
