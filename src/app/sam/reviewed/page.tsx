import { requirePageRole } from '@/lib/auth-guard'
import ReviewedView from '@/components/shared/ReviewedView'

export const dynamic = 'force-dynamic'

/**
 * Project Lead — what this stage has already decided.
 *
 * The queue empties as work is done; this is the record that does not.
 */
export default async function ProjectLeadReviewedPage() {
  const user = await requirePageRole('project_lead')
  return <ReviewedView stage="lead" user={user} hrefBase="/sam/requests" queueHref="/sam/requests" reviewedHref="/sam/reviewed" />
}
