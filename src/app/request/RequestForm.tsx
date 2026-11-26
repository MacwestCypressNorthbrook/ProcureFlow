'use client'

import { lineNeedsSupplier, supplierRequiredMessage } from '@/lib/supplier-rule'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import FormErrorBanner from '@/components/shared/FormErrorBanner'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import SupplierPicker, { type SupplierOption } from '@/components/shared/SupplierPicker'
import { uploadDocument } from '@/lib/upload-client'
import type { Project } from '@/lib/types'
import {
  AlertTriangle,
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

function Label({
  children,
  required,
  htmlFor,
  id,
}: {
  children: React.ReactNode
  required?: boolean
  htmlFor?: string
  id?: string
}) {
  return (
    <label htmlFor={htmlFor} id={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
      {required && (
        <span aria-hidden="true" className="ml-0.5 text-destructive">
          *
        </span>
      )}
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
    : 'inline-flex h-9 pointer-coarse:h-11 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors'
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
  const fid = useId()
  const lineFieldId = (i: number, field: string) => `${fid}-line-${i}-${field}`

  const [suppliers, setSuppliers] = useState<SupplierOption[]>(initialSuppliers)
  const [projectId, setProjectId] = useState(projects.length === 1 ? projects[0].id : '')
  const [department, setDepartment] = useState(requester.department || 'Operations')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  // The first line renders on the server too, so its id must be deterministic
  // (nextId mixes a module counter and Date.now(), which differ server vs client).
  // Lines added later are created only in the browser and can use nextId.
  const [lines, setLines] = useState<Line[]>(() => [{ ...blankLine(), id: 'line-initial' }])
  const [collapsedLines, setCollapsedLines] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])
  /**
   * Which of the chosen files are supplier invoices.
   *
   * Tracked by a key off the file itself, not by position, so ticking one and
   * then removing another above it does not move the tick. Asked here because
   * a filename cannot be trusted to say it: most invoices on site are
   * photographed, and arrive called `IMG_0985.png`.
   */
  const [invoiceKeys, setInvoiceKeys] = useState<Set<string>>(new Set())
  const fileKey = (f: File) => `${f.name}:${f.size}:${f.lastModified}`
  const [notifyEmail, setNotifyEmail] = useState(requester.email)

  const [submitting, setSubmittingState] = useState(false)
  // State alone is not a lock: two clicks in the same frame both see it false.
  const submitLock = useRef(false)
  const setSubmitting = (value: boolean) => {
    submitLock.current = value
    setSubmittingState(value)
  }
  const [uploading, setUploading] = useState<{ index: number; total: number; percent: number } | null>(null)
  const [submitted, setSubmitted] = useState<{ total: number; lines: number; requestId: string | null } | null>(null)
  /** Files that did not attach after the requisition saved, so they can be retried. */
  const [failedUploads, setFailedUploads] = useState<File[]>([])
  const [retrying, setRetrying] = useState(false)
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

  /**
   * Uploads one file and records it against the requisition. Throws if either
   * the transfer or the attachment record fails, so the caller can keep it for a retry.
   */
  const uploadAttachment = async (
    requestId: string,
    file: File,
    onProgress?: (percent: number) => void
  ) => {
    // Straight to storage where possible, so a weak connection retries
    // one file instead of losing the whole batch.
    const uploaded = await uploadDocument(file, { scope: `request-docs/${requestId}`, onProgress })

    const isInvoice = invoiceKeys.has(fileKey(file))
    let res: Response
    if (uploaded.viaServer) {
      const form = new FormData()
      form.append('file', file)
      form.append('is_invoice', isInvoice ? 'true' : 'false')
      res = await fetch(`/api/requests/${requestId}/attachments`, { method: 'POST', body: form })
    } else {
      res = await fetch(`/api/requests/${requestId}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: uploaded.fileName,
          file_url: uploaded.key,
          file_size: uploaded.fileSize,
          file_type: uploaded.contentType,
          is_invoice: isInvoice,
        }),
      })
    }
    if (!res.ok) throw new Error(`Attachment could not be recorded (${res.status})`)
  }

  const retryFailedUploads = async () => {
    const requestId = submitted?.requestId
    if (!requestId || retrying || failedUploads.length === 0) return
    setRetrying(true)
    const stillFailed: File[] = []
    for (const file of failedUploads) {
      try {
        await uploadAttachment(requestId, file)
        // Drop each file from the warning as soon as it lands.
        setFailedUploads((list) => list.filter((f) => f !== file))
      } catch (uploadErr) {
        console.error('Attachment retry failed:', uploadErr)
        stillFailed.push(file)
      }
    }
    setFailedUploads(stillFailed)
    setRetrying(false)
  }

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
    // A sub-contractor's amount may be zero (agreed later, or covered elsewhere); an expense may not.
    const noAmount = payloadLines.find((l) =>
      l.category === 'labour' && l.isSubcontractor ? Number(l.unitPrice) < 0 : isLumpSum(l) && !(Number(l.unitPrice) > 0)
    )
    if (noAmount) {
      setError(
        noAmount.isSubcontractor
          ? 'A sub-contractor amount cannot be negative.'
          : 'Every expense line needs an amount greater than zero.'
      )
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
      // not discard a requisition that already saved, but it must be reported.
      const requestId: string | null = payload.data?.id ?? null
      const failed: File[] = []
      if (files.length > 0) {
        if (!requestId) {
          failed.push(...files)
        } else {
          for (const [index, file] of files.entries()) {
            setUploading({ index, total: files.length, percent: 0 })
            try {
              await uploadAttachment(requestId, file, (percent: number) =>
                setUploading({ index, total: files.length, percent })
              )
            } catch (uploadErr) {
              console.error('Attachment upload failed:', uploadErr)
              failed.push(file)
            }
          }
          setUploading(null)
        }
      }

      setFailedUploads(failed)
      setSubmitted({ total: grandTotal, lines: payloadLines.length, requestId })
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
              <dd className="text-sm font-semibold text-foreground">
                {files.length - failedUploads.length}
                {failedUploads.length > 0 ? ` of ${files.length}` : ''}
              </dd>
            </div>
          )}
        </dl>
        {failedUploads.length > 0 && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-left"
          >
            <p className="flex items-start gap-2 text-sm font-semibold text-destructive">
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              The requisition was submitted, but {failedUploads.length === 1 ? 'this file was' : 'these files were'} not
              attached:
            </p>
            <ul className="mt-2 space-y-1 pl-6 text-sm text-foreground">
              {failedUploads.map((f, i) => (
                <li key={`${fileKey(f)}-${i}`} className="list-disc break-all">
                  {f.name}
                </li>
              ))}
            </ul>
            {submitted.requestId ? (
              <button
                type="button"
                onClick={retryFailedUploads}
                disabled={retrying}
                className="mt-3 inline-flex h-11 items-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                {retrying && <Loader2 size={16} aria-hidden="true" className="animate-spin" />}
                {retrying ? 'Retrying…' : 'Retry upload'}
              </button>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Open the requisition from your dashboard to add them.
              </p>
            )}
          </div>
        )}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              setSubmitted(null)
              setLines([blankLine()])
              setNotes('')
              setFiles([])
              setFailedUploads([])
              setInvoiceKeys(new Set())
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
    <form onSubmit={handleSubmit} className="pb-28">
      <div className="w-full space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <FormErrorBanner message={error} />

        {/* Requester — prefilled, read-only */}
        {/* One line, not a card: it confirms who is raising the request without
            pushing the form below the fold on a phone. The email is already in
            "Send status updates to", so it only shows where there is room. */}
        <section aria-label="Requester" className="flex items-center gap-2.5 px-1">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
          >
            {(requester.name || requester.email).slice(0, 2).toUpperCase()}
          </span>
          <p className="min-w-0 truncate text-sm text-muted-foreground">
            Requesting as{' '}
            <span className="font-semibold text-foreground">{requester.name || 'Unnamed user'}</span>
            <span className="hidden sm:inline"> · {requester.email}</span>
          </p>
        </section>

        {/* Context */}
        <section className="surface rounded-xl p-4 sm:p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <HardHat size={16} className="text-muted-foreground" />
            Site &amp; context
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="sm:col-span-2">
              <Label required={projects.length > 0} htmlFor={`${fid}-project`}>Project site</Label>
              {projects.length > 0 ? (
                <select
                  id={`${fid}-project`}
                  aria-required="true"
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
              <Label htmlFor={`${fid}-department`}>Department</Label>
              <select
                id={`${fid}-department`}
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
              <Label htmlFor={`${fid}-date`}>Date</Label>
              <input id={`${fid}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
          </div>
        </section>

        {/* Materials */}
        <section className="surface rounded-xl p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText size={16} className="text-muted-foreground" />
              Materials &amp; Labour
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                {lines.length}
              </span>
            </h2>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex h-10 pointer-coarse:h-11 items-center gap-1.5 rounded-lg border border-input bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
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
                      aria-expanded={lines.length > 1 ? !isCollapsed : undefined}
                      className="flex min-h-9 min-w-0 flex-1 items-center gap-2 text-left pointer-coarse:min-h-11"
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
                      className="flex h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remove item ${i + 1}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {!isCollapsed && (
                    // Container query, not viewport: the card is narrow on a phone
                    // but ~580px beside the sidebar at 1024, where one field per
                    // row made each line ~720px tall.
                    <div className="@container space-y-4">
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
                        <Label required htmlFor={lineFieldId(i, 'description')}>
                          {line.category === 'other'
                            ? 'Expense description'
                            : line.category === 'labour'
                              ? line.isSubcontractor
                                ? 'Service rendered'
                                : 'Labour description'
                              : 'Material description'}
                        </Label>
                        <textarea
                          id={lineFieldId(i, 'description')}
                          aria-required="true"
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

                      <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3">
                      {!isLumpSum(line) && (
                        <>
                          <div>
                            <Label required htmlFor={lineFieldId(i, 'quantity')}>Quantity</Label>
                            <input
                              id={lineFieldId(i, 'quantity')}
                              aria-required="true"
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
                            <Label htmlFor={lineFieldId(i, 'unit')}>Unit</Label>
                            <select
                              id={lineFieldId(i, 'unit')}
                              value={line.unit}
                              onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                              className={`${inputClass} appearance-none`}
                            >
                              {UNITS.map((u) => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}

                      <div className="col-span-2 @lg:col-span-1">
                        <Label required={line.category === 'other'} htmlFor={lineFieldId(i, 'price')}>
                          {isLumpSum(line) ? 'Amount (GHS)' : 'Unit price (GHS)'}
                        </Label>
                        <input
                          id={lineFieldId(i, 'price')}
                          aria-required={line.category === 'other'}
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
                      </div>

                      {line.isSubcontractor && (
                        <div>
                          <Label htmlFor={lineFieldId(i, 'scope')}>Scope / supporting detail (optional)</Label>
                          <textarea
                            id={lineFieldId(i, 'scope')}
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

                      <div className="grid gap-4 @lg:grid-cols-2">
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
                        <Label htmlFor={lineFieldId(i, 'remarks')}>Remarks</Label>
                        <input
                          id={lineFieldId(i, 'remarks')}
                          value={line.remarks}
                          onChange={(e) => updateLine(line.id, { remarks: e.target.value })}
                          placeholder="Optional note"
                          className={inputClass}
                        />
                      </div>
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
                    <th className="w-28 px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Description</th>
                    <th className="w-24 px-3 py-2.5 2xl:w-28">Qty</th>
                    <th className="w-24 px-3 py-2.5">Unit</th>
                    <th className="w-28 px-3 py-2.5">Unit price / amount</th>
                    <th className="w-44 px-3 py-2.5">Supplier</th>
                    <th className="w-28 px-3 py-2.5 text-right">Total</th>
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
                        {/* One row that grows with the text (field-sizing: content),
                            so long descriptions wrap instead of being clipped in
                            the narrow grid column. Older browsers keep one row and scroll. */}
                        <textarea
                          rows={1}
                          value={line.description}
                          onChange={(e) => updateLine(line.id, { description: e.target.value })}
                          aria-label={`Line ${i + 1} description`}
                          aria-required="true"
                          placeholder={
                            line.category === 'other'
                              ? 'e.g. Site permit fees — district assembly'
                              : line.category === 'labour'
                                ? line.isSubcontractor
                                  ? 'e.g. Electrical first fix — Block B, per signed scope'
                                  : 'e.g. Mason & 2 labourers — foundation blockwork'
                                : 'e.g. Iron rods 12mm, high tensile'
                          }
                          className="block min-h-10 max-h-[7lh] w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm leading-5 text-foreground [field-sizing:content] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <input
                          value={line.remarks}
                          onChange={(e) => updateLine(line.id, { remarks: e.target.value })}
                          placeholder="Remarks (optional)"
                          aria-label={`Line ${i + 1} remarks`}
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
                            aria-label={`Line ${i + 1} quantity`}
                            aria-required="true"
                            className="h-10 w-full min-w-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none rounded-lg border border-input bg-card px-2.5 text-sm tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        )}
                      </td>
                      {!isLumpSum(line) && (
                        <td className="px-2 py-2">
                          <select
                            value={line.unit}
                            onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                            aria-label={`Line ${i + 1} unit`}
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
                          aria-label={isLumpSum(line) ? `Line ${i + 1} amount` : `Line ${i + 1} unit price`}
                          aria-required={line.category === 'other'}
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
                {/* No total row here: the pinned action bar already shows the
                    total cost, always in view — one place for that figure. */}
              </table>
            </div>
          </div>
        </section>

        {/* Notes & attachments */}
        <section className="surface rounded-xl p-4 sm:p-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <div>
              <Label htmlFor={`${fid}-notes`}>Justification / notes</Label>
              <textarea
                id={`${fid}-notes`}
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
                      <label
                        className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        title="Tick if this file is a supplier invoice, so it reaches the Invoices report whatever it is called"
                      >
                        <input
                          type="checkbox"
                          checked={invoiceKeys.has(fileKey(f))}
                          onChange={(e) =>
                            setInvoiceKeys((prev) => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(fileKey(f))
                              else next.delete(fileKey(f))
                              return next
                            })
                          }
                          className="h-3.5 w-3.5 rounded border-input accent-primary"
                        />
                        Invoice
                      </label>
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
            <Label htmlFor={`${fid}-notify-email`}>Send status updates to</Label>
            <input
              id={`${fid}-notify-email`}
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
        Action bar, pinned for every screen size.
        - Touch: sits on top of the mobile tab bar (`--pf-tabbar-h`) instead of
          covering it, so navigation stays reachable from the form.
        - Pointer ≥ md: starts at the sidebar column (`--pf-rail-w`, published
          by DashboardLayout) so it follows the open/collapsed rail.
        - One row at every width, so it costs ~70px of a phone screen, not ~110px.
      */}
      <div className="fixed inset-x-0 bottom-[calc(var(--pf-tabbar-h,0px)+env(safe-area-inset-bottom,0px))] z-40 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-6 pointer-fine:md:bottom-0 pointer-fine:md:left-[var(--pf-rail-w,0px)] pointer-fine:md:pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-8">
        <div className="flex items-center justify-between gap-3 sm:gap-6">
          {/* Label stacks over the amount until lg: beside the sidebar at md the
              bar is only ~470px wide and the inline version wrapped into Cancel. */}
          <div className="flex min-w-0 flex-col whitespace-nowrap lg:flex-row lg:items-baseline lg:gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">Total cost</span>
            <span className="text-lg font-semibold tabular-nums text-foreground sm:text-xl">{ghs(grandTotal)}</span>
            <span className="hidden text-xs text-muted-foreground lg:inline">
              {filledLines} of {lines.length} line{lines.length === 1 ? '' : 's'} filled
              {files.length > 0 ? ` · ${files.length} attachment${files.length === 1 ? '' : 's'}` : ''}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(dashboardPath)}
              className="hidden h-11 whitespace-nowrap rounded-lg px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex sm:items-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-5 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 sm:h-11 sm:px-6 sm:text-sm"
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
