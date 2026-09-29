/**
 * Excel and PDF export.
 *
 * Both are generated in the browser from the rows already on screen, so an
 * export always matches what the viewer filtered down to rather than dumping
 * the whole table.
 *
 * No new dependency for either:
 *
 *   Excel — an HTML table served as `application/vnd.ms-excel`. Excel, Numbers
 *     and LibreOffice all open it, and unlike a CSV it carries column widths,
 *     a header style, right-aligned money and a totals row. A CSV export lives
 *     alongside it in `lib/csv.ts` for anyone feeding another system.
 *
 *   PDF — a print window holding a typeset document, which the browser's own
 *     "Save as PDF" turns into a file. A bundled PDF writer would add hundreds
 *     of kilobytes to the client for something every browser already does, and
 *     does better: real fonts, selectable text, correct page breaks.
 */

export interface ExportColumn<T> {
  header: string
  value: (row: T) => unknown
  /** Money and counts read far better right-aligned. */
  align?: 'left' | 'right' | 'center'
  /** Rendered as a number, so Excel sums it and PDF right-aligns it. */
  numeric?: boolean
  /** Included in the totals row. Implies `numeric`. */
  total?: boolean
}

export interface ExportMeta {
  /** "Cost Control — Reviewed requisitions" */
  title: string
  /** "Approvals and send-backs recorded by this stage." */
  subtitle?: string
  /** Who ran the export, printed in the footer for the audit trail. */
  exportedBy?: string | null
  /** Filters that were active, so a shared file explains itself. */
  filters?: string[]
}

