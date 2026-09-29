import { requirePageRole } from '@/lib/auth-guard'
import QueueTable from '@/components/shared/QueueTable'
import { PageContainer, StatGrid } from '@/components/shared/ui-kit'
import { requestSummaryStats } from '@/components/shared/stat-presets'
import { getStageInbox, getStageDecisions } from '@/lib/review'
import StageTabs from '@/components/shared/StageTabs'
import { ShoppingBag } from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * Administration's queue — the last stop on the chain.
 *
 * Everything here has cleared the Project Lead, Supply Chain and Cost Control.
 * All that remains is raising the purchase order and closing the requisition,
 * so nothing leaves this page for another stage; it leaves completed.
 */
export default async function AdminPOQueuePage() {
  await requirePageRole('administrator', 'super_user')
  const [rows, decisions] = await Promise.all([
    getStageInbox('admin'),
    getStageDecisions('admin', { limit: 500 }),
  ])

  return (
    <>
      <PageContainer className="space-y-6">
        <StageTabs
          tabs={[
            { label: 'Awaiting review', href: '/admin/requests', count: rows.length, active: true },
            { label: 'Reviewed', href: '/admin/reviewed', count: decisions.length },
          ]}
        />
        <StatGrid
          stats={requestSummaryStats({
            requests: rows as unknown as Record<string, unknown>[],
            label: 'Awaiting final authorization',
            icon: <ShoppingBag size={18} />,
            tone: 'purple',
            trailing: 'age',
            ageLabel: 'Longest waiting',
          })}
        />
        <QueueTable rows={rows} hrefBase="/admin/requests" storageKey="admin-authorization-queue" />
      </PageContainer>
    </>
  )
}
