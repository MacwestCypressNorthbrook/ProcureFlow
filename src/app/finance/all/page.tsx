import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import POTable from '@/components/shared/POTable'
import { PageContainer, StatGrid, SectionHeader, EmptyState } from '@/components/shared/ui-kit'
import { poSummaryStats } from '@/components/shared/stat-presets'
import { Receipt } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function FinanceAllPage() {
  await requirePageRole('finance')
  let pos: PurchaseOrder[] = []

  try {
    pos = await query<PurchaseOrder>(
      `SELECT * FROM public.purchase_orders ORDER BY created_at DESC`
    )
  } catch (err) {
    console.error('Failed to query all POs from Neon:', err)
  }

  return (
    <>
      <PageContainer className="space-y-6">
        <StatGrid
          stats={poSummaryStats({
            pos,
            label: 'All purchase orders',
            icon: <Receipt size={18} />,
            tone: 'indigo',
            trailing: 'month',
          })}
        />
        <SectionHeader title="All Purchase Orders" count={pos.length} />
        {pos.length > 0 ? (
          <POTable pos={pos} hrefBase="/finance" storageKey="finance-all" />
        ) : (
          <EmptyState icon={<Receipt size={20} />} title="No purchase orders" description="Purchase orders will appear here." />
        )}
      </PageContainer>
    </>
  )
}
