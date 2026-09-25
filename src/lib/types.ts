export type UserRole =
  | 'engineer'
  | 'supply_chain'
  | 'finance'
  | 'cost_control'
  | 'project_lead'
  | 'super_user'
  | 'administrator'
  | 'adminstrator'
  // Legacy aliases for backwards compatibility
  | 'minta'
  | 'sam'

export interface User {
  id: string
  auth_id: string
  email: string
  name: string | null
  role: UserRole | string
  company_id: string | null
  avatar_url: string | null
  phone?: string | null
  is_active?: boolean
  created_at: string
  updated_at: string
}

/** A user row joined with the project sites they are assigned to. */
export interface UserWithProjects extends User {
  projects: Array<Pick<Project, 'id' | 'name' | 'code'>>
}

export type RequestStatus =
  | 'draft'
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'converted'
  | 'cancelled'

export interface Request {
  id: string
  purpose: string
  description: string | null
  department?: string | null
  estimated_quantity: number | null
  estimated_unit_rate: number | null
  total_amount?: number | null
  currency?: string | null
  guest_name: string | null
  guest_email: string | null
  project_id?: string | null
  created_by: string | null
  status: RequestStatus | string
  notes?: string | null
  created_at: string
  updated_at: string
  /**
   * Purchase-order summary, present when the query joins it in. A requisition
   * with `has_po: false` is one still waiting for an administrator to raise
   * and attach its PO.
   */
  /** Set when a reviewer returns the requisition to an earlier stage. */
  sent_back_to?: string | null
  return_to_stage?: string | null
  has_po?: boolean
  po_id?: string | null
  po_number?: string | null
  po_status?: string | null
  /** Overall discount Supply Chain applied across the materials, subtracted from the line-item subtotal. */
  discount_amount?: number | null
}

export type POStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'sent_back'
  | 'cancelled'

export interface PurchaseOrder {
  id: string
  po_number?: string | null
  request_id: string | null
  purpose: string
  description: string | null
  vendor_name?: string | null
  quantity: number | null
  unit_rate: number | null
  total_amount: number | null
  file_path: string | null
  file_name: string | null
  created_by: string | null
  status: POStatus | string
  approved_by?: string | null
  approved_at?: string | null
  sam_approved_by?: string | null
  sam_approved_at?: string | null
  sam_rejection_reason?: string | null
  rejection_reason?: string | null
  paid_by: string | null
  paid_at: string | null
  notes?: string | null
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
  file_size?: number | null
  file_type?: string | null
  uploaded_by: string | null
  created_at: string
}

export interface RequestAttachment {
  id: string
  request_id: string
  file_name: string
  file_url: string
  file_size?: number | null
  file_type?: string | null
  uploaded_by: string | null
  created_at: string
}

export interface PoComment {
  id: string
  po_id: string
  user_id: string | null
  user_name: string | null
  comment: string
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  type: 'info' | 'approval' | 'reminder' | 'warning' | 'success'
  link?: string | null
  is_read: boolean
  created_at: string
}

export interface Reminder {
  id: string
  target_id: string
  target_type: 'request' | 'purchase_order'
  user_id: string
  title: string
  message?: string | null
  due_date: string
  status: 'pending' | 'sent' | 'dismissed' | 'cancelled'
  sent_at?: string | null
  last_sent_via?: 'email_resend' | 'email_smtp' | 'in_app' | null
  created_at: string
  updated_at: string
}


export type ProjectStatus = 'active' | 'on_hold' | 'archived'

/** A project site. Requisitions are raised against one of these. */
export interface Project {
  id: string
  name: string
  code: string | null
  site_location: string | null
  client: string | null
  description: string | null
  status: ProjectStatus | string
  created_by: string | null
  created_at: string
  updated_at: string
}

/** A project row decorated with its assigned-member count, for admin listings. */
export interface ProjectWithMemberCount extends Project {
  member_count: number
}

/** A vendor that materials can be sourced from. */
export interface Supplier {
  id: string
  name: string
  category: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  tin: string | null
  notes: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

/** One material line on a requisition. `line_total` is computed by Postgres. */
export interface RequestItem {
  id: string
  request_id: string
  position: number
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  line_total: number
  supplier_id: string | null
  remarks: string | null
  created_at: string
}

/** A line item joined with its supplier's display name. */
export interface RequestItemWithSupplier extends RequestItem {
  supplier_name: string | null
}
