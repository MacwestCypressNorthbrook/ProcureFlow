import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import POTable from '@/components/shared/POTable'
import { PageContainer, SectionHeader, DashboardHero, EmptyState } from '@/components/shared/ui-kit'
import FinanceHomeDashboard from '@/components/dashboards/FinanceHomeDashboard'
import { Button } from '@/components/ui/button'
import { CheckCircle, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import type { PurchaseOrder } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function FinancePage() {
  const user = await requirePageRole('finance')
  let allPos: PurchaseOrder[] = []

  try {
    allPos = await query<PurchaseOrder>(
      `SELECT po.*, r.description AS request_description
         FROM public.purchase_orders po
         LEFT JOIN public.requests r ON r.id = po.request_id
        ORDER BY po.created_at DESC`
    )
  } catch (err) {
    console.error('Failed to load POs from Neon:', err)
  }

  const pendingCount = allPos.filter((p) => p.status === 'pending_finance').length
  const completedThisMonth = allPos.filter((p) => {
    if (!p.paid_at || (p.status !== 'paid')) return false
    const now = new Date()
    const paid = new Date(p.paid_at)
    return paid.getMonth() === now.getMonth() && paid.getFullYear() === now.getFullYear()
  }).length
  const totalAmount = allPos
    .filter((p) => p.status === 'paid' || p.status === 'pending_finance')
    .reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0)

  const pendingPaying = allPos.filter((p) => p.status === 'pending_finance')
  const recentlyCompleted = allPos.filter((p) => p.status === 'paid').slice(0, 8)

  const pendingAmount = pendingPaying.reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0)
  const money = (n: number) =>
    new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
      maximumFractionDigits: 0,
    }).format(n)
  const firstName = user?.name?.split(' ')[0]

  return (
    <>
      <PageContainer className="space-y-6">
        <DashboardHero
          eyebrow="Disbursements"
          title={
            pendingCount === 0
              ? 'Every approved order is settled'
              : `${money(pendingAmount)} ready to disburse`
          }
          description={
            pendingCount === 0
              ? firstName
                ? `Nothing is waiting on payment, ${firstName}. Approved orders land here the moment Sam signs them off.`
                : 'Nothing is waiting on payment. Approved orders land here the moment Sam signs them off.'
              : `${pendingCount} approved purchase order${pendingCount === 1 ? '' : 's'} are cleared for payment. Attach the receipt to close each one out.`
          }
          meta={[
            { label: `${pendingCount} awaiting payment`, tone: pendingCount > 0 ? 'blue' : 'emerald' },
            { label: `${completedThisMonth} settled this month`, tone: 'emerald' },
            { label: `${money(totalAmount)} lifetime value`, tone: 'amber' },
          ]}
          actions={
            pendingCount > 0 ? (
              <Link href="/finance/pending">
                <Button className="h-10 gap-1.5 px-4">
                  Process payments <ArrowRight size={15} />
                </Button>
              </Link>
            ) : undefined
          }
        />

        <FinanceHomeDashboard pos={allPos} />

        <section>
          <SectionHeader
            title="Pending Payments"
            count={pendingPaying.length}
            action={
              pendingPaying.length > 0 && (
                <Link href="/finance/pending" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  View all <ArrowRight size={13} />
                </Link>
              )
            }
          />
          {pendingPaying.length > 0 ? (
            <POTable pos={pendingPaying.slice(0, 8)} hrefBase="/finance" compact />
          ) : (
            <EmptyState icon={<CheckCircle size={20} />} title="All paid up" description="No payments pending at this time." />
          )}
        </section>

        {recentlyCompleted.length > 0 && (
          <section>
            <SectionHeader title="Recently Completed" count={recentlyCompleted.length} />
            <POTable pos={recentlyCompleted} hrefBase="/finance" compact />
          </section>
        )}
      </PageContainer>
    </>
  )
}
