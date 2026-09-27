'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import DocumentList from '@/components/shared/DocumentList'
import FileUpload, { type UploadedFile } from '@/components/shared/FileUpload'
import RichRequisitionView from '@/components/shared/RichRequisitionView'
import StatusBadge from '@/components/shared/StatusBadge'
import { PageContainer, PageHeader, Panel, Field } from '@/components/shared/ui-kit'
import { REQUEST_STATUS_CONFIG, formatCurrency, formatDate } from '@/lib/utils'
import { Eye, Paperclip, Upload, Send, Link2 } from 'lucide-react'
import { can } from '@/lib/roles'

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
  const [attDoc, setAttDoc] = useState<UploadedFile | null>(null)

  const [poNumber, setPoNumber] = useState('')
  const [poDoc, setPoDoc] = useState<UploadedFile | null>(null)
  const [submittingPo, setSubmittingPo] = useState(false)

  const handleMarkAsReviewing = async () => {
    setIsMarkingReviewing(true)
    const res = await fetch(`/api/requests/${request.id}/review`, { method: 'POST' })
    if (res.ok) router.refresh()
    setIsMarkingReviewing(false)
  }

  const handleAddAttachment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!attDoc) return
    setAttaching(true)

    const formData = new FormData()
    if (attDoc.file) {
      formData.append('file', attDoc.file)
    } else {
      formData.append('file_name', attDoc.fileName)
      formData.append('file_url', attDoc.fileUrl)
    }

    const res = await fetch(`/api/requests/${request.id}/attachments`, {
      method: 'POST',
      body: formData,
    })
    if (res.ok) {
      const data = await res.json()
      setAttachments((prev) => [data.data, ...prev])
      setAttDoc(null)
    }
    setAttaching(false)
  }

  // Only Supply Chain converts a requisition into a purchase order.
  const canConvert = can(role, 'request:convert')

  const handleAttachPO = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!poNumber.trim() || !poDoc) return
    setSubmittingPo(true)

    const formData = new FormData()
    formData.append('po_number', poNumber.trim())
    if (poDoc.file) {
      formData.append('file', poDoc.file)
    } else {
      formData.append('file_name', poDoc.fileName)
      formData.append('file_url', poDoc.fileUrl)
    }

    const res = await fetch(`/api/requests/${request.id}/attach-po`, {
      method: 'POST',
      body: formData,
    })
    // Reachable only when `canConvert`, i.e. Supply Chain or an elevated role,
    // both of which can open this list.
    if (res.ok) router.push('/mintah/pos')
    setSubmittingPo(false)
  }

  // The stored total is the only figure that holds for a multi-line requisition:
  // `estimated_unit_rate` is set only when there is exactly one line. Quantity ×
  // rate stays as the fallback for rows raised before totals were recorded.
  const storedTotal = Number(request.total_amount)
  const legacyTotal = Number(request.estimated_quantity) * Number(request.estimated_unit_rate)
  const estTotal =
    storedTotal > 0
      ? formatCurrency(storedTotal)
      : Number.isFinite(legacyTotal) && legacyTotal > 0
        ? formatCurrency(legacyTotal)
        : '—'

  return (
    <>
      <PageContainer className="space-y-6">
        <PageHeader
          backHref="/mintah/requests"
          backLabel="Back to Requests"
          title={request.purpose}
          subtitle={`Submitted ${formatDate(request.created_at)}${request.guest_name ? ` by ${request.guest_name}` : ''}`}
          actions={<StatusBadge status={request.status} config={REQUEST_STATUS_CONFIG} />}
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Main */}
          <div className="min-w-0 space-y-6">
            <RichRequisitionView description={request.description} fallbackPurpose={request.purpose} fallbackDate={request.created_at} />

            <Panel
              title="Attachments"
              icon={<Paperclip size={16} />}
              action={attachments.length > 0 ? <span className="text-xs text-muted-foreground">{attachments.length}</span> : null}
            >
              <div className="space-y-4">
                <DocumentList docs={attachments} emptyLabel="No attachments uploaded yet." />
                <form onSubmit={handleAddAttachment} className="space-y-3 border-t border-border pt-4">
                  <FileUpload value={attDoc} onChange={setAttDoc} disabled={attaching} />
                  <Button type="submit" size="sm" disabled={attaching || !attDoc} className="w-full gap-1.5">
                    <Upload size={14} />
                    {attaching ? 'Adding…' : 'Add Attachment'}
                  </Button>
                </form>
              </div>
            </Panel>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Panel title="Request Summary">
              <div className="space-y-3">
                <Field label="Requester"><p className="text-sm font-semibold text-foreground">{request.guest_name || '—'}</p></Field>
                <Field label="Email"><p className="text-sm font-semibold text-foreground">{request.guest_email || '—'}</p></Field>
                <Field label="Est. Total"><p className="text-sm font-semibold tabular-nums text-foreground">{estTotal}</p></Field>
              </div>
            </Panel>

            {request.status === 'new' && (
              <Panel title="Next Step">
                <p className="mb-3 text-xs text-muted-foreground">Move this request into review to begin processing.</p>
                <Button onClick={handleMarkAsReviewing} disabled={isMarkingReviewing} className="w-full gap-1.5">
                  <Eye size={16} />
                  {isMarkingReviewing ? 'Processing…' : 'Mark as Reviewing'}
                </Button>
              </Panel>
            )}

            {request.status === 'reviewing' && canConvert && (
              <Panel title="Attach PO Document" icon={<Link2 size={16} className="text-primary" />}>
                <p className="mb-3 text-xs text-muted-foreground">
                  Upload the PO document (PDF) to create a PO record and submit it for Sam&apos;s approval.
                </p>
                <form onSubmit={handleAttachPO} className="space-y-2.5">
                  <Field label="PO Number">
                    <Input placeholder="e.g. PO-2025-001" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className="h-9 text-sm" />
                  </Field>
                  <Field label="PO Document (PDF)">
                    <FileUpload value={poDoc} onChange={setPoDoc} disabled={submittingPo} />
                  </Field>
                  <Button type="submit" disabled={submittingPo || !poNumber.trim() || !poDoc} className="w-full gap-1.5">
                    <Send size={14} />
                    {submittingPo ? 'Submitting…' : 'Attach & Submit to Sam'}
                  </Button>
                </form>
              </Panel>
            )}
          </div>
        </div>
      </PageContainer>
    </>
  )
}
