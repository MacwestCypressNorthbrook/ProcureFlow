import { requirePageRole } from '@/lib/auth-guard'
import DashboardLayout from '@/components/layout/DashboardLayout'
import QueueTable from '@/components/shared/QueueTable'
import { PageContainer, StatGrid } from '@/components/shared/ui-kit'
import { requestSummaryStats } from '@/components/shared/stat-presets'
import { getStageQueue } from '@/lib/review'
import { statusForStage } from '@/lib/workflow'
import { ShoppingBag } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminPOQueuePage() {
  const user = await requirePageRole('administrator', 'super_user')
  const rows = await getStageQueue([statusForStage('admin')])

  return (
    <DashboardLayout
      title="Purchase Orders to Raise"
      subtitle="Approved requisitions waiting for a purchase order"
      user={{ name: user.name, email: user.email }}
      role={user.role}
    >
      <PageContainer className="space-y-6">
        <StatGrid
          stats={requestSummaryStats({
            requests: rows as unknown as Record<string, unknown>[],
            label: 'Awaiting a PO',
            icon: <ShoppingBag size={18} />,
            tone: 'purple',
            trailing: 'age',
            ageLabel: 'Longest waiting',
          })}
        />
        <QueueTable rows={rows} hrefBase="/admin/requests" storageKey="admin-po-queue" />
      </PageContainer>
    </DashboardLayout>
  )
}
