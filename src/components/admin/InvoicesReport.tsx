'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, BadgeCheck, FileArchive, FileSpreadsheet, FileText, Receipt, Scale, Table2 } from 'lucide-react'
import DataView, { type DataColumn, type DataFacet } from '@/components/shared/DataView'
import { StatGrid } from '@/components/shared/ui-kit'
import { cn } from '@/lib/utils'
import { buildXlsx, downloadBlob, sheet, summarize, type XlsxColumn } from '@/lib/xlsx'
import { downloadPdf, exportFilename, type ExportColumn } from '@/lib/export'
import { toCsv, downloadCsv } from '@/lib/csv'
import { downloadDocumentBundle, MAX_BUNDLE_FILES } from '@/lib/bundle-documents'
import type { AdminInvoice } from './report-types'
import ReportExportMenu, { type ReportExportOption } from './ReportExportMenu'
import { ChartCard, MonthColumns, RankedBars, ghsFull, monthSeries, rankRows } from './report-charts'

interface InvoiceRow extends AdminInvoice {
  value: number
  project: string
  engineer: string
  month: string
  hasDocument: boolean
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

const STATUS_LABEL: Record<string, string> = { recorded: 'Awaiting verification', verified: 'Verified' }

/**
 * Every supplier invoice recorded against a requisition, in one place.
 *
 * Invoices are recorded per requisition by Supply Chain and Cost Control; this
 * is where they are seen together — filtered by supplier, project, engineer or
 * month — and downloaded, either as a workbook or as the invoice documents
 * themselves, bundled into one archive.
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
        const d = new Date(inv.invoice_date)
        return {
          ...inv,
          value: num(inv.amount),
          project: inv.project_name || 'Unassigned',
          engineer: inv.engineer_name || 'Unknown',
          month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          hasDocument: Boolean(inv.attachment_id),
        }
      }),
    [invoices]
  )
  const [visible, setVisible] = useState<InvoiceRow[]>(rows)

  const stats = useMemo(() => {
    const total = visible.reduce((s, r) => s + r.value, 0)
    const verified = visible.filter((r) => r.status === 'verified')
    // Invoiced against what each requisition priced for that supplier — counted
    // once per requisition and supplier, however many invoices it took.
    const pairs = new Map<string, { invoiced: number; requisitioned: number }>()
    for (const r of visible) {
      const key = `${r.request_id}|${r.supplier_id}`
      const entry = pairs.get(key) ?? { invoiced: 0, requisitioned: num(r.supplier_requisitioned) }
      entry.invoiced += r.value
      pairs.set(key, entry)
    }
    const overBilled = [...pairs.values()].filter((p) => p.requisitioned > 0 && p.invoiced > p.requisitioned * 1.005)
    return {
      total,
      count: visible.length,
      verifiedValue: verified.reduce((s, r) => s + r.value, 0),
      verifiedCount: verified.length,
      awaiting: visible.length - verified.length,
      noDocument: visible.filter((r) => !r.hasDocument).length,
      noPo: visible.filter((r) => !r.po_numbers).length,
      overBilled: overBilled.length,
      overBilledBy: overBilled.reduce((s, p) => s + (p.invoiced - p.requisitioned), 0),
      suppliers: new Set(visible.map((r) => r.supplier_id)).size,
    }
  }, [visible])

  const charts = useMemo(
    () => ({
      supplier: rankRows(summarize(visible, (r) => r.supplier_name, (r) => r.value).map((g) => ({ label: g.name, value: g.total, count: g.count }))),
      project: rankRows(summarize(visible, (r) => r.project, (r) => r.value).map((g) => ({ label: g.name, value: g.total, count: g.count }))),
      months: monthSeries(visible, (r) => r.invoice_date, (r) => r.value),
    }),
    [visible]
  )

  const columns: DataColumn<InvoiceRow>[] = [
    {
      id: 'number',
      label: 'Invoice',
      sortable: true,
      sortValue: (r) => r.invoice_number,
      cell: (r) => (
        <div className="min-w-0 max-w-[220px]">
          <p className="truncate text-sm font-semibold text-foreground">#{r.invoice_number}</p>
          <p className="truncate text-xs text-muted-foreground" title={r.supplier_name}>
            {r.supplier_name}
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
      cell: (r) => <span className="font-semibold tabular-nums text-foreground">{ghsFull(r.value)}</span>,
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
              : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
          )}
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
      label: 'Invoice date',
      hideBelow: 'sm',
      sortable: true,
      sortValue: (r) => r.invoice_date,
      cell: (r) => <span className="whitespace-nowrap text-xs text-muted-foreground">{dateOnly(r.invoice_date)}</span>,
    },
  ]

  const facet = (
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
  })

  const facets: DataFacet<InvoiceRow>[] = [
    facet('supplier', 'Supplier', (r) => r.supplier_name),
    facet('project', 'Project', (r) => r.project),
    facet('engineer', 'Engineer', (r) => r.engineer),
    facet('status', 'Status', (r) => r.status, (v) => STATUS_LABEL[v] ?? v),
    facet('month', 'Invoice month', (r) => r.month, monthName, (a, b) => b.localeCompare(a)),
    facet('document', 'Document', (r) => (r.hasDocument ? 'yes' : 'no'), (v) => (v === 'yes' ? 'Has document' : 'No document')),
    facet('po', 'PO', (r) => (r.po_numbers ? 'yes' : 'no'), (v) => (v === 'yes' ? 'Matched to a PO' : 'No matching PO')),
  ]

  const detail: XlsxColumn<InvoiceRow>[] = [
    { header: 'Invoice number', value: (r) => r.invoice_number, width: 16 },
    { header: 'Invoice date', value: (r) => r.invoice_date, format: 'date', width: 14 },
    { header: 'Supplier', value: (r) => r.supplier_name, width: 28 },
    { header: 'Amount', value: (r) => r.value, format: 'money', width: 16, total: true },
    { header: 'Status', value: (r) => STATUS_LABEL[r.status] ?? r.status, width: 20 },
    { header: 'Against PO', value: (r) => r.po_numbers, width: 18 },
    { header: 'Requisitioned for supplier', value: (r) => num(r.supplier_requisitioned), format: 'money', width: 18 },
    { header: 'Project site', value: (r) => r.project, width: 26 },
    { header: 'Engineer', value: (r) => r.engineer, width: 22 },
    { header: 'Requisition', value: (r) => r.request_purpose, width: 34 },
    { header: 'Recorded by', value: (r) => r.recorded_by_name, width: 20 },
    { header: 'Recorded on', value: (r) => r.created_at, format: 'date', width: 14 },
    { header: 'Verified by', value: (r) => r.verified_by_name, width: 20 },
    { header: 'Verified on', value: (r) => r.verified_at, format: 'date', width: 14 },
    { header: 'Document', value: (r) => r.attachment_name ?? 'Not attached', width: 30 },
    { header: 'Notes', value: (r) => r.notes, width: 36 },
  ]

  const exportOptions = (list: InvoiceRow[]): ReportExportOption[] => {
    const single = (key: (r: InvoiceRow) => string) => {
      const values = [...new Set(list.map(key))]
      return values.length === 1 ? values[0] : null
    }
    const supplier = single((r) => r.supplier_name)
    const project = single((r) => r.project)
    const engineer = single((r) => r.engineer)
    const filters = [supplier && `Supplier: ${supplier}`, project && `Project: ${project}`, engineer && `Engineer: ${engineer}`].filter(
      Boolean
    ) as string[]
    if (list.length < rows.length) filters.push(`${list.length} of ${rows.length} invoices`)
    const subject = list.length < rows.length ? supplier ?? project ?? engineer : null
    const title = subject ? `Supplier invoices — ${subject}` : 'Supplier invoices'
    const section = subject ? `invoices-${slug(subject)}` : 'invoices'
    const meta = [
      `Exported ${new Date().toLocaleString('en-GB')}${exportedBy ? ` by ${exportedBy}` : ''} · ${list.length} invoice${list.length === 1 ? '' : 's'} · amounts in Ghana cedis (GHS)`,
      ...(filters.length ? [`Filters: ${filters.join(' · ')}`] : []),
    ]
    const withDocs = list.filter((r) => r.hasDocument)
    type Group = ReturnType<typeof summarize<InvoiceRow>>[number]
    const group = (name: string, label: string, key: (r: InvoiceRow) => string) =>
      sheet<Group>({
        name,
        title: `${title} — by ${label.toLowerCase()}`,
        subtitle: `Invoiced value by ${label.toLowerCase()}, largest first.`,
        meta,
        rows: summarize(list, key, (r) => r.value),
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
                subtitle: 'Every recorded supplier invoice, with the purchase order and requisition it belongs to.',
                meta,
                rows: list,
                columns: detail,
              }),
              group('By Supplier', 'Supplier', (r) => r.supplier_name),
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
            { header: 'Invoice', value: (r) => r.invoice_number },
            { header: 'Date', value: (r) => dateOnly(r.invoice_date) },
            { header: 'Supplier', value: (r) => r.supplier_name },
            { header: 'Project', value: (r) => r.project },
            { header: 'PO', value: (r) => r.po_numbers ?? '—' },
            { header: 'Status', value: (r) => STATUS_LABEL[r.status] ?? r.status },
            { header: 'Amount (GHS)', value: (r) => r.value, total: true },
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
              return {
                id: r.attachment_id!,
                fileName: `${dateOnly(r.invoice_date)} - INV ${r.invoice_number}${ext}`,
                folder: r.supplier_name,
                index: {
                  'Invoice number': r.invoice_number,
                  'Invoice date': dateOnly(r.invoice_date),
                  Supplier: r.supplier_name,
                  'Amount (GHS)': r.value,
                  'Against PO': r.po_numbers,
                  Project: r.project,
                  Status: STATUS_LABEL[r.status] ?? r.status,
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
    <div className="space-y-6">
      <StatGrid
        stats={[
          {
            label: 'Invoiced',
            value: ghsFull(stats.total),
            icon: <Receipt size={18} />,
            tone: 'purple',
            compare: `${stats.count} invoice${stats.count === 1 ? '' : 's'} from ${stats.suppliers} supplier${stats.suppliers === 1 ? '' : 's'}`,
          },
          {
            label: 'Verified by Cost Control',
            value: ghsFull(stats.verifiedValue),
            icon: <BadgeCheck size={18} />,
            tone: 'emerald',
            share: stats.total > 0 ? stats.verifiedValue / stats.total : 0,
            compare: `${stats.verifiedCount} verified · ${stats.awaiting} awaiting verification`,
          },
          {
            label: 'Billed above requisition',
            value: stats.overBilled,
            icon: <Scale size={18} />,
            tone: stats.overBilled > 0 ? 'red' : 'emerald',
            compare:
              stats.overBilled > 0
                ? `Supplier invoices exceed what was requisitioned by ${ghsFull(stats.overBilledBy)}`
                : 'No supplier has invoiced more than was requisitioned',
          },
          {
            label: 'Missing paperwork',
            value: stats.noDocument,
            icon: <AlertTriangle size={18} />,
            tone: stats.noDocument > 0 ? 'amber' : 'emerald',
            compare: `${stats.noDocument} without a document · ${stats.noPo} with no matching PO`,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Invoiced by supplier" caption="Who is billing">
          <RankedBars rows={charts.supplier} unit="invoice" />
        </ChartCard>
        <ChartCard title="Invoiced by project" caption="Which sites the invoices are for">
          <RankedBars rows={charts.project} unit="invoice" />
        </ChartCard>
        <ChartCard title="Monthly invoiced value" caption="Last 12 months, by invoice date">
          <MonthColumns points={charts.months} unit="invoice" />
        </ChartCard>
      </div>

      <DataView
        rows={rows}
        getRowId={(r) => r.id}
        columns={columns}
        facets={facets}
        onVisibleRows={setVisible}
        onRowClick={(r) => router.push(`/admin/requests/${r.request_id}`)}
        searchPlaceholder="Search invoice number, supplier, project, PO…"
        searchText={(r) => [r.invoice_number, r.supplier_name, r.project, r.engineer, r.po_numbers, r.request_purpose]}
        defaultSort={{ id: 'date', dir: 'desc' }}
        storageKey="admin-invoice-report"
        toolbarExtra={(list) => <ReportExportMenu count={list.length} noun="invoice" options={exportOptions(list)} />}
        emptyTitle="No supplier invoices recorded"
        emptyMessage="Invoices appear here once Supply Chain or Cost Control records them on a requisition."
      />
    </div>
  )
}
