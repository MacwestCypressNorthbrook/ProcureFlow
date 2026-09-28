import { requirePageRole } from '@/lib/auth-guard'
import QueueTable from '@/components/shared/QueueTable'
import { PageContainer, StatGrid } from '@/components/shared/ui-kit'
import { requestSummaryStats } from '@/components/shared/stat-presets'
import { getStageInbox } from '@/lib/review'
import { statusForStage } from '@/lib/workflow'
import { Eye } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SupplyChainQueuePage() {
  await requirePageRole('supply_chain')
  const rows = await getStageInbox('supply_chain')

  return (
    <>
      <PageContainer className="space-y-6">
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
