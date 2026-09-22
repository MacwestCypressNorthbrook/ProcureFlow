import { query } from '@/lib/db'
import type { RequestItemWithSupplier } from '@/lib/types'

/**
 * The material lines of a requisition, in the order they were entered.
 *
 * `request_items` is the queryable record of what was actually asked for —
 * the totals on `public.requests` are only a rollup of these rows.
 */
export async function getRequestItems(requestId: string): Promise<RequestItemWithSupplier[]> {
  return await query<RequestItemWithSupplier>(
    `SELECT ri.*, s.name AS supplier_name
       FROM public.request_items ri
       LEFT JOIN public.suppliers s ON s.id = ri.supplier_id
      WHERE ri.request_id = $1
      ORDER BY ri.position ASC, ri.created_at ASC`,
    [requestId]
  )
}
