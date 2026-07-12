import { createClient, getUserFromSession } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EnhancedFinanceDetailClient from '@/components/shared/EnhancedFinanceDetailClient'
import type { PurchaseOrder, PoAuditTrail, PoAttachment } from '@/lib/types'

interface RawComment {
  id: string
  content: string
  created_at: string
  author: { id: string; name: string | null; email: string }
}

export default async function FinanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  let originalRequest: Record<string, unknown> | null = null
  if (po.request_id) {
    const { data: req } = await supabase
      .from('requests')
      .select('*')
      .eq('id', po.request_id)
      .single()
    originalRequest = req
  }

  let samUser: { name: string | null; email: string } | null = null
  if (po.sam_approved_by) {
    const { data: u } = await supabase
      .from('users')
      .select('name, email')
      .eq('id', po.sam_approved_by)
      .single()
    samUser = u
  }

  const { data: auditTrail } = await supabase
    .from('po_audit_trail')
    .select('*')
    .eq('po_id', id)
    .order('created_at', { ascending: false })

  const { data: comments } = await supabase
    .from('po_comments')
    .select('id, po_id, author_id, content, created_at, author:users!po_comments_author_id_fkey(id, name, email)')
    .eq('po_id', id)
    .order('created_at', { ascending: true })

  const { data: poAttachments } = await supabase
    .from('po_attachments')
    .select('id, po_id, file_name, file_url, uploaded_by, created_at')
    .eq('po_id', id)
    .order('created_at', { ascending: true })

  return (
    <EnhancedFinanceDetailClient
      po={po as unknown as PurchaseOrder}
      originalRequest={originalRequest}
      samUser={samUser}
      auditTrail={(auditTrail as PoAuditTrail[]) ?? []}
      comments={(comments as unknown as RawComment[]) ?? []}
      poAttachments={(poAttachments as unknown as PoAttachment[]) ?? []}
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'finance'}
    />
  )
}
