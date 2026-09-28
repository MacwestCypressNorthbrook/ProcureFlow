import { requirePageRole } from '@/lib/auth-guard'
import QueueTable from '@/components/shared/QueueTable'
import { PageContainer, StatGrid } from '@/components/shared/ui-kit'
import { requestSummaryStats } from '@/components/shared/stat-presets'
import { getStageInbox } from '@/lib/review'
import { statusForStage } from '@/lib/workflow'
import { CreditCard } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function FinanceQueuePage() {
  await requirePageRole('finance')
  const rows = await getStageInbox('finance')

  return (
    <>
      <PageContainer className="space-y-6">
        <StatGrid
          stats={requestSummaryStats({
            requests: rows as unknown as Record<string, unknown>[],
            label: 'Awaiting payment',
            icon: <CreditCard size={18} />,
            tone: 'blue',
            trailing: 'age',
            ageLabel: 'Longest waiting',
          })}
        />
        <QueueTable rows={rows} hrefBase="/finance/queue" storageKey="finance-queue" />
      </PageContainer>
    </>
  )
}
