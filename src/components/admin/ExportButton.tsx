'use client'

import { Download } from 'lucide-react'
import { AdminButton } from './admin-ui'
import { toCsv, downloadCsv, csvFilename, type CsvColumn } from '@/lib/csv'

/**
 * Export what is on screen.
 *
 * It takes the rows DataView hands it — already filtered, searched and sorted —
 * so narrowing the table to twelve records and exporting gives twelve records,
 * not the whole table.
 */
export default function ExportButton<T>({
  rows,
  columns,
  section,
}: {
  rows: T[]
  columns: CsvColumn<T>[]
  section: string
}) {
  const count = rows.length

  return (
    <AdminButton
      type="button"
      variant="outline"
      className="shrink-0"
      disabled={count === 0}
      title={
        count === 0
          ? 'Nothing to export'
          : `Export these ${count} row${count === 1 ? '' : 's'} as a CSV file`
      }
      onClick={() => downloadCsv(csvFilename(section), toCsv(rows, columns))}
    >
      <Download size={15} />
      Export CSV
      {count > 0 && (
        <span className="ml-0.5 text-xs font-normal text-muted-foreground">({count})</span>
      )}
    </AdminButton>
  )
}
