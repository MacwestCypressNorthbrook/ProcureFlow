import { requirePageRole } from '@/lib/auth-guard'
import StageReview from '@/components/shared/StageReview'

export const dynamic = 'force-dynamic'

export default async function AdminPORaisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePageRole('administrator', 'super_user')

  return <StageReview requestId={id} user={user} backHref="/admin/requests" backLabel="Back to PO queue" />
}
