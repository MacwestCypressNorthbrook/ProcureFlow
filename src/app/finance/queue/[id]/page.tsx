import { requirePageRole } from '@/lib/auth-guard'
import StageReview from '@/components/shared/StageReview'

export const dynamic = 'force-dynamic'

export default async function FinancePayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePageRole('finance')

  return <StageReview requestId={id} user={user} backHref="/finance/queue" backLabel="Back to payment queue" />
}
