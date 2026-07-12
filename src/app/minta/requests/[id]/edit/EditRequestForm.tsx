'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
    <Card className="glass-card border-border/40 animate-slide-up">
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="px-3 py-2 text-xs border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Purpose</label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              required
              className="w-full h-9 bg-background border border-border/60 rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              placeholder="What is this request for?"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all resize-none"
              placeholder="Provide details about your request..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Estimated Quantity</label>
              <input
                type="number"
                min="0"
                value={estimatedQuantity || ''}
                onChange={(e) => setEstimatedQuantity(Number(e.target.value))}
                className="w-full h-9 bg-background border border-border/60 rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all font-mono"
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Estimated Unit Rate ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={estimatedUnitRate || ''}
                onChange={(e) => setEstimatedUnitRate(Number(e.target.value))}
                className="w-full h-9 bg-background border border-border/60 rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all font-mono"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Requester Name</label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="w-full h-9 bg-background border border-border/60 rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                placeholder="Your name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className="w-full h-9 bg-background border border-border/60 rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                placeholder="you@company.com"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isSubmitting} className="gap-1.5">
              {isSubmitting ? <Loader2 size="14" className="animate-spin" /> : <Save size="14" />}
              Save Changes
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
