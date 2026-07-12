'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import StatusBadge from '@/components/shared/StatusBadge'
import { REQUEST_STATUS_CONFIG } from '@/lib/utils'
import { ArrowLeft, Document, ArrowRight } from '@/lib/icons'
import Link from 'next/link'
import RichRequisitionView from '@/components/shared/RichRequisitionView'

interface RequestDetailProps {
  request: any
}

export default function RequestDetailClient({ request }: RequestDetailProps) {
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
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/mintah" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft size="14" />
          Back to Dashboard
        </Link>

        <div className="mb-6 animate-slide-up">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight mb-1">
                Request Details
              </h1>
              <p className="text-sm text-muted-foreground">
                Review this request and convert it to a Purchase Order
              </p>
            </div>
            <StatusBadge status={request.status} config={REQUEST_STATUS_CONFIG} />
          </div>
        </div>

        <div className="animate-slide-up" style={{ animationDelay: '0.05s' }}>
          <RichRequisitionView 
            description={request.description} 
            fallbackPurpose={request.purpose} 
            fallbackDate={request.created_at} 
          />
        </div>

        {request.status === 'new' || request.status === 'reviewing' ? (
          <div className="mt-6 flex gap-3 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <Button
              onClick={handleConvertToPO}
              disabled={isConverting}
              size="lg"
              className="gap-2 shadow-lg shadow-emerald-500/20"
            >
              {isConverting ? (
                <>Processing...</>
              ) : (
                <>
                  <Document size="16" />
                  Convert to PO & Send to Sam
                  <ArrowRight size="16" />
                </>
              )}
            </Button>
            <Link href="/mintah">
              <Button variant="outline" size="lg">
                <ArrowLeft size="16" className="mr-1.5" />
                Back
              </Button>
            </Link>
          </div>
        ) : (
          <div className="mt-6">
            <Link href="/mintah">
              <Button variant="outline" size="lg" className="gap-2">
                <ArrowLeft size="16" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
