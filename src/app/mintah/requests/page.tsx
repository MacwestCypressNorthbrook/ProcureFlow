import { requirePageCapability } from '@/lib/auth-guard'
import AllRequisitionsView from '@/components/shared/AllRequisitionsView'
import { PageContainer } from '@/components/shared/ui-kit'

export const dynamic = 'force-dynamic'

export default async function MintahRequestsPage() {
  await requirePageCapability('request:review')

  return (
    <PageContainer className="space-y-6">
      <AllRequisitionsView
        stage="supply_chain"
        queueHref="/mintah/queue"
        queueLabel="Awaiting Review"
        hrefBase="/mintah/requests"
        storageKey="mintah-requests"
      />
    </PageContainer>
  )
}
