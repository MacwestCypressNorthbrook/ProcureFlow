'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import POProgress from '@/components/shared/POProgress'
import StatusBadge from '@/components/shared/StatusBadge'
import { PO_STATUS_CONFIG, formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, CreditCard, FileText, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import RichRequisitionView from '@/components/shared/RichRequisitionView'

interface FinanceDetailProps {
  po: any
  user?: { name?: string; email: string } | null
  role?: string | null
}

export default function FinanceDetailClient({ po, user, role }: FinanceDetailProps) {
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
    <DashboardLayout
      title="Payment Processing"
      subtitle="Verify details and disburse payment"
      user={user}
      role={role}
    >
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/finance"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft size="14" />
          Back to Dashboard
        </Link>

        <div className="mb-6 flex items-center justify-between gap-4 animate-slide-up">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              PO Payment Info
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Verify PO details and Sam&apos;s executive approval
            </p>
          </div>
          <StatusBadge status={po.status} config={PO_STATUS_CONFIG} />
        </div>

        <div className="mb-6 animate-slide-up" style={{ animationDelay: '0.05s' }}>
          <POProgress status={po.status} />
        </div>

        <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
          {po.description && po.description.trim().startsWith('{') ? (
            <div className="space-y-6">
              <RichRequisitionView 
                description={po.description} 
                fallbackPurpose={po.purpose} 
                fallbackDate={po.created_at} 
              />
              {po.sam_approved_at && (
                <Card className="border-border/60">
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
                  <p className="text-lg font-bold text-primary">{formatCurrency(po.total_amount)}</p>
                </div>

                {po.sam_approved_at && (
                  <div className="border-t pt-4">
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1.5">
                      <CheckCircle size="12" className="text-emerald-600" />
                      Sam&apos;s Approval
                    </Label>
                    <p className="text-xs text-emerald-600 font-bold">
                      Approved on {formatDate(po.sam_approved_at)}
                    </p>
                  </div>
                )}
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
              className="gap-1.5 shadow-sm"
            >
              <CreditCard size="16" />
              {isPaying ? 'Processing...' : 'Mark as Paid & Complete'}
            </Button>
            <Link href="/finance">
              <Button variant="outline" size="lg" className="gap-1.5">
                <ArrowLeft size="16" />
                Back
              </Button>
            </Link>
          </div>
        )}

        {po.status === 'completed' && (
          <div className="mt-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-6 text-center animate-slide-up">
            <CheckCircle size="36" className="mx-auto mb-2 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Payment Completed</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">
              This PO was marked as paid on {formatDate(po.paid_at)}.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
