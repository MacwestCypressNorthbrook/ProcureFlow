import { requirePageCapability } from '@/lib/auth-guard'
import { query, queryOne } from '@/lib/db'
import { notFound } from 'next/navigation'
import MintahRequestDetailClient from '@/components/shared/MintahRequestDetailClient'
import { resolveAttachments } from '@/lib/resolve-file-url'
import type { Request as DbRequest, RequestAttachment } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function MintahRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePageCapability('request:review')

  const [request, attachmentsRaw] = await Promise.all([
    queryOne<DbRequest>(`SELECT * FROM public.requests WHERE id = $1 LIMIT 1`, [id]),
    query<RequestAttachment>(
      `SELECT id, request_id, file_name, file_url, uploaded_by, created_at
       FROM public.request_attachments
       WHERE request_id = $1
       ORDER BY created_at DESC`,
      [id]
    ),
  ])

  if (!request) {
    notFound()
  }

  const resolvedAttachments = await resolveAttachments(attachmentsRaw)

  return (
    <MintahRequestDetailClient
      request={request}
      attachments={resolvedAttachments}
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'supply_chain'}
    />
  )
}