function esc(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cellValue<T>(row: T, column: ExportColumn<T>): { text: string; num: number | null } {
  const raw = column.value(row)
  if (column.numeric || column.total) {
    const n = Number(raw)
    return { text: Number.isFinite(n) ? String(n) : '', num: Number.isFinite(n) ? n : null }
  }
  if (raw instanceof Date) return { text: raw.toLocaleString('en-GB'), num: null }
  if (raw === null || raw === undefined) return { text: '', num: null }
  return { text: String(raw), num: null }
}

function stamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function exportFilename(section: string, ext: string): string {
  return `procureflow-${section}-${stamp()}.${ext}`
}

/** Amounts are Ghana cedis throughout ProcureFlow. */
function money(n: number): string {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function totalsFor<T>(rows: T[], columns: ExportColumn<T>[]): Map<number, number> {
  const totals = new Map<number, number>()
  columns.forEach((column, i) => {
    if (!column.total) return
    let sum = 0
    for (const row of rows) {
      const { num } = cellValue(row, column)
      if (num !== null) sum += num
    }
    totals.set(i, sum)
  })
  return totals
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ============================================================
   Excel
   ============================================================ */

export function downloadExcel<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  meta: ExportMeta,
  section: string
): void {
  const totals = totalsFor(rows, columns)

  const head = columns
    .map(
      (c) =>
        `<th style="background:#0f172a;color:#ffffff;font-weight:700;font-size:11pt;padding:8px;border:1px solid #334155;text-align:${c.align ?? (c.numeric || c.total ? 'right' : 'left')};">${esc(c.header)}</th>`
    )
    .join('')

  const body = rows
    .map((row, ri) => {
      const cells = columns
        .map((c) => {
          const { text, num } = cellValue(row, c)
          const align = c.align ?? (c.numeric || c.total ? 'right' : 'left')
          // `x:num` is what makes Excel treat the cell as a number rather than
          // as text that merely looks like one.
          const attrs = num !== null ? ` x:num="${num}"` : ''
          return `<td${attrs} style="padding:6px 8px;border:1px solid #cbd5e1;text-align:${align};font-size:10pt;">${esc(text)}</td>`
        })
        .join('')
      return `<tr style="background:${ri % 2 === 0 ? '#ffffff' : '#f8fafc'};">${cells}</tr>`
    })
    .join('')

  const totalRow =
    totals.size > 0
      ? `<tr>${columns
          .map((c, i) => {
            if (totals.has(i)) {
              return `<td x:num="${totals.get(i)}" style="padding:8px;border:1px solid #94a3b8;background:#e2e8f0;font-weight:700;text-align:right;font-size:10pt;">${totals.get(i)}</td>`
            }
            return `<td style="padding:8px;border:1px solid #94a3b8;background:#e2e8f0;font-weight:700;font-size:10pt;">${i === 0 ? 'TOTAL' : ''}</td>`
          })
          .join('')}</tr>`
      : ''

  const filterLine = meta.filters?.length
    ? `<tr><td colspan="${columns.length}" style="padding:4px 8px;font-size:9pt;color:#64748b;">Filters: ${esc(meta.filters.join(' · '))}</td></tr>`
    : ''

  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>${esc(meta.title).slice(0, 31)}</x:Name>
<x:WorksheetOptions><x:FreezePanes/><x:SplitHorizontal>3</x:SplitHorizontal><x:TopRowBottomPane>3</x:TopRowBottomPane></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head>
<body>
<table border="0" cellspacing="0" cellpadding="0" style="font-family:Calibri,Arial,sans-serif;border-collapse:collapse;">
  <tr><td colspan="${columns.length}" style="font-size:16pt;font-weight:700;padding:10px 8px;color:#0f172a;">${esc(meta.title)}</td></tr>
  ${meta.subtitle ? `<tr><td colspan="${columns.length}" style="font-size:10pt;color:#475569;padding:0 8px 6px 8px;">${esc(meta.subtitle)}</td></tr>` : ''}
  <tr><td colspan="${columns.length}" style="font-size:9pt;color:#64748b;padding:0 8px 4px 8px;">Exported ${esc(new Date().toLocaleString('en-GB'))}${meta.exportedBy ? ` by ${esc(meta.exportedBy)}` : ''} · ${rows.length} record${rows.length === 1 ? '' : 's'} · Amounts in Ghana cedis (GHS)</td></tr>
  ${filterLine}
  <tr><td colspan="${columns.length}" style="height:8px;"></td></tr>
  <tr>${head}</tr>
  ${body}
  ${totalRow}
</table>
</body></html>`

  triggerDownload(
    new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' }),
    exportFilename(section, 'xls')
  )
}

/* ============================================================
   PDF
   ============================================================ */

/**
 * Open a typeset copy of the table and hand it to the browser's print dialog,
 * where "Save as PDF" is the destination.
 *
 * Landscape by default: these tables are wide, and a portrait page squeezes the
 * description column down to nothing.
 */
export function downloadPdf<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  meta: ExportMeta,
  { orientation = 'landscape' }: { orientation?: 'portrait' | 'landscape' } = {}
): boolean {
  const totals = totalsFor(rows, columns)

  const head = columns
    .map(
      (c) =>
        `<th style="text-align:${c.align ?? (c.numeric || c.total ? 'right' : 'left')}">${esc(c.header)}</th>`
    )
    .join('')

  const body = rows
    .map((row) => {
      const cells = columns
        .map((c) => {
          const { text, num } = cellValue(row, c)
          const align = c.align ?? (c.numeric || c.total ? 'right' : 'left')
          const display = c.total && num !== null ? money(num) : text
          return `<td style="text-align:${align}">${esc(display)}</td>`
        })
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')

  const totalRow =
    totals.size > 0
      ? `<tr class="totals">${columns
          .map((c, i) =>
            totals.has(i)
              ? `<td style="text-align:right">${esc(money(totals.get(i)!))}</td>`
              : `<td>${i === 0 ? 'Total' : ''}</td>`
          )
          .join('')}</tr>`
      : ''

  const win = window.open('', '_blank', 'width=1100,height=800')
  if (!win) return false

  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(meta.title)}</title>
<style>
  @page { size: A4 ${orientation}; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: #64748b; }
  h1 { font-size: 19px; font-weight: 800; margin: 5px 0 3px 0; letter-spacing: -0.01em; }
  .sub { font-size: 12px; color: #475569; margin: 0; }
  .meta { font-size: 10px; color: #94a3b8; margin-top: 7px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th {
    background: #0f172a; color: #fff; font-size: 9px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.05em; padding: 7px 8px; border: 1px solid #0f172a;
  }
  td { font-size: 10px; padding: 6px 8px; border: 1px solid #e2e8f0; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  tr { page-break-inside: avoid; }
  tr.totals td { background: #e2e8f0; font-weight: 800; font-size: 11px; border-color: #cbd5e1; }
  footer { margin-top: 14px; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 7px; }
  @media print { .noprint { display: none; } }
  .noprint { margin-bottom: 14px; }
  .noprint button {
    font: inherit; font-size: 13px; font-weight: 600; padding: 9px 18px; border-radius: 8px;
    border: 0; background: #0f172a; color: #fff; cursor: pointer;
  }
</style></head>
<body>
  <div class="noprint"><button onclick="window.print()">Save as PDF / Print</button></div>
  <header>
    <div class="brand">ProcureFlow</div>
    <h1>${esc(meta.title)}</h1>
    ${meta.subtitle ? `<p class="sub">${esc(meta.subtitle)}</p>` : ''}
    <div class="meta">
      Exported ${esc(new Date().toLocaleString('en-GB'))}${meta.exportedBy ? ` by ${esc(meta.exportedBy)}` : ''}
      · ${rows.length} record${rows.length === 1 ? '' : 's'} · Amounts in Ghana cedis (GHS)
      ${meta.filters?.length ? `<br>Filters: ${esc(meta.filters.join(' · '))}` : ''}
    </div>
  </header>
  <table><thead><tr>${head}</tr></thead><tbody>${body}${totalRow}</tbody></table>
  <footer>Generated by ProcureFlow · This document reflects the records visible to the exporter at the time of export.</footer>
</body></html>`)
  win.document.close()
  win.focus()
  return true
}
