'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import POProgress from '@/components/shared/POProgress'
import StatusBadge from '@/components/shared/StatusBadge'
import { PO_STATUS_CONFIG, formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, TickCircle, CloseCircle, Document, ArrowDown } from '@/lib/icons'
import Link from 'next/link'
import RichRequisitionView from '@/components/shared/RichRequisitionView'

interface PODetailProps {
  po: any
}

export default function PODetailClient({ po }: PODetailProps) {
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

  return (
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Link href="/sam" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft size="14" />
          Back to Dashboard
        </Link>

        <div className="mb-6 animate-slide-up">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight mb-1">
                PO Review
              </h1>
              <p className="text-sm text-muted-foreground">
                Inspect the Purchase Order and make your decision
              </p>
            </div>
            <StatusBadge status={po.status} config={PO_STATUS_CONFIG} />
          </div>
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
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Document size="16" color="currentColor" />
                      PO Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1 block">Purpose</Label>
                      <p className="text-lg font-semibold">{po.purpose}</p>
                    </div>

                    {po.description && (
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground mb-1 block">Description</Label>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{po.description}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground mb-1 block">Quantity</Label>
                        <p className="text-sm font-medium">{po.quantity ?? '—'}</p>
                      </div>
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground mb-1 block">Unit Rate</Label>
                        <p className="text-sm font-medium">{formatCurrency(po.unit_rate)}</p>
                      </div>
                    </div>

                    <div className="rounded-lg bg-primary/5 border border-primary/10 p-4">
                      <Label className="text-xs font-medium text-muted-foreground mb-1 block">Total Amount</Label>
                      <p className="text-2xl font-bold text-primary">{formatCurrency(po.total_amount)}</p>
                    </div>

                    <div className="border-t pt-4 text-xs text-muted-foreground">
                      Created: {formatDate(po.created_at)}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

          {/* File Preview / Rejection */}
          <div className="space-y-6">
            <Card className="animate-slide-in-right" style={{ animationDelay: '0.15s' }}>
              <CardHeader>
                <CardTitle className="text-lg">Attached File</CardTitle>
              </CardHeader>
              <CardContent>
                {po.file_name ? (
                  <div className="rounded-lg border bg-muted/30 p-6 text-center">
                    <Document size="48" color="currentColor" className="mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm font-medium mb-2">{po.file_name}</p>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <ArrowDown size="14" />
                      Download
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border bg-muted/30 p-6 text-center text-muted-foreground text-sm">
                    No file attached to this PO.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Rejection Reason */}
            {(po.status === 'pending_sam' || po.status === 'revision_required') && (
              <Card className="animate-slide-in-right" style={{ animationDelay: '0.2s' }}>
                <CardContent className="p-4">
                  <Label className="text-sm font-medium mb-2 block">
                    Rejection Reason {po.status === 'revision_required' ? '(sent back to Mintah)' : '(if rejecting)'}
                  </Label>
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g. Missing signature, needs stamp on page 2..."
                    rows={3}
                    className="resize-none mb-3"
                  />
                </CardContent>
              </Card>
            )}

            {/* Rejection history */}
            {po.sam_rejection_reason && (
              <Card className="border-destructive/20 bg-destructive/5 animate-slide-in-right">
                <CardContent className="p-4">
                  <Label className="text-sm font-medium text-destructive mb-1 block flex items-center gap-1.5">
                    <CloseCircle size="14" color="currentColor" />
                    Rejection Reason
                  </Label>
                  <p className="text-sm">{po.sam_rejection_reason}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {(po.status === 'pending_sam' || po.status === 'revision_required') && (
          <div className="mt-8 flex flex-wrap gap-3 animate-slide-up" style={{ animationDelay: '0.25s' }}>
            <Button
              onClick={handleApprove}
              disabled={isSubmitting}
              size="lg"
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20"
            >
              <TickCircle size="16" />
              Approve & Send to Finance
            </Button>
            <Button
              onClick={handleReject}
              disabled={isSubmitting || !rejectionReason.trim()}
              variant="destructive"
              size="lg"
              className="gap-2"
            >
              <CloseCircle size="16" />
              Reject & Return to Mintah
            </Button>
            <Link href="/sam">
              <Button variant="outline" size="lg">
                <ArrowLeft size="16" className="mr-1.5" />
                Back
              </Button>
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
