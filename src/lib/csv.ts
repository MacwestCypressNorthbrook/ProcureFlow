/**
 * CSV export.
 *
 * Hand-written rather than pulled from a library: the whole job is escaping and
 * one download, and a spreadsheet export is exactly the place where a careless
 * escape turns a comma in a project name into a shifted column.
 */

export interface CsvColumn<T> {
  header: string
  value: (row: T) => unknown
}

/** Spreadsheets execute a cell that opens with one of these. Neutralise it. */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r']

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return formatDate(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  return String(value)
}

/** `YYYY-MM-DD HH:mm`, which every spreadsheet parses as a date. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** A plain number for the spreadsheet: no separators, no currency symbol. */
export function csvNumber(value: unknown): string {
  const n = Number(value)
  return Number.isFinite(n) ? String(n) : ''
}

function escapeCell(raw: string): string {
  // A leading formula trigger is disarmed with a single quote, which
  // spreadsheets strip on display but never evaluate.
  const guarded = FORMULA_TRIGGERS.some((t) => raw.startsWith(t)) ? `'${raw}` : raw
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(',')]
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(formatValue(c.value(row)))).join(','))
  }
  // CRLF is what Excel expects from a .csv file.
  return lines.join('\r\n')
}

/**
 * Hand the browser a file.
 *
 * The BOM matters: without it Excel reads the file as the local codepage and
 * renders GH₵ and accented names as mojibake.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the download a moment to start before the URL is reclaimed.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** `procureflow-users-2026-09-23.csv` */
export function csvFilename(section: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `procureflow-${section}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`
}
