import { requirePageRole } from '@/lib/auth-guard'
import { queryOne } from '@/lib/db'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { PageContainer, PageHeader, EmptyState } from '@/components/shared/ui-kit'
import { Lock, FileText } from 'lucide-react'
import Link from 'next/link'
import EditRequestForm from './EditRequestForm'

export const dynamic = 'force-dynamic'

export default async function EditRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePageRole('engineer')

  let request: Record<string, unknown> | null = null

  try {
    request = await queryOne<Record<string, unknown>>(
      `SELECT * FROM public.requests WHERE id = $1 LIMIT 1`,
      [id]
    )
  } catch (err) {
    console.error('Failed to load request for editing from Neon:', err)
  }

  if (!request) {
    return (
      <DashboardLayout
        title="Edit Request"
        user={user ? { name: user.name, email: user.email } : null}
        role={user?.role ?? 'minta'}
      >
        <PageContainer>
          <EmptyState
            icon={<FileText size={20} />}
            title="Request not found"
            action={<Link href="/minta/requests" className="text-sm font-medium text-primary hover:underline">Back to requests</Link>}
          />
        </PageContainer>
      </DashboardLayout>
    )
  }

  const status = request.status as string
  const canEdit = status === 'new' || status === 'reviewing'

  // Parse description for pre-fill
  let descriptionText = (request.description as string) || ''
  let richData: Record<string, unknown> | null = null
  if (descriptionText.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(descriptionText)
      if (parsed && parsed.type === 'rich_requisition') {
        richData = parsed
      }
    } catch {
      // Use raw description
    }
  }

  return (
    <DashboardLayout
      title="Edit Request"
      subtitle={request.purpose as string}
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'minta'}
    >
      <PageContainer className="space-y-6">
        <PageHeader backHref={`/minta/requests/${id}`} backLabel="Back to request" title="Edit Request" subtitle={request.purpose as string} />

        {!canEdit ? (
          <EmptyState
            icon={<Lock size={20} />}
            title="This request cannot be edited"
            description={`Requests with status "${status}" are read-only. Only "new" or "reviewing" requests can be modified.`}
            action={<Link href={`/minta/requests/${id}`} className="text-sm font-medium text-primary hover:underline">View request details</Link>}
          />
        ) : (
          <EditRequestForm
            requestId={id}
            initialData={{
              purpose: (request.purpose as string) || '',
              description: descriptionText,
              estimated_quantity: (request.estimated_quantity as number) || 0,
              estimated_unit_rate: (request.estimated_unit_rate as number) || 0,
              guest_name: (request.guest_name as string) || '',
              guest_email: (request.guest_email as string) || '',
            }}
          />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
