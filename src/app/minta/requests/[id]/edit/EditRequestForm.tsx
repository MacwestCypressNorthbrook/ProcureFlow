'use client'

import { lineNeedsSupplier, supplierRequiredMessage } from '@/lib/supplier-rule'
import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Panel, Field } from '@/components/shared/ui-kit'
import SupplierPicker, { type SupplierOption } from '@/components/shared/SupplierPicker'
import { uploadDocument } from '@/lib/upload-client'
import { openDocument } from '@/lib/files'
import type { Project, RequestAttachment } from '@/lib/types'
import {
  RotateCcw,
  Send,
  Save,
  Plus,
  Trash2,
  Loader2,
  Package,
  Users,
  Receipt,
  AlertCircle,
  CheckCircle2,
  Building2,
  FileText,
  Paperclip,
  ExternalLink,
  Undo2,
  X,
} from 'lucide-react'

const MATERIAL_UNITS = ['pcs', 'bags', 'tonnes', 'kg', 'litres', 'm', 'm²', 'm³', 'rolls', 'trips', 'lumpsum']
const LABOUR_UNITS = ['man-days', 'days', 'hours', 'trips', 'lumpsum']
const UNITS = Array.from(new Set([...MATERIAL_UNITS, ...LABOUR_UNITS]))
const DEPARTMENTS = ['Operations', 'Site Works', 'Finance', 'Administration', 'HR', 'IT', 'Procurement']

export type LineCategory = 'material' | 'labour' | 'other'

export interface FormLine {
  id: string
  category: LineCategory
  isSubcontractor: boolean
  description: string
  quantity: string
  unit: string
  unitPrice: string
  supplierId: string | null
  remarks: string
}

interface EditRequestFormProps {
  requestId: string
  status: string
  initialData: {
    purpose: string
    notes: string
    department: string
    projectId: string
    items: FormLine[]
    guestName?: string
    guestEmail?: string
  }
  projects: Project[]
  suppliers: SupplierOption[]
  sendBackInfo?: {
    comment: string | null
    performer_name: string | null
    created_at: string
    stage?: string | null
  } | null
  attachments?: RequestAttachment[]
}

const isLumpSum = (l: FormLine) =>
  l.category === 'other' || (l.category === 'labour' && l.isSubcontractor)

const lineTotal = (l: FormLine) =>
  isLumpSum(l)
    ? Number(l.unitPrice) || 0
    : (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)

const formatGHS = (val: number) =>
  new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', minimumFractionDigits: 2 }).format(val || 0)

