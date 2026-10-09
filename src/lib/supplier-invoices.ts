import { query } from '@/lib/db'

export interface SupplierInvoice {
  id: string
  request_id: string
  supplier_id: string
  supplier_name: string
  invoice_number: string
  invoice_date: string // YYYY-MM-DD
  amount: number
  attachment_id: string | null
  attachment_name: string | null
  notes: string | null
  status: 'recorded' | 'verified'
  recorded_by: string | null
  recorded_by_name: string | null
  verified_by_name: string | null
  verified_at: string | null
  created_at: string
}

/** Postgres "undefined_table": the migration that creates invoices has not been applied. */
export const isMissingTable = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01'

/**
 * The invoices recorded against a requisition.
 *
 * Returns `null` — not an empty list — when the table does not exist yet, so
 * the review page can hide the panel instead of offering a form that cannot
 * save. Code deployed ahead of migration 016 then degrades quietly rather than
 * breaking every review screen.
 */
export async function getRequestInvoices(requestId: string): Promise<SupplierInvoice[] | null> {
  try {
    return await query<SupplierInvoice>(
      `SELECT i.id, i.request_id, i.supplier_id, s.name AS supplier_name, i.invoice_number,
              to_char(i.invoice_date, 'YYYY-MM-DD') AS invoice_date,
              i.amount::float8 AS amount, i.attachment_id, ra.file_name AS attachment_name,
              i.notes, i.status, i.recorded_by, rb.name AS recorded_by_name,
              vb.name AS verified_by_name, i.verified_at, i.created_at
         FROM public.supplier_invoices i
         JOIN public.suppliers s ON s.id = i.supplier_id
         LEFT JOIN public.request_attachments ra ON ra.id = i.attachment_id
         LEFT JOIN public.users rb ON rb.id = i.recorded_by
         LEFT JOIN public.users vb ON vb.id = i.verified_by
        WHERE i.request_id = $1
        ORDER BY i.created_at DESC`,
      [requestId]
    )
  } catch (err) {
    if (isMissingTable(err)) return null
    throw err
  }
}
