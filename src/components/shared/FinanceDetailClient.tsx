'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import POProgress from '@/components/shared/POProgress'
import StatusBadge from '@/components/shared/StatusBadge'
import { PO_STATUS_CONFIG, formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, Card as CardIcon, Document, TickCircle } from '@/lib/icons'
import Link from 'next/link'
import RichRequisitionView from '@/components/shared/RichRequisitionView'

interface FinanceDetailProps {
  po: any
}

export default function FinanceDetailClient({ po }: FinanceDetailProps) {
  const router = useRouter()
  const [isPaying, setIsPaying] = useState(false)

  const handleMarkAsPaid = async () => {
    setIsPaying(true)
    const res = await fetch(`/api/po/${po.id}/pay`, { method: 'POST' })
    if (res.ok) {
      router.refresh()
    }
    setIsPaying(false)
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/finance" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft size="14" />
          Back to Dashboard
        </Link>

        <div className="mb-6 animate-slide-up">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight mb-1">
                Payment Processing
              </h1>
              <p className="text-sm text-muted-foreground">
                Verify details and process payment
              </p>
            </div>
            <StatusBadge status={po.status} config={PO_STATUS_CONFIG} />
          </div>
        </div>

        <div className="mb-6 animate-slide-up" style={{ animationDelay: '0.05s' }}>
          <POProgress status={po.status} />
        </div>

            {/* Purchase Order Details */}
            <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
              {po.description && po.description.trim().startsWith('{') ? (
                <div className="space-y-6">
                  <RichRequisitionView 
                    description={po.description} 
                    fallbackPurpose={po.purpose} 
                    fallbackDate={po.created_at} 
                  />
                  {po.sam_approved_at && (
                    <Card>
                      <CardContent className="p-4">
                        <Label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1.5">
                          <TickCircle size="12" color="#059669" />
                          Sam&apos;s Approval
                        </Label>
                        <p className="text-sm text-emerald-600 font-medium">
                          Approved on {formatDate(po.sam_approved_at)}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Document size="16" color="currentColor" />
                      Purchase Order
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
                      <p className="text-3xl font-bold text-primary">{formatCurrency(po.total_amount)}</p>
                    </div>

                    {po.sam_approved_at && (
                      <div className="border-t pt-4">
                        <Label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1.5">
                          <TickCircle size="12" color="#059669" />
                          Sam&apos;s Approval
                        </Label>
                        <p className="text-sm text-emerald-600 font-medium">
                          Approved on {formatDate(po.sam_approved_at)}
                        </p>
                      </div>
                    )}

                    <div className="border-t pt-4 text-xs text-muted-foreground">
                      Created: {formatDate(po.created_at)}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

        {po.status === 'pending_payment' && (
          <div className="mt-8 flex gap-3 animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <Button
              onClick={handleMarkAsPaid}
              disabled={isPaying}
              size="lg"
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20"
            >
              <CardIcon size="16" />
              {isPaying ? 'Processing...' : 'Mark as Paid & Complete'}
            </Button>
            <Link href="/finance">
              <Button variant="outline" size="lg">
                <ArrowLeft size="16" className="mr-1.5" />
                Back
              </Button>
            </Link>
          </div>
        )}

        {po.status === 'completed' && (
          <div className="mt-8 rounded-lg bg-emerald-50 border border-emerald-200 p-6 text-center animate-slide-up">
            <TickCircle size="40" color="#059669" variant="Bulk" className="mx-auto mb-3" />
            <p className="text-lg font-semibold text-emerald-700">Payment Completed</p>
            <p className="text-sm text-emerald-600 mt-1">
              This PO has been paid on {formatDate(po.paid_at)}.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
