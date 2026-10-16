'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, FileArchive, FileSpreadsheet, FileText, Table2 } from 'lucide-react'
import DataView, { type DataColumn, type DataFacet } from '@/components/shared/DataView'
import StatusBadge from '@/components/shared/StatusBadge'
import { PO_STATUS_CONFIG, REQUEST_STATUS_CONFIG, cn } from '@/lib/utils'
import { buildXlsx, downloadBlob, sheet, summarize, type XlsxColumn } from '@/lib/xlsx'
import { downloadPdf, exportFilename, type ExportColumn } from '@/lib/export'
import { toCsv, downloadCsv } from '@/lib/csv'
import { downloadDocumentBundle, MAX_BUNDLE_FILES } from '@/lib/bundle-documents'
import { vendorKey, type AdminInvoice, type AdminPurchaseOrder } from './report-types'
import ReportExportMenu, { type ReportExportOption } from './ReportExportMenu'
import { ghsFull, monthSeries } from './report-charts'
import {
  BreakdownDonut,
  KpiTile,
  LeadTime,
  PixelTrend,
  SpendPipeline,
  Tray,
  VarianceBars,
  compact,
  type KpiTrend,
  type Slice,
  type SparkPoint,
  type VarianceRow,
} from './po-dashboard'

/** One purchase order with the figures its report derives. */
interface PoRow extends AdminPurchaseOrder {
  amount: number
  /** What the requisition priced for this PO's vendor; null when the vendor matches no supplier line. */
  requisitioned: number | null
  variance: number | null
  variancePct: number | null
  band: 'over' | 'under' | 'match' | 'unmatched'
  invoiced: number
  paid: number
  daysToPo: number | null
  month: string
  project: string
  engineer: string
  vendor: string
}

/** Within half a percent of the requisition counts as matching — rounding, not a decision. */
const TOLERANCE = 0.005

