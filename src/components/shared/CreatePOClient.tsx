'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import FileUpload, { type UploadedFile } from '@/components/shared/FileUpload'
import { PageContainer, PageHeader, Panel, Field } from '@/components/shared/ui-kit'
import { ArrowLeft, FileText, Send, Upload } from 'lucide-react'
import Link from 'next/link'
import FormErrorBanner from '@/components/shared/FormErrorBanner'
import { cn, formatCurrency } from '@/lib/utils'

interface CreatePOProps {
  request: any
  user?: { name?: string; email: string } | null
  role?: string | null
}

export default function CreatePOClient({ request, user, role }: CreatePOProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const id = useId()

  const [purpose, setPurpose] = useState(request.purpose || '')
  const [description, setDescription] = useState(request.description || '')
  const [quantity, setQuantity] = useState(request.estimated_quantity?.toString() || '')
  const [unitRate, setUnitRate] = useState(request.estimated_unit_rate?.toString() || '')
  const [poDoc, setPoDoc] = useState<UploadedFile | null>(null)

  const totalAmount = quantity && unitRate ? parseFloat(quantity) * parseFloat(unitRate) : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')
    const payload: Record<string, any> = {}
    if (purpose !== request.purpose) payload.purpose = purpose
    if (description !== request.description) payload.description = description
    if (quantity !== (request.estimated_quantity?.toString() || '')) payload.quantity = quantity ? parseFloat(quantity) : null
    if (unitRate !== (request.estimated_unit_rate?.toString() || '')) payload.unit_rate = unitRate ? parseFloat(unitRate) : null
    if (poDoc) {
      payload.file_name = poDoc.fileName
      payload.file_url = poDoc.fileUrl
    }

    try {
      const res = await fetch(`/api/requests/${request.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        router.push('/mintah/pos')
        return
      }
      const body = await res.json().catch(() => null)
      setError(body?.error || `Couldn't create the purchase order (error ${res.status}). Please try again.`)
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      {error && <FormErrorBanner message={error} />}
      <PageContainer className="space-y-6">
        <PageHeader
          backHref={`/mintah/requests/${request.id}`}
          backLabel="Back to Request"
          title="Create Purchase Order"
          subtitle="Modify details as needed before submitting to Sam"
        />

        <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Form */}
          <div className="min-w-0 space-y-6">
            <Panel title="Purchase Order Details" icon={<FileText size={16} />}>
              <div className="space-y-4">
                <Field label="Purpose" htmlFor={`${id}-purpose`}>
                  <Input id={`${id}-purpose`} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose of the purchase" required />
                </Field>
                <Field label="Description" htmlFor={`${id}-description`}>
                  <Textarea id={`${id}-description`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detailed description" rows={4} className="resize-none" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Quantity" htmlFor={`${id}-quantity`}>
                    <Input id={`${id}-quantity`} type="number" inputMode="decimal" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
                  </Field>
                  <Field label="Unit Rate (GH₵)" htmlFor={`${id}-rate`}>
                    <Input id={`${id}-rate`} type="number" inputMode="decimal" step="any" min="0" value={unitRate} onChange={(e) => setUnitRate(e.target.value)} placeholder="0.00" />
                  </Field>
                </div>
              </div>
            </Panel>

            <Panel title="PO Document" icon={<Upload size={16} />}>
              <Field label="Upload PO document (PDF, optional)">
                <FileUpload value={poDoc} onChange={setPoDoc} disabled={isSubmitting} />
              </Field>
            </Panel>
          </div>

          {/* Live summary */}
          <div className="space-y-6">
            <Panel title="Summary">
              <div className="space-y-3">
                <Field label="Requester"><p className="text-sm font-semibold text-foreground">{request.guest_name || '—'}</p></Field>
                <Field label="Purpose"><p className="text-sm font-medium text-foreground">{purpose || '—'}</p></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Quantity"><p className="text-sm font-semibold tabular-nums text-foreground">{quantity || '—'}</p></Field>
                  <Field label="Unit Rate"><p className="text-sm font-semibold tabular-nums text-foreground">{unitRate ? formatCurrency(Number(unitRate)) : '—'}</p></Field>
                </div>
                <div className="rounded-lg border border-primary/15 bg-primary/[0.04] p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Amount</p>
                  <p className="mt-0.5 text-2xl font-semibold tabular-nums text-primary">
                    {totalAmount !== null ? formatCurrency(totalAmount) : '—'}
                  </p>
                </div>
              </div>
            </Panel>

            <div className="space-y-2">
              <Button type="submit" disabled={isSubmitting} className="w-full gap-1.5">
                <Send size={16} />
                {isSubmitting ? 'Creating…' : 'Create PO & Send to Sam'}
              </Button>
              <Link
                href={`/mintah/requests/${request.id}`}
                className={cn(buttonVariants({ variant: 'outline' }), 'w-full gap-1.5')}
              >
                <ArrowLeft size={16} /> Cancel
              </Link>
            </div>
          </div>
        </form>
      </PageContainer>
    </>
  )
}
