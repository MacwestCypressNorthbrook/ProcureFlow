import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, StatGrid, EmptyState } from '@/components/shared/ui-kit'
import { poSummaryStats } from '@/components/shared/stat-presets'
import { CheckCircle, CreditCard } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function FinancePendingPage() {
  const user = await requirePageRole('finance')
  let pos: PurchaseOrder[] = []

  try {
    pos = await query<PurchaseOrder>(
      `SELECT * FROM public.purchase_orders
       WHERE status IN ('pending_finance')
       ORDER BY created_at ASC`
    )
  } catch (err) {
    console.error('Failed to query pending POs from Neon:', err)
  }

  return (
    <DashboardLayout
      title="Pending Payment"
      subtitle="Approved purchase orders awaiting payment"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'finance'}
    >
      <PageContainer className="space-y-6">
        <StatGrid
          stats={poSummaryStats({
            pos,
            label: 'Awaiting payment',
            icon: <CreditCard size={18} />,
            tone: 'blue',
            trailing: 'age',
            ageLabel: 'Longest waiting',
          })}
        />
        {pos.length > 0 ? (
          <POTable pos={pos} hrefBase="/finance" storageKey="finance-pending" />
        ) : (
          <EmptyState icon={<CheckCircle size={20} />} title="All paid up" description="No purchase orders pending payment." />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
