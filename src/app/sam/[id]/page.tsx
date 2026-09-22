import { requirePageRole } from '@/lib/auth-guard'
import { query, queryOne } from '@/lib/db'
import { notFound } from 'next/navigation'
import EnhancedPODetailClient from '@/components/shared/EnhancedPODetailClient'
import { resolveAttachments } from '@/lib/resolve-file-url'
import type { PurchaseOrder, PoAttachment } from '@/lib/types'
import { getPoAuditTrail } from '@/lib/audit'

export const dynamic = 'force-dynamic'

interface RawComment {
  id: string
  content: string
  created_at: string
  author: { id: string; name: string | null; email: string }
}

export default async function SamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePageRole('project_lead', 'cost_control')

  const po = await queryOne<PurchaseOrder>(
    `SELECT * FROM public.purchase_orders WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!po) {
    notFound()
  }

  let originalRequest: Record<string, unknown> | null = null
  if (po.request_id) {
    originalRequest = await queryOne<Record<string, unknown>>(
      `SELECT * FROM public.requests WHERE id = $1 LIMIT 1`,
      [po.request_id]
    )
  }

  const auditTrail = await getPoAuditTrail(id)

  const comments = await query<RawComment>(
    `SELECT c.id, c.comment as content, c.created_at,
            json_build_object('id', u.id, 'name', u.name, 'email', u.email) as author
     FROM public.po_comments c
     LEFT JOIN public.users u ON u.id = c.user_id
     WHERE c.po_id = $1
     ORDER BY c.created_at ASC`,
    [id]
  )

  const poAttachmentsRaw = await query<PoAttachment>(
    `SELECT id, po_id, file_name, file_url, uploaded_by, created_at
     FROM public.po_attachments
     WHERE po_id = $1
     ORDER BY created_at ASC`,
    [id]
  )

  const poAttachments = await resolveAttachments(poAttachmentsRaw)

  return (
    <EnhancedPODetailClient
      po={po}
      originalRequest={originalRequest}
      auditTrail={auditTrail}
      comments={comments}
      poAttachments={poAttachments}
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'project_lead'}
    />
  )
}
