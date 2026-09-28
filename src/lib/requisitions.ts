export interface RichRequisitionData {
  type: 'rich_requisition'
  header: {
    companyLogo: string
    docTitle: string
    docNo: string
    version: string
    page: string
  }
  details: {
    name: string
    department: string
    project: string
    date: string
  }
  items: Array<{
    category?: 'material' | 'labour' | 'other'
    isSubcontractor?: boolean
    description: string
    quantity: number
    unit?: string
    unitPrice: number
    amount: number
    supplierName?: string
    remarks: string
  }>
  signatures: {
    requestedBy: string
    headOfDept: string
    approvedBy: string
    paidBy: string
  }
  generalNotes?: string
}

/** Pull a rich requisition payload out of a description, tolerating a
 *  human-readable prefix such as "[PO#: PO-2026-0472] {…json…}". */
export function extractRequisition(description?: string | null): {
  data: RichRequisitionData | null
  poNumber: string | null
} {
  if (!description) return { data: null, poNumber: null }
  const poMatch = description.match(/\[PO#:\s*([^\]]+)\]/i)
  const poNumber = poMatch ? poMatch[1].trim() : null

  const start = description.indexOf('{')
  const end = description.lastIndexOf('}')
  if (start === -1 || end <= start) return { data: null, poNumber }
  try {
    const parsed = JSON.parse(description.slice(start, end + 1))
    if (parsed && parsed.type === 'rich_requisition') {
      return { data: parsed as RichRequisitionData, poNumber }
    }
  } catch {
    /* not a rich requisition */
  }
  return { data: null, poNumber }
}

export function isRichRequisition(description?: string | null): boolean {
  return extractRequisition(description).data !== null
}
