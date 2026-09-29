import { requirePageRole } from '@/lib/auth-guard'
import StageReview from '@/components/shared/StageReview'

export const dynamic = 'force-dynamic'

export default async function MintahRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePageRole('supply_chain')

  return <StageReview requestId={id} user={user} backHref="/mintah/requests" backLabel="Back to requests" />
}
