import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import { approvalsListSql } from '@/lib/approval-trail'
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
      `SELECT po.*,
              r.description AS request_description,
              COALESCE(ap.name, ap.email, ra_u.name, ra_u.email) AS approver_name,
              COALESCE(po.approved_at, po.sam_approved_at, ra.created_at) AS approved_at,
              ${approvalsListSql('po.request_id', 'po.id')} AS approvals_list
         FROM public.purchase_orders po
         LEFT JOIN public.requests r ON r.id = po.request_id
         LEFT JOIN public.users ap ON ap.id = COALESCE(po.approved_by, po.sam_approved_by)
         LEFT JOIN LATERAL (
              SELECT a.created_at, a.performed_by
                FROM public.request_approvals a
               WHERE a.po_id = po.id AND a.action = 'approved'
               ORDER BY a.created_at DESC
               LIMIT 1
         ) ra ON true
         LEFT JOIN public.users ra_u ON ra_u.id = ra.performed_by
        ORDER BY po.created_at DESC`
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
