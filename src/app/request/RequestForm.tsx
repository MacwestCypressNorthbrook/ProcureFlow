'use client'

import { lineNeedsSupplier, supplierRequiredMessage } from '@/lib/supplier-rule'
import { useEffect, useMemo, useRef, useState } from 'react'
import FormErrorBanner from '@/components/shared/FormErrorBanner'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import SupplierPicker, { type SupplierOption } from '@/components/shared/SupplierPicker'
import { uploadDocument } from '@/lib/upload-client'
import type { Project } from '@/lib/types'
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  HardHat,
  Info,
  Loader2,
  Package,
  Paperclip,
  Receipt,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react'

const ghs = (n: number) =>
  new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', minimumFractionDigits: 2 }).format(n || 0)

const MATERIAL_UNITS = ['pcs', 'bags', 'tonnes', 'kg', 'litres', 'm', 'm²', 'm³', 'rolls', 'trips', 'lumpsum']
const LABOUR_UNITS = ['man-days', 'days', 'hours', 'trips', 'lumpsum']
const UNITS = Array.from(new Set([...MATERIAL_UNITS, ...LABOUR_UNITS]))

const DEPARTMENTS = ['Operations', 'Site Works', 'Finance', 'Administration', 'HR', 'IT', 'Procurement']

type LineCategory = 'material' | 'labour' | 'other'

let seq = 0
const nextId = () => `line-${++seq}-${Date.now()}`

interface Line {
  id: string
  category: LineCategory
  /** Labour rendered by a sub-contractor: a lump-sum service, not qty x rate. */
  isSubcontractor: boolean
  /** What the sub-contractor delivered. Optional. */
  subcontractorNote: string
  description: string
  quantity: string
  unit: string
  unitPrice: string
  supplierId: string | null
  remarks: string
}

const blankLine = (): Line => ({
  id: nextId(),
  category: 'material',
  isSubcontractor: false,
  subcontractorNote: '',
  description: '',
  quantity: '1',
  unit: 'pcs',
  unitPrice: '',
  supplierId: null,
  remarks: '',
})

/** Sub-contracted services and other expenses are a single agreed amount. */
const isLumpSum = (l: Line) => l.category === 'other' || (l.category === 'labour' && l.isSubcontractor)

const lineTotal = (l: Line) =>
  isLumpSum(l) ? Number(l.unitPrice) || 0 : (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)

/* ── Small field primitives, sized for thumbs ───────────────────────────── */

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
      {required && <span className="ml-0.5 text-destructive">*</span>}
    </label>
  )
}

/* `text-base` on mobile is deliberate: anything smaller makes iOS Safari zoom
   the viewport when the field takes focus. */
const fieldClass =
  'w-full rounded-lg border border-input bg-card px-3.5 text-base text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm'
const inputClass = `${fieldClass} h-12 sm:h-11`

