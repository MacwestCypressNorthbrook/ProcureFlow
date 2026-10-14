import { query, queryOne } from '@/lib/db'
import { statusForStage, type Stage, type RequestStatus } from '@/lib/workflow'
import type { PurchaseOrder, Request as DbRequest } from '@/lib/types'
import type { ApprovalEntry, ReviewDocument } from '@/components/shared/ApprovalPanel'
import { documentHref } from '@/lib/resolve-file-url'
import { attachmentsHaveInvoiceFlag } from '@/lib/supplier-invoices'

export interface QueueRow extends DbRequest {
  sent_back_to: string | null
  return_to_stage: string | null
  project_name: string | null
  requester_name: string | null
  item_count: number
  document_count: number
  /** Distinct suppliers across the lines — each one means its own purchase order. */
  supplier_count?: number
  supplier_names?: string | null
  po_id: string | null
  po_number: string | null
  po_status: string | null
  /** True once a purchase order exists for this requisition. */
  has_po: boolean
  /** Escalated by the Project Lead for emergency approval. */
  is_urgent: boolean | null
  urgent_reason: string | null
  urgent_marked_at: string | null
  /** Who escalated it, resolved for display. */
  urgent_marked_by_name: string | null
}

/**
 * Everything sitting at one or more stages, newest first.
 *
 * The joins are folded in here rather than in each page so every queue shows
 * the same columns — requester, site, line count, documents and the purchase
 * order once one exists.
 */
export async function getStageQueue(statuses: RequestStatus[]): Promise<QueueRow[]> {
  if (statuses.length === 0) return []
  try {
    return await query<QueueRow>(
      `SELECT r.*,
              p.name AS project_name,
              u.name AS requester_name,
              (SELECT COUNT(*)::int FROM public.request_items ri WHERE ri.request_id = r.id) AS item_count,
              (SELECT COUNT(*)::int FROM public.request_attachments ra WHERE ra.request_id = r.id) AS document_count,
              (SELECT COUNT(DISTINCT ri.supplier_id)::int FROM public.request_items ri
                WHERE ri.request_id = r.id AND ri.supplier_id IS NOT NULL) AS supplier_count,
              (SELECT string_agg(DISTINCT s.name, ', ') FROM public.request_items ri
                 JOIN public.suppliers s ON s.id = ri.supplier_id
                WHERE ri.request_id = r.id) AS supplier_names,
              po.id AS po_id,
              po.po_number,
              po.status AS po_status,
              (po.id IS NOT NULL) AS has_po,
              uu.name AS urgent_marked_by_name
         FROM public.requests r
         LEFT JOIN public.projects p ON p.id = r.project_id
         LEFT JOIN public.users u ON u.id = r.created_by
         LEFT JOIN public.users uu ON uu.id = r.urgent_marked_by
         LEFT JOIN LATERAL (
              SELECT id, po_number, status
                FROM public.purchase_orders
               WHERE request_id = r.id
               ORDER BY created_at DESC
               LIMIT 1
         ) po ON true
        WHERE r.status = ANY($1::text[])
        ORDER BY r.is_urgent DESC, r.created_at DESC`,
      [statuses]
    )
  } catch (err) {
    console.error('Failed to load the stage queue from Neon:', err)
    return []
  }
}

/**
 * What a stage is actually holding — its queue.
 *
 * Two things sit with a stage: requisitions at its own status, and ones another
 * stage sent BACK to it, which carry `status = 'sent_back'` and name their
 * holder in `sent_back_to`. `currentStage()` has always treated both as held by
 * that stage; the queue used to filter on status alone, so a sent-back
 * requisition vanished from the queue it had been returned to and only showed
 * under All Requisitions.
 */
export async function getStageInbox(stage: Stage): Promise<QueueRow[]> {
  try {
    return await query<QueueRow>(
      `SELECT r.*,
              p.name AS project_name,
              u.name AS requester_name,
              (SELECT COUNT(*)::int FROM public.request_items ri WHERE ri.request_id = r.id) AS item_count,
              (SELECT COUNT(*)::int FROM public.request_attachments ra WHERE ra.request_id = r.id) AS document_count,
              (SELECT COUNT(DISTINCT ri.supplier_id)::int FROM public.request_items ri
                WHERE ri.request_id = r.id AND ri.supplier_id IS NOT NULL) AS supplier_count,
              (SELECT string_agg(DISTINCT s.name, ', ') FROM public.request_items ri
                 JOIN public.suppliers s ON s.id = ri.supplier_id
                WHERE ri.request_id = r.id) AS supplier_names,
              po.id AS po_id,
              po.po_number,
              po.status AS po_status,
              (po.id IS NOT NULL) AS has_po,
              uu.name AS urgent_marked_by_name
         FROM public.requests r
         LEFT JOIN public.projects p ON p.id = r.project_id
         LEFT JOIN public.users u ON u.id = r.created_by
         LEFT JOIN public.users uu ON uu.id = r.urgent_marked_by
         LEFT JOIN LATERAL (
              SELECT id, po_number, status
                FROM public.purchase_orders
               WHERE request_id = r.id
               ORDER BY created_at DESC
               LIMIT 1
         ) po ON true
        WHERE r.status = $1
           OR (r.status = 'sent_back' AND r.sent_back_to = $2)
        ORDER BY r.is_urgent DESC, r.created_at DESC`,
      [statusForStage(stage), stage]
    )
  } catch (err) {
    console.error('Failed to load the stage inbox from Neon:', err)
    return []
  }
}

