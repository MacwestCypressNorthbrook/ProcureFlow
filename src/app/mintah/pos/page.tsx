import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { monthSplit, statMoney } from '@/components/shared/stat-presets'
import { PageContainer, SectionHeader, StatGrid, EmptyState } from '@/components/shared/ui-kit'
import { AlertTriangle, CheckCircle, Send, ShoppingBag, Wallet } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function MintahPOsPage() {
  const user = await requirePageRole('supply_chain')
  let myPOs: PurchaseOrder[] = []

  if (user?.id) {
    try {
      myPOs = await query<PurchaseOrder>(
        `SELECT * FROM public.purchase_orders
         WHERE created_by = $1
         ORDER BY created_at DESC`,
        [user.id]
      )
    } catch (err) {
      console.error('Failed to load POs from Neon:', err)
    }
  }

  const stats = {
    total: myPOs.length,
    pendingSam: myPOs.filter((po) => po.status === 'pending_cost_control').length,
    revision: myPOs.filter((po) => po.status === 'sent_back').length,
    completed: myPOs.filter((po) => po.status === 'paid').length,
  }

  const share = (n: number) => (stats.total > 0 ? n / stats.total : 0)
  const month = monthSplit(myPOs.map((p) => p.created_at))
  const totalValue = myPOs.reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0)

  return (
    <DashboardLayout
      title="Purchase Orders"
      subtitle="Manage and track procurement orders"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'supply_chain'}
    >
      <PageContainer className="space-y-6">
        <StatGrid
          stats={[
            {
              label: 'Total orders',
              value: stats.total,
              icon: <ShoppingBag size={18} />,
              tone: 'indigo',
              delta: month.delta,
              compare: month.lastMonth > 0 ? `vs. ${month.lastMonth} last month` : `${month.thisMonth} raised this month`,
            },
            {
              label: 'Total value',
              value: statMoney(totalValue),
              icon: <Wallet size={18} />,
              tone: 'purple',
              compare: `Across ${stats.total} order${stats.total === 1 ? '' : 's'}`,
            },
            {
              label: 'Pending approval',
              value: stats.pendingSam,
              icon: <Send size={18} />,
              tone: 'amber',
              share: share(stats.pendingSam),
              compare: 'Sitting with the approver',
              href: '/mintah/pos/pending',
            },
            {
              label: 'Revision needed',
              value: stats.revision,
              icon: <AlertTriangle size={18} />,
              tone: 'red',
              share: share(stats.revision),
              compare: stats.revision > 0 ? 'Sent back for correction' : 'Nothing sent back',
              href: '/mintah/pos/revision',
            },
            {
              label: 'Completed',
              value: stats.completed,
              icon: <CheckCircle size={18} />,
              tone: 'emerald',
              share: share(stats.completed),
              compare: `${Math.round(share(stats.completed) * 100)}% of everything you raised`,
              href: '/mintah/pos/completed',
            },
          ]}
        />

        <section>
          <SectionHeader title="All Purchase Orders" count={myPOs.length} />
          {myPOs.length > 0 ? (
            <POTable pos={myPOs} hrefBase="/mintah/po" showRejection storageKey="mintah-pos" />
          ) : (
            <EmptyState icon={<ShoppingBag size={20} />} title="No purchase orders yet" description="Convert a request to create your first PO." />
          )}
        </section>
      </PageContainer>
    </DashboardLayout>
  )
}
