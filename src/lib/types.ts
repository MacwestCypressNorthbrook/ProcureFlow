export interface User {
  id: string
  email: string
  name: string | null
  role: string
  company_id: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Request {
  id: string
  purpose: string
  description: string | null
  estimated_quantity: number | null
  estimated_unit_rate: number | null
  guest_name: string | null
  guest_email: string | null
  created_by: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface PurchaseOrder {
  id: string
  request_id: string | null
  purpose: string
  description: string | null
  quantity: number | null
  unit_rate: number | null
  total_amount: number | null
  file_path: string | null
  file_name: string | null
  created_by: string | null
  status: string
  sam_approved_by: string | null
  sam_approved_at: string | null
  sam_rejection_reason: string | null
  paid_by: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

export interface PoAuditTrail {
  id: string
  po_id: string
  action: string
  performed_by: string | null
  notes: string | null
  created_at: string
}

export interface PoAttachment {
  id: string
  po_id: string
  file_name: string
  file_url: string
  uploaded_by: string | null
  created_at: string
}
