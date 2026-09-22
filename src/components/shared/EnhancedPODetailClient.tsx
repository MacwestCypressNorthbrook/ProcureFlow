'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import POProgress from '@/components/shared/POProgress'
import StatusBadge from '@/components/shared/StatusBadge'
import DocumentList from '@/components/shared/DocumentList'
import { PageContainer, PageHeader, Panel, Field } from '@/components/shared/ui-kit'
import { PO_STATUS_CONFIG, formatCurrency, formatDate } from '@/lib/utils'
import { CheckCircle, XCircle, FileText, MessageSquare, History, Clock, Send } from 'lucide-react'
import RichRequisitionView, { isRichRequisition } from '@/components/shared/RichRequisitionView'
import type { PurchaseOrder, PoAttachment } from '@/lib/types'
import type { PoAuditEntry } from '@/lib/audit'
import AuditTrail from '@/components/shared/AuditTrail'
import { can, dashboardPathForRole, normalizeRole } from '@/lib/roles'

interface Comment {
  id: string
  content: string
  created_at: string
  author: { id: string; name: string | null; email: string }
}

interface EnhancedPODetailProps {
  po: PurchaseOrder
  originalRequest?: Record<string, unknown> | null
  auditTrail: PoAuditEntry[]
  comments: Comment[]
  poAttachments?: PoAttachment[]
  user?: { name?: string; email: string } | null
  role?: string | null
}

export default function EnhancedPODetailClient({ po, originalRequest, auditTrail, comments: initialComments, poAttachments = [], user, role }: EnhancedPODetailProps) {
  const router = useRouter()
  const [rejectionReason, setRejectionReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false)
  const [comments, setComments] = useState<Comment[]>(initialComments)

  const handleApprove = async () => {
    setIsSubmitting(true)
    const res = await fetch(`/api/po/${po.id}/approve`, { method: 'POST' })
    if (res.ok) router.refresh()
    setIsSubmitting(false)
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) return
    setIsSubmitting(true)
    const res = await fetch(`/api/po/${po.id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: rejectionReason }),
    })
    if (res.ok) router.refresh()
    setIsSubmitting(false)
  }

  const handleAddComment = async () => {
    if (!commentText.trim()) return
    setIsCommentSubmitting(true)
    const res = await fetch(`/api/po/${po.id}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: commentText }),
    })
    if (res.ok) {
      const { data } = await res.json()
      setComments((prev) => [...prev, data])
      setCommentText('')
    }
    setIsCommentSubmitting(false)
  }

  // The stored role is `project_lead` / `cost_control`; comparing against the
  // legacy literal 'sam' meant the approve and reject actions never rendered
  // for the people who are supposed to use them.
  const canAct =
    po.status === 'pending_cost_control' && can(role, 'po:approve')

  return (
    <DashboardLayout title="PO Review" subtitle="Inspect the Purchase Order and make your decision" user={user} role={role}>
      <PageContainer className="space-y-6">
        <PageHeader
          backHref={dashboardPathForRole(role)}
          backLabel="Back to Dashboard"
          title={`PO #${po.id.slice(0, 8)}`}
          subtitle={`Created ${formatDate(po.created_at)}`}
          actions={<StatusBadge status={po.status} config={PO_STATUS_CONFIG} />}
        />

        <POProgress status={po.status} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Main */}
          <div className="min-w-0 space-y-6">
            {isRichRequisition(po.description) ? (
              <RichRequisitionView description={po.description} fallbackPurpose={po.purpose} fallbackDate={po.created_at} />
            ) : (
              <Panel title="PO Details" icon={<FileText size={16} />}>
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
                <div className="space-y-3">
                  <Field label="Purpose"><p className="text-sm font-semibold text-foreground">{String(originalRequest.purpose ?? '')}</p></Field>
                  {(typeof originalRequest.estimated_quantity === 'number' || typeof originalRequest.estimated_unit_rate === 'number') && (
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Est. Quantity"><p className="text-sm font-semibold tabular-nums text-foreground">{String(originalRequest.estimated_quantity ?? '—')}</p></Field>
                      <Field label="Est. Unit Rate"><p className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(Number(originalRequest.estimated_unit_rate ?? 0))}</p></Field>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Requested {formatDate(String(originalRequest.created_at ?? ''))}</p>
                </div>
              </Panel>
            )}

            <Panel title={`Comments (${comments.length})`} icon={<MessageSquare size={16} />}>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a comment…" rows={2} className="resize-none text-sm" />
                  <Button size="sm" onClick={handleAddComment} disabled={isCommentSubmitting || !commentText.trim()} className="shrink-0 self-end">
                    {isCommentSubmitting ? 'Sending…' : 'Send'}
                  </Button>
                </div>
                {comments.length > 0 ? (
                  <div className="max-h-72 space-y-2 overflow-y-auto">
                    {comments.map((c) => {
                      const authorName = c.author?.name || c.author?.email || 'Unknown'
                      return (
                      <div key={c.id} className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {authorName.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">{authorName}</span>
                            <span className="text-[10px] text-muted-foreground">{formatDate(c.created_at)}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{c.content}</p>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="py-3 text-center text-xs text-muted-foreground">No comments yet.</p>
                )}
              </div>
            </Panel>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Decision panel */}
            {canAct && (
              <Panel title="Decision" icon={<CheckCircle size={16} />}>
                <div className="space-y-3">
                  <Button onClick={handleApprove} disabled={isSubmitting} className="w-full gap-1.5">
                    <CheckCircle size={16} /> Approve &amp; Send to Finance
                  </Button>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                      Reason {po.status === 'sent_back' ? '(returns to Supply Chain)' : '(if rejecting)'}
                    </p>
                    <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="e.g. Missing signature on page 2…" rows={3} className="resize-none text-sm" />
                  </div>
                  <Button onClick={handleReject} disabled={isSubmitting || !rejectionReason.trim()} variant="destructive" className="w-full gap-1.5">
                    <XCircle size={16} /> Reject &amp; Return
                  </Button>
                </div>
              </Panel>
            )}

            <Panel title="PO Documents" icon={<FileText size={16} />}>
              <DocumentList docs={poAttachments} emptyLabel="No PO documents attached yet." />
            </Panel>

            {po.sam_rejection_reason && (
              <div className="rounded-xl border border-destructive/25 bg-destructive/[0.05] p-4">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-destructive">
                  <XCircle size={14} /> Rejection Reason
                </p>
                <p className="text-sm leading-relaxed text-destructive/90">{po.sam_rejection_reason}</p>
              </div>
            )}

            {po.sam_approved_at && normalizeRole(role) === 'finance' && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle size={13} /> Approved by Sam · {formatDate(po.sam_approved_at)}
                </p>
              </div>
            )}

            <Panel title="Status Timeline" icon={<History size={16} />}>
              <AuditTrail entries={auditTrail} />
            </Panel>
          </div>
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}
