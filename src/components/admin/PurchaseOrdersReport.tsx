'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CalendarClock, Coins, FileArchive, FileSpreadsheet, FileText, Receipt, Scale, Table2 } from 'lucide-react'
import DataView, { type DataColumn, type DataFacet } from '@/components/shared/DataView'
import StatusBadge from '@/components/shared/StatusBadge'
import { StatGrid } from '@/components/shared/ui-kit'
import { PO_STATUS_CONFIG, REQUEST_STATUS_CONFIG, cn } from '@/lib/utils'
import { buildXlsx, downloadBlob, sheet, summarize, type XlsxColumn } from '@/lib/xlsx'
import { downloadPdf, exportFilename, type ExportColumn } from '@/lib/export'
import { toCsv, downloadCsv } from '@/lib/csv'
import { downloadDocumentBundle, MAX_BUNDLE_FILES } from '@/lib/bundle-documents'
import { vendorKey, type AdminInvoice, type AdminPurchaseOrder } from './report-types'
import ReportExportMenu, { type ReportExportOption } from './ReportExportMenu'
import { ChartCard, MonthColumns, RankedBars, ghsFull, monthSeries, rankRows } from './report-charts'

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
  const invoicedBy = new Map<string, number>()
  for (const inv of invoices) {
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

function ranked(rows: PoRow[], key: (r: PoRow) => string) {
  return rankRows(summarize(rows, key, (r) => r.amount).map((g) => ({ label: g.name, value: g.total, count: g.count })))
}

/** "+GHS 1,200 (+4.0%)" */
function signedMoney(n: number) {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${ghsFull(Math.abs(n))}`
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
    const invoiced = visible.reduce((s, r) => s + Math.min(r.invoiced, r.amount || r.invoiced), 0)
    const days = visible.map((r) => r.daysToPo).filter((d): d is number => d !== null).sort((a, b) => a - b)
    return {
      committed,
      count: visible.length,
      average: visible.length ? committed / visible.length : 0,
      thisValue,
      lastValue,
      delta: lastValue > 0 ? ((thisValue - lastValue) / lastValue) * 100 : undefined,
      variance: matchedPo - matchedReq,
      variancePct: matchedReq > 0 ? (matchedPo - matchedReq) / matchedReq : 0,
      matchedCount: matched.length,
      invoiced,
      invoicedShare: committed > 0 ? invoiced / committed : 0,
      medianDays: days.length ? days[Math.floor(days.length / 2)] : null,
      slowest: days.length ? days[days.length - 1] : null,
      noDocument: visible.filter((r) => !r.document_id && !r.file_path).length,
      overTen: visible.filter((r) => (r.variancePct ?? 0) > 0.1).length,
      unmatched: visible.filter((r) => r.band === 'unmatched').length,
      uninvoiced: visible.filter((r) => r.invoiced === 0 && r.status !== 'rejected').length,
    }
  }, [visible])

  const charts = useMemo(
    () => ({
      project: ranked(visible, (r) => r.project),
      supplier: ranked(visible, (r) => r.vendor),
      engineer: ranked(visible, (r) => r.engineer),
      months: monthSeries(visible, (r) => r.created_at, (r) => r.amount),
    }),
    [visible]
  )

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

  return (
    <div className="space-y-6">
      <StatGrid
        stats={[
          {
            label: 'Committed value',
            value: ghsFull(stats.committed),
            icon: <Coins size={18} />,
            tone: 'purple',
            compare: `${stats.count} purchase order${stats.count === 1 ? '' : 's'} · average ${ghsFull(stats.average)}`,
          },
          {
            label: 'Raised this month',
            value: ghsFull(stats.thisValue),
            icon: <CalendarClock size={18} />,
            tone: 'blue',
            delta: stats.delta !== undefined ? Math.round(stats.delta) : undefined,
            compare: stats.lastValue > 0 ? `vs. ${ghsFull(stats.lastValue)} last month` : 'Nothing raised last month',
          },
          {
            label: 'PO vs requisitioned',
            value: stats.matchedCount ? signedMoney(stats.variance) : '—',
            icon: <Scale size={18} />,
            tone: stats.variance > 0 ? 'red' : 'emerald',
            compare: stats.matchedCount
              ? `${(stats.variancePct * 100).toFixed(1)}% ${stats.variance > 0 ? 'above' : stats.variance < 0 ? 'below' : 'against'} what was requisitioned · ${stats.matchedCount} PO${stats.matchedCount === 1 ? '' : 's'} matched to a supplier`
              : 'No PO vendor matches a requisition supplier yet',
          },
          {
            label: 'Invoiced',
            value: ghsFull(stats.invoiced),
            icon: <Receipt size={18} />,
            tone: 'emerald',
            share: stats.invoicedShare,
            compare: `${Math.round(stats.invoicedShare * 100)}% of committed value has a recorded invoice`,
          },
          {
            label: 'Requisition to PO',
            value: stats.medianDays !== null ? `${stats.medianDays}d` : '—',
            icon: <CalendarClock size={18} />,
            tone: stats.medianDays !== null && stats.medianDays > 14 ? 'red' : 'amber',
            compare: stats.slowest !== null ? `Median wait · slowest ${stats.slowest} days` : 'No dated requisitions',
          },
        ]}
      />

      {/* What deserves a second look, in words — never colour alone. */}
      {(stats.noDocument > 0 || stats.overTen > 0 || stats.unmatched > 0 || stats.uninvoiced > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            stats.overTen > 0 && `${stats.overTen} PO${stats.overTen === 1 ? '' : 's'} more than 10% over the requisition`,
            stats.unmatched > 0 && `${stats.unmatched} PO vendor${stats.unmatched === 1 ? '' : 's'} not on the requisition`,
            stats.noDocument > 0 && `${stats.noDocument} without a PO document`,
            stats.uninvoiced > 0 && `${stats.uninvoiced} with no invoice recorded`,
          ]
            .filter(Boolean)
            .map((text) => (
              <span
                key={text as string}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-2.5 py-1 font-medium text-amber-800 dark:text-amber-300"
              >
                <AlertTriangle size={12} /> {text}
              </span>
            ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Committed by project" caption="Where purchase-order spend is going">
          <RankedBars rows={charts.project} />
        </ChartCard>
        <ChartCard title="Committed by supplier" caption="Who the purchase orders are raised to">
          <RankedBars rows={charts.supplier} />
        </ChartCard>
        <ChartCard title="Committed by engineer" caption="By whoever raised the underlying requisition">
          <RankedBars rows={charts.engineer} />
        </ChartCard>
        <ChartCard title="Monthly committed value" caption="Last 12 months, by the month each PO was raised">
          <MonthColumns points={charts.months} />
        </ChartCard>
      </div>

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
    </div>
  )
}
