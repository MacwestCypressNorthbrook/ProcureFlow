'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, BadgeCheck, FileArchive, FileSpreadsheet, FileText, Table2 } from 'lucide-react'
import DataView, { type DataColumn, type DataFacet } from '@/components/shared/DataView'
import { cn } from '@/lib/utils'
import { buildXlsx, downloadBlob, sheet, summarize, type XlsxColumn } from '@/lib/xlsx'
import { downloadPdf, exportFilename, type ExportColumn } from '@/lib/export'
import { toCsv, downloadCsv } from '@/lib/csv'
import { downloadDocumentBundle, MAX_BUNDLE_FILES } from '@/lib/bundle-documents'
import type { AdminInvoice } from './report-types'
import ReportExportMenu, { type ReportExportOption } from './ReportExportMenu'
import {
  AttentionStrip,
  KpiRow,
  KpiTile,
  TableTray,
  compact,
  concentrationInsight,
  daysBetween,
  ghsFull,
  monthOverMonth,
  monthlySpark,
  pct,
  stableSlices,
} from '@/components/shared/dashboard/kit'
import { PixelTrend } from '@/components/shared/dashboard/time-charts'
import { BreakdownDonut, DayHistogram, DivergingBars, StackedShare, type DivergingRow } from '@/components/shared/dashboard/share-charts'

type Dimension = 'supplier' | 'project' | 'engineer'

const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: 'supplier', label: 'Supplier' },
  { value: 'project', label: 'Project' },
  { value: 'engineer', label: 'Engineer' },
]

interface InvoiceRow extends AdminInvoice {
  value: number
  project: string
  engineer: string
  month: string
  hasDocument: boolean
  /** An invoice document nobody has recorded yet: no number, no amount. */
  isDocument: boolean
  supplier: string
  /** What the row is dated by: the invoice date if recorded, else when the file arrived. */
  effectiveDate: string
  /** The invoice number if recorded, else the document's filename. */
  label: string
}

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const dateOnly = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const monthName = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const STATUS_LABEL: Record<string, string> = {
  document: 'Not recorded',
  recorded: 'Awaiting verification',
  verified: 'Verified',
}

const UNIDENTIFIED = 'Supplier not identified'

/**
 * Every supplier invoice in the system, in one place — at whatever stage it has
 * reached.
 *
 * An invoice arrives as a file, uploaded by an Engineer or by Supply Chain, and
 * becomes a record when someone keys in its number, date and amount; Cost
 * Control then verifies it against the document. All three states are rows
 * here, because a page that listed only the keyed-in records showed nothing at
 * all while the documents piled up — and an invoice the business has received
 * is an invoice whether or not anyone has typed it in yet.
 *
 * Money is counted from recorded invoices alone. An unrecorded document has no
 * amount to count, so it shows a blank rather than a zero: a zero would read as
 * a settled total, and quietly understate what is owed.
 */
