import { requirePageRole } from '@/lib/auth-guard'
import QueueTable from '@/components/shared/QueueTable'
import { PageContainer, StatGrid } from '@/components/shared/ui-kit'
import { requestSummaryStats } from '@/components/shared/stat-presets'
import { getStageInbox, getStageDecisionCount } from '@/lib/review'
import StageTabs from '@/components/shared/StageTabs'
import { Eye } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SupplyChainQueuePage() {
  await requirePageRole('supply_chain')
  const [rows, decisionCount] = await Promise.all([
    getStageInbox('supply_chain'),
    getStageDecisionCount('supply_chain'),
  ])

  return (
    <>
      <PageContainer className="space-y-6">
        <StageTabs
          tabs={[
            { label: 'Awaiting review', href: '/mintah/queue', count: rows.length, active: true },
            { label: 'Reviewed', href: '/mintah/reviewed', count: decisionCount },
          ]}
        />
        <StatGrid
          stats={requestSummaryStats({
            requests: rows as unknown as Record<string, unknown>[],
            label: 'Awaiting your review',
            icon: <Eye size={18} />,
            tone: 'amber',
            trailing: 'age',
            ageLabel: 'Longest waiting',
          })}
        />
        <QueueTable rows={rows} hrefBase="/mintah/queue" storageKey="supply-chain-queue" />
      </PageContainer>
    </>
  )
}