/** Requisitions a given person raised that are waiting on them to fix. */
export async function getSentBackToRequester(userId: string): Promise<QueueRow[]> {
  try {
    return await query<QueueRow>(
      `SELECT r.*,
              p.name AS project_name,
              u.name AS requester_name,
              0 AS item_count,
              0 AS document_count,
              NULL::uuid AS po_id,
              NULL::text AS po_number,
              NULL::text AS po_status,
              false AS has_po,
              uu.name AS urgent_marked_by_name
         FROM public.requests r
         LEFT JOIN public.projects p ON p.id = r.project_id
         LEFT JOIN public.users u ON u.id = r.created_by
         LEFT JOIN public.users uu ON uu.id = r.urgent_marked_by
        WHERE r.status = 'sent_back'
          AND r.sent_back_to = 'requester'
          AND r.created_by = $1
        ORDER BY r.sent_back_at DESC NULLS LAST`,
      [userId]
    )
  } catch (err) {
    console.error('Failed to load sent-back requisitions from Neon:', err)
    return []
  }
}

export interface RequestItemRow {
  id: string
  position: number
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  line_total: number
  supplier_id: string | null
  supplier_name: string | null
  remarks: string | null
  category: 'material' | 'labour' | 'other'
  is_subcontractor: boolean
}

export interface ReviewBundle {
  request: QueueRow
  items: RequestItemRow[]
  /** The most recent purchase order — what single-order views and payments read. */
  po: PurchaseOrder | null
  /**
   * Every purchase order on the requisition, oldest first. A requisition
   * sourced from several suppliers is raised as one Odoo PO per vendor.
   */
  pos: PurchaseOrder[]
  documents: ReviewDocument[]
  history: ApprovalEntry[]
}

/**
 * One requisition with everything a reviewer needs to decide.
 *
 * Documents come from both the requisition and its purchase order, because
 * every stage from the Administrator onward reviews both.
 */
export async function getReviewBundle(requestId: string): Promise<ReviewBundle | null> {
  try {
    const request = await queryOne<QueueRow>(
      `SELECT r.*,
              p.name AS project_name,
              u.name AS requester_name,
              0 AS item_count,
              0 AS document_count,
              NULL::uuid AS po_id,
              NULL::text AS po_number,
              NULL::text AS po_status,
              false AS has_po,
              uu.name AS urgent_marked_by_name
         FROM public.requests r
         LEFT JOIN public.projects p ON p.id = r.project_id
         LEFT JOIN public.users u ON u.id = r.created_by
         LEFT JOIN public.users uu ON uu.id = r.urgent_marked_by
        WHERE r.id = $1
        LIMIT 1`,
      [requestId]
    )
    if (!request) return null

    const hasInvoiceFlag = await attachmentsHaveInvoiceFlag()

    const [items, pos, requestDocs, history] = await Promise.all([
      query<RequestItemRow>(
        `SELECT ri.id, ri.position, ri.description, ri.quantity, ri.unit,
                ri.unit_price, ri.line_total, ri.remarks, ri.category, ri.is_subcontractor,
                ri.supplier_id, s.name AS supplier_name
           FROM public.request_items ri
           LEFT JOIN public.suppliers s ON s.id = ri.supplier_id
          WHERE ri.request_id = $1
          ORDER BY ri.position ASC`,
        [requestId]
      ),
      query<PurchaseOrder>(
        `SELECT * FROM public.purchase_orders
          WHERE request_id = $1
          ORDER BY created_at ASC`,
        [requestId]
      ),
      query<{
        id: string
        file_name: string
        file_url: string
        file_size: number | null
        status: string | null
        reviewed_by: string | null
        reviewed_at: string | null
        reviewer_name: string | null
        review_notes: string | null
        is_invoice: boolean | null
      }>(
        // `is_invoice` arrives with migration 019; selected through a column
        // list that tolerates its absence so the review page keeps working
        // either side of the migration.
        `SELECT ra.id, ra.file_name, ra.file_url, ra.file_size, ra.status,
                ra.reviewed_by, ra.reviewed_at, ra.review_notes,
                ${hasInvoiceFlag ? 'ra.is_invoice' : 'NULL::boolean AS is_invoice'},
                u.name AS reviewer_name
           FROM public.request_attachments ra
           LEFT JOIN public.users u ON u.id = ra.reviewed_by
          WHERE ra.request_id = $1
          ORDER BY ra.created_at DESC`,
        [requestId]
      ),
      query<ApprovalEntry>(
        `SELECT a.id, a.stage, a.action, a.comment, a.created_at,
                u.name AS performer_name
           FROM public.request_approvals a
           LEFT JOIN public.users u ON u.id = a.performed_by
          WHERE a.request_id = $1
          ORDER BY a.created_at DESC`,
        [requestId]
      ),
    ])

    const documents: ReviewDocument[] = requestDocs.map((d) => ({
      id: d.id,
      file_name: d.file_name,
      // Served through our own route, which signs on demand — a raw storage
      // key is a relative URL and would navigate to the wrong origin.
      file_url: documentHref(d.id, d.file_url),
      file_size: d.file_size,
      source: 'request' as const,
      status: (d.status as 'pending' | 'accepted' | 'declined') || 'pending',
      reviewed_by: d.reviewed_by,
      reviewed_at: d.reviewed_at,
      reviewer_name: d.reviewer_name,
      review_notes: d.review_notes,
      is_invoice: d.is_invoice,
    }))

    const po = pos.length > 0 ? pos[pos.length - 1] : null

    if (pos.length > 0) {
      const poDocs = await query<{
        id: string
        po_id: string
        file_name: string
        file_url: string
        file_size: number | null
      }>(
        `SELECT id, po_id, file_name, file_url, file_size
           FROM public.po_attachments
          WHERE po_id = ANY($1::uuid[])
          ORDER BY created_at DESC`,
        [pos.map((p) => p.id)]
      )
      for (const d of poDocs) {
        documents.push({
          id: d.id,
          file_name: d.file_name,
          file_url: documentHref(d.id, d.file_url),
          file_size: d.file_size,
          source: 'po',
          po_id: d.po_id,
        })
      }
      // Each PO's own uploaded file, for orders attached before po_attachments
      // existed. Attaching one today writes BOTH `purchase_orders.file_path`
      // and an attachments row for the same physical file, so listing it here
      // unconditionally showed every purchase order twice.
      for (const order of pos) {
        const alreadyListed = poDocs.some((d) => d.file_url === order.file_path)
        if (order.file_path && !alreadyListed) {
          documents.push({
            id: `po-file-${order.id}`,
            file_name: order.file_name ?? 'Purchase order',
            file_url: documentHref(`po-file-${order.id}`, order.file_path),
            source: 'po',
            po_id: order.id,
          })
        }
      }
    }

    return { request, items, po, pos, documents, history }
  } catch (err) {
    console.error('Failed to load the review bundle from Neon:', err)
    return null
  }
}

