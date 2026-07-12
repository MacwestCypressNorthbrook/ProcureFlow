'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import POProgress from '@/components/shared/POProgress'
import StatusBadge from '@/components/shared/StatusBadge'
import { PO_STATUS_CONFIG, formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, FileText, Download, Eye, ExternalLink, Send, MessageSquare, Clock } from 'lucide-react'
import Link from 'next/link'
import DocumentPreviewModal from '@/components/shared/DocumentPreviewModal'

interface Comment {
  id: string
  po_id: string
  author_id: string | null
  content: string
  created_at: string
  author?: { id: string; name: string; email: string } | null
}

interface AuditEntry {
  id: string
  po_id: string
  action: string
  performed_by: string | null
  notes: string | null
  created_at: string
}

interface MintahPODetailProps {
  po: any
  originalRequest: any | null
  comments: Comment[]
  auditTrail: AuditEntry[]
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
  const router = useRouter()
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [newComment, setNewComment] = useState('')
  const [isPostingComment, setIsPostingComment] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<{ fileName: string; fileUrl: string } | null>(null)

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

  return (
    <DashboardLayout
      title="PO Details"
      subtitle={`Purchase Order #${po.id.slice(0, 8)}`}
      user={user}
      role={role}
    >
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/mintah/pos"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft size="14" />
          Back to My POs
        </Link>

        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-4 animate-slide-up">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {po.purpose}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              PO #{po.id.slice(0, 8)} · Created {formatDate(po.created_at)}
            </p>
          </div>
          <StatusBadge status={po.status} config={PO_STATUS_CONFIG} />
        </div>

        {/* Progress */}
        <div className="mb-6 animate-slide-up" style={{ animationDelay: '0.05s' }}>
          <POProgress status={po.status} />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* PO Details */}
            <Card className="border-border/60 animate-slide-up" style={{ animationDelay: '0.1s' }}>
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
                    <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">{po.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">Quantity</Label>
                    <p className="text-sm font-bold text-foreground">{po.quantity ?? '—'}</p>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">Unit Rate</Label>
                    <p className="text-sm font-bold text-foreground">{formatCurrency(po.unit_rate)}</p>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">Total</Label>
                    <p className="text-sm font-bold text-primary">{formatCurrency(po.total_amount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Original Request */}
            {originalRequest && (
              <Card className="border-border/60 animate-slide-up" style={{ animationDelay: '0.15s' }}>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FileText size="16" className="text-muted-foreground" />
                    Original Request
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1 block">Requester</Label>
                      <p className="font-semibold text-foreground">{originalRequest.guest_name || '—'}</p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1 block">Email</Label>
                      <p className="font-semibold text-foreground">{originalRequest.guest_email || '—'}</p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1 block">Submitted</Label>
                      <p className="font-semibold text-foreground">{formatDate(originalRequest.created_at)}</p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1 block">Status</Label>
                      <p className="font-semibold text-foreground capitalize">{originalRequest.status}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Rejection Reason */}
            {po.sam_rejection_reason && (
              <Card className="border-destructive/20 bg-destructive/5 animate-slide-up" style={{ animationDelay: '0.18s' }}>
                <CardContent className="p-4">
                  <Label className="text-xs font-bold text-destructive mb-1.5 block">
                    Sam&apos;s Rejection Reason
                  </Label>
                  <p className="text-sm font-medium leading-relaxed text-destructive">{po.sam_rejection_reason}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Documents */}
            <Card className="border-border/60 animate-slide-up" style={{ animationDelay: '0.12s' }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText size="16" className="text-muted-foreground" />
                  PO Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                {poAttachments.length > 0 ? (
                  <div className="space-y-3">
                    {poAttachments.map((att: any) => (
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
                    {po.file_path && (
                      <a href={po.file_path} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="gap-1.5 h-8">
                          <Download size="13" />
                          Download
                        </Button>
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-muted/10 p-5 text-center text-xs text-muted-foreground font-semibold">
                    No PO documents attached yet.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <Card className="border-border/60 animate-slide-up" style={{ animationDelay: '0.18s' }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {po.status === 'revision_required' && (
                  <Link href={`/mintah/po/${po.id}/edit`} className="block">
                    <Button className="w-full gap-1.5" size="sm">
                      <FileText size="14" />
                      Edit PO
                    </Button>
                  </Link>
                )}
                {po.request_id && (
                  <Link href={`/mintah/requests/${po.request_id}`} className="block">
                    <Button variant="outline" className="w-full gap-1.5" size="sm">
                      <ArrowLeft size="14" />
                      View Original Request
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>

            {/* Audit Trail */}
            <Card className="border-border/60 animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock size="14" className="text-muted-foreground" />
                  Audit Trail
                </CardTitle>
              </CardHeader>
              <CardContent>
                {auditTrail.length > 0 ? (
                  <div className="space-y-3">
                    {auditTrail.map((entry) => (
                      <div key={entry.id} className="text-xs">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-foreground capitalize">{entry.action.replace(/_/g, ' ')}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">{formatDate(entry.created_at)}</span>
                        </div>
                        {entry.notes && (
                          <p className="text-muted-foreground leading-relaxed pl-0">{entry.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground font-medium">No audit trail entries.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Comments Section */}
        <div className="mt-8 animate-slide-up" style={{ animationDelay: '0.25s' }}>
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare size="16" className="text-muted-foreground" />
                Comments
                {comments.length > 0 && (
                  <span className="text-xs text-muted-foreground font-normal">({comments.length})</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {comments.length > 0 ? (
                <div className="space-y-3">
                  {comments.map((comment) => (
                    <div key={comment.id} className="rounded-xl border border-border bg-muted/10 p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                          {comment.author?.name?.slice(0, 2).toUpperCase() || '??'}
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {comment.author?.name || 'Unknown'}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDate(comment.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{comment.content}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground font-medium">No comments yet.</p>
              )}

              {/* Add Comment */}
              <form onSubmit={handleAddComment} className="border-t border-border/40 pt-4">
                <Label className="text-xs font-semibold mb-2 block">Add a Comment</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Write a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="text-xs"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isPostingComment || !newComment.trim()}
                    className="gap-1.5 shrink-0"
                  >
                    <Send size="14" />
                    {isPostingComment ? 'Sending...' : 'Send'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
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
