import { requirePageRole } from '@/lib/auth-guard'
import ReviewedView from '@/components/shared/ReviewedView'

export const dynamic = 'force-dynamic'

/**
 * Supply Chain — what this stage has already decided.
 *
 * The queue empties as work is done; this is the record that does not.
 */
export default async function SupplyChainReviewedPage() {
  const user = await requirePageRole('supply_chain')
  return <ReviewedView stage="supply_chain" user={user} hrefBase="/mintah/requests" queueHref="/mintah/queue" reviewedHref="/mintah/reviewed" />
}
