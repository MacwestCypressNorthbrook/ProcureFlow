'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import POProgress from '@/components/shared/POProgress'
import StatusBadge from '@/components/shared/StatusBadge'
import DocumentList from '@/components/shared/DocumentList'
import { PageContainer, PageHeader, Panel, Field } from '@/components/shared/ui-kit'
import { PO_STATUS_CONFIG, formatCurrency, formatDate, formatQuantity } from '@/lib/utils'
import { CreditCard, FileText, CheckCircle, XCircle, MessageSquare, History, Clock, CheckSquare } from 'lucide-react'
import RichRequisitionView, { isRichRequisition } from '@/components/shared/RichRequisitionView'
import type { PurchaseOrder, PoAttachment } from '@/lib/types'
import type { PoAuditEntry } from '@/lib/audit'
import AuditTrail from '@/components/shared/AuditTrail'

interface Comment {
  id: string
  content: string
  created_at: string
  author: { id: string; name: string | null; email: string }
}

interface EnhancedFinanceDetailProps {
  po: PurchaseOrder
  originalRequest?: Record<string, unknown> | null
  samUser?: { name: string | null; email: string } | null
  auditTrail: PoAuditEntry[]
  comments: Comment[]
  poAttachments?: PoAttachment[]
  user?: { name?: string; email: string } | null
  role?: string | null
}

export default function EnhancedFinanceDetailClient({
  po,
  samUser,
  auditTrail,
  comments: initialComments,
  poAttachments = [],
  user,
  role,
}: EnhancedFinanceDetailProps) {
  const router = useRouter()
  const [isPaying, setIsPaying] = useState(false)
  const [paymentNotes, setPaymentNotes] = useState('')
  const [showConfirmPay, setShowConfirmPay] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false)
  const [comments, setComments] = useState<Comment[]>(initialComments)

  const handleMarkAsPaid = async () => {
    setIsPaying(true)
    const res = await fetch(`/api/po/${po.id}/pay`, { method: 'POST' })
    if (res.ok) router.refresh()
    setIsPaying(false)
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

  return (
    <>
      <PageContainer className="space-y-6">
        <PageHeader
          backHref="/finance"
          backLabel="Back to Finance Dashboard"
          title={`PO #${po.id.slice(0, 8)} Payment`}
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
              <Panel title="Purchase Order Details" icon={<FileText size={16} />}>
                <div className="space-y-4">
                  <Field label="Purpose"><p className="text-base font-semibold text-foreground">{po.purpose}</p></Field>
                  {po.description && (
                    <Field label="Description"><p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{po.description}</p></Field>
                  )}
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="Quantity"><p className="text-sm font-semibold tabular-nums text-foreground">{formatQuantity(po.quantity)}</p></Field>
                    <Field label="Unit Rate"><p className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(po.unit_rate)}</p></Field>
                    <Field label="Total"><p className="text-sm font-semibold tabular-nums text-primary">{formatCurrency(po.total_amount)}</p></Field>
                  </div>
                </div>
              </Panel>
            )}

            <Panel title="Approval" icon={<CheckCircle size={16} className="text-emerald-500" />}>
              {po.sam_approved_at ? (
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle size={18} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Approved by Sam</p>
                    <p className="text-xs text-muted-foreground">
                      {samUser ? `${samUser.name || samUser.email} · ` : ''}{formatDate(po.sam_approved_at)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not yet approved.</p>
              )}
            </Panel>

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
            <Panel title="PO Documents" icon={<FileText size={16} />}>
              <DocumentList docs={poAttachments} emptyLabel="No PO documents attached yet." />
            </Panel>

            <Panel title="Payment Timeline" icon={<History size={16} />}>
              <AuditTrail entries={auditTrail} />
            </Panel>

            {po.status === 'completed' && po.paid_at && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-5 text-center">
                <CheckCircle size={30} className="mx-auto mb-2 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Payment Completed</p>
                <p className="mt-0.5 text-xs text-emerald-600/80 dark:text-emerald-500/80">Paid on {formatDate(po.paid_at)}</p>
              </div>
            )}

            {po.status === 'pending_finance' && (
              <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-5">
                {!showConfirmPay ? (
                  <div className="text-center">
                    <CreditCard size={30} className="mx-auto mb-2 text-primary" />
                    <p className="mb-1 text-sm font-semibold text-foreground">Ready for Payment</p>
                    <p className="mb-4 text-xs text-muted-foreground">Verify details and disburse {formatCurrency(po.total_amount)}.</p>
                    <Button onClick={() => setShowConfirmPay(true)} className="w-full gap-2">
                      <CreditCard size={16} /> Proceed to Pay
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm font-semibold text-foreground">Confirm Payment</p>
                    <p className="text-xs text-muted-foreground">
                      Amount to disburse: <span className="font-semibold text-foreground">{formatCurrency(po.total_amount)}</span>
                    </p>
                    <Textarea value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} placeholder="Optional payment reference…" rows={2} className="resize-none text-sm" />
                    <div className="flex gap-2">
                      <Button onClick={handleMarkAsPaid} disabled={isPaying} className="flex-1">
                        {isPaying ? 'Processing…' : 'Confirm Payment'}
                      </Button>
                      <Button variant="outline" onClick={() => setShowConfirmPay(false)} disabled={isPaying}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </PageContainer>
    </>
  )
}
