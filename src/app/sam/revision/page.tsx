import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, StatGrid, EmptyState } from '@/components/shared/ui-kit'
import { poSummaryStats } from '@/components/shared/stat-presets'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function SamRevisionPage() {
  const user = await requirePageRole('project_lead', 'cost_control')
  let pos: PurchaseOrder[] = []

  try {
    pos = await query<PurchaseOrder>(
      `SELECT * FROM public.purchase_orders
       WHERE status IN ('sent_back')
       ORDER BY updated_at DESC`
    )
  } catch (err) {
    console.error('Failed to load revision POs from Neon:', err)
  }

  return (
    <DashboardLayout
      title="Needs Revision"
      subtitle="Purchase orders returned for correction"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'project_lead'}
    >
      <PageContainer className="space-y-6">
        <StatGrid
          stats={poSummaryStats({
            pos,
            label: 'Needs revision',
            icon: <AlertTriangle size={18} />,
            tone: 'red',
            trailing: 'age',
            ageLabel: 'Longest outstanding',
          })}
        />
        {pos.length > 0 ? (
          <POTable pos={pos} hrefBase="/sam" showRejection storageKey="sam-revision" />
        ) : (
          <EmptyState icon={<CheckCircle size={20} />} title="Nothing to revise" description="No purchase orders need revision." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