export default function EditRequestForm({
  requestId,
  status,
  initialData,
  projects,
  suppliers: initialSuppliers,
  sendBackInfo,
  attachments = [],
}: EditRequestFormProps) {
  const router = useRouter()
  const [suppliers, setSuppliers] = useState<SupplierOption[]>(initialSuppliers)
  const [isSubmitting, setIsSubmittingState] = useState(false)
  // State alone is not a lock: two clicks in the same frame both see it false.
  const submitLock = useRef(false)
  const setIsSubmitting = (value: boolean) => {
    submitLock.current = value
    setIsSubmittingState(value)
  }
  const [submitMode, setSubmitMode] = useState<'save' | 'resubmit'>('save')
  const [error, setError] = useState('')

  const [purpose, setPurpose] = useState(initialData.purpose)
  const [projectId, setProjectId] = useState(initialData.projectId)
  const [department, setDepartment] = useState(initialData.department || 'Operations')
  const [notes, setNotes] = useState(initialData.notes)
  const [lines, setLines] = useState<FormLine[]>(initialData.items)
  const [resubmitComment, setResubmitComment] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState<{ index: number; total: number; percent: number } | null>(null)

  const addFiles = (incoming: FileList | null) => {
    if (incoming) setFiles((f) => [...f, ...Array.from(incoming)])
  }

  const toggleRemoved = (id: string) => {
    setRemovedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Runs after the edits are saved, so a failed upload never loses them.
  // Returns the names of documents that could not be uploaded or removed.
  const syncAttachments = async (): Promise<string[]> => {
    const failed: string[] = []

    for (const attachmentId of removedIds) {
      const res = await fetch(
        `/api/requests/${requestId}/attachments?attachmentId=${encodeURIComponent(attachmentId)}`,
        { method: 'DELETE' }
      ).catch(() => null)
      if (!res?.ok) failed.push(attachments.find((a) => a.id === attachmentId)?.file_name || 'document')
    }

    for (const [index, file] of files.entries()) {
      setUploading({ index, total: files.length, percent: 0 })
      try {
        const uploaded = await uploadDocument(file, {
          scope: `request-docs/${requestId}`,
          onProgress: (percent: number) => setUploading({ index, total: files.length, percent }),
        })

        const res = uploaded.viaServer
          ? await fetch(`/api/requests/${requestId}/attachments`, {
              method: 'POST',
              body: (() => {
                const form = new FormData()
                form.append('file', file)
                return form
              })(),
            })
          : await fetch(`/api/requests/${requestId}/attachments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                file_name: uploaded.fileName,
                file_url: uploaded.key,
                file_size: uploaded.fileSize,
                file_type: uploaded.contentType,
              }),
            })
        if (!res.ok) failed.push(file.name)
      } catch (uploadErr) {
        console.error('Attachment upload failed:', uploadErr)
        failed.push(file.name)
      }
    }
    setUploading(null)

    return failed
  }

  const grandTotal = useMemo(() => lines.reduce((sum, l) => sum + lineTotal(l), 0), [lines])
  const filledLinesCount = lines.filter((l) => l.description.trim()).length

  const updateLine = (id: string, patch: Partial<FormLine>) => {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const setLineCategory = (id: string, category: LineCategory) => {
    setLines((ls) =>
      ls.map((l) => {
        if (l.id !== id) return l
        const next = { ...l, category }
        if (category === 'other') return { ...next, isSubcontractor: false, quantity: '1', unit: 'lumpsum' }
        if (category === 'material') next.isSubcontractor = false
        const defaultUnitStale = l.unit === 'pcs' || l.unit === 'man-days' || l.unit === 'lumpsum'
        if (defaultUnitStale) next.unit = category === 'labour' ? 'man-days' : 'pcs'
        return next
      })
    )
  }

  const addLine = () => {
    setLines((ls) => [
      ...ls,
      {
        id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        category: 'material',
        isSubcontractor: false,
        description: '',
        quantity: '1',
        unit: 'pcs',
        unitPrice: '',
        supplierId: null,
        remarks: '',
      },
    ])
  }

  const removeLine = (id: string) => {
    setLines((ls) => {
      if (ls.length === 1) {
        return [
          {
            id: `line-${Date.now()}`,
            category: 'material',
            isSubcontractor: false,
            description: '',
            quantity: '1',
            unit: 'pcs',
            unitPrice: '',
            supplierId: null,
            remarks: '',
          },
        ]
      }
      return ls.filter((l) => l.id !== id)
    })
  }

  const registerSupplier = (s: SupplierOption) => {
    setSuppliers((list) =>
      list.some((x) => x.id === s.id) ? list : [...list, s].sort((a, b) => a.name.localeCompare(b.name))
    )
  }

  const handleSave = async (shouldResubmit: boolean) => {
    if (submitLock.current) return
    setError('')

    const payloadLines = lines.filter((l) => l.description.trim())
    if (payloadLines.length === 0) {
      setError('Please add at least one material or labour line with a description.')
      return
    }

    const noQty = payloadLines.find((l) => !isLumpSum(l) && !(Number(l.quantity) > 0))
    if (noQty) {
      setError(`"${noQty.description || 'Line'}" requires a quantity greater than zero.`)
      return
    }

    const noAmount = payloadLines.find((l) => isLumpSum(l) && !(Number(l.unitPrice) > 0))
    if (noAmount) {
      setError(`"${noAmount.description || 'Expense'}" requires an amount greater than zero.`)
      return
    }

    const unsourced = payloadLines.find(
      (l) => !l.supplierId && lineNeedsSupplier({ category: l.category, quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0 })
    )
    if (unsourced) {
      setError(supplierRequiredMessage(unsourced.description))
      return
    }

    setIsSubmitting(true)
    setSubmitMode(shouldResubmit ? 'resubmit' : 'save')

    try {
      // 1. Save edits via PUT
      const res = await fetch(`/api/requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose: purpose.trim() || payloadLines[0].description.trim(),
          project_id: projectId || null,
          department: department,
          notes: notes.trim(),
          items: payloadLines.map((l) => ({
            category: l.category,
            isSubcontractor: l.isSubcontractor,
            description: l.description.trim(),
            quantity: Number(l.quantity) || 1,
            unit: l.unit || 'pcs',
            unitPrice: Number(l.unitPrice) || 0,
            supplierId: l.supplierId || null,
            remarks: l.remarks.trim(),
          })),
        }),
      })

      const putData = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(putData.error || 'Failed to update requisition.')
        setIsSubmitting(false)
        return
      }

      // 2. Upload new documents and drop removed ones before any resubmission,
      //    so the reviewer sees the corrected set.
      const failedDocs = await syncAttachments()
      if (failedDocs.length > 0) {
        setFiles((list) => list.filter((f) => failedDocs.includes(f.name)))
        setRemovedIds(new Set())
        setError(
          `Changes saved, but these documents could not be updated: ${failedDocs.join(', ')}. Try again before resubmitting.`
        )
        setIsSubmitting(false)
        router.refresh()
        return
      }

      // 3. If resubmitting, call transition endpoint
      if (shouldResubmit) {
        const transRes = await fetch(`/api/requests/${requestId}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'resubmit',
            comment: resubmitComment.trim() || 'Corrections made as requested.',
          }),
        })

        const transData = await transRes.json().catch(() => ({}))
        if (!transRes.ok) {
          setError(
            transData.error ||
              'Changes saved, but resubmission failed. You can resubmit from the request details page.'
          )
          setIsSubmitting(false)
          return
        }
      }

      router.push(`/minta/requests/${requestId}`)
      router.refresh()
    } catch {
      setError('Network error. Failed to save requisition.')
      setIsSubmitting(false)
    }
  }

  const isSentBack = status === 'sent_back'

  return (
    <div className="space-y-6">
      {/* Sent Back Banner */}
      {isSentBack && sendBackInfo && (
        <section className="rounded-2xl border-2 border-orange-500/40 bg-orange-500/[0.06] p-4 sm:p-5 text-foreground shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400">
              <RotateCcw size={20} />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-orange-500/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">
                  Returned for Corrections
                </span>
                {sendBackInfo.performer_name && (
                  <span className="text-xs font-medium text-muted-foreground">
                    by <span className="font-semibold text-foreground">{sendBackInfo.performer_name}</span> (Project Lead)
                  </span>
                )}
              </div>
              {sendBackInfo.comment && (
                <div className="mt-2 rounded-xl border border-orange-500/20 bg-background/80 p-3 text-sm text-foreground">
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400 mb-0.5">
                    Reviewer Feedback:
                  </p>
                  <p className="italic text-foreground">"{sendBackInfo.comment}"</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground pt-1">
                Make your edits below. Once finished, click{' '}
                <strong className="text-foreground">Save & Resubmit to Project Lead</strong> to resume approval.
              </p>
            </div>
          </div>
        </section>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/[0.08] px-4 py-3 text-sm font-medium text-destructive">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Requisition Details */}
      <Panel title="Requisition Details" icon={<FileText size={16} />}>
        <div className="space-y-4">
          <Field label="Requisition Purpose">
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              required
              placeholder="e.g. Foundation excavation and drainage pipe installation"
              className="h-11"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Project Site">
              <div className="relative">
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select project site…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.code ? `(${p.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </Field>

            <Field label="Department">
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </Panel>

      {/* Material & Labour Lines */}
      <Panel
        title={`Requisition Lines (${lines.length})`}
        icon={<Package size={16} />}
        action={
          <Button type="button" variant="outline" size="sm" onClick={addLine} className="gap-1.5 h-8 text-xs font-semibold">
            <Plus size={13} /> Add Line
          </Button>
        }
      >
        <div className="space-y-4">
          {lines.map((line, index) => {
            const lumpSum = isLumpSum(line)
            const currentTotal = lineTotal(line)

            return (
              <div
                key={line.id}
                className="rounded-xl border border-border bg-card/60 p-4 transition-all hover:border-ring/50 space-y-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                      {index + 1}
                    </span>

                    {/* Category Toggle */}
                    <div className="inline-flex rounded-lg border border-input bg-muted/40 p-0.5">
                      <button
                        type="button"
                        onClick={() => setLineCategory(line.id, 'material')}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          line.category === 'material'
                            ? 'bg-card text-foreground shadow-sm font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Package size={12} /> Material
                      </button>
                      <button
                        type="button"
                        onClick={() => setLineCategory(line.id, 'labour')}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          line.category === 'labour'
                            ? 'bg-card text-foreground shadow-sm font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Users size={12} /> Labour
                      </button>
                      <button
                        type="button"
                        onClick={() => setLineCategory(line.id, 'other')}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          line.category === 'other'
                            ? 'bg-card text-foreground shadow-sm font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Receipt size={12} /> Other
                      </button>
                    </div>

                    {line.category === 'labour' && (
                      <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none ml-1">
                        <input
                          type="checkbox"
                          checked={line.isSubcontractor}
                          onChange={(e) => updateLine(line.id, { isSubcontractor: e.target.checked })}
                          className="rounded border-input text-primary focus:ring-primary"
                        />
                        <span>Sub-contracted</span>
                      </label>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold tabular-nums text-foreground">
                      {formatGHS(currentTotal)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      title="Remove this line"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-6">
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Description <span className="text-destructive">*</span>
                      </label>
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(line.id, { description: e.target.value })}
                        placeholder={
                          line.category === 'labour'
                            ? 'e.g. Masonry work for perimeter wall'
                            : line.category === 'other'
                              ? 'e.g. Environmental EPA permit fee'
                              : 'e.g. High Tensile Steel 16mm'
                        }
                        className="h-10 text-sm"
                        required
                      />
                    </div>

                    {!lumpSum ? (
                      <>
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Qty</label>
                          <Input
                            type="number"
                            min="0.001"
                            step="any"
                            value={line.quantity}
                            onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                            placeholder="1"
                            className="h-10 text-sm"
                            required
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Unit</label>
                          <select
                            value={line.unit}
                            onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                            className="h-10 w-full rounded-lg border border-input bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Rate (GHS)</label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })}
                            placeholder="0.00"
                            className="h-10 text-sm"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="sm:col-span-6">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Amount (GHS)</label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })}
                          placeholder="0.00"
                          className="h-10 text-sm"
                          required
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-5">
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">{line.category === 'material' && Number(line.unitPrice) > 0 ? 'Supplier (required once priced)' : 'Supplier (optional)'}</label>
                      <SupplierPicker
                        value={line.supplierId}
                        suppliers={suppliers}
                        onChange={(sid) => updateLine(line.id, { supplierId: sid })}
                        onCreated={registerSupplier}
                        compact
                      />
                    </div>
                    <div className="sm:col-span-7">
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Remarks / Specifications</label>
                      <Input
                        value={line.remarks}
                        onChange={(e) => updateLine(line.id, { remarks: e.target.value })}
                        placeholder="Specifications, supplier quotes, or site delivery location"
                        className="h-10 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={addLine} className="gap-1.5 w-full sm:w-auto">
              <Plus size={14} /> Add another line item
            </Button>

            <div className="flex items-baseline gap-3 rounded-xl border border-border bg-card px-4 py-2.5 w-full sm:w-auto justify-between sm:justify-end">
              <span className="text-xs text-muted-foreground">
                Total ({filledLinesCount} item{filledLinesCount === 1 ? '' : 's'}):
              </span>
              <span className="text-lg font-bold tabular-nums text-foreground">{formatGHS(grandTotal)}</span>
            </div>
          </div>
        </div>
      </Panel>

      {/* General Notes */}
      <Panel title="General Notes & Justification">
        <Field label="Notes for Reviewers">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="resize-none"
            placeholder="Add any additional context, justification or instructions for the project lead and review team…"
          />
        </Field>
      </Panel>

      {/* Supporting documents */}
      <Panel title="Supporting Documents" icon={<Paperclip size={16} />}>
        <div className="space-y-3">
          {attachments.length > 0 && (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {attachments.map((att) => {
                const removed = removedIds.has(att.id)
                return (
                  <li key={att.id} className="flex items-center gap-2.5 px-3 py-2.5">
                    <FileText size={14} className="shrink-0 text-muted-foreground" />
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        removed ? 'text-muted-foreground line-through' : 'text-foreground'
                      }`}
                    >
                      {att.file_name}
                    </span>
                    {!removed && (
                      <button
                        type="button"
                        onClick={() => openDocument(att.file_url)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                        aria-label={`Open ${att.file_name}`}
                      >
                        <ExternalLink size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleRemoved(att.id)}
                      disabled={isSubmitting}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                      aria-label={removed ? `Keep ${att.file_name}` : `Remove ${att.file_name}`}
                      title={removed ? 'Keep' : 'Remove on save'}
                    >
                      {removed ? <Undo2 size={14} /> : <Trash2 size={14} />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <label className="flex min-h-[104px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-5 text-center transition-colors hover:bg-muted/40">
            <input
              type="file"
              multiple
              disabled={isSubmitting}
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
              className="sr-only"
            />
            <Paperclip size={18} className="text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Attach quotes, invoices or photos</span>
            <span className="text-xs text-muted-foreground">Tap to choose files · uploaded when you save</span>
          </label>

          {files.length > 0 && (
            <ul className="space-y-2">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-background/40 px-3 py-2.5"
                >
                  <Paperclip size={14} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{f.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles((list) => list.filter((_, idx) => idx !== i))}
                    disabled={isSubmitting}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {uploading && (
            <p className="text-xs font-medium text-muted-foreground">
              Uploading {uploading.index + 1} of {uploading.total} · {uploading.percent}%
            </p>
          )}
        </div>
      </Panel>

      {/* Resubmission Comment (when sent back) */}
      {isSentBack && (
        <Panel title="Resubmission Note for Project Lead" icon={<RotateCcw size={16} className="text-orange-500" />}>
          <Field label="Explanation of Changes">
            <Textarea
              value={resubmitComment}
              onChange={(e) => setResubmitComment(e.target.value)}
              rows={2}
              className="resize-none"
              placeholder="e.g. Adjusted cement quantities to 50 bags and added specification notes as requested."
            />
            <p className="mt-1 text-xs text-muted-foreground">
              This note will be attached to the approval history and emailed to the Project Lead upon resubmission.
            </p>
          </Field>
        </Panel>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/minta/requests/${requestId}`)}
          disabled={isSubmitting}
        >
          Cancel
        </Button>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          {/* Save Changes button */}
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => handleSave(false)}
            className="w-full sm:w-auto gap-2"
          >
            {isSubmitting && submitMode === 'save' ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            Save Changes
          </Button>

          {/* If sent back, provide immediate Save & Resubmit */}
          {isSentBack && (
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSave(true)}
              className="w-full sm:w-auto gap-2 bg-primary font-semibold shadow-sm hover:opacity-90"
            >
              {isSubmitting && submitMode === 'resubmit' ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Send size={15} />
              )}
              Save & Resubmit to Project Lead
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
