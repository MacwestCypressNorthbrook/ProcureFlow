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

/** A recorded supplier invoice, with the requisition and purchase orders it belongs to. */
export interface AdminInvoice {
  id: string
  request_id: string
  supplier_id: string
  supplier_name: string
  invoice_number: string
  invoice_date: string
  amount: number | string
  status: 'recorded' | 'verified' | string
  notes: string | null
  created_at: string
  verified_at: string | null
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
