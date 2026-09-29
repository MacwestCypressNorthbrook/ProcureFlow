import { requirePageRole } from '@/lib/auth-guard'
import ReviewedView from '@/components/shared/ReviewedView'

export const dynamic = 'force-dynamic'

/**
 * Administration — what this stage has already decided.
 *
 * The queue empties as work is done; this is the record that does not.
 */
export default async function AdministrationReviewedPage() {
  const user = await requirePageRole('administrator', 'super_user')
  return <ReviewedView stage="admin" user={user} hrefBase="/admin/requests" queueHref="/admin/requests" reviewedHref="/admin/reviewed" />
}
