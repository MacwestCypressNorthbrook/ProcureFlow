import { requirePageRole } from '@/lib/auth-guard'
import AllRequisitionsView from '@/components/shared/AllRequisitionsView'
import { PageContainer } from '@/components/shared/ui-kit'

export const dynamic = 'force-dynamic'

export default async function FinanceAllRequestsPage() {
  await requirePageRole('finance')

  return (
    <PageContainer className="space-y-6">
      <AllRequisitionsView
        stage="finance"
        queueHref="/finance/queue"
        queueLabel="Awaiting Payment"
        hrefBase="/finance/queue"
        storageKey="finance-all-requests"
      />
    </PageContainer>
  )
}
