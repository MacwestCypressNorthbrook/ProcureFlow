import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, StatGrid, SectionHeader, EmptyState } from '@/components/shared/ui-kit'
import { poSummaryStats } from '@/components/shared/stat-presets'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function MintahPOsRevisionPage() {
  const user = await requirePageRole('supply_chain')
  let revisionPOs: PurchaseOrder[] = []

  if (user?.id) {
    try {
      revisionPOs = await query<PurchaseOrder>(
        `SELECT * FROM public.purchase_orders
         WHERE created_by = $1 AND status IN ('sent_back')
         ORDER BY updated_at DESC`,
        [user.id]
      )
    } catch (err) {
      console.error('Failed to load revision POs from Neon:', err)
    }
  }

  return (
    <DashboardLayout
      title="Revisions Needed"
      subtitle="Purchase orders returned for correction"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'supply_chain'}
    >
      <PageContainer className="space-y-6">
        <StatGrid
          stats={poSummaryStats({
            pos: revisionPOs,
            label: 'Needs revision',
            icon: <AlertTriangle size={18} />,
            tone: 'red',
            trailing: 'age',
            ageLabel: 'Longest outstanding',
          })}
        />
        <SectionHeader title="Revisions Needed" count={revisionPOs.length} />
        {revisionPOs.length > 0 ? (
          <POTable pos={revisionPOs} hrefBase="/mintah/po" showRejection storageKey="mintah-pos-revision" />
        ) : (
          <EmptyState icon={<CheckCircle size={20} />} title="Nothing to revise" description="No purchase orders need revision." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
