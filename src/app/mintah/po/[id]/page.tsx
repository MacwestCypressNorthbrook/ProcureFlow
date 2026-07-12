import { createClient, getUserFromSession } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import MintahPODetailClient from '@/components/shared/MintahPODetailClient'

export default async function MintahPODetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const user = await getUserFromSession()

  const { data: po, error } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !po) {
    notFound()
  }

  let originalRequest: any = null
  let comments: any[] = []
  let auditTrail: any[] = []

  if (po.request_id) {
    const { data } = await supabase
      .from('requests')
      .select('*')
      .eq('id', po.request_id)
      .single()
    originalRequest = data
  }

  try {
    const [commentsRes, auditRes] = await Promise.all([
      supabase
        .from('po_comments')
        .select('id, po_id, author_id, content, created_at, author:users!po_comments_author_id_fkey(id, name, email)')
        .eq('po_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('po_audit_trail')
        .select('id, po_id, action, performed_by, notes, created_at')
        .eq('po_id', id)
        .order('created_at', { ascending: false }),
    ])
    comments = (commentsRes.data as any[]) ?? []
    auditTrail = (auditRes.data as any[]) ?? []
  } catch {
    // tables may not exist yet
  }

  let poAttachments: any[] = []
  try {
    const { data: attachments } = await supabase
      .from('po_attachments')
      .select('id, po_id, file_name, file_url, uploaded_by, created_at')
      .eq('po_id', id)
      .order('created_at', { ascending: true })
    poAttachments = attachments ?? []
  } catch {
    // table may not exist yet
  }

  return (
    <MintahPODetailClient
      po={po}
      originalRequest={originalRequest}
      comments={comments}
      auditTrail={auditTrail}
      poAttachments={poAttachments}
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'mintah'}
    />
  )
}
