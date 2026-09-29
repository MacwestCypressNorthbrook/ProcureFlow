import { requirePageRole } from '@/lib/auth-guard'
import QueueTable from '@/components/shared/QueueTable'
import { PageContainer, StatGrid } from '@/components/shared/ui-kit'
import { requestSummaryStats } from '@/components/shared/stat-presets'
import { getStageInbox, getStageDecisions } from '@/lib/review'
import StageTabs from '@/components/shared/StageTabs'
import { ClipboardCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function LeadQueuePage() {
  await requirePageRole('project_lead')
  const [rows, decisions] = await Promise.all([
    getStageInbox('lead'),
    getStageDecisions('lead', { limit: 500 }),
  ])

  return (
    <>
      <PageContainer className="space-y-6">
        <StageTabs
          tabs={[
            { label: 'Awaiting review', href: '/sam/requests', count: rows.length, active: true },
            { label: 'Reviewed', href: '/sam/reviewed', count: decisions.length },
          ]}
        />
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
    </>
  )
}
