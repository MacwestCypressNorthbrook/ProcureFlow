'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import DocumentList from '@/components/shared/DocumentList'
import POProgress from '@/components/shared/POProgress'
import StatusBadge from '@/components/shared/StatusBadge'
import RichRequisitionView, { isRichRequisition } from '@/components/shared/RichRequisitionView'
import { PageContainer, PageHeader, Panel, Field } from '@/components/shared/ui-kit'
import { PO_STATUS_CONFIG, formatCurrency, formatDate } from '@/lib/utils'
import { FileText, Send, MessageSquare, Clock, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { PoAuditEntry } from '@/lib/audit'
import AuditTrail from '@/components/shared/AuditTrail'

interface Comment {
  id: string
  po_id: string
  author_id: string | null
  content: string
  created_at: string
  author?: { id: string; name: string; email: string } | null
}

interface MintahPODetailProps {
  po: any
  originalRequest: any | null
  comments: Comment[]
  auditTrail: PoAuditEntry[]
  poAttachments?: any[]
  user?: { name?: string; email: string } | null
  role?: string | null
}

export default function MintahPODetailClient({
  po,
  originalRequest,
  comments: initialComments,
  auditTrail,
  poAttachments = [],
  user,
  role,
}: MintahPODetailProps) {
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [newComment, setNewComment] = useState('')
  const [isPostingComment, setIsPostingComment] = useState(false)

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return
    setIsPostingComment(true)
    const res = await fetch(`/api/po/${po.id}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newComment.trim() }),
    })
    if (res.ok) {
      const data = await res.json()
      setComments((prev) => [...prev, data.data])
      setNewComment('')
    }
    setIsPostingComment(false)
  }

  const isRich = isRichRequisition(po.description)

  return (
    <>
      <PageContainer className="space-y-6">
        <PageHeader
          backHref="/mintah/pos"
          backLabel="Back to My POs"
          title={po.purpose}
          subtitle={`PO #${po.id.slice(0, 8)} · Created ${formatDate(po.created_at)}`}
          actions={<StatusBadge status={po.status} config={PO_STATUS_CONFIG} />}
        />

        <POProgress status={po.status} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Main */}
          <div className="min-w-0 space-y-6">
            {isRich ? (
              <RichRequisitionView description={po.description} fallbackPurpose={po.purpose} fallbackDate={po.created_at} />
            ) : (
              <Panel title="Purchase Order Details" icon={<FileText size={16} />}>
                <div className="space-y-4">
                  <Field label="Purpose"><p className="text-base font-semibold text-foreground">{po.purpose}</p></Field>
                  {po.description && (
                    <Field label="Description"><p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{po.description}</p></Field>
                  )}
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="Quantity"><p className="text-sm font-semibold tabular-nums text-foreground">{po.quantity ?? '—'}</p></Field>
                    <Field label="Unit Rate"><p className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(po.unit_rate)}</p></Field>
                    <Field label="Total"><p className="text-sm font-semibold tabular-nums text-primary">{formatCurrency(po.total_amount)}</p></Field>
                  </div>
                </div>
              </Panel>
            )}

            {originalRequest && (
              <Panel title="Original Request" icon={<FileText size={16} />}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Requester"><p className="text-sm font-semibold text-foreground">{originalRequest.guest_name || '—'}</p></Field>
                  <Field label="Email"><p className="text-sm font-semibold text-foreground">{originalRequest.guest_email || '—'}</p></Field>
                  <Field label="Submitted"><p className="text-sm font-semibold text-foreground">{formatDate(originalRequest.created_at)}</p></Field>
                  <Field label="Status"><p className="text-sm font-semibold capitalize text-foreground">{originalRequest.status}</p></Field>
                </div>
              </Panel>
            )}

            {po.sam_rejection_reason && (
              <div className="rounded-xl border border-destructive/25 bg-destructive/[0.05] p-4">
                <p className="mb-1.5 text-xs font-semibold text-destructive">Sam&apos;s Rejection Reason</p>
                <p className="text-sm leading-relaxed text-destructive/90">{po.sam_rejection_reason}</p>
              </div>
            )}

            <Panel title={`Comments (${comments.length})`} icon={<MessageSquare size={16} />}>
              <div className="space-y-4">
                <form onSubmit={handleAddComment} className="flex gap-2">
                  <Input placeholder="Write a comment…" value={newComment} onChange={(e) => setNewComment(e.target.value)} className="text-sm" />
                  <Button type="submit" size="sm" disabled={isPostingComment || !newComment.trim()} className="shrink-0 gap-1.5">
                    <Send size={14} />
                    {isPostingComment ? 'Sending…' : 'Send'}
                  </Button>
                </form>
                {comments.length > 0 ? (
                  <div className="space-y-2">
                    {comments.map((comment) => (
                      <div key={comment.id} className="rounded-lg border border-border bg-muted/20 p-3">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                            {comment.author?.name?.slice(0, 2).toUpperCase() || '??'}
                          </span>
                          <span className="text-xs font-semibold text-foreground">{comment.author?.name || 'Unknown'}</span>
                          <span className="text-[10px] text-muted-foreground">{formatDate(comment.created_at)}</span>
                        </div>
                        <p className="text-sm leading-relaxed text-foreground">{comment.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No comments yet.</p>
                )}
              </div>
            </Panel>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Panel title="PO Documents" icon={<FileText size={16} />}>
              <DocumentList docs={poAttachments} emptyLabel="No PO documents attached yet." />
            </Panel>

            {po.request_id && (
              <Panel title="Actions">
                <Link href={`/mintah/requests/${po.request_id}`} className="block">
                  <Button variant="outline" className="w-full gap-1.5" size="sm">
                    <ArrowLeft size={14} /> View Original Request
                  </Button>
                </Link>
              </Panel>
            )}

            <Panel title="Audit Trail" icon={<Clock size={16} />}>
              <AuditTrail entries={auditTrail} />
            </Panel>
          </div>
        </div>
      </PageContainer>
    </>
  )
}
