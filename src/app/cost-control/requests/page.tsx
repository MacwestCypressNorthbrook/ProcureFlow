import { requirePageRole } from '@/lib/auth-guard'
import AllRequisitionsView from '@/components/shared/AllRequisitionsView'
import { PageContainer } from '@/components/shared/ui-kit'

export const dynamic = 'force-dynamic'

export default async function CostControlAllRequestsPage() {
  await requirePageRole('cost_control')

  return (
    <PageContainer className="space-y-6">
      <AllRequisitionsView
        stage="cost_control"
        queueHref="/cost-control"
        queueLabel="Awaiting Review"
        hrefBase="/cost-control/requests"
        storageKey="cost-control-all-requests"
      />
    </PageContainer>
  )
}
