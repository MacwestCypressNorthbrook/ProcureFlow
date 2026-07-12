'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import StatusBadge from '@/components/shared/StatusBadge'
import { REQUEST_STATUS_CONFIG, formatDate } from '@/lib/utils'
import { ArrowLeft, FileText, Eye, Paperclip, Upload, X, Send, Link2 } from 'lucide-react'
import Link from 'next/link'
import RichRequisitionView from '@/components/shared/RichRequisitionView'

interface Attachment {
  id: string
  file_name: string
  file_url: string
  uploaded_by: string | null
  created_at: string
}

interface MintahRequestDetailProps {
  request: any
  attachments: Attachment[]
  user?: { name?: string; email: string } | null
  role?: string | null
}

export default function MintahRequestDetailClient({
  request,
  attachments: initialAttachments,
  user,
  role,
}: MintahRequestDetailProps) {
  const router = useRouter()
  const [isMarkingReviewing, setIsMarkingReviewing] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments)
  const [attaching, setAttaching] = useState(false)
  const [attFileName, setAttFileName] = useState('')
  const [attFileUrl, setAttFileUrl] = useState('')

  const [poNumber, setPoNumber] = useState('')
  const [poFileName, setPoFileName] = useState('')
  const [poFileUrl, setPoFileUrl] = useState('')
  const [submittingPo, setSubmittingPo] = useState(false)

  const handleMarkAsReviewing = async () => {
    setIsMarkingReviewing(true)
    const res = await fetch(`/api/requests/${request.id}/review`, { method: 'POST' })
    if (res.ok) {
      router.refresh()
    }
    setIsMarkingReviewing(false)
  }

  const handleAddAttachment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!attFileName.trim() || !attFileUrl.trim()) return
    setAttaching(true)

    const res = await fetch(`/api/requests/${request.id}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_name: attFileName.trim(), file_url: attFileUrl.trim() }),
    })

    if (res.ok) {
      const data = await res.json()
      setAttachments((prev) => [data.data, ...prev])
      setAttFileName('')
      setAttFileUrl('')
    }
    setAttaching(false)
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const handleAttachPO = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!poNumber.trim() || !poFileName.trim() || !poFileUrl.trim()) return
    setSubmittingPo(true)

    const res = await fetch(`/api/requests/${request.id}/attach-po`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        po_number: poNumber.trim(),
        file_name: poFileName.trim(),
        file_url: poFileUrl.trim(),
      }),
    })

    if (res.ok) {
      router.push('/mintah/pos')
    }
    setSubmittingPo(false)
  }

  return (
    <DashboardLayout
      title="Request Details"
      subtitle="Review this request in detail"
      user={user}
      role={role}
    >
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/mintah/requests"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft size="14" />
          Back to Requests
        </Link>

        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-4 animate-slide-up">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {request.purpose}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Submitted {formatDate(request.created_at)}
              {request.guest_name && ` by ${request.guest_name}`}
            </p>
          </div>
          <StatusBadge status={request.status} config={REQUEST_STATUS_CONFIG} />
        </div>

        {/* Requestor Info */}
        <Card className="mb-6 border-border/60 animate-slide-up" style={{ animationDelay: '0.05s' }}>
          <CardContent className="p-4">
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">Requester</Label>
                <p className="font-semibold text-foreground">{request.guest_name || '—'}</p>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">Email</Label>
                <p className="font-semibold text-foreground">{request.guest_email || '—'}</p>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">Est. Total</Label>
                <p className="font-semibold text-foreground">
                  {request.estimated_quantity && request.estimated_unit_rate
                    ? `$${(request.estimated_quantity * request.estimated_unit_rate).toLocaleString()}`
                    : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rich Requisition View */}
        <div className="mb-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <RichRequisitionView
            description={request.description}
            fallbackPurpose={request.purpose}
            fallbackDate={request.created_at}
          />
        </div>

        {/* PO Document Attachment Section (reviewing status) */}
        {request.status === 'reviewing' && (
          <Card className="mb-6 border-primary/30 bg-primary/[0.02] animate-slide-up" style={{ animationDelay: '0.12s' }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Link2 size="16" className="text-primary" />
                Attach PO Document
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Attach the PO document from your procurement system. This will create a PO record and submit it for Sam&apos;s approval.
              </p>
              <form onSubmit={handleAttachPO} className="space-y-3">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">PO Number</Label>
                    <Input
                      placeholder="e.g. PO-2025-001"
                      value={poNumber}
                      onChange={(e) => setPoNumber(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Document Name</Label>
                    <Input
                      placeholder="e.g. PO Document"
                      value={poFileName}
                      onChange={(e) => setPoFileName(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Document URL</Label>
                    <Input
                      placeholder="https://..."
                      value={poFileUrl}
                      onChange={(e) => setPoFileUrl(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submittingPo || !poNumber.trim() || !poFileName.trim() || !poFileUrl.trim()}
                  className="gap-1.5 h-9 shrink-0"
                >
                  <Send size="14" />
                  {submittingPo ? 'Submitting...' : 'Attach & Submit to Sam'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Attachments */}
        <Card className="mb-6 border-border/60 animate-slide-up" style={{ animationDelay: '0.15s' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Paperclip size="16" className="text-muted-foreground" />
              Attachments
              {attachments.length > 0 && (
                <span className="text-xs text-muted-foreground font-normal">({attachments.length})</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {attachments.length > 0 ? (
              <div className="space-y-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText size="16" className="shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate text-foreground">{att.file_name}</p>
                        <p className="text-[10px] text-muted-foreground">{formatDate(att.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={att.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                          <Eye size="12" />
                          View
                        </Button>
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeAttachment(att.id)}
                      >
                        <X size="14" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground font-medium">No attachments uploaded yet.</p>
            )}

            {/* Add Attachment Form */}
            <form onSubmit={handleAddAttachment} className="border-t border-border/40 pt-4">
              <Label className="text-xs font-semibold mb-2 block">Add Attachment</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="File name"
                  value={attFileName}
                  onChange={(e) => setAttFileName(e.target.value)}
                  className="text-xs h-9"
                />
                <Input
                  placeholder="File URL"
                  value={attFileUrl}
                  onChange={(e) => setAttFileUrl(e.target.value)}
                  className="text-xs h-9"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={attaching || !attFileName.trim() || !attFileUrl.trim()}
                  className="gap-1.5 h-9 shrink-0"
                >
                  <Upload size="14" />
                  {attaching ? 'Adding...' : 'Add'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          {request.status === 'new' && (
            <Button
              onClick={handleMarkAsReviewing}
              disabled={isMarkingReviewing}
              size="lg"
              className="gap-1.5 shadow-sm"
            >
              <Eye size="16" />
              {isMarkingReviewing ? 'Processing...' : 'Mark as Reviewing'}
            </Button>
          )}
          <Link href="/mintah/requests">
            <Button variant="outline" size="lg" className="gap-1.5">
              <ArrowLeft size="16" />
              Back
            </Button>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  )
}
