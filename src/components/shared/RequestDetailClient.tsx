'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Button } from '@/components/ui/button'
import StatusBadge from '@/components/shared/StatusBadge'
import { PageContainer, PageHeader } from '@/components/shared/ui-kit'
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
      <PageContainer className="space-y-6">
        <PageHeader
          backHref="/mintah"
          backLabel="Back to Dashboard"
          title="Request Info"
          subtitle="Review details submitted by requester"
          actions={<StatusBadge status={request.status} config={REQUEST_STATUS_CONFIG} />}
        />

        <RichRequisitionView
          description={request.description}
          fallbackPurpose={request.purpose}
          fallbackDate={request.created_at}
        />

        {request.status === 'new' || request.status === 'reviewing' ? (
          <div className="flex flex-wrap gap-3">
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
          <Link href="/mintah">
            <Button variant="outline" size="lg" className="gap-1.5">
              <ArrowLeft size="16" />
              Back to Dashboard
            </Button>
          </Link>
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
