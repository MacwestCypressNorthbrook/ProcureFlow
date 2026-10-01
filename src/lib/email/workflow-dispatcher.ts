import { query, queryOne } from '@/lib/db'
import { sendEmail } from '@/lib/email/client'
import { deliverNotificationEmail } from '@/lib/email/delivery'
import { linkForRole } from '@/lib/links'
import {
  buildWorkflowEmailSubject,
  renderWorkflowEmailHtml,
  renderWorkflowEmailText,
  type WorkflowChainStep,
  type WorkflowDocumentLine,
  type WorkflowEmailData,
  type WorkflowEventType,
  type WorkflowItemLine,
} from '@/lib/email/templates/workflow-email'
import { STAGES, STAGE_ORDER, currentStage } from '@/lib/workflow'
import { normalizeRole, type RoleId } from '@/lib/roles'
import { extractRequisition } from '@/lib/requisitions'
import type { Request as DbRequest, PurchaseOrder, Project, User, RequestItem } from '@/lib/types'

export interface DispatchWorkflowEmailParams {
  eventType: WorkflowEventType
  requestId?: string | null
  poId?: string | null
  /** One recipient. Pass this or `recipientRole`. */
  recipientUserId?: string | null
  /**
   * Every active holder of a role, each with the link resolved against their
   * own area. Used where the news belongs to a whole stage rather than to one
   * person — an urgent escalation reaching Supply Chain, for instance.
   */
  recipientRole?: RoleId | string | null
  performerId?: string | null
  comments?: string | null
  customLink?: string | null
  /** Names a specific document, for the invoice accepted / declined events. */
  documentName?: string | null
}

/**
 * The chain as a strip, with the requisition's position marked.
 *
 * Built from `STAGE_ORDER` rather than hard-coded, so it follows the workflow
 * whenever a stage moves.
 */
