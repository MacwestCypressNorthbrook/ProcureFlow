import { requirePageRole } from '@/lib/auth-guard'
import QueueTable from '@/components/shared/QueueTable'
import { PageContainer, StatGrid } from '@/components/shared/ui-kit'
import { requestSummaryStats } from '@/components/shared/stat-presets'
import { withPresence } from '@/lib/presence'
import { getStageInbox, getStageDecisionCount } from '@/lib/review'
import StageTabs from '@/components/shared/StageTabs'
import { STAGES, statusForStage } from '@/lib/workflow'
import { ClipboardCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function LeadQueuePage() {
  const user = await requirePageRole('project_lead')
  const [rows, decisionCount] = await Promise.all([
    // Who else at this stage has each one open (advisory badge).
    getStageInbox('lead').then((rows) => withPresence(rows, ['lead'], user.id)),
    getStageDecisionCount('lead'),
  ])

  return (
    <>
      <PageContainer className="space-y-6">
        <StageTabs
          tabs={[
            { label: 'Awaiting review', href: '/sam/requests', count: rows.length, active: true },
            { label: 'Reviewed', href: '/sam/reviewed', count: decisionCount },
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
        <QueueTable
          rows={rows}
          hrefBase="/sam/requests"
          storageKey="lead-queue"
          batch={{ eligibleStatus: statusForStage('lead'), nextStageLabel: STAGES.supply_chain.label }}
        />
      </PageContainer>
    </>
  )
}
