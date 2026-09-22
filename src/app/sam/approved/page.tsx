import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, StatGrid, EmptyState } from '@/components/shared/ui-kit'
import { poSummaryStats } from '@/components/shared/stat-presets'
import { CheckCircle } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function SamApprovedPage() {
  const user = await requirePageRole('project_lead', 'cost_control')
  let pos: PurchaseOrder[] = []

  try {
    pos = await query<PurchaseOrder>(
      `SELECT * FROM public.purchase_orders
       WHERE status IN ('pending_finance', 'paid')
       ORDER BY created_at DESC`
    )
  } catch (err) {
    console.error('Failed to load approved POs from Neon:', err)
  }

  return (
    <DashboardLayout
      title="Approved POs"
      subtitle="Purchase orders that have been approved"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'project_lead'}
    >
      <PageContainer className="space-y-6">
        <StatGrid
          stats={poSummaryStats({
            pos,
            label: 'Approved orders',
            icon: <CheckCircle size={18} />,
            tone: 'emerald',
            trailing: 'month',
          })}
        />
        {pos.length > 0 ? (
          <POTable pos={pos} hrefBase="/sam" storageKey="sam-approved" />
        ) : (
          <EmptyState icon={<CheckCircle size={20} />} title="No approvals yet" description="Purchase orders you approve will appear here." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
