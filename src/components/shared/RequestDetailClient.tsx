'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Button } from '@/components/ui/button'
import StatusBadge from '@/components/shared/StatusBadge'
import { REQUEST_STATUS_CONFIG } from '@/lib/utils'
import { ArrowLeft, FileText, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import RichRequisitionView from '@/components/shared/RichRequisitionView'

interface RequestDetailProps {
  request: any
  user?: { name?: string; email: string } | null
  role?: string | null
}

export default function RequestDetailClient({ request, user, role }: RequestDetailProps) {
  const router = useRouter()
  const [isConverting, setIsConverting] = useState(false)

  const handleConvertToPO = async () => {
    setIsConverting(true)
    const res = await fetch(`/api/requests/${request.id}/convert`, {
      method: 'POST',
    })
    if (res.ok) {
      const data = await res.json()
      router.push(`/mintah/po/${data.data.id}`)
    }
    setIsConverting(false)
  }

  return (
    <DashboardLayout
      title="Request Details"
      subtitle="Review this request and convert it to a Purchase Order"
      user={user}
      role={role}
    >
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/mintah"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft size="14" />
          Back to Dashboard
        </Link>

        <div className="mb-6 flex items-center justify-between gap-4 animate-slide-up">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Request Info
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review details submitted by requester
            </p>
          </div>
          <StatusBadge status={request.status} config={REQUEST_STATUS_CONFIG} />
        </div>

        <div className="animate-slide-up" style={{ animationDelay: '0.05s' }}>
          <RichRequisitionView 
            description={request.description} 
            fallbackPurpose={request.purpose} 
            fallbackDate={request.created_at} 
          />
        </div>

        {request.status === 'new' || request.status === 'reviewing' ? (
          <div className="mt-6 flex flex-wrap gap-3 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <Button
              onClick={handleConvertToPO}
              disabled={isConverting}
              size="lg"
              className="gap-1.5 shadow-sm"
            >
              {isConverting ? (
                <>Processing...</>
              ) : (
                <>
                  <FileText size="16" />
                  Convert to PO & Send to Sam
                  <ArrowRight size="16" />
                </>
              )}
            </Button>
            <Link href="/mintah">
              <Button variant="outline" size="lg" className="gap-1.5">
                <ArrowLeft size="16" />
                Back
              </Button>
            </Link>
          </div>
        ) : (
          <div className="mt-6">
            <Link href="/mintah">
              <Button variant="outline" size="lg" className="gap-1.5">
                <ArrowLeft size="16" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
