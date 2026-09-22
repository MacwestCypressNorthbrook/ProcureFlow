import { requirePageRole } from '@/lib/auth-guard'
import StageReview from '@/components/shared/StageReview'

export const dynamic = 'force-dynamic'

export default async function CostControlReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePageRole('cost_control')

  return <StageReview requestId={id} user={user} backHref="/cost-control" backLabel="Back to review queue" />
}