export interface StageDecision {
  id: string
  request_id: string
  action: string
  comment: string | null
  created_at: string
  actor_name: string | null
  purpose: string
  /** The requisition's stored document, so a decision can show what it was for. */
  description: string | null
  total_amount: number | null
  project_name: string | null
  requester_name: string | null
  po_number: string | null
  po_status: string | null
  is_urgent: boolean | null
}

/**
 * What a stage has already decided.
 *
 * A queue only answers "what is waiting on me"; once a reviewer approves, the
 * requisition moves on and leaves their screen with no trace. The decisions are
 * recorded either way — this reads them back so a stage can see its own record.
 *
 * Any stage can be passed, so the same view works for Project Lead, Supply
 * Chain and Finance.
 */
export async function getStageDecisions(
  stage: Stage,
  { limit = 200, actorId }: { limit?: number; actorId?: string } = {}
): Promise<StageDecision[]> {
  try {
    return await query<StageDecision>(
      `SELECT a.id,
              a.request_id,
              a.action,
              a.comment,
              a.created_at,
              u.name AS actor_name,
              r.purpose,
              r.description,
              r.total_amount,
              r.is_urgent,
              p.name AS project_name,
              ru.name AS requester_name,
              po.po_number,
              po.status AS po_status
         FROM public.request_approvals a
         JOIN public.requests r ON r.id = a.request_id
         LEFT JOIN public.users u ON u.id = a.performed_by
         LEFT JOIN public.users ru ON ru.id = r.created_by
         LEFT JOIN public.projects p ON p.id = r.project_id
         LEFT JOIN public.purchase_orders po ON po.id = a.po_id
        WHERE a.stage = $1
          -- Raising and editing a requisition are history, not a stage's decision.
          AND a.action NOT IN ('submitted', 'edited')
          AND ($2::uuid IS NULL OR a.performed_by = $2)
        ORDER BY a.created_at DESC
        LIMIT $3`,
      [stage, actorId ?? null, limit]
    )
  } catch (err) {
    console.error('Failed to load stage decisions from Neon:', err)
    return []
  }
}

/** Count waiting at each of a role's stages, for dashboard tiles. */
export async function getStageCounts(): Promise<Record<string, number>> {
  try {
    const rows = await query<{ status: string; count: number }>(
      `SELECT status, COUNT(*)::int AS count FROM public.requests GROUP BY status`
    )
    return Object.fromEntries(rows.map((r) => [r.status, r.count]))
  } catch (err) {
    console.error('Failed to count requisition stages in Neon:', err)
    return {}
  }
}

export type { Stage }
