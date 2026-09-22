import { requirePageRole } from '@/lib/auth-guard'
import DashboardLayout from '@/components/layout/DashboardLayout'
import QueueTable from '@/components/shared/QueueTable'
import { PageContainer, StatGrid } from '@/components/shared/ui-kit'
import { requestSummaryStats } from '@/components/shared/stat-presets'
import { getStageQueue } from '@/lib/review'
import { statusForStage } from '@/lib/workflow'
import { ClipboardCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function LeadQueuePage() {
  const user = await requirePageRole('project_lead')
  const rows = await getStageQueue([statusForStage('lead')])

  return (
    <DashboardLayout
      title="Requisitions to Review"
      subtitle="First review — confirm the requisition is justified"
      user={{ name: user.name, email: user.email }}
      role={user.role}
    >
      <PageContainer className="space-y-6">
        <StatGrid
          stats={requestSummaryStats({
            requests: rows as unknown as Record<string, unknown>[],
            label: 'Awaiting your review',
            icon: <ClipboardCheck size={18} />,
            tone: 'indigo',
            trailing: 'age',
            ageLabel: 'Longest waiting',
          })}
        />
        <QueueTable rows={rows} hrefBase="/sam/requests" storageKey="lead-queue" />
      </PageContainer>
    </DashboardLayout>
  )
}