/** What the line is being raised for. */
function CategoryToggle({
  value,
  onChange,
  compact = false,
}: {
  value: LineCategory
  onChange: (category: LineCategory) => void
  compact?: boolean
}) {
  const base = compact
    ? 'inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium transition-colors'
    : 'inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors'
  const options: Array<{ id: LineCategory; label: string; Icon: typeof Package }> = [
    { id: 'material', label: 'Material', Icon: Package },
    { id: 'labour', label: 'Labour', Icon: Users },
    { id: 'other', label: 'Other', Icon: Receipt },
  ]
  return (
    <div className={`inline-flex rounded-lg border border-input bg-muted/40 p-0.5 ${compact ? '' : 'w-full'}`}>
      {options.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          className={`${base} ${value === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
        >
          <Icon size={compact ? 12 : 14} /> {label}
        </button>
      ))}
    </div>
  )
}

export default function RequestForm({
  requester,
  projects,
  suppliers: initialSuppliers,
  dashboardPath = '/minta',
}: {
  requester: { name: string; email: string; department?: string | null }
  projects: Project[]
  suppliers: SupplierOption[]
  dashboardPath?: string
}) {
  const router = useRouter()

  const [suppliers, setSuppliers] = useState<SupplierOption[]>(initialSuppliers)
  const [projectId, setProjectId] = useState(projects.length === 1 ? projects[0].id : '')
  const [department, setDepartment] = useState(requester.department || 'Operations')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<Line[]>([blankLine()])
  const [collapsedLines, setCollapsedLines] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [notifyEmail, setNotifyEmail] = useState(requester.email)

  const [submitting, setSubmittingState] = useState(false)
  // State alone is not a lock: two clicks in the same frame both see it false.
  const submitLock = useRef(false)
  const setSubmitting = (value: boolean) => {
    submitLock.current = value
    setSubmittingState(value)
  }
  const [uploading, setUploading] = useState<{ index: number; total: number; percent: number } | null>(null)
  const [submitted, setSubmitted] = useState<{ total: number; lines: number } | null>(null)
  const [error, setError] = useState('')
  // The line a supplier error is about, so it can be taken to and outlined.
  const [errorLineId, setErrorLineId] = useState<string | null>(null)

  const grandTotal = useMemo(() => lines.reduce((sum, l) => sum + lineTotal(l), 0), [lines])
  const filledLines = lines.filter((l) => l.description.trim()).length

  const updateLine = (id: string, patch: Partial<Line>) => {
    if (patch.supplierId) setErrorLineId((current) => (current === id ? null : current))
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  // Take the engineer to the line the error is about. Both the card and the
  // table row exist in the page (one is hidden by breakpoint), so pick the visible one.
  useEffect(() => {
    if (!errorLineId) return
    // The supplier field itself, not the card around it: on a phone the card is
    // taller than the screen, and centring it can leave the field out of sight.
    const visible = (selector: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).find((el) => el.offsetParent !== null)
    const target = visible(`[data-line-error="${errorLineId}"]`) ?? visible(`[data-line="${errorLineId}"]`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [errorLineId])

  // Switching category nudges the unit toward what that category usually
  // needs, but only when the engineer hasn't already picked something else.
  const setLineCategory = (id: string, category: LineCategory) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.id !== id) return l
        const next = { ...l, category }
        // An expense is one amount, so it stops carrying a meaningful quantity.
        if (category === 'other') return { ...next, isSubcontractor: false, quantity: '1', unit: 'lumpsum' }
        if (category === 'material') next.isSubcontractor = false
        const defaultUnitStale = l.unit === 'pcs' || l.unit === 'man-days' || l.unit === 'lumpsum'
        if (defaultUnitStale) next.unit = category === 'labour' ? 'man-days' : 'pcs'
        return next
      })
    )

  /** Sub-contracted labour switches the same line to a single agreed amount. */
  const setSubcontractor = (id: string, on: boolean) =>
    setLines((ls) =>
      ls.map((l) =>
        l.id === id
          ? {
            ...l,
            isSubcontractor: on,
            quantity: on ? '1' : l.quantity,
            unit: on ? 'lumpsum' : l.unit === 'lumpsum' ? 'man-days' : l.unit,
            subcontractorNote: on ? l.subcontractorNote : '',
          }
          : l
      )
    )

  const addLine = () =>
    setLines((ls) => {
      // Collapsing what's already there before adding a blank one keeps the
      // card the engineer is about to fill the only one open on a phone screen.
      setCollapsedLines((prev) => new Set([...prev, ...ls.map((l) => l.id)]))
      return [...ls, blankLine()]
    })

  const removeLine = (id: string) =>
    setLines((ls) => (ls.length === 1 ? [blankLine()] : ls.filter((l) => l.id !== id)))

  const toggleCollapsed = (id: string) =>
    setCollapsedLines((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const registerSupplier = (s: SupplierOption) =>
    setSuppliers((list) => (list.some((x) => x.id === s.id) ? list : [...list, s].sort((a, b) => a.name.localeCompare(b.name))))

  const addFiles = (incoming: FileList | null) => {
    if (incoming) setFiles((f) => [...f, ...Array.from(incoming)])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitLock.current) return
    setError('')
    setErrorLineId(null)

    const payloadLines = lines.filter((l) => l.description.trim())
    if (payloadLines.length === 0) {
      setError('Add at least one material or labour line with a description.')
      return
    }
    if (projects.length > 0 && !projectId) {
      setError('Select the project site this requisition is for.')
      return
    }
    const noQty = payloadLines.find((l) => !isLumpSum(l) && !(Number(l.quantity) > 0))
    if (noQty) {
      setError('Every material and labour line needs a quantity greater than zero.')
      return
    }
    const noAmount = payloadLines.find((l) => isLumpSum(l) && !(Number(l.unitPrice) > 0))
    if (noAmount) {
      setError('Every expense and sub-contractor line needs an amount greater than zero.')
      return
    }

    const unsourced = payloadLines.find(
      (l) => !l.supplierId && lineNeedsSupplier({ category: l.category, quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0 })
    )
    if (unsourced) {
      setError(supplierRequiredMessage(unsourced.description))
      setErrorLineId(unsourced.id)
      setCollapsedLines((prev) => {
        const next = new Set(prev)
        next.delete(unsourced.id)
        return next
      })
      return
    }

    setSubmitting(true)

    const project = projects.find((p) => p.id === projectId)
    const first = payloadLines[0].description.trim()
    const purpose = payloadLines.length > 1 ? `${first} + ${payloadLines.length - 1} more` : first

    // The JSON document mirrors the sheet as submitted. It is what purchase
    // orders carry forward at conversion, so it stays self-contained even
    // though request_items is the queryable record.
    const document = {
      type: 'rich_requisition',
      header: { docTitle: 'REQUISITION FORM', docNo: 'MACWL-IMS-A-RF-001', version: '1.0', page: 'Page 1 of 1' },
      details: {
        name: requester.name,
        department,
        project: project ? [project.name, project.code].filter(Boolean).join(' · ') : '',
        date,
      },
      items: payloadLines.map((l) => ({
        category: l.category,
        isSubcontractor: l.isSubcontractor,
        description: l.description.trim(),
        quantity: Number(l.quantity) || 0,
        unit: l.unit,
        unitPrice: Number(l.unitPrice) || 0,
        amount: lineTotal(l),
        supplierName: suppliers.find((s) => s.id === l.supplierId)?.name ?? '',
        remarks: l.remarks.trim(),
      })),
      signatures: { requestedBy: requester.name, headOfDept: '', approvedBy: '', paidBy: '' },
      generalNotes: notes.trim(),
    }

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose: purpose.length > 90 ? `${purpose.slice(0, 87)}…` : purpose,
          description: JSON.stringify(document),
          department,
          project_id: projectId || null,
          currency: 'GHS',
          guest_name: requester.name,
          guest_email: notifyEmail.trim() || null,
          items: payloadLines.map((l) => ({
            category: l.category,
            isSubcontractor: l.isSubcontractor,
            description: l.description.trim(),
            // A lump-sum line carries its whole value in unitPrice.
            quantity: isLumpSum(l) ? 1 : Number(l.quantity) || 0,
            unit: isLumpSum(l) ? 'lumpsum' : l.unit,
            unitPrice: Number(l.unitPrice) || 0,
            supplierId: l.supplierId,
            remarks: [l.remarks.trim(), l.subcontractorNote.trim()].filter(Boolean).join(' — '),
          })),
        }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'Could not submit the requisition. Please try again.')
        setSubmitting(false)
        return
      }

      // Attachments upload after the requisition exists; a failure here must
      // not discard a requisition that already saved.
      if (files.length > 0 && payload.data?.id) {
        const requestId = payload.data.id
        for (const [index, file] of files.entries()) {
          setUploading({ index, total: files.length, percent: 0 })
          try {
            // Straight to storage where possible, so a weak connection retries
            // one file instead of losing the whole batch.
            const uploaded = await uploadDocument(file, {
              scope: `request-docs/${requestId}`,
              onProgress: (percent: number) =>
                setUploading({ index, total: files.length, percent }),
            })

            if (uploaded.viaServer) {
              const form = new FormData()
              form.append('file', file)
              await fetch(`/api/requests/${requestId}/attachments`, { method: 'POST', body: form })
            } else {
              await fetch(`/api/requests/${requestId}/attachments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  file_name: uploaded.fileName,
                  file_url: uploaded.key,
                  file_size: uploaded.fileSize,
                  file_type: uploaded.contentType,
                }),
              })
            }
          } catch (uploadErr) {
            console.error('Attachment upload failed:', uploadErr)
          }
        }
        setUploading(null)
      }

      setSubmitted({ total: grandTotal, lines: payloadLines.length })
    } catch {
      setError('Network error — the requisition was not submitted.')
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Success ──────────────────────────────────────────────────────────── */
  if (submitted) {
    return (
      <div className="mx-auto max-w-lg px-5 py-12 text-center">
        <CheckCircle2 size={56} className="mx-auto text-emerald-500" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">Requisition submitted</h1>
        <p className="mt-2 text-base text-muted-foreground">
          It is now queued for review. You will be notified as it moves through approval.
        </p>
        <dl className="surface mt-7 space-y-3 rounded-xl p-5 text-left">
          <div className="flex justify-between gap-4">
            <dt className="text-sm text-muted-foreground">Lines</dt>
            <dd className="text-sm font-semibold text-foreground">{submitted.lines}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-sm text-muted-foreground">Total value</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">{ghs(submitted.total)}</dd>
          </div>
          {files.length > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-sm text-muted-foreground">Attachments</dt>
              <dd className="text-sm font-semibold text-foreground">{files.length}</dd>
            </div>
          )}
        </dl>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              setSubmitted(null)
              setLines([blankLine()])
              setNotes('')
              setFiles([])
              setError('')
            }}
            className="h-12 flex-1 rounded-lg border border-input bg-card text-base font-medium text-foreground transition-colors hover:bg-muted"
          >
            Raise another
          </button>
          <Link
            href={dashboardPath}
            className="flex h-12 flex-1 items-center justify-center rounded-lg bg-primary text-base font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    )
  }

  /* ── Form ─────────────────────────────────────────────────────────────── */
  return (
    <form onSubmit={handleSubmit} className="pb-36 sm:pb-28">
      <div className="w-full space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <FormErrorBanner message={error} />

        {/* Requester — prefilled, read-only */}
        <section className="surface rounded-xl p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {(requester.name || requester.email).slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-foreground">{requester.name || 'Unnamed user'}</p>
              <p className="truncate text-sm text-muted-foreground">{requester.email}</p>
            </div>
            <span className="hidden shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground sm:inline">
              Requester
            </span>
          </div>
        </section>

        {/* Context */}
        <section className="surface rounded-xl p-4 sm:p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <HardHat size={16} className="text-muted-foreground" />
            Site &amp; context
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="sm:col-span-2">
              <Label required={projects.length > 0}>Project site</Label>
              {projects.length > 0 ? (
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className={`${inputClass} appearance-none`}
                >
                  <option value="">Select a project site…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.code ? ` · ${p.code}` : ''}
                      {p.site_location ? ` — ${p.site_location}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3.5 py-3 text-sm text-muted-foreground">
                  <Info size={15} className="mt-0.5 shrink-0" />
                  You are not assigned to any project site yet. Ask an administrator to assign you, then this
                  requisition can be tied to a site.
                </p>
              )}
            </div>

            <div>
              <Label>Department</Label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className={`${inputClass} appearance-none`}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Date</Label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
          </div>
        </section>

        {/* Materials */}
        <section className="surface rounded-xl p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText size={16} className="text-muted-foreground" />
              Materials &amp; Labour
              <span className="rounded-full bg-muted  py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                {filledLines}
              </span>
            </h2>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-input bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Plus size={15} /> Add
            </button>
          </div>

          {/* Mobile & tablet: one card per material, collapsible once there's more than one */}
          <div className="space-y-3 xl:hidden">
            {lines.map((line, i) => {
              const isCollapsed = lines.length > 1 && collapsedLines.has(line.id)
              return (
                <div
                  key={line.id}
                  data-line={line.id}
                  className={`rounded-md border bg-background/40 p-4 ${errorLineId === line.id ? 'border-destructive ring-2 ring-destructive/40' : 'border-border'}`}
                >
                  <div className={`flex items-center justify-between gap-2 ${isCollapsed ? '' : 'mb-3'}`}>
                    <button
                      type="button"
                      onClick={() => lines.length > 1 && toggleCollapsed(line.id)}
                      disabled={lines.length <= 1}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Item {i + 1}
                      </span>
                      {isCollapsed && (
                        <span className="truncate text-sm text-foreground">
                          {line.description.trim() || (line.category === 'labour' ? 'Untitled labour line' : 'Untitled material')}
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            · {line.quantity || 0} {line.unit}
                            {Number(line.unitPrice) > 0 ? ` · ${ghs(lineTotal(line))}` : ''}
                          </span>
                        </span>
                      )}
                      {lines.length > 1 && (
                        <span className="ml-auto shrink-0 text-muted-foreground">
                          {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remove item ${i + 1}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {!isCollapsed && (
                    <div className="space-y-4">
                      <CategoryToggle value={line.category} onChange={(c) => setLineCategory(line.id, c)} />

                      {line.category === 'labour' && (
                        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-input bg-muted/30 px-3.5 py-3 text-sm">
                          <input
                            type="checkbox"
                            checked={line.isSubcontractor}
                            onChange={(e) => setSubcontractor(line.id, e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                          />
                          <span className="font-medium text-foreground">
                            Rendered by a sub-contractor
                            <span className="block text-xs font-normal text-muted-foreground">
                              Charged as one agreed amount rather than a daily rate.
                            </span>
                          </span>
                        </label>
                      )}

                      <div>
                        <Label required>
                          {line.category === 'other'
                            ? 'Expense description'
                            : line.category === 'labour'
                              ? line.isSubcontractor
                                ? 'Service rendered'
                                : 'Labour description'
                              : 'Material description'}
                        </Label>
                        <textarea
                          value={line.description}
                          onChange={(e) => updateLine(line.id, { description: e.target.value })}
                          placeholder={
                            line.category === 'other'
                              ? 'e.g. Site permit fees — district assembly'
                              : line.category === 'labour'
                                ? line.isSubcontractor
                                  ? 'e.g. Electrical first fix — Block B, per signed scope'
                                  : 'e.g. Mason & 2 labourers — foundation blockwork'
                                : 'e.g. Iron rods 12mm, high tensile'
                          }
                          rows={2}
                          className={`${fieldClass} resize-none py-3`}
                        />
                      </div>

                      {!isLumpSum(line) && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label required>Quantity</Label>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="any"
                              value={line.quantity}
                              onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <Label>Unit</Label>
                            <select
                              value={line.unit}
                              onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                              className={`${inputClass} appearance-none`}
                            >
                              {UNITS.map((u) => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                      )}

                      <div>
                        <Label required={isLumpSum(line)}>
                          {isLumpSum(line) ? 'Amount (GHS)' : 'Unit price (GHS)'}
                        </Label>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          placeholder={isLumpSum(line) ? '0.00' : '0.00 (optional)'}
                          value={line.unitPrice}
                          onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })}
                          className={inputClass}
                        />
                      </div>

                      {line.isSubcontractor && (
                        <div>
                          <Label>Scope / supporting detail (optional)</Label>
                          <textarea
                            value={line.subcontractorNote}
                            onChange={(e) => updateLine(line.id, { subcontractorNote: e.target.value })}
                            placeholder="What the sub-contractor delivered, and anything the reviewers should know."
                            rows={2}
                            className={`${fieldClass} resize-none py-3`}
                          />
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            Attach the signed scope, quotation or completion certificate under Supporting documents below.
                          </p>
                        </div>
                      )}

                      <div>
                        <Label>
                          {line.category === 'other'
                            ? 'Paid to (optional)'
                            : line.isSubcontractor
                              ? 'Sub-contractor (optional)'
                              : line.category === 'labour'
                                ? 'Contractor (optional)'
                                : Number(line.unitPrice) > 0
                                  ? 'Supplier (required once priced)'
                                  : 'Supplier (optional)'}
                        </Label>
                        <SupplierPicker
                          value={line.supplierId}
                          suppliers={suppliers}
                          onChange={(supplierId) => updateLine(line.id, { supplierId })}
                          onCreated={registerSupplier}
                        />
                        {errorLineId === line.id && (
                          <p data-line-error={line.id} className="mt-1.5 text-xs font-semibold text-destructive">Choose a supplier for this line.</p>
                        )}
                      </div>

                      <div>
                        <Label>Remarks</Label>
                        <input
                          value={line.remarks}
                          onChange={(e) => updateLine(line.id, { remarks: e.target.value })}
                          placeholder="Optional note"
                          className={inputClass}
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3.5 py-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Line total
                        </span>
                        <span className="text-base font-semibold tabular-nums text-foreground">
                          {ghs(lineTotal(line))}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Desktop: spreadsheet-style grid */}
          <div className="hidden xl:block">
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full table-fixed border-collapse">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="w-10 px-3 py-2.5 text-center">#</th>
                    <th className="w-36 px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Description</th>
                    <th className="w-20 px-3 py-2.5">Qty</th>
                    <th className="w-24 px-3 py-2.5">Unit</th>
                    <th className="w-28 px-3 py-2.5">Unit price / amount</th>
                    <th className="w-44 px-3 py-2.5">Supplier</th>
                    <th className="w-32 px-3 py-2.5 text-right">Total</th>
                    <th className="w-12 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr
                      key={line.id}
                      data-line={line.id}
                      className={`border-t border-border align-top ${errorLineId === line.id ? 'bg-destructive/10 outline outline-2 -outline-offset-2 outline-destructive' : ''}`}
                    >
                      <td className="px-3 py-2.5 text-center text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-2">
                        {/* A select, not the segmented toggle: three options do not
                            fit a dense grid column without clipping their labels. */}
                        <div className="relative">
                          <select
                            value={line.category}
                            onChange={(e) => setLineCategory(line.id, e.target.value as LineCategory)}
                            aria-label={`Line ${i + 1} type`}
                            className="h-10 w-full appearance-none rounded-lg border border-input bg-card pl-2.5 pr-7 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="material">Material</option>
                            <option value="labour">Labour</option>
                            <option value="other">Other</option>
                          </select>
                          <ChevronDown
                            size={14}
                            aria-hidden="true"
                            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                          />
                        </div>
                        {line.category === 'labour' && (
                          <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={line.isSubcontractor}
                              onChange={(e) => setSubcontractor(line.id, e.target.checked)}
                              className="h-3.5 w-3.5 rounded border-input accent-primary"
                            />
                            Sub-contractor
                          </label>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={line.description}
                          onChange={(e) => updateLine(line.id, { description: e.target.value })}
                          placeholder={
                            line.category === 'other'
                              ? 'e.g. Site permit fees — district assembly'
                              : line.category === 'labour'
                                ? line.isSubcontractor
                                  ? 'e.g. Electrical first fix — Block B, per signed scope'
                                  : 'e.g. Mason & 2 labourers — foundation blockwork'
                                : 'e.g. Iron rods 12mm, high tensile'
                          }
                          className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <input
                          value={line.remarks}
                          onChange={(e) => updateLine(line.id, { remarks: e.target.value })}
                          placeholder="Remarks (optional)"
                          className="mt-1.5 h-9 w-full rounded-lg border border-transparent bg-transparent px-3 text-xs text-muted-foreground placeholder:text-muted-foreground/70 hover:border-input focus:border-input focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </td>
                      <td className="px-2 py-2" colSpan={isLumpSum(line) ? 2 : 1}>
                        {isLumpSum(line) ? (
                          <span className="inline-flex h-10 items-center text-xs text-muted-foreground">
                            Lump sum
                          </span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.quantity}
                            onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                            className="h-10 w-full rounded-lg border border-input bg-card px-2.5 text-sm tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        )}
                      </td>
                      {!isLumpSum(line) && (
                        <td className="px-2 py-2">
                          <select
                            value={line.unit}
                            onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                            className="h-10 w-full appearance-none rounded-lg border border-input bg-card px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            {UNITS.map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </td>
                      )}
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })}
                          className="h-10 w-full rounded-lg border border-input bg-card px-2.5 text-sm tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <SupplierPicker
                          compact
                          value={line.supplierId}
                          suppliers={suppliers}
                          onChange={(supplierId) => updateLine(line.id, { supplierId })}
                          onCreated={registerSupplier}
                        />
                        {errorLineId === line.id && (
                          <p data-line-error={line.id} className="mt-1.5 text-xs font-semibold text-destructive">Choose a supplier for this line.</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-foreground">
                        <span className="inline-block pt-2.5">{ghs(lineTotal(line))}</span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Remove item ${i + 1}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/50">
                    <td colSpan={7} className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Total cost
                    </td>
                    <td className="px-3 py-3 text-right text-base font-semibold tabular-nums text-foreground">
                      {ghs(grandTotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </section>

        {/* Notes & attachments */}
        <section className="surface rounded-xl p-4 sm:p-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <div>
              <Label>Justification / notes</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Why is this needed? Anything reviewers should know."
                className={`${fieldClass} resize-none py-3`}
              />
            </div>

            <div>
              <Label>Supporting documents</Label>
              <label className="flex min-h-[104px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-5 text-center transition-colors hover:bg-muted/40">
                <input
                  type="file"
                  multiple
                  onChange={(e) => addFiles(e.target.files)}
                  className="sr-only"
                />
                <Paperclip size={18} className="text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Attach quotes, invoices or photos</span>
                <span className="text-xs text-muted-foreground">Tap to choose files</span>
              </label>

              {files.length > 0 && (
                <ul className="mt-3 space-y-2">
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
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                        aria-label={`Remove ${f.name}`}
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-border pt-5">
            <Label>Send status updates to</Label>
            <input
              type="email"
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
              placeholder="you@company.com"
              className={`${inputClass} max-w-sm`}
            />
          </div>
        </section>

      </div>

      {/*
        Action bar, pinned for every screen size. `lg:left-[272px]` keeps it
        clear of the dashboard sidebar rather than spanning under it.
      */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6 lg:left-[272px] lg:px-8">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex items-baseline justify-between gap-3 sm:justify-start">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total cost</span>
            <span className="text-xl font-semibold tabular-nums text-foreground">{ghs(grandTotal)}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {filledLines} line{filledLines === 1 ? '' : 's'}
              {files.length > 0 ? ` · ${files.length} attachment${files.length === 1 ? '' : 's'}` : ''}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:shrink-0">
            <button
              type="button"
              onClick={() => router.push(dashboardPath)}
              className="hidden h-11 rounded-lg px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex sm:items-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 sm:h-11 sm:w-auto sm:px-6 sm:text-sm"
            >
              {submitting ? <Loader2 size={18} className="animate-spin sm:h-4 sm:w-4" /> : <Send size={18} className="sm:h-4 sm:w-4" />}
              {submitting
                ? uploading
                  ? `Uploading ${uploading.index + 1} of ${uploading.total} · ${uploading.percent}%`
                  : 'Submitting…'
                : 'Submit requisition'}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
