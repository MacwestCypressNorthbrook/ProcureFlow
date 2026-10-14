import { zip } from '@/lib/zip'

/**
 * A real Excel workbook (.xlsx), written in the browser with no dependency.
 *
 * The older export (`lib/export.ts`) serves an HTML table as `.xls`: Excel opens
 * it, but warns that the format does not match, keeps one sheet, and treats
 * every date as text. This writes genuine Office Open XML instead, so a report
 * opens cleanly with:
 *
 *   - several sheets (the detail plus summaries),
 *   - a styled header that stays frozen while scrolling, with filter arrows,
 *   - money in GHS, counts with thousands separators, real dates that sort,
 *   - zebra rows and a bold totals row computed by Excel's own SUM.
 */

export type CellFormat = 'text' | 'money' | 'int' | 'date' | 'percent'
export type CellValue = string | number | Date | null | undefined

export interface XlsxColumn<T> {
  header: string
  value: (row: T) => CellValue
  format?: CellFormat
  /** Width in characters. */
  width?: number
  /** Sum this column in the totals row. */
  total?: boolean
}

export interface XlsxSheetInput<T> {
  name: string
  title: string
  subtitle?: string
  /** Extra lines under the title — who exported it, which filters were on. */
  meta?: string[]
  columns: XlsxColumn<T>[]
  rows: T[]
}

/** A sheet with its cells resolved, so sheets of different row types can share a workbook. */
export interface XlsxSheet {
  name: string
  title: string
  subtitle?: string
  meta: string[]
  headers: string[]
  formats: CellFormat[]
  widths: number[]
  totals: boolean[]
  cells: CellValue[][]
}

export function sheet<T>(input: XlsxSheetInput<T>): XlsxSheet {
  return {
    name: input.name,
    title: input.title,
    subtitle: input.subtitle,
    meta: input.meta ?? [],
    headers: input.columns.map((c) => c.header),
    formats: input.columns.map((c) => c.format ?? 'text'),
    widths: input.columns.map((c) => c.width ?? Math.max(10, Math.min(48, c.header.length + 4))),
    totals: input.columns.map((c) => Boolean(c.total)),
    cells: input.rows.map((row) => input.columns.map((c) => c.value(row))),
  }
}

/* ── Styles ─────────────────────────────────────────────────────────────────
   cellXfs indices, referenced as s="n" below. Body styles come in pairs: plain
   and zebra-striped. */
