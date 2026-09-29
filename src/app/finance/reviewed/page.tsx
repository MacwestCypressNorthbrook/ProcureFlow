import { requirePageRole } from '@/lib/auth-guard'
import ReviewedView from '@/components/shared/ReviewedView'

export const dynamic = 'force-dynamic'

/**
 * Finance — what this stage has already settled.
 *
 * Finance sits off the approval chain now, but the payments it recorded while
 * it was on it are still part of the audit trail and still get asked about.
 */
export default async function FinanceReviewedPage() {
  const user = await requirePageRole('finance')
  return <ReviewedView stage="finance" user={user} hrefBase="/finance" />
}
