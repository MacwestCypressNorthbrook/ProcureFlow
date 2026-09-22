import { requirePageRole } from '@/lib/auth-guard'
import StageReview from '@/components/shared/StageReview'

export const dynamic = 'force-dynamic'

export default async function LeadReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePageRole('project_lead')

  return <StageReview requestId={id} user={user} backHref="/sam/requests" backLabel="Back to review queue" />
}
