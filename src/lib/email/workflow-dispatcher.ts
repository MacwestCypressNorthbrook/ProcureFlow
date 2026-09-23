import { query, queryOne } from '@/lib/db'
import { sendEmail } from '@/lib/email/client'
import { linkForRole } from '@/lib/links'
import {
  buildWorkflowEmailSubject,
  renderWorkflowEmailHtml,
  renderWorkflowEmailText,
  type WorkflowEmailData,
  type WorkflowEventType,
  type WorkflowItemLine,
} from '@/lib/email/templates/workflow-email'
import type { Request as DbRequest, PurchaseOrder, Project, User, RequestItem } from '@/lib/types'

export interface DispatchWorkflowEmailParams {
  eventType: WorkflowEventType
  requestId?: string | null
  poId?: string | null
  recipientUserId: string
  performerId?: string | null
  comments?: string | null
  customLink?: string | null
}

/**
 * Dispatch a rich, tailored email for critical procurement milestones:
 * - po_approved
 * - po_sent_back
 * - payment_complete
 * - converted
 */
export async function dispatchWorkflowEmail({
  eventType,
  requestId,
  poId,
  recipientUserId,
  performerId,
  comments,
  customLink,
}: DispatchWorkflowEmailParams): Promise<{ success: boolean; error?: string; mocked?: boolean }> {
  try {
    // 1. Fetch recipient
    const recipient = await queryOne<User>(
      `SELECT id, email, name, role FROM public.users WHERE id = $1 LIMIT 1`,
      [recipientUserId]
    )

    if (!recipient?.email) {
      return { success: false, error: 'Recipient has no valid email address' }
    }

    // 2. Hydrate PO and Request records
    let po: PurchaseOrder | null = null
    let req: DbRequest | null = null

    if (poId) {
      po = await queryOne<PurchaseOrder>(
        `SELECT * FROM public.purchase_orders WHERE id = $1 LIMIT 1`,
        [poId]
      )
      if (po?.request_id) {
        req = await queryOne<DbRequest>(
          `SELECT * FROM public.requests WHERE id = $1 LIMIT 1`,
          [po.request_id]
        )
      }
    }

    if (!req && requestId) {
      req = await queryOne<DbRequest>(
        `SELECT * FROM public.requests WHERE id = $1 LIMIT 1`,
        [requestId]
      )
      if (!po) {
        po = await queryOne<PurchaseOrder>(
          `SELECT * FROM public.purchase_orders WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [requestId]
        )
      }
    }

    // 3. Hydrate Project Site
    let project: Project | null = null
    if (req?.project_id) {
      project = await queryOne<Project>(
        `SELECT * FROM public.projects WHERE id = $1 LIMIT 1`,
        [req.project_id]
      )
    }

    // 4. Hydrate Requester
    let requester: User | null = null
    if (req?.created_by) {
      requester = await queryOne<User>(
        `SELECT id, name, email, role FROM public.users WHERE id = $1 LIMIT 1`,
        [req.created_by]
      )
    }

    // 5. Hydrate Performer (Action actor)
    let performer: User | null = null
    if (performerId) {
      performer = await queryOne<User>(
        `SELECT id, name, email, role FROM public.users WHERE id = $1 LIMIT 1`,
        [performerId]
      )
    }

    // 6. Hydrate Line Items
    let items: WorkflowItemLine[] = []
    const resolvedReqId = req?.id || po?.request_id
    if (resolvedReqId) {
      const dbItems = await query<RequestItem>(
        `SELECT description, quantity, unit, unit_price, line_total
         FROM public.request_items
         WHERE request_id = $1
         ORDER BY position ASC
         LIMIT 12`,
        [resolvedReqId]
      )
      items = dbItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        line_total: item.line_total,
      }))
    }

    // 7. Resolve target link
    let actionUrl = customLink || ''
    if (!actionUrl) {
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
      let relativePath = ''
      if (po?.id) {
        relativePath = linkForRole(recipient.role, { type: 'po', id: po.id })
      } else if (req?.id) {
        relativePath = linkForRole(recipient.role, { type: 'request', id: req.id })
      }
      actionUrl = `${baseUrl}${relativePath || '/'}`
    }

    // Calculate final financial total
    let totalAmount: number | null = null
    if (po?.total_amount != null) {
      totalAmount = Number(po.total_amount)
    } else if (req?.total_amount != null) {
      totalAmount = Number(req.total_amount)
    } else if (req?.estimated_quantity && req?.estimated_unit_rate) {
      totalAmount = Number(req.estimated_quantity) * Number(req.estimated_unit_rate)
    }

    const emailData: WorkflowEmailData = {
      eventType,
      recipientName: recipient.name || recipient.email,
      recipientRole: recipient.role,

      // Requisition context
      requestId: req?.id || po?.request_id || requestId || 'REQ',
      requestPurpose: req?.purpose || po?.purpose || 'Procurement Requisition',
      requestDescription: req?.description || po?.description || null,
      department: req?.department || null,
      projectName: project?.name || null,
      projectLocation: project?.site_location || null,
      requesterName: requester?.name || req?.guest_name || 'Team Member',
      requesterEmail: requester?.email || req?.guest_email || null,
      requestDate: req?.created_at || null,

      // PO context
      poId: po?.id || null,
      poNumber: po?.po_number || null,
      vendorName: po?.vendor_name || null,
      totalAmount,
      currency: req?.currency || 'GHS',
      quantity: po?.quantity || req?.estimated_quantity || null,
      unitRate: po?.unit_rate || req?.estimated_unit_rate || null,

      items,

      // Performer & notes
      performerName: performer?.name || null,
      performerRole: performer?.role || null,
      performerEmail: performer?.email || null,
      actionTimestamp: new Date(),
      comments: comments || po?.rejection_reason || null,

      actionUrl,
    }

    const subject = buildWorkflowEmailSubject(emailData)
    const html = renderWorkflowEmailHtml(emailData)
    const text = renderWorkflowEmailText(emailData)

    return await sendEmail({
      to: recipient.email,
      subject,
      html,
      text,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Error dispatching workflow email:', msg)
    return { success: false, error: msg }
  }
}
