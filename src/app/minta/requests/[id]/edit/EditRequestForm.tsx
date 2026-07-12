'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Panel, Field } from '@/components/shared/ui-kit'
import { Loader2, Save } from 'lucide-react'

interface EditRequestFormProps {
  requestId: string
  initialData: {
    purpose: string
    description: string
    estimated_quantity: number
    estimated_unit_rate: number
    guest_name: string
    guest_email: string
  }
}

export default function EditRequestForm({ requestId, initialData }: EditRequestFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [purpose, setPurpose] = useState(initialData.purpose)
  const [description, setDescription] = useState(initialData.description)
  const [estimatedQuantity, setEstimatedQuantity] = useState(initialData.estimated_quantity)
  const [estimatedUnitRate, setEstimatedUnitRate] = useState(initialData.estimated_unit_rate)
  const [guestName, setGuestName] = useState(initialData.guest_name)
  const [guestEmail, setGuestEmail] = useState(initialData.guest_email)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose,
          description,
          estimated_quantity: estimatedQuantity,
          estimated_unit_rate: estimatedUnitRate,
          guest_name: guestName,
          guest_email: guestEmail || null,
        }),
      })
      if (res.ok) {
        router.push(`/minta/requests/${requestId}`)
        router.refresh()
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to update request.')
      }
    } catch {
      setError('Network error. Failed to update request.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/[0.06] px-3 py-2 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      <Panel title="Request Details">
        <div className="space-y-4">
          <Field label="Purpose">
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} required placeholder="What is this request for?" />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className="resize-none" placeholder="Provide details about your request…" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Estimated Quantity">
              <Input type="number" min="0" value={estimatedQuantity || ''} onChange={(e) => setEstimatedQuantity(Number(e.target.value))} placeholder="0" />
            </Field>
            <Field label="Estimated Unit Rate ($)">
              <Input type="number" min="0" step="0.01" value={estimatedUnitRate || ''} onChange={(e) => setEstimatedUnitRate(Number(e.target.value))} placeholder="0.00" />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel title="Requester">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Requester Name">
            <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Your name" />
          </Field>
          <Field label="Email">
            <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="you@company.com" />
          </Field>
        </div>
      </Panel>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting} className="gap-1.5">
          {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Changes
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  )
}