export default function InvoicesReport({
  invoices,
  exportedBy,
}: {
  invoices: AdminInvoice[]
  exportedBy: string | null
}) {
  const router = useRouter()
  const rows = useMemo<InvoiceRow[]>(
    () =>
      invoices.map((inv) => {
        const isDocument = inv.kind === 'document'
        const effectiveDate = inv.invoice_date ?? inv.uploaded_at ?? inv.created_at
        const d = new Date(effectiveDate)
        return {
          ...inv,
          value: isDocument ? 0 : num(inv.amount),
          project: inv.project_name || 'Unassigned',
          engineer: inv.engineer_name || 'Unknown',
          month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          hasDocument: Boolean(inv.attachment_id),
          isDocument,
          supplier: inv.supplier_name || UNIDENTIFIED,
          effectiveDate,
          label: isDocument ? (inv.attachment_name ?? 'Invoice document') : `#${inv.invoice_number ?? '—'}`,
        }
      }),
    [invoices]
  )
  const [visible, setVisible] = useState<InvoiceRow[]>(rows)

  const stats = useMemo(() => {
    // Only recorded invoices carry money. Documents are counted as a backlog.
    const recorded = visible.filter((r) => !r.isDocument)
    const documents = visible.filter((r) => r.isDocument)
    const total = recorded.reduce((s, r) => s + r.value, 0)
    const verified = recorded.filter((r) => r.status === 'verified')
    // Invoiced against what each requisition priced for that supplier — counted
    // once per requisition and supplier, however many invoices it took.
    const pairs = new Map<string, { invoiced: number; requisitioned: number }>()
    for (const r of recorded) {
      const key = `${r.request_id}|${r.supplier_id}`
      const entry = pairs.get(key) ?? { invoiced: 0, requisitioned: num(r.supplier_requisitioned) }
      entry.invoiced += r.value
      pairs.set(key, entry)
    }
    const overBilled = [...pairs.values()].filter((p) => p.requisitioned > 0 && p.invoiced > p.requisitioned * 1.005)
    return {
      total,
      count: recorded.length,
      verifiedValue: verified.reduce((s, r) => s + r.value, 0),
      verifiedCount: verified.length,
      awaiting: recorded.length - verified.length,
      unrecorded: documents.length,
      unidentified: documents.filter((r) => !r.supplier_id).length,
      noDocument: recorded.filter((r) => !r.hasDocument).length,
      noPo: recorded.filter((r) => !r.po_numbers).length,
      overBilled: overBilled.length,
      overBilledBy: overBilled.reduce((s, p) => s + (p.invoiced - p.requisitioned), 0),
      suppliers: new Set(recorded.map((r) => r.supplier_id)).size,
    }
  }, [visible])

  /* ── Charts ─────────────────────────────────────────────────────────── */
  // Money charts plot recorded invoices alone: a document would otherwise
  // enter every ranking as a zero-value bar for its supplier.
  const charts = useMemo(() => {
    const recorded = visible.filter((r) => !r.isDocument)
    const verified = recorded.filter((r) => r.status === 'verified')
    const documents = visible.filter((r) => r.isDocument)

    // Billed against what each requisition priced for that supplier — counted
    // once per requisition and supplier, then summed per supplier.
    const pairs = new Map<string, { supplier: string; invoiced: number; requisitioned: number }>()
    for (const r of recorded) {
      const key = `${r.request_id}|${r.supplier_id}`
      const entry = pairs.get(key) ?? { supplier: r.supplier, invoiced: 0, requisitioned: num(r.supplier_requisitioned) }
      entry.invoiced += r.value
      pairs.set(key, entry)
    }
    const bySupplier = new Map<string, DivergingRow>()
    for (const p of pairs.values()) {
      if (p.requisitioned <= 0) continue
      const g = bySupplier.get(p.supplier) ?? { label: p.supplier, delta: 0, base: 0, count: 0 }
      g.delta += p.invoiced - p.requisitioned
      g.base += p.requisitioned
      g.count += 1
      bySupplier.set(p.supplier, g)
    }

    return {
      trend: recorded.map((r) => ({ at: r.effectiveDate, value: r.value, part: r.status === 'verified' ? r.value : 0 })),
      billing: [...bySupplier.values()],
      verifyDays: verified.map((r) => daysBetween(r.created_at, r.verified_at)).filter((d): d is number => d !== null),
      sparks: {
        value: monthlySpark(recorded, (r) => r.effectiveDate, (rs) => rs.reduce((s, r) => s + r.value, 0), ghsFull),
        verified: monthlySpark(verified, (r) => r.effectiveDate, (rs) => rs.reduce((s, r) => s + r.value, 0), ghsFull),
        awaiting: monthlySpark(recorded.filter((r) => r.status !== 'verified'), (r) => r.effectiveDate, (rs) => rs.length, (n) => `${n} awaiting`),
        documents: monthlySpark(documents, (r) => r.uploaded_at ?? r.created_at, (rs) => rs.length, (n) => `${n} unrecorded`),
      },
      steps: [
        { label: 'Not recorded', note: 'a file, no number or amount yet', count: documents.length },
        { label: 'Awaiting verification', note: 'keyed in, not yet checked', count: recorded.length - verified.length, value: recorded.reduce((s, r) => s + r.value, 0) - verified.reduce((s, r) => s + r.value, 0) },
        { label: 'Verified', note: 'checked by Cost Control', count: verified.length, value: verified.reduce((s, r) => s + r.value, 0) },
      ],
    }
  }, [visible])

  const [dimension, setDimension] = useState<Dimension>('supplier')
  const breakdown = useMemo(() => {
    const key: Record<Dimension, (r: InvoiceRow) => string> = {
      supplier: (r) => r.supplier,
      project: (r) => r.project,
      engineer: (r) => r.engineer,
    }
    const recordedAll = rows.filter((r) => !r.isDocument)
    const slices = stableSlices(recordedAll, visible.filter((r) => !r.isDocument), key[dimension], (r) => r.value)
    const noun = dimension
    return { slices, insight: concentrationInsight(slices, noun, `${noun}s`, 'invoiced value') }
  }, [rows, visible, dimension])

  // Memoized: DataView re-filters and re-sorts whenever these change identity.
  const columns: DataColumn<InvoiceRow>[] = useMemo(() => [
    {
      id: 'number',
      label: 'Invoice',
      sortable: true,
      sortValue: (r) => r.label,
      cell: (r) => (
        <div className="min-w-0 max-w-[220px]">
          <p
            className={cn('truncate text-sm font-semibold', r.isDocument ? 'text-foreground/90' : 'text-foreground')}
            title={r.isDocument ? (r.attachment_name ?? undefined) : undefined}
          >
            {r.isDocument && <FileText size={12} className="mr-1 inline-block align-[-1px] text-muted-foreground" />}
            {r.label}
          </p>
          <p
            className={cn('truncate text-xs', r.supplier_id ? 'text-muted-foreground' : 'italic text-amber-700 dark:text-amber-500')}
            title={r.supplier_id ? r.supplier : `This requisition names ${r.supplier_candidates ?? 0} suppliers — open it to say which issued this invoice`}
          >
            {r.supplier}
          </p>
        </div>
      ),
    },
    {
      id: 'project',
      label: 'Project · Engineer',
      hideBelow: 'md',
      sortable: true,
      sortValue: (r) => r.project,
      cell: (r) => (
        <div className="min-w-0 max-w-[200px]">
          <p className="truncate text-sm text-foreground">{r.project}</p>
          <p className="truncate text-xs text-muted-foreground">{r.engineer}</p>
        </div>
      ),
    },
    {
      id: 'amount',
      label: 'Amount',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.value,
      cell: (r) =>
        r.isDocument ? (
          <span className="text-xs text-muted-foreground" title="Not recorded — this amount is in no total">
            Not recorded
          </span>
        ) : (
          <span className="font-semibold tabular-nums text-foreground">{ghsFull(r.value)}</span>
        ),
    },
    {
      id: 'po',
      label: 'Against PO',
      hideBelow: 'lg',
      sortable: true,
      sortValue: (r) => r.po_numbers ?? '',
      cell: (r) =>
        r.po_numbers ? (
          <span className="text-xs font-medium text-foreground">#{r.po_numbers.split(', ').join(', #')}</span>
        ) : (
          <span className="text-xs text-muted-foreground">No PO to this supplier</span>
        ),
    },
    {
      id: 'status',
      label: 'Status',
      sortable: true,
      sortValue: (r) => r.status,
      cell: (r) => (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            r.status === 'verified'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : r.isDocument
                ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
          )}
          title={r.isDocument ? 'The document is attached but its number, date and amount have not been recorded' : undefined}
        >
          {r.status === 'verified' ? <BadgeCheck size={11} /> : <AlertTriangle size={11} />}
          {STATUS_LABEL[r.status] ?? r.status}
        </span>
      ),
    },
    {
      id: 'document',
      label: 'Document',
      hideBelow: 'xl',
      sortable: true,
      sortValue: (r) => (r.hasDocument ? 1 : 0),
      cell: (r) =>
        r.hasDocument ? (
          <a
            href={`/api/documents/${r.attachment_id}?download=1`}
            onClick={(e) => e.stopPropagation()}
            className="block max-w-[160px] truncate text-xs font-medium text-primary hover:underline"
            title={r.attachment_name ?? undefined}
          >
            {r.attachment_name ?? 'Download'}
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">Not attached</span>
        ),
    },
    {
      id: 'date',
      label: 'Date',
      hideBelow: 'sm',
      sortable: true,
      sortValue: (r) => r.effectiveDate,
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {r.isDocument && <span className="text-muted-foreground/70">Attached </span>}
          {dateOnly(r.effectiveDate)}
        </span>
      ),
    },
  ], [])


  const facet = useCallback((
    id: string,
    label: string,
    key: (r: InvoiceRow) => string,
    labelOf: (v: string) => string = (v) => v,
    order?: (a: string, b: string) => number
  ): DataFacet<InvoiceRow> => ({
    id,
    label,
    options: [...new Set(rows.map(key))]
      .sort(order ?? ((a, b) => labelOf(a).localeCompare(labelOf(b))))
      .map((v) => ({ value: v, label: labelOf(v) })),
    matches: (r, value) => key(r) === value,
  }), [rows])

  const facets: DataFacet<InvoiceRow>[] = useMemo(() => [
    facet('supplier', 'Supplier', (r) => r.supplier),
    facet('project', 'Project', (r) => r.project),
    facet('engineer', 'Engineer', (r) => r.engineer),
    facet('status', 'Status', (r) => r.status, (v) => STATUS_LABEL[v] ?? v),
    facet('month', 'Month', (r) => r.month, monthName, (a, b) => b.localeCompare(a)),
    facet('document', 'Document', (r) => (r.hasDocument ? 'yes' : 'no'), (v) => (v === 'yes' ? 'Has document' : 'No document')),
    facet('po', 'PO', (r) => (r.po_numbers ? 'yes' : 'no'), (v) => (v === 'yes' ? 'Matched to a PO' : 'No matching PO')),
  ], [facet])


  // An unrecorded document leaves the number, date and amount blank rather than
  // writing a zero: Excel's SUM skips a blank, so the totals row stays a total
  // of what was actually invoiced.
  const detail: XlsxColumn<InvoiceRow>[] = [
    { header: 'Invoice number', value: (r) => r.invoice_number ?? 'Not recorded', width: 16 },
    { header: 'Invoice date', value: (r) => r.invoice_date, format: 'date', width: 14 },
    { header: 'Supplier', value: (r) => r.supplier, width: 28 },
    { header: 'Amount', value: (r) => (r.isDocument ? null : r.value), format: 'money', width: 16, total: true },
    { header: 'Status', value: (r) => STATUS_LABEL[r.status] ?? r.status, width: 20 },
    { header: 'Against PO', value: (r) => r.po_numbers, width: 18 },
    { header: 'Requisitioned for supplier', value: (r) => num(r.supplier_requisitioned), format: 'money', width: 18 },
    { header: 'Project site', value: (r) => r.project, width: 26 },
    { header: 'Engineer', value: (r) => r.engineer, width: 22 },
    { header: 'Requisition', value: (r) => r.request_purpose, width: 34 },
    { header: 'Recorded by', value: (r) => r.recorded_by_name, width: 20 },
    { header: 'Recorded on', value: (r) => (r.isDocument ? null : r.created_at), format: 'date', width: 14 },
    { header: 'Attached by', value: (r) => r.uploaded_by_name, width: 20 },
    { header: 'Attached on', value: (r) => r.uploaded_at, format: 'date', width: 14 },
    { header: 'Verified by', value: (r) => r.verified_by_name, width: 20 },
    { header: 'Verified on', value: (r) => r.verified_at, format: 'date', width: 14 },
    { header: 'Document', value: (r) => r.attachment_name ?? 'Not attached', width: 30 },
    { header: 'Notes', value: (r) => r.notes, width: 36 },
  ]

  const exportOptions = (list: InvoiceRow[]): ReportExportOption[] => {
    const distinct = (key: (r: InvoiceRow) => string) => [...new Set(list.map(key))].sort()
    const named = (key: (r: InvoiceRow) => string, label: string) => {
      const values = distinct(key)
      return values.length > 0 && values.length <= 3 ? `${label}: ${values.join(', ')}` : null
    }
    const only = (key: (r: InvoiceRow) => string) => {
      const values = distinct(key)
      return values.length === 1 ? values[0] : null
    }
    const filters = [
      named((r) => r.supplier, 'Supplier'),
      named((r) => r.project, 'Project'),
      named((r) => r.engineer, 'Engineer'),
    ].filter(Boolean) as string[]
    if (list.length < rows.length) filters.push(`${list.length} of ${rows.length} invoices`)
    const subject =
      list.length < rows.length ? only((r) => r.supplier) ?? only((r) => r.project) ?? only((r) => r.engineer) : null
    const title = subject ? `Supplier invoices — ${subject}` : 'Supplier invoices'
    const section = subject ? `invoices-${slug(subject)}` : 'invoices'
    const unrecorded = list.filter((r) => r.isDocument).length
    const meta = [
      `Exported ${new Date().toLocaleString('en-GB')}${exportedBy ? ` by ${exportedBy}` : ''} · ${list.length} invoice${list.length === 1 ? '' : 's'} · amounts in Ghana cedis (GHS)`,
      ...(unrecorded > 0
        ? [
            `${unrecorded} of these ${unrecorded === 1 ? 'is a document that has' : 'are documents that have'} not been recorded, so ${unrecorded === 1 ? 'its' : 'their'} amount is blank and is not in any total.`,
          ]
        : []),
      ...(filters.length ? [`Filters: ${filters.join(' · ')}`] : []),
    ]
    const withDocs = list.filter((r) => r.hasDocument)
    // The by-supplier/project/engineer sheets total money, so they cover the
    // recorded invoices alone.
    const recorded = list.filter((r) => !r.isDocument)
    type Group = ReturnType<typeof summarize<InvoiceRow>>[number]
    const group = (name: string, label: string, key: (r: InvoiceRow) => string) =>
      sheet<Group>({
        name,
        title: `${title} — by ${label.toLowerCase()}`,
        subtitle: `Invoiced value by ${label.toLowerCase()}, largest first.`,
        meta,
        rows: summarize(recorded, key, (r) => r.value),
        columns: [
          { header: label, value: (g) => g.name, width: 32 },
          { header: 'Invoices', value: (g) => g.count, format: 'int', width: 10, total: true },
          { header: 'Invoiced', value: (g) => g.total, format: 'money', width: 18, total: true },
          { header: 'Share', value: (g) => g.share, format: 'percent', width: 9 },
          { header: 'Average invoice', value: (g) => g.average, format: 'money', width: 16 },
        ],
      })

    return [
      {
        id: 'xlsx',
        label: 'Excel report (.xlsx)',
        hint: 'Every invoice + by supplier, project and engineer',
        icon: <FileSpreadsheet size={16} className="text-emerald-600 dark:text-emerald-400" />,
        run: () => {
          downloadBlob(
            buildXlsx([
              sheet<InvoiceRow>({
                name: 'Invoices',
                title,
                subtitle:
                  'Every supplier invoice, recorded or still only a document, with the purchase order and requisition it belongs to.',
                meta,
                rows: list,
                columns: detail,
              }),
              group('By Supplier', 'Supplier', (r) => r.supplier),
              group('By Project', 'Project site', (r) => r.project),
              group('By Engineer', 'Engineer', (r) => r.engineer),
            ]),
            exportFilename(section, 'xlsx')
          )
          return 'Excel report downloaded'
        },
      },
      {
        id: 'pdf',
        label: 'PDF summary',
        hint: 'Typeset for printing or filing',
        icon: <FileText size={16} className="text-rose-600 dark:text-rose-400" />,
        run: () => {
          const cols: ExportColumn<InvoiceRow>[] = [
            { header: 'Invoice', value: (r) => (r.isDocument ? (r.attachment_name ?? 'Document') : r.invoice_number) },
            { header: 'Date', value: (r) => dateOnly(r.effectiveDate) },
            { header: 'Supplier', value: (r) => r.supplier },
            { header: 'Project', value: (r) => r.project },
            { header: 'PO', value: (r) => r.po_numbers ?? '—' },
            { header: 'Status', value: (r) => STATUS_LABEL[r.status] ?? r.status },
            { header: 'Amount (GHS)', value: (r) => (r.isDocument ? '—' : r.value), total: true },
          ]
          if (!downloadPdf(list, cols, { title, subtitle: 'Supplier invoices as filtered.', exportedBy, filters })) {
            throw new Error('Allow pop-ups for this site to export a PDF.')
          }
          return 'PDF ready to save'
        },
      },
      {
        id: 'csv',
        label: 'CSV file',
        hint: 'Plain data for another system',
        icon: <Table2 size={16} className="text-muted-foreground" />,
        run: () => {
          downloadCsv(
            exportFilename(section, 'csv'),
            toCsv(
              list,
              detail.map((c) => ({
                header: c.header,
                value: (r: InvoiceRow) => {
                  const v = c.value(r)
                  return c.format === 'date' && v ? dateOnly(String(v)) : v
                },
              }))
            )
          )
          return 'CSV downloaded'
        },
      },
      {
        id: 'zip',
        label: 'Invoice documents (.zip)',
        hint: `${withDocs.length} file${withDocs.length === 1 ? '' : 's'}, a folder per supplier, with an index`,
        icon: <FileArchive size={16} className="text-violet-600 dark:text-violet-400" />,
        disabled: withDocs.length === 0 ? ('None of these invoices has a document attached' as const) : false,
        run: async (progress) => {
          const result = await downloadDocumentBundle(
            withDocs.map((r) => {
              const ext = r.attachment_name?.match(/\.[a-z0-9]+$/i)?.[0] ?? '.pdf'
              // A recorded invoice is filed under its number; an unrecorded one
              // has none, so it keeps the filename it arrived with.
              const base = r.isDocument
                ? (r.attachment_name?.replace(/\.[a-z0-9]+$/i, '') ?? 'document')
                : `INV ${r.invoice_number}`
              return {
                id: r.attachment_id!,
                fileName: `${dateOnly(r.effectiveDate)} - ${base}${ext}`,
                folder: r.supplier,
                index: {
                  'Invoice number': r.invoice_number ?? 'Not recorded',
                  'Invoice date': r.invoice_date ? dateOnly(r.invoice_date) : '',
                  Supplier: r.supplier,
                  'Amount (GHS)': r.isDocument ? '' : r.value,
                  'Against PO': r.po_numbers,
                  Project: r.project,
                  Status: STATUS_LABEL[r.status] ?? r.status,
                  'Attached by': r.uploaded_by_name ?? r.recorded_by_name,
                  'Attached on': dateOnly(r.uploaded_at ?? r.created_at),
                },
              }
            }),
            exportFilename(`${section}-documents`, 'zip'),
            (done, total) => progress(`Fetching ${done} of ${total}…`)
          )
          const capped = withDocs.length > MAX_BUNDLE_FILES ? ` (first ${MAX_BUNDLE_FILES})` : ''
          return result.failed
            ? `${result.included} documents zipped${capped}; ${result.failed} could not be fetched — see index.csv`
            : `${result.included} documents zipped${capped}`
        },
      },
    ]
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <KpiRow>
        <KpiTile
          label="Invoiced"
          prefix="GHS"
          value={compact(stats.total)}
          title={ghsFull(stats.total)}
          spark={charts.sparks.value}
          info={`${stats.count} recorded invoice${stats.count === 1 ? '' : 's'} from ${stats.suppliers} supplier${stats.suppliers === 1 ? '' : 's'}, by invoice date. Unrecorded documents carry no amount, so they are in no total.`}
          trend={monthOverMonth(charts.sparks.value, { percent: true, upIsGood: null })}
          note="this month vs last"
        />
        <KpiTile
          label="Verified"
          value={`${pct(stats.verifiedValue, stats.total)}`}
          unit="% of value"
          title={ghsFull(stats.verifiedValue)}
          spark={charts.sparks.verified}
          info="Share of invoiced value Cost Control has checked against the document. The sparkline is verified value per month."
          note={`${stats.verifiedCount} verified · ${stats.awaiting} awaiting`}
        />
        <KpiTile
          label="Awaiting check"
          value={stats.awaiting.toLocaleString('en-GB')}
          unit={stats.awaiting === 1 ? 'invoice' : 'invoices'}
          spark={charts.sparks.awaiting}
          info="Recorded invoices Cost Control has not verified yet, by the month they are dated. Falling is good."
          trend={monthOverMonth(charts.sparks.awaiting, { upIsGood: false })}
          note="this month vs last"
        />
        <KpiTile
          label="Not recorded"
          value={stats.unrecorded.toLocaleString('en-GB')}
          unit={stats.unrecorded === 1 ? 'document' : 'documents'}
          spark={charts.sparks.documents}
          info="Invoice files attached to a requisition but never keyed in — their value is in no total until someone records the number, date and amount."
          note={stats.unidentified ? `${stats.unidentified} with no supplier identified` : 'every supplier identified'}
        />
      </KpiRow>

      <AttentionStrip
        items={[
          stats.overBilled > 0 && `${stats.overBilled} supplier billing${stats.overBilled === 1 ? '' : 's'} above the requisition, by ${ghsFull(stats.overBilledBy)}`,
          stats.unrecorded > 0 && `${stats.unrecorded} invoice document${stats.unrecorded === 1 ? '' : 's'} not recorded`,
          stats.noDocument > 0 && `${stats.noDocument} record${stats.noDocument === 1 ? '' : 's'} with no document`,
          stats.noPo > 0 && `${stats.noPo} with no matching PO`,
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <PixelTrend
            label="Invoiced trend"
            info="Recorded invoice value by invoice date. Dark squares are verified by Cost Control; light squares are recorded but not yet checked."
            items={charts.trend}
            format="money"
            noun="invoice"
            partLabel="Verified"
            restLabel="Awaiting check"
            rangeLabel="Invoiced in range"
          />
        </div>
        <BreakdownDonut
          label="Who's billing"
          info="Recorded invoice value split by supplier, project or engineer. The five largest keep their colour as you filter."
          measure="Invoiced"
          format="money"
          noun="invoice"
          slices={breakdown.slices}
          insight={breakdown.insight}
          dimension={dimension}
          dimensions={DIMENSIONS}
          onDimension={setDimension}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StackedShare
          label="Verification pipeline"
          info="Every invoice at the step it has reached: a file nobody has keyed in, a record awaiting Cost Control, or verified."
          steps={charts.steps}
          noun="invoice"
          doneLabel="verified"
        />
        <DivergingBars
          label="Billed vs requisitioned"
          info="What each supplier has invoiced against what the requisitions priced for them, counted once per requisition. Over means billed above the requisition."
          rows={charts.billing}
          reference="requisitioned"
          noun="requisition"
          empty="No recorded invoice matches a priced requisition supplier yet."
        />
        <div className="min-w-0 md:col-span-2 xl:col-span-1">
          <DayHistogram
            label="Days to verify"
            info="Days from an invoice being recorded to Cost Control verifying it. The darker column holds the median."
            days={charts.verifyDays}
            noun="invoice"
            caption="median days to verify"
          />
        </div>
      </div>

      <TableTray label="Invoices" info="Every chart above reflects exactly what this table's search and filters leave. Select a row to open its requisition.">
      <DataView
        rows={rows}
        getRowId={(r) => r.id}
        columns={columns}
        facets={facets}
        onVisibleRows={setVisible}
        onRowClick={(r) => router.push(`/admin/requests/${r.request_id}`)}
        searchPlaceholder="Search invoice number, document, supplier, project, PO…"
        searchText={(r) => [r.invoice_number, r.attachment_name, r.supplier, r.project, r.engineer, r.po_numbers, r.request_purpose]}
        defaultSort={{ id: 'date', dir: 'desc' }}
        storageKey="admin-invoice-report"
        toolbarExtra={(list) => <ReportExportMenu count={list.length} noun="invoice" options={exportOptions(list)} />}
        emptyTitle="No supplier invoices yet"
        emptyMessage="Invoice documents appear here as soon as they are attached to a requisition, and become full records once Supply Chain or Cost Control keys in the number, date and amount."
      />
      </TableTray>
    </div>
  )
}
