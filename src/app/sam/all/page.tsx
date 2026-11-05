import { requirePageRole } from '@/lib/auth-guard'
import AllRequisitionsView from '@/components/shared/AllRequisitionsView'
import { PageContainer } from '@/components/shared/ui-kit'

export const dynamic = 'force-dynamic'

/**
 * Project Lead — the whole pipeline, with each requisition's approval trail.
 *
 * The Lead approves first and then loses sight of a requisition; this is where
 * they follow it through Supply Chain, Cost Control and Administration.
 */
export default async function ProjectLeadAllRequestsPage() {
  await requirePageRole('project_lead')

  return (
    <PageContainer className="space-y-6">
      <AllRequisitionsView
        stage="lead"
        queueHref="/sam/requests"
        queueLabel="Awaiting Review"
        hrefBase="/sam/requests"
        storageKey="lead-all-requests"
      />
    </PageContainer>
  )
}
