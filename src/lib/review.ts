import { query, queryOne } from '@/lib/db'
import type { Stage, RequestStatus } from '@/lib/workflow'
import type { PurchaseOrder, Request as DbRequest } from '@/lib/types'
import type { ApprovalEntry, ReviewDocument } from '@/components/shared/ApprovalPanel'
import { documentHref } from '@/lib/resolve-file-url'

export interface QueueRow extends DbRequest {
  sent_back_to: string | null
  return_to_stage: string | null
  project_name: string | null
  requester_name: string | null
  item_count: number
  document_count: number
  po_id: string | null
  po_number: string | null
  po_status: string | null
  /** True once a purchase order exists for this requisition. */
  has_po: boolean
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
              po.id AS po_id,
              po.po_number,
              po.status AS po_status,
              (po.id IS NOT NULL) AS has_po
         FROM public.requests r
         LEFT JOIN public.projects p ON p.id = r.project_id
         LEFT JOIN public.users u ON u.id = r.created_by
         LEFT JOIN LATERAL (
              SELECT id, po_number, status
                FROM public.purchase_orders
               WHERE request_id = r.id
               ORDER BY created_at DESC
               LIMIT 1
         ) po ON true
        WHERE r.status = ANY($1::text[])
        ORDER BY r.created_at ASC`,
      [statuses]
    )
  } catch (err) {
    console.error('Failed to load the stage queue from Neon:', err)
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
              NULL::text AS po_status
         FROM public.requests r
         LEFT JOIN public.projects p ON p.id = r.project_id
         LEFT JOIN public.users u ON u.id = r.created_by
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
  supplier_name: string | null
  remarks: string | null
}

export interface ReviewBundle {
  request: QueueRow
  items: RequestItemRow[]
  po: PurchaseOrder | null
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
              NULL::text AS po_status
         FROM public.requests r
         LEFT JOIN public.projects p ON p.id = r.project_id
         LEFT JOIN public.users u ON u.id = r.created_by
        WHERE r.id = $1
        LIMIT 1`,
      [requestId]
    )
    if (!request) return null

    const [items, po, requestDocs, history] = await Promise.all([
      query<RequestItemRow>(
        `SELECT ri.id, ri.position, ri.description, ri.quantity, ri.unit,
                ri.unit_price, ri.line_total, ri.remarks,
                s.name AS supplier_name
           FROM public.request_items ri
           LEFT JOIN public.suppliers s ON s.id = ri.supplier_id
          WHERE ri.request_id = $1
          ORDER BY ri.position ASC`,
        [requestId]
      ),
      queryOne<PurchaseOrder>(
        `SELECT * FROM public.purchase_orders
          WHERE request_id = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [requestId]
      ),
      query<{ id: string; file_name: string; file_url: string; file_size: number | null }>(
        `SELECT id, file_name, file_url, file_size
           FROM public.request_attachments
          WHERE request_id = $1
          ORDER BY created_at ASC`,
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
    }))

    if (po) {
      const poDocs = await query<{ id: string; file_name: string; file_url: string; file_size: number | null }>(
        `SELECT id, file_name, file_url, file_size
           FROM public.po_attachments
          WHERE po_id = $1
          ORDER BY created_at ASC`,
        [po.id]
      )
      for (const d of poDocs) {
        documents.push({
          id: d.id,
          file_name: d.file_name,
          file_url: documentHref(d.id, d.file_url),
          file_size: d.file_size,
          source: 'po',
        })
      }
      // The PO's own uploaded file, when it was attached directly rather than
      // through the attachments table.
      if (po.file_path) {
        documents.push({
          id: `po-file-${po.id}`,
          file_name: po.file_name ?? 'Purchase order',
          file_url: documentHref(`po-file-${po.id}`, po.file_path),
          source: 'po',
        })
      }
    }

    return { request, items, po, documents, history }
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
  total_amount: number | null
  project_name: string | null
  requester_name: string | null
  po_number: string | null
  po_status: string | null
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
              r.total_amount,
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
