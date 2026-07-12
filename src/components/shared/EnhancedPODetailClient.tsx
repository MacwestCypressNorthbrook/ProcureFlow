'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import POProgress from '@/components/shared/POProgress'
import StatusBadge from '@/components/shared/StatusBadge'
import { PO_STATUS_CONFIG, formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, CheckCircle, XCircle, FileText, Download, Eye, ExternalLink, MessageSquare, History, Calendar, User, Clock, Send } from 'lucide-react'
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

interface EnhancedPODetailProps {
  po: PurchaseOrder
  originalRequest?: Record<string, unknown> | null
  auditTrail: PoAuditTrail[]
  comments: Comment[]
  poAttachments?: PoAttachment[]
  user?: { name?: string; email: string } | null
  role?: string | null
}

const TIMELINE_STEPS = [
  { key: 'pending_sam', label: 'Submitted to Sam', icon: 'send' },
  { key: 'revision_required', label: 'Revision Requested', icon: 'x' },
  { key: 'pending_payment', label: 'Approved by Sam', icon: 'check' },
  { key: 'completed', label: 'Payment Completed', icon: 'paid' },
]

export default function EnhancedPODetailClient({ po, originalRequest, auditTrail, comments: initialComments, poAttachments = [], user, role }: EnhancedPODetailProps) {
  const router = useRouter()
  const [rejectionReason, setRejectionReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false)
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [previewDoc, setPreviewDoc] = useState<{ fileName: string; fileUrl: string } | null>(null)

  const handleApprove = async () => {
    setIsSubmitting(true)
    const res = await fetch(`/api/po/${po.id}/approve`, { method: 'POST' })
    if (res.ok) {
      router.refresh()
    }
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
    if (res.ok) {
      router.refresh()
    }
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

  const getStepIcon = (icon: string) => {
    switch (icon) {
      case 'send': return <Send size="14" />
      case 'x': return <XCircle size="14" />
      case 'check': return <CheckCircle size="14" />
      case 'paid': return <CheckCircle size="14" />
      default: return <Clock size="14" />
    }
  }

  const auditActionLabel: Record<string, string> = {
    created: 'PO Created',
    approved_by_sam: 'Approved by Sam',
    rejected_by_sam: 'Revision Requested by Sam',
    payment_completed: 'Payment Completed',
    comment_added: 'Comment Added',
  }

  return (
    <DashboardLayout
      title="PO Review"
      subtitle="Inspect the Purchase Order and make your decision"
      user={user}
      role={role}
    >
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <Link
          href={role === 'sam' ? '/sam' : '/finance'}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-2 transition-colors"
        >
          <ArrowLeft size="14" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 animate-slide-up">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              PO #{po.id.slice(0, 8)}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Created on {formatDate(po.created_at)}
            </p>
          </div>
          <StatusBadge status={po.status} config={PO_STATUS_CONFIG} />
        </div>

        {/* Progress */}
        <div className="animate-slide-up" style={{ animationDelay: '0.05s' }}>
          <POProgress status={po.status} />
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Main Content - 3 cols */}
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
                      PO Details
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
            </div>

            {/* Original Request */}
            {originalRequest && (
              <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
                <Card className="border-border/60">
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <FileText size="16" className="text-muted-foreground" />
                      Original Request Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1 block">Purpose</Label>
                      <p className="text-sm font-semibold text-foreground">{String(originalRequest.purpose ?? '')}</p>
                    </div>
                    {(typeof originalRequest.estimated_quantity === 'number' || typeof originalRequest.estimated_unit_rate === 'number') && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground mb-1 block">Est. Quantity</Label>
                          <p className="text-xs font-bold text-foreground">{String(originalRequest.estimated_quantity ?? '—')}</p>
                        </div>
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground mb-1 block">Est. Unit Rate</Label>
                          <p className="text-xs font-bold text-foreground">{formatCurrency(Number(originalRequest.estimated_unit_rate ?? 0))}</p>
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Requested on {formatDate(String(originalRequest.created_at ?? ''))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Comments Section */}
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

          {/* Sidebar - 2 cols */}
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

            {/* Status Timeline */}
            <Card className="border-border/60 animate-slide-in-right" style={{ animationDelay: '0.15s' }}>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <History size="16" className="text-muted-foreground" />
                  Status Timeline
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
                          <div className={`h-5 w-5 rounded-full flex items-center justify-center ring-2 ring-background ${
                            entry.action === 'approved_by_sam' || entry.action === 'payment_completed'
                              ? 'bg-emerald-500 text-white'
                              : entry.action === 'rejected_by_sam'
                              ? 'bg-red-500 text-white'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {getStepIcon(
                              entry.action === 'approved_by_sam' ? 'check' :
                              entry.action === 'rejected_by_sam' ? 'x' :
                              entry.action === 'payment_completed' ? 'paid' : 'send'
                            )}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="text-xs font-semibold text-foreground">{auditActionLabel[entry.action] || entry.action}</p>
                          {entry.notes && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">{entry.notes}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(entry.created_at)}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center">
                        <Clock size="10" />
                      </div>
                      <p className="text-xs text-muted-foreground">PO Created</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Rejection Reason */}
            {po.sam_rejection_reason && (
              <Card className="border-destructive/20 bg-destructive/5 animate-slide-in-right" style={{ animationDelay: '0.2s' }}>
                <CardContent className="p-4">
                  <Label className="text-xs font-bold text-destructive mb-1.5 block flex items-center gap-1.5">
                    <XCircle size="14" />
                    Rejection Reason
                  </Label>
                  <p className="text-xs font-medium leading-relaxed text-destructive">{po.sam_rejection_reason}</p>
                </CardContent>
              </Card>
            )}

            {/* Approval Info (for finance) */}
            {po.sam_approved_at && role === 'finance' && (
              <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 animate-slide-in-right" style={{ animationDelay: '0.2s' }}>
                <CardContent className="p-4">
                  <Label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1.5">
                    <CheckCircle size="12" className="text-emerald-600" />
                    Sam&apos;s Approval
                  </Label>
                  <p className="text-sm text-emerald-600 font-bold">
                    Approved on {formatDate(po.sam_approved_at)}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Actions for SAM */}
        {(po.status === 'pending_sam' || po.status === 'revision_required') && role === 'sam' && (
          <div className="flex flex-wrap gap-3 animate-slide-up" style={{ animationDelay: '0.25s' }}>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs font-semibold mb-2 block">
                Rejection Reason {po.status === 'revision_required' ? '(will return to Mintah)' : '(if rejecting)'}
              </Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Missing signature, needs stamp on page 2..."
                rows={2}
                className="resize-none text-xs"
              />
            </div>
            <div className="flex items-end gap-3">
              <Button
                onClick={handleApprove}
                disabled={isSubmitting}
                size="lg"
                className="gap-1.5 shadow-sm"
              >
                <CheckCircle size="16" />
                Approve & Send to Finance
              </Button>
              <Button
                onClick={handleReject}
                disabled={isSubmitting || !rejectionReason.trim()}
                variant="destructive"
                size="lg"
                className="gap-1.5"
              >
                <XCircle size="16" />
                Reject & Return
              </Button>
            </div>
          </div>
        )}
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
