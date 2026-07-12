'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, FileText, Send, Upload } from 'lucide-react'
import Link from 'next/link'

interface CreatePOProps {
  request: any
  user?: { name?: string; email: string } | null
  role?: string | null
}

export default function CreatePOClient({ request, user, role }: CreatePOProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [purpose, setPurpose] = useState(request.purpose || '')
  const [description, setDescription] = useState(request.description || '')
  const [quantity, setQuantity] = useState(request.estimated_quantity?.toString() || '')
  const [unitRate, setUnitRate] = useState(request.estimated_unit_rate?.toString() || '')
  const [fileName, setFileName] = useState('')
  const [fileUrl, setFileUrl] = useState('')

  const totalAmount =
    quantity && unitRate ? (parseFloat(quantity) * parseFloat(unitRate)).toFixed(2) : ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const payload: Record<string, any> = {}
    if (purpose !== request.purpose) payload.purpose = purpose
    if (description !== request.description) payload.description = description
    if (quantity !== (request.estimated_quantity?.toString() || '')) payload.quantity = quantity ? parseFloat(quantity) : null
    if (unitRate !== (request.estimated_unit_rate?.toString() || '')) payload.unit_rate = unitRate ? parseFloat(unitRate) : null
    if (fileName.trim()) payload.file_name = fileName.trim()
    if (fileUrl.trim()) payload.file_url = fileUrl.trim()

    const res = await fetch(`/api/requests/${request.id}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      router.push('/mintah/pos')
    }
    setIsSubmitting(false)
  }

  return (
    <DashboardLayout
      title="Create Purchase Order"
      subtitle={`Converting request: ${request.purpose}`}
      user={user}
      role={role}
    >
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href={`/mintah/requests/${request.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft size="14" />
          Back to Request
        </Link>

        <div className="mb-6 animate-slide-up">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Create Purchase Order
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Modify details as needed before submitting to Sam
          </p>
        </div>

        {/* Original Request Summary */}
        <Card className="mb-6 border-border/60 animate-slide-up" style={{ animationDelay: '0.05s' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Original Request
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">Requester</Label>
                <p className="font-semibold text-foreground">{request.guest_name || '—'}</p>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">Email</Label>
                <p className="font-semibold text-foreground">{request.guest_email || '—'}</p>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">Status</Label>
                <p className="font-semibold text-foreground capitalize">{request.status}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PO Form */}
        <form onSubmit={handleSubmit}>
          <Card className="border-border/60 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText size="16" className="text-muted-foreground" />
                Purchase Order Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">Purpose</Label>
                <Input
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Purpose of the purchase"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold mb-1.5 block">Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detailed description"
                  rows={4}
                  className="resize-none"
                />
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs font-semibold mb-1.5 block">Quantity</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold mb-1.5 block">Unit Rate ($)</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={unitRate}
                    onChange={(e) => setUnitRate(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold mb-1.5 block">Total Amount</Label>
                  <div className="rounded-xl bg-primary/5 border border-primary/10 p-3">
                    <p className="text-lg font-bold text-primary">
                      {totalAmount ? `$${Number(totalAmount).toLocaleString()}` : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* PO Document Upload */}
              <div className="border-t border-border/40 pt-5">
                <Label className="text-xs font-semibold mb-2 block">PO Document (optional)</Label>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Input
                    placeholder="File name"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                  />
                  <Input
                    placeholder="File URL"
                    value={fileUrl}
                    onChange={(e) => setFileUrl(e.target.value)}
                  />
                </div>
                {(fileName || fileUrl) && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Upload size="12" />
                    Document will be attached: {fileName || 'untitled'}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="mt-6 flex flex-wrap gap-3 animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <Button type="submit" size="lg" disabled={isSubmitting} className="gap-1.5 shadow-sm">
              <FileText size="16" />
              {isSubmitting ? 'Creating...' : 'Create PO & Send to Sam'}
              <Send size="16" />
            </Button>
            <Link href={`/mintah/requests/${request.id}`}>
              <Button variant="outline" size="lg" className="gap-1.5">
                <ArrowLeft size="16" />
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}
