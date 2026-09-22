import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, StatGrid, EmptyState } from '@/components/shared/ui-kit'
import { poSummaryStats } from '@/components/shared/stat-presets'
import { CheckCircle, ClipboardCheck } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function SamPendingPage() {
  const user = await requirePageRole('project_lead', 'cost_control')
  let pos: PurchaseOrder[] = []

  try {
    pos = await query<PurchaseOrder>(
      `SELECT * FROM public.purchase_orders
       WHERE status IN ('pending_cost_control')
       ORDER BY created_at DESC`
    )
  } catch (err) {
    console.error('Failed to load pending POs from Neon:', err)
  }

  return (
    <DashboardLayout
      title="Pending Approval"
      subtitle="Purchase orders awaiting sign-off"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'project_lead'}
    >
      <PageContainer className="space-y-6">
        <StatGrid
          stats={poSummaryStats({
            pos,
            label: 'Pending approval',
            icon: <ClipboardCheck size={18} />,
            tone: 'amber',
            trailing: 'age',
            ageLabel: 'Longest waiting',
          })}
        />
        {pos.length > 0 ? (
          <POTable pos={pos} hrefBase="/sam" storageKey="sam-pending" />
        ) : (
          <EmptyState icon={<CheckCircle size={20} />} title="All caught up" description="No purchase orders pending approval." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
