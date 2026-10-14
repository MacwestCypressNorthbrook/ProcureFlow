import { query, queryOne } from '@/lib/db'

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

/**
 * Does this filename read as an invoice?
 *
 * Invoices reached this system as attachments long before they were records,
 * and they still arrive that way — Engineers and Supply Chain both upload them.
 * Nothing on `request_attachments` says "this one is an invoice", so the name is
 * the only signal there is. Checked against every attachment in production, this
 * pattern caught all 25 invoices with no false positives, and correctly passed
 * over the IPC (interim payment certificate) files, which are not invoices.
 *
 * It is a heuristic, deliberately a tight one: an invoice photographed and left
 * as `IMG_4021.jpeg` will not match. The requisition's own panel lists every
 * attachment regardless, so nothing is unreachable — this only decides what the
 * Invoices report volunteers, where a false positive would be a site photo
 * sitting in a financial ledger.
 *
 * `INVOICE_FILENAME_SQL` is the same rule in Postgres spelling (`\y` is its word
 * boundary, where JavaScript writes `\b`). Change one and change the other.
 */
export const INVOICE_FILENAME_RE = /invoice|\binv[\s._-]*\d/i
export const INVOICE_FILENAME_SQL = String.raw`invoice|\yinv[[:space:]._-]*[0-9]`

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

/**
 * Is `request_attachments.is_invoice` present yet?
 *
 * The column arrives with migration 019 and migrations here are applied by
 * hand, so code that reaches production first must keep working without it.
 * Every reader and writer asks here and falls back to the filename, which is
 * all the system had to go on before.
 *
 * Mirrors `poHasSupplierColumn` deliberately — same problem, same shape.
 */
let invoiceFlagKnown: boolean | null = null
let invoiceFlagCheckedAt = 0

export async function attachmentsHaveInvoiceFlag(): Promise<boolean> {
  // A present column never disappears, so "yes" is cached for good; "no" is
  // re-checked each minute so applying the migration takes effect without a deploy.
  if (invoiceFlagKnown === true || (invoiceFlagKnown === false && Date.now() - invoiceFlagCheckedAt < 60_000)) {
    return invoiceFlagKnown
  }
  try {
    const row = await queryOne<{ present: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'request_attachments' AND column_name = 'is_invoice'
       ) AS present`
    )
    invoiceFlagKnown = row?.present === true
  } catch {
    invoiceFlagKnown = false
  }
  invoiceFlagCheckedAt = Date.now()
  return invoiceFlagKnown
}

/**
 * SQL for "this attachment is an invoice", whichever columns exist.
 *
 * Once 019 is applied the stated flag wins and the filename is consulted only
 * for rows nobody has judged (`is_invoice IS NULL`), which is what keeps the
 * day of the migration uneventful: everything the report showed before, it
 * still shows after.
 *
 * `$1` is `INVOICE_FILENAME_SQL`.
 */
export const invoiceAttachmentSql = (hasFlag: boolean) =>
  hasFlag
    ? `COALESCE(ra.is_invoice, ra.file_name ~* $1)`
    : `(ra.file_name ~* $1)`
