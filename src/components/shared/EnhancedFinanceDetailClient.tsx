'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import POProgress from '@/components/shared/POProgress'
import StatusBadge from '@/components/shared/StatusBadge'
import { PO_STATUS_CONFIG, formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, CreditCard, FileText, CheckCircle, XCircle, Eye, ExternalLink, MessageSquare, History, Clock, Download, CheckSquare } from 'lucide-react'
import Link from 'next/link'
import RichRequisitionView from '@/components/shared/RichRequisitionView'
import DocumentPreviewModal from '@/components/shared/DocumentPreviewModal'
import type { PurchaseOrder, PoAuditTrail, PoAttachment } from '@/lib/types'

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
  auditTrail: PoAuditTrail[]
  comments: Comment[]
  poAttachments?: PoAttachment[]
  user?: { name?: string; email: string } | null
  role?: string | null
}

export default function EnhancedFinanceDetailClient({
  po,
  originalRequest,
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
  const [previewDoc, setPreviewDoc] = useState<{ fileName: string; fileUrl: string } | null>(null)

  const handleMarkAsPaid = async () => {
    setIsPaying(true)
    const res = await fetch(`/api/po/${po.id}/pay`, { method: 'POST' })
    if (res.ok) {
      router.refresh()
    }
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

  const auditActionLabel: Record<string, string> = {
    created: 'PO Created',
    approved_by_sam: 'Approved by Sam',
    rejected_by_sam: 'Revision Requested',
    payment_completed: 'Payment Completed',
    comment_added: 'Comment Added',
  }

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'approved_by_sam': return <CheckCircle size="14" />;
      case 'rejected_by_sam': return <XCircle size="14" />;
      case 'payment_completed': return <CheckSquare size="14" />;
      default: return <Clock size="14" />;
    }
  }

  const getActionColor = (action: string): string => {
    switch (action) {
      case 'approved_by_sam': return 'bg-emerald-500 text-white';
      case 'payment_completed': return 'bg-blue-500 text-white';
      case 'rejected_by_sam': return 'bg-red-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  }

  return (
    <DashboardLayout
      title="Payment Review"
      subtitle="Verify and process payment for this purchase order"
      user={user}
      role={role}
    >
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <Link
          href="/finance"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-2 transition-colors"
        >
          <ArrowLeft size="14" />
          Back to Finance Dashboard
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 animate-slide-up">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              PO #{po.id.slice(0, 8)} Payment
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Created {formatDate(po.created_at)}
            </p>
          </div>
          <StatusBadge status={po.status} config={PO_STATUS_CONFIG} />
        </div>

        {/* Progress */}
        <div className="animate-slide-up" style={{ animationDelay: '0.05s' }}>
          <POProgress status={po.status} />
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* PO Details */}
            <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
              {po.description && po.description.trim().startsWith('{') ? (
                <RichRequisitionView
                  description={po.description}
                  fallbackPurpose={po.purpose}
                  fallbackDate={po.created_at}
                />
              ) : (
                <Card className="border-border/60">
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <FileText size="16" className="text-muted-foreground" />
                      Purchase Order Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1 block">Purpose</Label>
                      <p className="text-base font-bold text-foreground">{po.purpose}</p>
                    </div>

                    {po.description && (
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground mb-1 block">Description</Label>
                        <p className="text-xs whitespace-pre-wrap leading-relaxed text-foreground">{po.description}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground mb-1 block">Quantity</Label>
                        <p className="text-xs font-bold text-foreground">{po.quantity ?? '—'}</p>
                      </div>
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground mb-1 block">Unit Rate</Label>
                        <p className="text-xs font-bold text-foreground">{formatCurrency(po.unit_rate)}</p>
                      </div>
                    </div>

                    <div className="rounded-xl bg-primary/5 border border-primary/10 p-4">
                      <Label className="text-xs font-medium text-muted-foreground mb-1 block">Total Amount</Label>
                      <p className="text-xl font-bold text-primary">{formatCurrency(po.total_amount)}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Approval Details */}
              <Card className="border-border/60 mt-4">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CheckCircle size="16" className="text-emerald-500" />
                    Approval Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {po.sam_approved_at ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                        <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                          <CheckCircle size="20" className="text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Approved by Sam</p>
                          {samUser && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400">
                              {samUser.name || samUser.email}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">{formatDate(po.sam_approved_at)}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not yet approved.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Comments */}
            <div className="animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <MessageSquare size="16" className="text-muted-foreground" />
                    Comments ({comments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Add a comment..."
                      rows={2}
                      className="resize-none text-xs"
                    />
                    <Button
                      size="sm"
                      onClick={handleAddComment}
                      disabled={isCommentSubmitting || !commentText.trim()}
                      className="shrink-0 self-end"
                    >
                      {isCommentSubmitting ? 'Sending...' : 'Send'}
                    </Button>
                  </div>
                  {comments.length > 0 ? (
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {comments.map((c) => (
                        <div key={c.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/30">
                          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                            {(c.author.name || c.author.email).slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-semibold text-foreground">{c.author.name || c.author.email}</span>
                              <span className="text-[10px] text-muted-foreground">{formatDate(c.created_at)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{c.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">No comments yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-2 space-y-6">
            {/* Documents */}
            <Card className="border-border/60 animate-slide-in-right" style={{ animationDelay: '0.1s' }}>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText size="16" className="text-muted-foreground" />
                  PO Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                {poAttachments.length > 0 ? (
                  <div className="space-y-3">
                    {poAttachments.map((att) => (
                      <div
                        key={att.id}
                        className="rounded-xl border border-border bg-muted/20 p-4 space-y-2"
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <FileText size="18" className="text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-foreground truncate">{att.file_name}</p>
                            <p className="text-[10px] text-muted-foreground truncate" title={att.file_url}>{att.file_url}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(att.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 h-7 text-[11px]"
                            onClick={() => setPreviewDoc({ fileName: att.file_name, fileUrl: att.file_url })}
                          >
                            <Eye size="12" />
                            Preview
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 h-7 text-[11px]"
                            onClick={() => window.open(att.file_url, '_blank', 'noopener,noreferrer')}
                          >
                            <ExternalLink size="12" />
                            Open
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : po.file_name ? (
                  <div className="rounded-xl border border-border bg-muted/20 p-5 text-center">
                    <FileText size="40" className="mx-auto mb-3 text-muted-foreground" />
                    <p className="text-xs font-semibold mb-3 truncate text-foreground">{po.file_name}</p>
                    <Button variant="outline" size="sm" className="gap-1.5 h-8">
                      <Download size="13" />
                      Download
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-muted/10 p-5 text-center text-xs text-muted-foreground font-semibold">
                    No PO documents attached yet.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payment Timeline */}
            <Card className="border-border/60 animate-slide-in-right" style={{ animationDelay: '0.15s' }}>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <History size="16" className="text-muted-foreground" />
                  Payment Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {auditTrail.length > 0 ? (
                    auditTrail.map((entry, i) => (
                      <div key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                        {i < auditTrail.length - 1 && (
                          <div className="absolute left-[11px] top-5 bottom-0 w-px bg-border" />
                        )}
                        <div className="mt-0.5">
                          <div className={`h-5 w-5 rounded-full flex items-center justify-center ring-2 ring-background ${getActionColor(entry.action)}`}>
                            {getActionIcon(entry.action)}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="text-xs font-semibold text-foreground">{auditActionLabel[entry.action] || entry.action}</p>
                          {entry.notes && <p className="text-[10px] text-muted-foreground mt-0.5">{entry.notes}</p>}
                          <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(entry.created_at)}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center">
                        <Clock size="10" />
                      </div>
                      <p className="text-xs text-muted-foreground">No activity yet</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Payment Completed Details */}
            {po.status === 'completed' && po.paid_at && (
              <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 animate-slide-in-right" style={{ animationDelay: '0.2s' }}>
                <CardContent className="p-6 text-center">
                  <CheckCircle size="36" className="mx-auto mb-2 text-emerald-600" />
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Payment Completed</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">
                    Paid on {formatDate(po.paid_at)}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Mark as Paid - Confirmation flow */}
            {po.status === 'pending_payment' && (
              <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 animate-slide-in-right" style={{ animationDelay: '0.2s' }}>
                <CardContent className="p-6">
                  {!showConfirmPay ? (
                    <div className="text-center">
                      <CreditCard size="36" className="mx-auto mb-2 text-blue-600" />
                      <p className="text-sm font-bold text-blue-700 dark:text-blue-300 mb-1">
                        Ready for Payment
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mb-4">
                        Verify details and disburse amount.
                      </p>
                      <Button
                        onClick={() => setShowConfirmPay(true)}
                        size="lg"
                        className="gap-2 w-full"
                      >
                        <CreditCard size="16" />
                        Proceed to Pay
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
                        Confirm Payment
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        Amount to disburse: <span className="font-bold">{formatCurrency(po.total_amount)}</span>
                      </p>
                      <Textarea
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        placeholder="Optional payment notes or reference number"
                        rows={2}
                        className="resize-none text-xs"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={handleMarkAsPaid}
                          disabled={isPaying}
                          className="gap-1.5 flex-1"
                        >
                          {isPaying ? 'Processing...' : 'Confirm Payment'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowConfirmPay(false)}
                          disabled={isPaying}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {previewDoc && (
        <DocumentPreviewModal
          isOpen={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          fileName={previewDoc.fileName}
          fileUrl={previewDoc.fileUrl}
        />
      )}
    </DashboardLayout>
  )
}