const BAND_LABEL: Record<PoRow['band'], string> = {
  over: 'Over requisition',
  under: 'Under requisition',
  match: 'Matches requisition',
  unmatched: 'Vendor not on requisition',
}

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const dateOnly = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const monthKey = (d: string) => {
  const date = new Date(d)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

const monthName = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function deriveRows(pos: AdminPurchaseOrder[], invoices: AdminInvoice[]): PoRow[] {
  // Invoices belong to a PO when they are on the same requisition from the
  // same supplier — by supplier id when the PO carries one, by name otherwise.
  const poKey = (po: AdminPurchaseOrder) =>
    po.supplier_id ? `${po.request_id}|id:${po.supplier_id}` : `${po.request_id}|name:${vendorKey(po.vendor_name)}`
  // Recorded invoices only. The Invoices report also carries attached-but-
  // unrecorded documents, which have no amount — they say an invoice exists,
  // not what it is for, so they cannot count towards what a PO has been billed.
  const invoicedBy = new Map<string, number>()
  for (const inv of invoices.filter((i) => i.kind === 'invoice')) {
    for (const key of [`${inv.request_id}|id:${inv.supplier_id}`, `${inv.request_id}|name:${vendorKey(inv.supplier_name)}`]) {
      invoicedBy.set(key, (invoicedBy.get(key) ?? 0) + num(inv.amount))
    }
  }

  // Several POs to one supplier on one requisition share its invoices in
  // proportion to their value, so the invoice is never counted twice.
  const committedBy = new Map<string, number>()
  const siblingsBy = new Map<string, number>()
  for (const po of pos) {
    const key = poKey(po)
    committedBy.set(key, (committedBy.get(key) ?? 0) + num(po.total_amount))
    siblingsBy.set(key, (siblingsBy.get(key) ?? 0) + 1)
  }

  return pos.map((po) => {
    const amount = num(po.total_amount)
    const invoiceKey = poKey(po)
    const pool = invoicedBy.get(invoiceKey) ?? 0
    const committed = committedBy.get(invoiceKey) ?? 0
    const invoiced = committed > 0 ? pool * (amount / committed) : pool / (siblingsBy.get(invoiceKey) ?? 1)
    const matched = num(po.supplier_line_count) > 0
    const requisitioned = matched ? num(po.supplier_requisitioned) : null
    const variance = requisitioned !== null ? amount - requisitioned : null
    const variancePct = requisitioned ? (variance ?? 0) / requisitioned : null
    const band: PoRow['band'] =
      requisitioned === null
        ? 'unmatched'
        : Math.abs(variancePct ?? 0) <= TOLERANCE
          ? 'match'
          : (variance ?? 0) > 0
            ? 'over'
            : 'under'
    const raised = po.request_created_at ? new Date(po.request_created_at).getTime() : NaN
    const created = new Date(po.created_at).getTime()
    return {
      ...po,
      amount,
      requisitioned,
      variance,
      variancePct,
      band,
      invoiced,
      paid: num(po.paid_amount),
      daysToPo: Number.isNaN(raised) ? null : Math.max(0, Math.round((created - raised) / 86_400_000)),
      month: monthKey(po.created_at),
      project: po.project_name || 'Unassigned',
      engineer: po.engineer_name || 'Unknown',
      vendor: po.vendor_name || 'No vendor recorded',
    }
  })
}

/** "+GHS 1,200 (+4.0%)" */
function signedMoney(n: number) {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${ghsFull(Math.abs(n))}`
}

type Dimension = 'project' | 'supplier' | 'engineer' | 'status'

const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: 'project', label: 'Project' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'status', label: 'Status' },
]

const DIMENSION_KEY: Record<Dimension, (r: PoRow) => string> = {
  project: (r) => r.project,
  supplier: (r) => r.vendor,
  engineer: (r) => r.engineer,
  status: (r) => r.status,
}

const dimensionLabel = (d: Dimension, key: string) => (d === 'status' ? PO_STATUS_CONFIG[key]?.label ?? key : key)

/** The part of a PO's value that has a recorded invoice — never more than the PO itself. */
const invoicedPart = (r: PoRow) => Math.min(r.invoiced, r.amount || r.invoiced)

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
}

const shortMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function trendOf(change: number, text: string, upIsGood: boolean | null): KpiTrend {
  return {
    text,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
    good: upIsGood === null ? null : upIsGood ? change > 0 : change < 0,
  }
}

export default function PurchaseOrdersReport({
  pos,
  invoices,
  exportedBy,
  focusId = '',
}: {
  pos: AdminPurchaseOrder[]
  invoices: AdminInvoice[]
  exportedBy: string | null
  focusId?: string
}) {
  const router = useRouter()
  const rows = useMemo(() => deriveRows(pos, invoices), [pos, invoices])
  const [visible, setVisible] = useState<PoRow[]>(rows)

  /* ── Analytics, over exactly what the filters leave ─────────────────── */
  const stats = useMemo(() => {
    const committed = visible.reduce((s, r) => s + r.amount, 0)
    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
    const thisValue = visible.filter((r) => r.month === thisMonth).reduce((s, r) => s + r.amount, 0)
    const lastValue = visible.filter((r) => r.month === lastMonth).reduce((s, r) => s + r.amount, 0)
    const matched = visible.filter((r) => r.requisitioned !== null)
    const matchedReq = matched.reduce((s, r) => s + (r.requisitioned ?? 0), 0)
    const matchedPo = matched.reduce((s, r) => s + r.amount, 0)
    const invoiced = visible.reduce((s, r) => s + invoicedPart(r), 0)
    const days = visible.map((r) => r.daysToPo).filter((d): d is number => d !== null)
    const daysIn = (month: string) =>
      visible.filter((r) => r.month === month && r.daysToPo !== null).map((r) => r.daysToPo as number)
    return {
      committed,
      count: visible.length,
      average: visible.length ? committed / visible.length : 0,
      thisValue,
      lastValue,
      thisCount: visible.filter((r) => r.month === thisMonth).length,
      lastCount: visible.filter((r) => r.month === lastMonth).length,
      delta: lastValue > 0 ? ((thisValue - lastValue) / lastValue) * 100 : undefined,
      variance: matchedPo - matchedReq,
      variancePct: matchedReq > 0 ? (matchedPo - matchedReq) / matchedReq : 0,
      matchedCount: matched.length,
      invoiced,
      invoicedShare: committed > 0 ? invoiced / committed : 0,
      paid: visible.reduce((s, r) => s + Math.min(r.paid, r.amount || r.paid), 0),
      days,
      medianDays: median(days),
      thisMedianDays: median(daysIn(thisMonth)),
      lastMedianDays: median(daysIn(lastMonth)),
      slowest: days.length ? Math.max(...days) : null,
      noDocument: visible.filter((r) => !r.document_id && !r.file_path).length,
      overTen: visible.filter((r) => (r.variancePct ?? 0) > 0.1).length,
      unmatched: visible.filter((r) => r.band === 'unmatched').length,
      uninvoiced: visible.filter((r) => r.invoiced === 0 && r.status !== 'rejected').length,
    }
  }, [visible])

  /* ── Charts ─────────────────────────────────────────────────────────── */
  const sparks = useMemo(() => {
    const value = monthSeries(visible, (r) => r.created_at, (r) => r.amount, 8)
    const invoiced = monthSeries(visible, (r) => r.created_at, invoicedPart, 8)
    return {
      value: value.map<SparkPoint>((p) => ({ label: shortMonth(p.month), value: p.value, display: ghsFull(p.value) })),
      count: value.map<SparkPoint>((p) => ({ label: shortMonth(p.month), value: p.count, display: `${p.count} POs` })),
      invoiced: invoiced.map<SparkPoint>((p) => ({ label: shortMonth(p.month), value: p.value, display: ghsFull(p.value) })),
      days: value.map<SparkPoint>((p) => {
        const d = median(visible.filter((r) => r.month === p.month && r.daysToPo !== null).map((r) => r.daysToPo as number))
        return { label: shortMonth(p.month), value: d ?? 0, display: d === null ? 'no POs' : `${d} days` }
      }),
    }
  }, [visible])

  const trendItems = useMemo(
    () => visible.map((r) => ({ at: r.created_at, amount: r.amount, invoiced: invoicedPart(r) })),
    [visible]
  )

  // Colours follow the entity, not its rank in the current filter: the five
  // largest across *all* POs hold their slot, so filtering never repaints them.
  const [dimension, setDimension] = useState<Dimension>('project')
  const pinned = useMemo(() => {
    const key = DIMENSION_KEY[dimension]
    const totals = new Map<string, number>()
    for (const r of rows) totals.set(key(r), (totals.get(key(r)) ?? 0) + r.amount)
    return new Map([...totals].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k], i) => [k, i + 1]))
  }, [rows, dimension])

  const breakdown = useMemo(() => {
    const key = DIMENSION_KEY[dimension]
    const groups = new Map<string, { value: number; count: number }>()
    for (const r of visible) {
      const g = groups.get(key(r)) ?? { value: 0, count: 0 }
      g.value += r.amount
      g.count += 1
      groups.set(key(r), g)
    }
    const present = [...groups].sort((a, b) => b[1].value - a[1].value)
    const taken = new Set(present.map(([k]) => pinned.get(k)).filter(Boolean))
    const free = [1, 2, 3, 4, 5].filter((s) => !taken.has(s))
    const slices: Slice[] = []
    const other = { value: 0, count: 0, n: 0 }
    for (const [k, g] of present) {
      const slot = pinned.get(k) ?? free.shift()
      if (slot) slices.push({ key: k, label: dimensionLabel(dimension, k), value: g.value, count: g.count, slot })
      else {
        other.value += g.value
        other.count += g.count
        other.n += 1
      }
    }
    if (other.n) slices.push({ key: '__other', label: `Other (${other.n})`, value: other.value, count: other.count, slot: null })

    const total = present.reduce((s, [, g]) => s + g.value, 0)
    const share = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
    const noun = DIMENSIONS.find((d) => d.value === dimension)!.label.toLowerCase()
    const insight =
      present.length === 0 || total === 0
        ? null
        : present.length === 1
          ? `All committed value sits with one ${noun}: ${dimensionLabel(dimension, present[0][0])}.`
          : present.length >= 4
            ? `${dimensionLabel(dimension, present[0][0])} holds ${share(present[0][1].value)}% of committed value; the top three ${noun === 'status' ? 'statuses' : `${noun}s`} together hold ${share(present.slice(0, 3).reduce((s, [, g]) => s + g.value, 0))}%.`
            : `${dimensionLabel(dimension, present[0][0])} holds ${share(present[0][1].value)}% of committed value across ${present[0][1].count} PO${present[0][1].count === 1 ? '' : 's'}.`
    return { slices, insight }
  }, [visible, dimension, pinned])

  const variance = useMemo(() => {
    const groups = new Map<string, VarianceRow>()
    for (const r of visible) {
      if (r.requisitioned === null) continue
      const g = groups.get(r.project) ?? { label: r.project, variance: 0, requisitioned: 0, count: 0 }
      g.variance += r.variance ?? 0
      g.requisitioned += r.requisitioned
      g.count += 1
      groups.set(r.project, g)
    }
    return [...groups.values()]
      .filter((g) => Math.abs(g.variance) >= 0.5)
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
      .slice(0, 6)
  }, [visible])

  /* ── Table ──────────────────────────────────────────────────────────── */
  // Memoized: DataView re-filters and re-sorts whenever these change identity.
  const columns: DataColumn<PoRow>[] = useMemo(() => [
    {
      id: 'po',
      label: 'Purchase order',
      sortable: true,
      sortValue: (r) => r.po_number ?? '',
      cell: (r) => (
        <div className="min-w-0 max-w-[220px]">
          <p className="truncate text-sm font-semibold text-foreground">#{r.po_number ?? '—'}</p>
          <p className="truncate text-xs text-muted-foreground" title={r.vendor}>
            {r.vendor}
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
          <p className="truncate text-sm text-foreground" title={r.project}>
            {r.project}
          </p>
          <p className="truncate text-xs text-muted-foreground">{r.engineer}</p>
        </div>
      ),
    },
    {
      id: 'amount',
      label: 'Amount',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.amount,
      cell: (r) => <span className="font-semibold tabular-nums text-foreground">{ghsFull(r.amount)}</span>,
    },
    {
      id: 'variance',
      label: 'vs requisition',
      align: 'right',
      hideBelow: 'lg',
      sortable: true,
      sortValue: (r) => r.variancePct,
      cell: (r) =>
        r.band === 'unmatched' ? (
          <span className="text-xs text-muted-foreground" title="The PO vendor matches no supplier line on the requisition">
            Not matched
          </span>
        ) : r.band === 'match' ? (
          <span className="text-xs text-muted-foreground">Matches</span>
        ) : (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-semibold tabular-nums',
              r.band === 'over' ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
            )}
            title={`Requisitioned ${ghsFull(r.requisitioned ?? 0)}`}
          >
            {r.band === 'over' && <AlertTriangle size={11} />}
            {signedMoney(r.variance ?? 0)} ({((r.variancePct ?? 0) * 100).toFixed(1)}%)
          </span>
        ),
    },
    {
      id: 'invoiced',
      label: 'Invoiced',
      align: 'right',
      hideBelow: 'xl',
      sortable: true,
      sortValue: (r) => r.invoiced,
      cell: (r) =>
        r.invoiced > 0 ? (
          <span className="text-xs tabular-nums text-foreground">
            {ghsFull(r.invoiced)}
            {r.amount > 0 && <span className="text-muted-foreground"> · {Math.round((r.invoiced / r.amount) * 100)}%</span>}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">None recorded</span>
        ),
    },
    {
      id: 'status',
      label: 'Status',
      sortable: true,
      sortValue: (r) => r.status,
      cell: (r) => <StatusBadge status={r.status} config={PO_STATUS_CONFIG} />,
    },
    {
      id: 'created_at',
      label: 'Raised',
      hideBelow: 'sm',
      sortable: true,
      sortValue: (r) => r.created_at,
      cell: (r) => (
        <div className="whitespace-nowrap">
          <p className="text-xs text-foreground">{dateOnly(r.created_at)}</p>
          {r.daysToPo !== null && (
            <p className="text-[11px] text-muted-foreground">
              {r.daysToPo} day{r.daysToPo === 1 ? '' : 's'} after requisition
            </p>
          )}
        </div>
      ),
    },
  ], [])


  const facet = useCallback(
    (
      id: string,
      label: string,
      key: (r: PoRow) => string,
      labelOf: (v: string) => string = (v) => v,
      order?: (a: string, b: string) => number
    ): DataFacet<PoRow> => ({
      id,
      label,
      options: [...new Set(rows.map(key))]
        .sort(order ?? ((a, b) => labelOf(a).localeCompare(labelOf(b))))
        .map((v) => ({ value: v, label: labelOf(v) })),
      matches: (r, value) => key(r) === value,
    }),
    [rows]
  )

  const facets: DataFacet<PoRow>[] = useMemo(() => [
    facet('project', 'Project', (r) => r.project),
    facet('engineer', 'Engineer', (r) => r.engineer),
    facet('supplier', 'Supplier', (r) => r.vendor),
    facet('status', 'Status', (r) => r.status, (v) => PO_STATUS_CONFIG[v]?.label ?? v),
    facet('department', 'Department', (r) => r.department || 'None'),
    facet('month', 'Raised in', (r) => r.month, monthName, (a, b) => b.localeCompare(a)),
    facet('band', 'Variance', (r) => r.band, (v) => BAND_LABEL[v as PoRow['band']]),
    facet('split', 'Requisition', (r) => (num(r.sibling_count) > 1 ? 'multi' : 'single'), (v) =>
      v === 'multi' ? 'Split across several POs' : 'Single PO'
    ),
  ], [facet])


  /* ── Exports ────────────────────────────────────────────────────────── */
  const describe = (list: PoRow[]) => {
    // Whatever the exported rows have in common is a filter in effect, so the
    // file says so. A few ticked values are named outright; more than a few
    // would be a paragraph, so those are left to the row count.
    const distinct = (key: (r: PoRow) => string) => [...new Set(list.map(key))].sort()
    const named = (key: (r: PoRow) => string, label: string) => {
      const values = distinct(key)
      return values.length > 0 && values.length <= 3 ? `${label}: ${values.join(', ')}` : null
    }
    const only = (key: (r: PoRow) => string) => {
      const values = distinct(key)
      return values.length === 1 ? values[0] : null
    }
    const filters = [
      named((r) => r.project, 'Project'),
      named((r) => r.engineer, 'Engineer'),
      named((r) => r.vendor, 'Supplier'),
      named((r) => PO_STATUS_CONFIG[r.status]?.label ?? r.status, 'Status'),
    ].filter(Boolean) as string[]
    if (list.length < rows.length) filters.push(`${list.length} of ${rows.length} purchase orders`)
    // The filename can only carry one name, so it takes a lone project,
    // engineer or supplier and otherwise stays generic.
    const subject = list.length < rows.length ? only((r) => r.project) ?? only((r) => r.engineer) ?? only((r) => r.vendor) : null
    return {
      filters,
      title: subject ? `Purchase orders — ${subject}` : 'Purchase orders',
      section: subject ? `purchase-orders-${slug(subject)}` : 'purchase-orders',
    }
  }

  const detail: XlsxColumn<PoRow>[] = [
    { header: 'PO number', value: (r) => r.po_number, width: 14 },
    { header: 'PO status', value: (r) => PO_STATUS_CONFIG[r.status]?.label ?? r.status, width: 16 },
    { header: 'Supplier / vendor', value: (r) => r.vendor, width: 28 },
    { header: 'Project site', value: (r) => r.project, width: 26 },
    { header: 'Project code', value: (r) => r.project_code, width: 12 },
    { header: 'Department', value: (r) => r.department, width: 16 },
    { header: 'Engineer', value: (r) => r.engineer, width: 22 },
    { header: 'Requisition', value: (r) => r.request_purpose, width: 34 },
    { header: 'Requisition status', value: (r) => (r.request_status ? REQUEST_STATUS_CONFIG[r.request_status]?.label ?? r.request_status : ''), width: 16 },
    { header: 'Lines from this supplier', value: (r) => num(r.supplier_line_count), format: 'int', width: 12 },
    { header: 'Items supplied', value: (r) => r.supplier_items, width: 48 },
    { header: 'PO amount', value: (r) => r.amount, format: 'money', width: 16, total: true },
    { header: 'Requisitioned for supplier', value: (r) => r.requisitioned, format: 'money', width: 16, total: true },
    { header: 'Variance', value: (r) => r.variance, format: 'money', width: 15, total: true },
    { header: 'Variance %', value: (r) => r.variancePct, format: 'percent', width: 11 },
    { header: 'Invoiced', value: (r) => r.invoiced, format: 'money', width: 15, total: true },
    { header: 'Paid', value: (r) => r.paid, format: 'money', width: 15, total: true },
    { header: 'POs on requisition', value: (r) => num(r.sibling_count), format: 'int', width: 10 },
    { header: 'All suppliers on requisition', value: (r) => r.requisition_suppliers, width: 36 },
    { header: 'Requisition raised', value: (r) => r.request_created_at, format: 'date', width: 14 },
    { header: 'PO raised', value: (r) => r.created_at, format: 'date', width: 14 },
    { header: 'Days to PO', value: (r) => r.daysToPo, format: 'int', width: 10 },
    { header: 'Raised by', value: (r) => r.raised_by_name, width: 20 },
    { header: 'PO document', value: (r) => r.document_name ?? r.file_name ?? 'Missing', width: 30 },
    { header: 'Notes', value: (r) => r.notes, width: 36 },
  ]

  type Group = ReturnType<typeof summarize<PoRow>>[number]
  const groupSheet = (name: string, title: string, label: string, list: PoRow[], key: (r: PoRow) => string, meta: string[]) => {
    const groups = summarize(list, key, (r) => r.amount)
    const extra = new Map(
      groups.map((g) => {
        const members = list.filter((r) => (key(r) || '—') === g.name)
        return [
          g.name,
          {
            invoiced: members.reduce((s, r) => s + r.invoiced, 0),
            variance: members.reduce((s, r) => s + (r.variance ?? 0), 0),
            suppliers: new Set(members.map((r) => vendorKey(r.vendor))).size,
            projects: new Set(members.map((r) => r.project)).size,
          },
        ]
      })
    )
    return sheet<Group>({
      name,
      title,
      subtitle: `Committed value by ${label.toLowerCase()}, largest first.`,
      meta,
      rows: groups,
      columns: [
        { header: label, value: (g) => g.name, width: 32 },
        { header: 'POs', value: (g) => g.count, format: 'int', width: 8, total: true },
        { header: 'Committed', value: (g) => g.total, format: 'money', width: 18, total: true },
        { header: 'Share', value: (g) => g.share, format: 'percent', width: 9 },
        { header: 'Average PO', value: (g) => g.average, format: 'money', width: 16 },
        { header: 'Variance vs requisition', value: (g) => extra.get(g.name)?.variance ?? 0, format: 'money', width: 18, total: true },
        { header: 'Invoiced', value: (g) => extra.get(g.name)?.invoiced ?? 0, format: 'money', width: 16, total: true },
        { header: 'Suppliers', value: (g) => extra.get(g.name)?.suppliers ?? 0, format: 'int', width: 10 },
        { header: 'Projects', value: (g) => extra.get(g.name)?.projects ?? 0, format: 'int', width: 10 },
      ],
    })
  }

  const exportOptions = (list: PoRow[]): ReportExportOption[] => {
    const { filters, title, section } = describe(list)
    const meta = [
      `Exported ${new Date().toLocaleString('en-GB')}${exportedBy ? ` by ${exportedBy}` : ''} · ${list.length} purchase order${list.length === 1 ? '' : 's'} · amounts in Ghana cedis (GHS)`,
      ...(filters.length ? [`Filters: ${filters.join(' · ')}`] : []),
    ]
    const withDocs = list.filter((r) => r.document_id || r.file_path)

    return [
      {
        id: 'xlsx',
        label: 'Excel report (.xlsx)',
        hint: 'Detail + by project, supplier, engineer and month',
        icon: <FileSpreadsheet size={16} className="text-emerald-600 dark:text-emerald-400" />,
        run: () => {
          const months = summarize(list, (r) => r.month, (r) => r.amount).sort((a, b) => b.name.localeCompare(a.name))
          const blob = buildXlsx([
            sheet<PoRow>({
              name: 'Purchase Orders',
              title,
              subtitle:
                'Every purchase order with the requisition it serves, what that requisition priced for the supplier, and what has been invoiced and paid.',
              meta,
              rows: list,
              columns: detail,
            }),
            groupSheet('By Project', `${title} — by project`, 'Project site', list, (r) => r.project, meta),
            groupSheet('By Supplier', `${title} — by supplier`, 'Supplier', list, (r) => r.vendor, meta),
            groupSheet('By Engineer', `${title} — by engineer`, 'Engineer', list, (r) => r.engineer, meta),
            sheet({
              name: 'By Month',
              title: `${title} — by month`,
              subtitle: 'Committed value by the month the PO was raised.',
              meta,
              rows: months,
              columns: [
                { header: 'Month', value: (g) => monthName(g.name), width: 20 },
                { header: 'POs', value: (g) => g.count, format: 'int', width: 8, total: true },
                { header: 'Committed', value: (g) => g.total, format: 'money', width: 18, total: true },
                { header: 'Share', value: (g) => g.share, format: 'percent', width: 9 },
                { header: 'Average PO', value: (g) => g.average, format: 'money', width: 16 },
              ],
            }),
          ])
          downloadBlob(blob, exportFilename(section, 'xlsx'))
          return 'Excel report downloaded'
        },
      },
      {
        id: 'pdf',
        label: 'PDF summary',
        hint: 'Typeset for printing or filing',
        icon: <FileText size={16} className="text-rose-600 dark:text-rose-400" />,
        run: () => {
          const cols: ExportColumn<PoRow>[] = [
            { header: 'PO', value: (r) => r.po_number },
            { header: 'Supplier', value: (r) => r.vendor },
            { header: 'Project', value: (r) => r.project },
            { header: 'Engineer', value: (r) => r.engineer },
            { header: 'Status', value: (r) => PO_STATUS_CONFIG[r.status]?.label ?? r.status },
            { header: 'Raised', value: (r) => dateOnly(r.created_at) },
            { header: 'Variance', value: (r) => (r.variance === null ? '—' : signedMoney(r.variance)), align: 'right' },
            { header: 'Amount (GHS)', value: (r) => r.amount, total: true },
          ]
          const opened = downloadPdf(list, cols, { title, subtitle: 'Purchase orders as filtered.', exportedBy, filters })
          if (!opened) throw new Error('Allow pop-ups for this site to export a PDF.')
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
                value: (r: PoRow) => {
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
        label: 'PO documents (.zip)',
        hint: `${withDocs.length} PDF${withDocs.length === 1 ? '' : 's'}, a folder per project, with an index`,
        icon: <FileArchive size={16} className="text-violet-600 dark:text-violet-400" />,
        disabled: withDocs.length === 0 ? ('None of these purchase orders has a document' as const) : false,
        run: async (progress: (t: string) => void) => {
          const result = await downloadDocumentBundle(
            withDocs.map((r) => ({
              id: r.document_id ?? `po-file-${r.id}`,
              fileName: `PO ${r.po_number ?? r.id.slice(0, 8)} - ${r.vendor}.pdf`,
              folder: r.project,
              index: {
                'PO number': r.po_number,
                Supplier: r.vendor,
                Project: r.project,
                Engineer: r.engineer,
                'Amount (GHS)': r.amount,
                Status: PO_STATUS_CONFIG[r.status]?.label ?? r.status,
                Raised: dateOnly(r.created_at),
              },
            })),
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

  const countChange = stats.thisCount - stats.lastCount
  const daysChange =
    stats.thisMedianDays !== null && stats.lastMedianDays !== null ? stats.thisMedianDays - stats.lastMedianDays : null

  const attention = [
    stats.overTen > 0 && `${stats.overTen} PO${stats.overTen === 1 ? '' : 's'} more than 10% over the requisition`,
    stats.unmatched > 0 && `${stats.unmatched} PO vendor${stats.unmatched === 1 ? '' : 's'} not on the requisition`,
    stats.noDocument > 0 && `${stats.noDocument} without a PO document`,
    stats.uninvoiced > 0 && `${stats.uninvoiced} with no invoice recorded`,
  ].filter(Boolean) as string[]

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-1 gap-3 stagger sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <KpiTile
          label="Committed value"
          prefix="GHS"
          value={compact(stats.committed)}
          title={ghsFull(stats.committed)}
          spark={sparks.value}
          info={`Total value of the ${stats.count} purchase orders shown, averaging ${ghsFull(stats.average)} each. The sparkline is the last eight months; the dark bar is this month.`}
          trend={stats.delta !== undefined ? trendOf(stats.delta, `${Math.abs(Math.round(stats.delta))}%`, null) : undefined}
          note={stats.lastValue > 0 ? 'this month vs last' : 'nothing raised last month'}
        />
        <KpiTile
          label="Purchase orders"
          value={stats.count.toLocaleString('en-GB')}
          unit={stats.count === 1 ? 'PO' : 'POs'}
          spark={sparks.count}
          info="How many purchase orders match the current filters, with POs raised per month over the last eight months."
          trend={trendOf(countChange, `${Math.abs(countChange)}`, null)}
          note={`raised this month (${stats.thisCount}) vs last`}
        />
        <KpiTile
          label="Invoiced"
          prefix="GHS"
          value={compact(stats.invoiced)}
          title={ghsFull(stats.invoiced)}
          spark={sparks.invoiced}
          info="Committed value with a recorded invoice against it. Invoices on a requisition are shared across that supplier's POs by value, and never count beyond a PO's own amount."
          note={`${Math.round(stats.invoicedShare * 100)}% of committed value`}
        />
        <KpiTile
          label="Requisition to PO"
          value={stats.medianDays !== null ? String(stats.medianDays) : '—'}
          unit={stats.medianDays === 1 ? 'day' : 'days'}
          spark={sparks.days}
          info="Median days from a requisition being raised to its purchase order. Falling is good. The sparkline is each month's median."
          trend={daysChange !== null ? trendOf(daysChange, `${Math.abs(daysChange)}d`, false) : undefined}
          note={daysChange !== null ? 'median this month vs last' : stats.slowest !== null ? `slowest ${stats.slowest} days` : 'no dated requisitions'}
        />
      </div>

      {/* What deserves a second look, in words — never colour alone. */}
      {attention.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attention.map((text) => (
            <span
              key={text}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300"
            >
              <AlertTriangle size={13} className="shrink-0" /> {text}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <PixelTrend items={trendItems} />
        </div>
        <BreakdownDonut
          dimension={dimension}
          dimensions={DIMENSIONS}
          onDimension={setDimension}
          slices={breakdown.slices}
          insight={breakdown.insight}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SpendPipeline committed={stats.committed} invoiced={stats.invoiced} paid={stats.paid} />
        <VarianceBars rows={variance} net={stats.variance} netPct={stats.variancePct} />
        <div className="min-w-0 md:col-span-2 xl:col-span-1">
          <LeadTime days={stats.days} />
        </div>
      </div>

      <Tray
        label="Purchase orders"
        info="Every chart above reflects exactly what this table's search and filters leave. Select a row to open its requisition."
        bodyClassName="border-0 bg-transparent p-0.5 shadow-none sm:p-1"
      >
        <DataView
          rows={rows}
          getRowId={(r) => r.id}
          columns={columns}
          facets={facets}
          onVisibleRows={setVisible}
          onRowClick={(r) => r.request_id && router.push(`/admin/requests/${r.request_id}`)}
          searchPlaceholder="Search PO number, supplier, project, engineer…"
          searchText={(r) => [r.id, r.po_number, r.vendor, r.project, r.engineer, r.request_purpose, r.supplier_items, r.department]}
          initialTerm={focusId}
          defaultSort={{ id: 'created_at', dir: 'desc' }}
          storageKey="admin-po-report"
          toolbarExtra={(list) => <ReportExportMenu count={list.length} noun="purchase order" options={exportOptions(list)} />}
          emptyTitle="No purchase orders yet"
          emptyMessage="Purchase orders appear here once the Administrator attaches them."
        />
      </Tray>
    </div>
  )
}
