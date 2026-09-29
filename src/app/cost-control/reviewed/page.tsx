import { requirePageRole } from '@/lib/auth-guard'
import ReviewedView from '@/components/shared/ReviewedView'

export const dynamic = 'force-dynamic'

/**
 * Cost Control — what this stage has already decided.
 *
 * The dashboard's own `?view=reviewed` tab still works and shows the same
 * record; this route exists so the sidebar entry matches every other role's.
 */
export default async function CostControlReviewedPage() {
  const user = await requirePageRole('cost_control')
  return <ReviewedView stage="cost_control" user={user} hrefBase="/cost-control/requests" queueHref="/cost-control" reviewedHref="/cost-control/reviewed" />
}
