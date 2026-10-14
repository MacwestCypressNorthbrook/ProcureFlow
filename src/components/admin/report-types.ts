import type { PurchaseOrder } from '@/lib/types'

/**
 * A purchase order with everything its report depends on: the requisition it
 * came from, who raised it and where, the supplier's share of the requisition
 * it covers, and what has been invoiced and paid against it.
 */
export interface AdminPurchaseOrder extends PurchaseOrder {
  request_purpose: string | null
  request_status: string | null
  request_created_at: string | null
  request_total: number | string | null
  department: string | null
  project_name: string | null
  project_code: string | null
  engineer_name: string | null
  raised_by_name: string | null
  paid_amount: number | string | null
  document_count: number | null
  /** Latest PO document, for bundling PDFs into a zip. */
  document_id: string | null
  document_name: string | null
  /** POs on the same requisition, this one included. */
  sibling_count: number | null
  /** Every supplier on the requisition. */
  requisition_suppliers: string | null
  /** The lines this PO's vendor supplies on the requisition, and their value. */
  supplier_line_count: number | null
  supplier_items: string | null
  supplier_requisitioned: number | string | null
}

/**
 * A row of the Invoices report — either a recorded invoice or an invoice
 * document that nobody has recorded yet.
 *
 * Both belong on the page. An invoice enters this system as a file: Engineers
 * and Supply Chain both upload them, and that happens weeks before, or instead
 * of, anyone keying in its number and amount. A report that listed only the
 * keyed-in records showed nothing at all while 25 invoice documents sat in the
 * system — so the document is a row in its own right, in the state it is
 * actually in.
 *
 * `kind` says which, and the fields a document cannot have are null on it: an
 * unrecorded invoice has no number, no date and no amount, and its supplier is
 * known only when the requisition names exactly one.
 */
export interface AdminInvoice {
  kind: 'invoice' | 'document'
  id: string
  request_id: string
  /** Null on a document whose requisition names no single supplier. */
  supplier_id: string | null
  supplier_name: string | null
  /** Null on a document: the number is printed on the file, not in the system. */
  invoice_number: string | null
  invoice_date: string | null
  amount: number | string | null
  status: 'recorded' | 'verified' | 'document' | string
  notes: string | null
  created_at: string
  verified_at: string | null
  /** Documents only: who attached the file, and when. */
  uploaded_by_name: string | null
  uploaded_at: string | null
  /** Documents only: Cost Control's review mark on the file itself. */
  document_review_status: string | null
  /** Documents only: how many suppliers the requisition names, when not exactly one. */
  supplier_candidates: number | null
  request_purpose: string | null
  request_status: string | null
  project_name: string | null
  engineer_name: string | null
  recorded_by_name: string | null
  verified_by_name: string | null
  attachment_id: string | null
  attachment_name: string | null
  attachment_url: string | null
  /** POs on the same requisition raised to this invoice's supplier. */
  po_numbers: string | null
  /** What the requisition priced for this supplier. */
  supplier_requisitioned: number | string | null
}

/** Vendor names are typed freehand on a PO; compare them loosely. Matches SQL `normalized_vendor`. */
export const vendorKey = (name: string | null | undefined) =>
  (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
