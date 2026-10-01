'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import POProgress from '@/components/shared/POProgress'
import StatusBadge from '@/components/shared/StatusBadge'
import { PO_STATUS_CONFIG, formatCurrency, formatDate, formatQuantity } from '@/lib/utils'
import { ArrowLeft, CheckCircle, XCircle, FileText, Download } from 'lucide-react'
import Link from 'next/link'
import RichRequisitionView from '@/components/shared/RichRequisitionView'

interface PODetailProps {
  po: any
  user?: { name?: string; email: string } | null
  role?: string | null
}

export default function PODetailClient({ po, user, role }: PODetailProps) {
  const router = useRouter()
  const [rejectionReason, setRejectionReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  const backHref = role === 'mintah' ? '/mintah' : '/sam'

  return (
    <>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft size="14" />
          Back to Dashboard
        </Link>

        <div className="mb-6 flex items-center justify-between gap-4 animate-slide-up">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Purchase Order #{po.id.slice(0, 8)}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Created on {formatDate(po.created_at)}
            </p>
          </div>
          <StatusBadge status={po.status} config={PO_STATUS_CONFIG} />
        </div>

        <div className="mb-6 animate-slide-up" style={{ animationDelay: '0.05s' }}>
          <POProgress status={po.status} />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
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
                      <p className="text-xs font-bold text-foreground">{formatQuantity(po.quantity)}</p>
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

          {/* File Preview & Rejection */}
          <div className="space-y-6">
            <Card className="border-border/60 animate-slide-in-right" style={{ animationDelay: '0.15s' }}>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Attached Document</CardTitle>
              </CardHeader>
              <CardContent>
                {po.file_name ? (
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
                    No file attached to this PO.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Rejection Reason Input */}
            {(po.status === 'pending_sam' || po.status === 'revision_required') && role === 'sam' && (
              <Card className="border-border/60 animate-slide-in-right" style={{ animationDelay: '0.2s' }}>
                <CardContent className="p-4">
                  <Label className="text-xs font-semibold mb-2 block">
                    Rejection Reason {po.status === 'revision_required' ? '(sent back to Mintah)' : '(if rejecting)'}
                  </Label>
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g. Missing signature, needs stamp on page 2..."
                    rows={3}
                    className="resize-none text-xs"
                  />
                </CardContent>
              </Card>
            )}

            {/* Rejection History */}
            {po.sam_rejection_reason && (
              <Card className="border-destructive/20 bg-destructive/5 animate-slide-in-right">
                <CardContent className="p-4">
                  <Label className="text-xs font-bold text-destructive mb-1.5 block flex items-center gap-1.5">
                    <XCircle size="14" />
                    Rejection History
                  </Label>
                  <p className="text-xs font-medium leading-relaxed text-destructive">{po.sam_rejection_reason}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {(po.status === 'pending_sam' || po.status === 'revision_required') && role === 'sam' && (
          <div className="mt-8 flex flex-wrap gap-3 animate-slide-up" style={{ animationDelay: '0.25s' }}>
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
            <Link href="/sam">
              <Button variant="outline" size="lg" className="gap-1.5">
                <ArrowLeft size="16" />
                Cancel
              </Button>
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