function buildChain(status: string, sentBackTo: string | null | undefined): WorkflowChainStep[] {
  const here = currentStage(status, sentBackTo)
  const hereIndex = here ? STAGE_ORDER.indexOf(here) : -1
  const done = status === 'completed'

  return STAGE_ORDER.map((stage, i) => ({
    label: STAGES[stage].label,
    state: done || (hereIndex >= 0 && i < hereIndex) ? 'done' : i === hereIndex ? 'here' : 'waiting',
  }))
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
  recipientRole,
  performerId,
  comments,
  customLink,
  documentName,
}: DispatchWorkflowEmailParams): Promise<{ success: boolean; error?: string; mocked?: boolean }> {
  try {
    // 1. Resolve recipients — one person, or every active holder of a role.
    let recipients: User[] = []

    if (recipientUserId) {
      recipients = await query<User>(
        `SELECT id, email, name, role FROM public.users WHERE id = $1 LIMIT 1`,
        [recipientUserId]
      )
    } else if (recipientRole) {
      const role = normalizeRole(recipientRole)
      if (!role) return { success: false, error: `Unknown recipient role: ${recipientRole}` }
      // Older rows still carry legacy role values such as `mintah` and `sam`.
      // Those map to a canonical role only through `normalizeRole`, which SQL
      // cannot call, so the match happens here rather than in the WHERE clause.
      const active = await query<User>(
        `SELECT id, email, name, role
           FROM public.users
          WHERE COALESCE(is_active, true)
            AND auth_id NOT LIKE 'pending:%'`
      )
      recipients = active.filter((u) => normalizeRole(u.role) === role)
    }

    recipients = recipients.filter((r) => Boolean(r?.email))
    if (recipients.length === 0) {
      return { success: false, error: 'No recipient with a valid email address' }
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

    // 6b. Hydrate the attached vendor invoices and quotes, with whatever Cost
    // Control decided about each. For an invoice event only the named document
    // is shown, so the email is about that one invoice rather than the pile.
    let documents: WorkflowDocumentLine[] = []
    if (resolvedReqId) {
      const dbDocs = await query<{
        file_name: string
        status: string | null
        review_notes: string | null
        reviewer_name: string | null
      }>(
        `SELECT ra.file_name, ra.status, ra.review_notes, u.name AS reviewer_name
           FROM public.request_attachments ra
           LEFT JOIN public.users u ON u.id = ra.reviewed_by
          WHERE ra.request_id = $1
          ORDER BY ra.created_at DESC
          LIMIT 12`,
        [resolvedReqId]
      )
      documents = dbDocs.map((d) => ({
        file_name: d.file_name,
        status: (d.status as WorkflowDocumentLine['status']) ?? 'pending',
        review_notes: d.review_notes,
        reviewer_name: d.reviewer_name,
      }))
      if (documentName) {
        const named = documents.filter((d) => d.file_name === documentName)
        if (named.length > 0) documents = named
      }
    }

    // Urgency and position on the chain are read off the requisition rather
    // than passed in, so any caller that emails about an urgent requisition
    // gets the red treatment without having to remember to ask for it.
    // `requests.description` usually holds a rich-requisition JSON document,
    // not prose. Sent through as-is it rendered as a wall of raw JSON in the
    // email body. Parse it: the itemised table already carries the line data,
    // so only the author's own `generalNotes` is worth showing as text.
    const rich = extractRequisition(req?.description ?? po?.description ?? null)
    const plainDescription = rich.data
      ? null
      : (req?.description ?? po?.description ?? null)
          // Drop the "[Odoo PO#: …]" prefix the convert step prepends.
          ?.replace(/^\s*\[(?:Odoo )?PO#:[^\]]*\]\s*/i, '')
          .trim() || null

    const reqRecord = (req ?? {}) as unknown as Record<string, unknown>
    const urgent = reqRecord.is_urgent === true
    const urgentReason = (reqRecord.urgent_reason as string | null) ?? null

    const holder = req ? currentStage(req.status, reqRecord.sent_back_to as string | null) : null
    const awaitingStageLabel = holder ? STAGES[holder].label : null

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

    /** The link has to resolve per recipient — the areas are role-guarded. */
    const urlFor = (user: User): string => {
      if (customLink) return customLink
      let relativePath = ''
      if (req?.id) {
        relativePath = linkForRole(user.role, { type: 'request', id: req.id })
      } else if (po?.id) {
        relativePath = linkForRole(user.role, { type: 'po', id: po.id })
      }
      return `${baseUrl}${relativePath || '/'}`
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

    const buildFor = (user: User): WorkflowEmailData => ({
      eventType,
      recipientName: user.name || user.email,
      recipientRole: user.role,

      // Requisition context
      requestId: req?.id || po?.request_id || requestId || 'REQ',
      requestPurpose: req?.purpose || po?.purpose || 'Procurement Requisition',
      requestDescription: plainDescription,
      department: req?.department || null,
      projectName: project?.name || null,
      projectLocation: project?.site_location || null,
      requesterName: requester?.name || req?.guest_name || 'Team Member',
      requesterEmail: requester?.email || req?.guest_email || null,
      requestDate: req?.created_at || null,
      notes: req?.notes || rich.data?.generalNotes?.trim() || null,

      // Escalation — an urgent requisition is themed red whatever the event.
      isUrgent: urgent,
      urgentReason: urgentReason,

      // PO context
      poId: po?.id || null,
      poNumber: po?.po_number || null,
      vendorName: po?.vendor_name || null,
      totalAmount,
      currency: req?.currency || 'GHS',
      quantity: po?.quantity || req?.estimated_quantity || null,
      unitRate: po?.unit_rate || req?.estimated_unit_rate || null,

      discountAmount: req ? Number((req as unknown as Record<string, unknown>).discount_amount) || null : null,

      items,
      documents,
      chain: req ? buildChain(req.status, (req as unknown as Record<string, unknown>).sent_back_to as string | null) : undefined,
      awaitingStageLabel,

      // Performer & notes
      performerName: performer?.name || null,
      performerRole: performer?.role || null,
      performerEmail: performer?.email || null,
      actionTimestamp: new Date(),
      comments: comments || po?.rejection_reason || null,

      actionUrl: urlFor(user),
    })

    // Each recipient gets their own render, because the link and the greeting
    // both depend on who is reading it.
    //
    // Whether each one is sent now, held for a digest, or dropped follows the
    // recipient's role setting. An urgent escalation always goes now.
    type SendResult = Awaited<ReturnType<typeof sendEmail>>
    const results = await Promise.all(
      recipients.map(async (user): Promise<SendResult> => {
        const data = buildFor(user)
        let result: SendResult = { success: true }
        await deliverNotificationEmail(
          { id: user.id, role: user.role },
          {
            title: buildWorkflowEmailSubject(data),
            message: data.comments,
            link: data.actionUrl,
            requestId: req?.id ?? po?.request_id ?? null,
          },
          async () => {
            result = await sendEmail({
              to: user.email,
              subject: buildWorkflowEmailSubject(data),
              html: renderWorkflowEmailHtml(data),
              text: renderWorkflowEmailText(data),
            })
          },
          { urgent: eventType === 'urgent_escalation' }
        )
        return result
      })
    )

    const failed = results.find((r) => !r.success)
    return failed ?? results[0]
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Error dispatching workflow email:', msg)
    return { success: false, error: msg }
  }
}
