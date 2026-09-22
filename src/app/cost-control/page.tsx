import { requirePageRole } from '@/lib/auth-guard'
import DashboardLayout from '@/components/layout/DashboardLayout'
import QueueTable from '@/components/shared/QueueTable'
import { PageContainer, StatGrid } from '@/components/shared/ui-kit'
import { requestSummaryStats } from '@/components/shared/stat-presets'
import { getStageQueue } from '@/lib/review'
import { statusForStage } from '@/lib/workflow'
import { Scale } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function CostControlQueuePage() {
  const user = await requirePageRole('cost_control')
  const rows = await getStageQueue([statusForStage('cost_control')])

  return (
    <DashboardLayout
      title="Cost Control Review"
      subtitle="Review purchase orders against budget"
      user={{ name: user.name, email: user.email }}
      role={user.role}
    >
      <PageContainer className="space-y-6">
        <StatGrid
          stats={requestSummaryStats({
            requests: rows as unknown as Record<string, unknown>[],
            label: 'Awaiting your review',
            icon: <Scale size={18} />,
            tone: 'emerald',
            trailing: 'age',
            ageLabel: 'Longest waiting',
          })}
        />
        <QueueTable rows={rows} hrefBase="/cost-control/requests" storageKey="cost-control-queue" />
      </PageContainer>
    </DashboardLayout>
  )
}
