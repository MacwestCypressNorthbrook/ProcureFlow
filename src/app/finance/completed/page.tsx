import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import POTable from '@/components/shared/POTable'
import { PageContainer, StatGrid, EmptyState } from '@/components/shared/ui-kit'
import { poSummaryStats } from '@/components/shared/stat-presets'
import { CheckCircle } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function FinanceCompletedPage() {
  await requirePageRole('finance')
  let pos: PurchaseOrder[] = []

  try {
    pos = await query<PurchaseOrder>(
      `SELECT po.*, r.description AS request_description
         FROM public.purchase_orders po
         LEFT JOIN public.requests r ON r.id = po.request_id
        WHERE po.status IN ('paid')
        ORDER BY po.paid_at DESC, po.created_at DESC`
    )
  } catch (err) {
    console.error('Failed to query completed POs from Neon:', err)
  }

  return (
    <>
      <PageContainer className="space-y-6">
        <StatGrid
          stats={poSummaryStats({
            pos,
            label: 'Completed payments',
            icon: <CheckCircle size={18} />,
            tone: 'emerald',
            dateField: 'paid_at',
            trailing: 'month',
          })}
        />
        {pos.length > 0 ? (
          <POTable pos={pos} hrefBase="/finance" storageKey="finance-completed" />
        ) : (
          <EmptyState icon={<CheckCircle size={20} />} title="No completed payments" description="Processed payments will appear here." />
        )}
      </PageContainer>
    </>
  )
}
