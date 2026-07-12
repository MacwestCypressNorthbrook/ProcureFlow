import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, SectionHeader, StatStrip, EmptyState } from '@/components/shared/ui-kit'
import { CreditCard, CheckCircle, DollarSign, Clock, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import type { PurchaseOrder } from '@/lib/types'

export default async function FinancePage() {
  const user = await getUserFromSession()
  const supabase = await createClient()
  let allPos: PurchaseOrder[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .order('created_at', { ascending: false })
    allPos = (data as PurchaseOrder[]) ?? []
  } catch {}

  const pendingCount = allPos.filter((p) => p.status === 'pending_payment').length
  const completedThisMonth = allPos.filter((p) => {
    if (!p.paid_at || p.status !== 'completed') return false
    const now = new Date()
    const paid = new Date(p.paid_at)
    return paid.getMonth() === now.getMonth() && paid.getFullYear() === now.getFullYear()
  }).length
  const totalProcessed = allPos.filter((p) => p.status === 'completed').length
  const totalAmount = allPos
    .filter((p) => p.status === 'completed' || p.status === 'pending_payment')
    .reduce((sum, p) => sum + (p.total_amount || 0), 0)

  const pendingPaying = allPos.filter((p) => p.status === 'pending_payment')
  const recentlyCompleted = allPos.filter((p) => p.status === 'completed').slice(0, 8)

  return (
    <DashboardLayout
      title="Finance Dashboard"
      subtitle="Manage and disburse payments for purchase orders"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'finance'}
    >
      <PageContainer className="space-y-8">
        <StatStrip
          stats={[
            { label: 'Pending Payment', value: pendingCount, icon: <CreditCard size={18} />, accent: 'blue', href: '/finance/pending' },
            { label: 'Completed This Month', value: completedThisMonth, icon: <CheckCircle size={18} />, accent: 'emerald', href: '/finance/completed' },
            { label: 'Total Processed', value: totalProcessed, icon: <Clock size={18} />, accent: 'purple', href: '/finance/completed' },
            { label: 'Total Amount', value: `$${totalAmount.toLocaleString()}`, icon: <DollarSign size={18} />, accent: 'amber', href: '/finance/all' },
          ]}
        />

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
            <POTable pos={pendingPaying.slice(0, 8)} hrefBase="/finance" />
          ) : (
            <EmptyState icon={<CheckCircle size={20} />} title="All paid up" description="No payments pending at this time." />
          )}
        </section>

        {recentlyCompleted.length > 0 && (
          <section>
            <SectionHeader title="Recently Completed" count={recentlyCompleted.length} />
            <POTable pos={recentlyCompleted} hrefBase="/finance" />
          </section>
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
