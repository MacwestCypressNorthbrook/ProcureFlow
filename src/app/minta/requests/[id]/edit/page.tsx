import { requirePageRole, isElevated } from '@/lib/auth-guard'
import { query, queryOne } from '@/lib/db'
import { getRequestItems } from '@/lib/requests'
import { getActiveProjects, getProjectsForUser } from '@/lib/projects'
import { PageContainer, PageHeader, EmptyState } from '@/components/shared/ui-kit'
import { extractRequisition } from '@/lib/requisitions'
import type { SupplierOption } from '@/components/shared/SupplierPicker'
import type { Project, RequestAttachment } from '@/lib/types'
import { Lock, FileText } from 'lucide-react'
import Link from 'next/link'
import EditRequestForm from './EditRequestForm'

export const dynamic = 'force-dynamic'

export default async function EditRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePageRole('engineer')

  let request: Record<string, unknown> | null = null
  let items: Awaited<ReturnType<typeof getRequestItems>> = []
  let projects: Project[] = []
  let suppliers: SupplierOption[] = []
  let sendBackInfo: {
    comment: string | null
    performer_name: string | null
    created_at: string
    stage?: string | null
  } | null = null
  let attachments: RequestAttachment[] = []

  try {
    const [requestData, itemRows, projectList, supplierList, sendBackRow, attachmentRows] = await Promise.all([
      queryOne<Record<string, unknown>>(
        `SELECT r.*, pr.name AS project_name
           FROM public.requests r
           LEFT JOIN public.projects pr ON pr.id = r.project_id
          WHERE r.id = $1
          LIMIT 1`,
        [id]
      ),
      getRequestItems(id),
      isElevated(user.role) ? getActiveProjects() : getProjectsForUser(user.id),
      query<SupplierOption>(
        `SELECT id, name, category, contact_name, phone
           FROM public.suppliers
          WHERE is_active
          ORDER BY name ASC`
      ),
      queryOne<{
        comment: string | null
        performer_name: string | null
        created_at: string
        stage: string | null
      }>(
        `SELECT a.comment, a.created_at, a.stage, u.name AS performer_name
           FROM public.request_approvals a
           LEFT JOIN public.users u ON u.id = a.performed_by
          WHERE a.request_id = $1 AND a.action = 'sent_back'
          ORDER BY a.created_at DESC
          LIMIT 1`,
        [id]
      ),
      query<RequestAttachment>(
        `SELECT id, request_id, file_name, file_url, file_size, file_type, uploaded_by, created_at
           FROM public.request_attachments
          WHERE request_id = $1
          ORDER BY created_at DESC`,
        [id]
      ),
    ])

    request = requestData
    items = itemRows
    projects = projectList
    suppliers = supplierList
    sendBackInfo = sendBackRow
    attachments = attachmentRows
  } catch (err) {
    console.error('Failed to load request for editing from Neon:', err)
  }

  if (!request) {
    return (
      <PageContainer>
        <EmptyState
          icon={<FileText size={20} />}
          title="Request not found"
          action={
            <Link href="/minta/requests" className="text-sm font-medium text-primary hover:underline">
              Back to requests
            </Link>
          }
        />
      </PageContainer>
    )
  }

  const isOwner =
    (request.created_by
      ? request.created_by === user?.id
      : request.guest_email === user?.email || user?.role === 'engineer') ||
    isElevated(user?.role)

  if (!isOwner) {
    return (
      <PageContainer>
        <EmptyState
          icon={<Lock size={20} />}
          title="Access restricted"
          description="You do not have permission to edit this requisition."
          action={
            <Link href={`/minta/requests/${id}`} className="text-sm font-medium text-primary hover:underline">
              View request details
            </Link>
          }
        />
      </PageContainer>
    )
  }

  const status = String(request.status || '')
  // A requisition is editable while in draft, pending lead review, or when sent back for correction
  const canEdit =
    status === 'draft' ||
    status === 'pending_lead' ||
    status === 'sent_back' ||
    status === 'new' ||
    status === 'reviewing'

  if (!canEdit) {
    return (
      <PageContainer className="space-y-6">
        <PageHeader
          backHref={`/minta/requests/${id}`}
          backLabel="Back to request"
          title="Edit Requisition"
          subtitle={String(request.purpose || '')}
        />
        <EmptyState
          icon={<Lock size={20} />}
          title="This request cannot be edited"
          description={`Requests with status "${status}" are read-only. Requisitions can only be edited while in draft, pending initial review, or when sent back for correction.`}
          action={
            <Link href={`/minta/requests/${id}`} className="text-sm font-medium text-primary hover:underline">
              View request details
            </Link>
          }
        />
      </PageContainer>
    )
  }

  const { data: richData } = extractRequisition(request.description as string | null)
  const notes =
    richData?.generalNotes ??
    (typeof request.description === 'string' && !request.description.trim().startsWith('{')
      ? request.description
      : '')

  const initialItems =
    items.length > 0
      ? items.map((it) => ({
          id: it.id,
          category: (it.category || 'material') as 'material' | 'labour' | 'other',
          isSubcontractor: Boolean(it.is_subcontractor),
          description: it.description || '',
          quantity: String(Number(it.quantity ?? 1)),
          unit: it.unit || (it.category === 'labour' ? 'man-days' : 'pcs'),
          unitPrice: String(it.unit_price ?? ''),
          supplierId: it.supplier_id || null,
          remarks: it.remarks || '',
        }))
      : richData?.items && richData.items.length > 0
        ? richData.items.map((it, idx) => ({
            id: `rich-${idx}`,
            category: (it.category || 'material') as 'material' | 'labour' | 'other',
            isSubcontractor: Boolean(it.isSubcontractor),
            description: it.description || '',
            quantity: String(Number(it.quantity ?? 1)),
            unit: it.unit || (it.category === 'labour' ? 'man-days' : 'pcs'),
            unitPrice: String(it.unitPrice ?? ''),
            supplierId: null,
            remarks: it.remarks || '',
          }))
        : [
            {
              id: 'initial-line-1',
              category: 'material' as const,
              isSubcontractor: false,
              description: String(request.purpose || ''),
              quantity: String(Number(request.estimated_quantity) || 1),
              unit: 'pcs',
              unitPrice: String((request.estimated_unit_rate as number) || ''),
              supplierId: null,
              remarks: '',
            },
          ]

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        backHref={`/minta/requests/${id}`}
        backLabel="Back to request"
        title="Edit Requisition"
        subtitle={String(request.purpose || '')}
      />

      <EditRequestForm
        requestId={id}
        status={status}
        initialData={{
          purpose: String(request.purpose || ''),
          notes: notes,
          department: String(request.department || richData?.details?.department || 'Operations'),
          projectId: (request.project_id as string) || '',
          items: initialItems,
          guestName: String(request.guest_name || ''),
          guestEmail: String(request.guest_email || ''),
        }}
        projects={projects}
        suppliers={suppliers}
        sendBackInfo={sendBackInfo}
        attachments={attachments}
      />
    </PageContainer>
  )
}