const S = {
  title: 1,
  subtitle: 2,
  meta: 3,
  header: 4,
  headerRight: 5,
  body: { text: 6, money: 7, int: 8, date: 9, percent: 10 } as Record<CellFormat, number>,
  zebra: { text: 11, money: 12, int: 13, date: 14, percent: 15 } as Record<CellFormat, number>,
  total: { text: 16, money: 17, int: 18, date: 16, percent: 16 } as Record<CellFormat, number>,
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2">
<numFmt numFmtId="164" formatCode="&quot;GHS&quot;\\ #,##0.00"/>
<numFmt numFmtId="165" formatCode="dd\\ mmm\\ yyyy"/>
</numFmts>
<fonts count="6">
<font><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="16"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF475569"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="9"/><color rgb="FF64748B"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>
<border><left/><right/><top style="medium"><color rgb="FF0F172A"/></top><bottom style="medium"><color rgb="FF0F172A"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="19">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="9" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="3" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="165" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="9" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="5" fillId="4" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="5" fillId="4" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="3" fontId="5" fillId="4" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

/* ── Cells ──────────────────────────────────────────────────────────────── */

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control characters other than tab/newline are invalid in XML.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

function colName(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** Excel stores dates as days since 1899-12-30. The calendar day is kept, not the instant. */
function excelDate(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000 + 25569
}

function toDate(v: CellValue): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v === 'string' && v) {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

function cell(ref: string, value: CellValue, format: CellFormat, style: number): string {
  if (value === null || value === undefined || value === '') return `<c r="${ref}" s="${style}"/>`
  if (format === 'date') {
    const d = toDate(value)
    return d ? `<c r="${ref}" s="${style}"><v>${excelDate(d)}</v></c>` : `<c r="${ref}" s="${style}"/>`
  }
  if (format === 'money' || format === 'int' || format === 'percent') {
    const n = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(n)) return `<c r="${ref}" s="${style}"><v>${n}</v></c>`
  }
  const text = value instanceof Date ? value.toLocaleDateString('en-GB') : String(value)
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`
}

function textRow(r: number, text: string, style: number, height?: number): string {
  return `<row r="${r}"${height ? ` ht="${height}" customHeight="1"` : ''}><c r="A${r}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c></row>`
}

function sheetXml(s: XlsxSheet): { xml: string; filterRef: string | null } {
  const lastCol = colName(Math.max(0, s.headers.length - 1))
  const rows: string[] = []
  const merges: string[] = []
  let r = 1

  rows.push(textRow(r, s.title, S.title, 24))
  merges.push(`A${r}:${lastCol}${r}`)
  r++
  if (s.subtitle) {
    rows.push(textRow(r, s.subtitle, S.subtitle))
    merges.push(`A${r}:${lastCol}${r}`)
    r++
  }
  for (const line of s.meta) {
    rows.push(textRow(r, line, S.meta))
    merges.push(`A${r}:${lastCol}${r}`)
    r++
  }
  r++ // a breathing row before the table

  const headerRow = r
  rows.push(
    `<row r="${r}" ht="22" customHeight="1">${s.headers
      .map((h, i) => {
        const right = s.formats[i] === 'money' || s.formats[i] === 'int' || s.formats[i] === 'percent'
        return cell(`${colName(i)}${r}`, h, 'text', right ? S.headerRight : S.header)
      })
      .join('')}</row>`
  )
  r++

  const firstData = r
  s.cells.forEach((values, ri) => {
    const styles = ri % 2 === 1 ? S.zebra : S.body
    rows.push(
      `<row r="${r}">${values.map((v, i) => cell(`${colName(i)}${r}`, v, s.formats[i], styles[s.formats[i]])).join('')}</row>`
    )
    r++
  })
  const lastData = r - 1

  if (s.totals.some(Boolean) && s.cells.length > 0) {
    rows.push(
      `<row r="${r}">${s.headers
        .map((_, i) => {
          const ref = `${colName(i)}${r}`
          const style = S.total[s.formats[i]]
          if (s.totals[i]) {
            const col = colName(i)
            const sum = s.cells.reduce((acc, row) => acc + (Number(row[i]) || 0), 0)
            return `<c r="${ref}" s="${style}"><f>SUM(${col}${firstData}:${col}${lastData})</f><v>${sum}</v></c>`
          }
          return i === 0 ? cell(ref, `Total (${s.cells.length})`, 'text', style) : `<c r="${ref}" s="${style}"/>`
        })
        .join('')}</row>`
    )
  }

  const filterRef = s.cells.length > 0 ? `A${headerRow}:${lastCol}${lastData}` : null
  const cols = s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${headerRow + 1}" sqref="A${headerRow + 1}"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="16"/>
<cols>${cols}</cols>
<sheetData>${rows.join('')}</sheetData>
${filterRef ? `<autoFilter ref="${filterRef}"/>` : ''}
<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`
  return { xml, filterRef }
}

function safeSheetName(name: string, taken: Set<string>): string {
  let base = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet'
  let candidate = base
  let n = 2
  while (taken.has(candidate.toLowerCase())) {
    const suffix = ` (${n++})`
    base = base.slice(0, 31 - suffix.length)
    candidate = base + suffix
  }
  taken.add(candidate.toLowerCase())
  return candidate
}

export function buildXlsx(sheets: XlsxSheet[]): Blob {
  const enc = new TextEncoder()
  const taken = new Set<string>()
  const names = sheets.map((s) => safeSheetName(s.name, taken))
  const built = sheets.map(sheetXml)

  const definedNames = built
    .map((b, i) =>
      b.filterRef
        ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${names[i].replace(/'/g, "''")}'!${b.filterRef
            .split(':')
            .map((ref) => ref.replace(/([A-Z]+)(\d+)/, '$$$1$$$2'))
            .join(':')}</definedName>`
        : ''
    )
    .join('')

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
${definedNames ? `<definedNames>${definedNames}</definedNames>` : ''}
</workbook>`

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  const blob = zip([
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'xl/workbook.xml', data: enc.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(workbookRels) },
    { name: 'xl/styles.xml', data: enc.encode(STYLES) },
    ...built.map((b, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(b.xml) })),
  ])
  return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Group rows and sum a value — the shape every summary sheet takes. */
export function summarize<T>(
  rows: T[],
  key: (row: T) => string,
  amount: (row: T) => number
): { name: string; count: number; total: number; share: number; average: number }[] {
  const map = new Map<string, { count: number; total: number }>()
  for (const row of rows) {
    const k = key(row) || '—'
    const entry = map.get(k) ?? { count: 0, total: 0 }
    entry.count++
    entry.total += amount(row) || 0
    map.set(k, entry)
  }
  const grand = [...map.values()].reduce((s, e) => s + e.total, 0)
  return [...map.entries()]
    .map(([name, e]) => ({
      name,
      count: e.count,
      total: e.total,
      share: grand > 0 ? e.total / grand : 0,
      average: e.count > 0 ? e.total / e.count : 0,
    }))
    .sort((a, b) => b.total - a.total)
}
