import { query, queryOne } from '@/lib/db'
import { isMissingTable } from '@/lib/supplier-invoices'

/**
 * What a supplier has been asked to supply, drawn from the requisition lines
 * that name them.
 *
 * Nothing here is typed in separately, so it cannot drift from the requisitions
 * it describes. Two limits are worth knowing:
 *  - Only lines Supply Chain has assigned to a supplier count. Labour, site
 *    costs and anything paid without a supplier never appear.
 *  - A purchase order covers a whole requisition, which can name several
 *    suppliers, so what has been paid is attributed to each supplier by its
 *    share of the requisition's value. It is an allocation, not a payment made
 *    to that supplier, and is labelled that way on screen.
 *
 * Drafts, rejected and cancelled requisitions are left out of every figure.
 */
const LIVE = `r.status NOT IN ('draft', 'rejected', 'cancelled')`

export interface SupplierProfile {
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
}

export interface SupplierTotals {
  requisitions: number
  lines: number
  /** Value of every live line naming this supplier. */
  requisitioned: number
  /** Of that, the value on requisitions that have run the whole chain. */
  completed: number
  /** Payments on those requisitions' purchase orders, allocated by share of value. */
  paidShare: number
  firstDate: string | null
  lastDate: string | null
}

export interface MonthPoint {
  month: string // YYYY-MM
  value: number
}

export interface ItemPrice {
  description: string
  lines: number
  quantity: number
  unit: string | null
  /** Quantity-weighted average price per unit. */
  average: number
  lowest: number
  highest: number
  /** The most recent price paid. */
  latest: number
}

export interface SupplierRequisition {
  id: string
  purpose: string
  status: string
  created_at: string
  project_name: string | null
  value: number
  lines: number
}

export interface InvoiceSummary {
  count: number
  verified: number
  invoiced: number
  /** Requisitions past Supply Chain, with priced lines from this supplier and no invoice recorded. */
  awaiting: number
  /** Requisitions where this supplier's invoices total more than its lines asked for. */
  overInvoiced: number
  recent: Array<{
    id: string
    request_id: string
    purpose: string
    invoice_number: string
    invoice_date: string
    amount: number
    status: 'recorded' | 'verified'
    requisitioned: number
    requisition_invoiced: number
  }>
}

export interface SupplierInsights {
  profile: SupplierProfile
  totals: SupplierTotals
  months: MonthPoint[]
  items: ItemPrice[]
  recent: SupplierRequisition[]
  /** `null` when migration 016 has not been applied, so the page can say so. */
  invoices: InvoiceSummary | null
}

export async function getSupplierInsights(id: string): Promise<SupplierInsights | null> {
  // A malformed id would be a Postgres cast error, not a clean "not found".
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null

  const profile = await queryOne<SupplierProfile>(
    `SELECT id, name, category, contact_name, phone, email, address, tin, notes, is_active
       FROM public.suppliers WHERE id = $1`,
    [id]
  )
  if (!profile) return null

  const [totals, months, items, recent] = await Promise.all([
    queryOne<SupplierTotals>(
      `WITH mine AS (
         SELECT ri.request_id, r.status, r.created_at, ri.line_total
           FROM public.request_items ri
           JOIN public.requests r ON r.id = ri.request_id
          WHERE ri.supplier_id = $1 AND ${LIVE}
       ),
       per_request AS (
         SELECT request_id, SUM(line_total) AS mine_total
           FROM mine GROUP BY request_id
       ),
       request_totals AS (
         SELECT ri.request_id, SUM(ri.line_total) AS all_total
           FROM public.request_items ri
          WHERE ri.request_id IN (SELECT request_id FROM per_request)
          GROUP BY ri.request_id
       ),
       paid AS (
         SELECT po.request_id, SUM(pp.amount) AS paid
           FROM public.purchase_orders po
           JOIN public.po_payments pp ON pp.po_id = po.id
          WHERE po.request_id IN (SELECT request_id FROM per_request)
          GROUP BY po.request_id
       )
       SELECT
         (SELECT COUNT(DISTINCT request_id)::int FROM mine)                       AS requisitions,
         (SELECT COUNT(*)::int FROM mine)                                         AS lines,
         COALESCE((SELECT SUM(line_total) FROM mine), 0)::float8                  AS requisitioned,
         COALESCE((SELECT SUM(line_total) FROM mine WHERE status = 'completed'), 0)::float8 AS completed,
         COALESCE((
           SELECT SUM(paid.paid * pr.mine_total / NULLIF(rt.all_total, 0))
             FROM per_request pr
             JOIN request_totals rt ON rt.request_id = pr.request_id
             JOIN paid ON paid.request_id = pr.request_id
         ), 0)::float8                                                            AS "paidShare",
         (SELECT MIN(created_at) FROM mine)                                       AS "firstDate",
         (SELECT MAX(created_at) FROM mine)                                       AS "lastDate"`,
      [id]
    ),
    query<MonthPoint>(
      `SELECT to_char(date_trunc('month', r.created_at), 'YYYY-MM') AS month,
              SUM(ri.line_total)::float8 AS value
         FROM public.request_items ri
         JOIN public.requests r ON r.id = ri.request_id
        WHERE ri.supplier_id = $1 AND ${LIVE}
          AND r.created_at >= date_trunc('month', now()) - interval '11 months'
        GROUP BY 1 ORDER BY 1`,
      [id]
    ),
    query<ItemPrice>(
      `SELECT MIN(ri.description) AS description,
              COUNT(*)::int AS lines,
              SUM(ri.quantity)::float8 AS quantity,
              MIN(ri.unit) AS unit,
              (SUM(ri.line_total) / NULLIF(SUM(ri.quantity), 0))::float8 AS average,
              MIN(ri.unit_price)::float8 AS lowest,
              MAX(ri.unit_price)::float8 AS highest,
              (ARRAY_AGG(ri.unit_price ORDER BY r.created_at DESC))[1]::float8 AS latest
         FROM public.request_items ri
         JOIN public.requests r ON r.id = ri.request_id
        WHERE ri.supplier_id = $1 AND ${LIVE} AND ri.unit_price > 0
        GROUP BY lower(trim(ri.description))
        ORDER BY SUM(ri.line_total) DESC
        LIMIT 25`,
      [id]
    ),
    query<SupplierRequisition>(
      `SELECT r.id, r.purpose, r.status, r.created_at, p.name AS project_name,
              SUM(ri.line_total)::float8 AS value, COUNT(*)::int AS lines
         FROM public.request_items ri
         JOIN public.requests r ON r.id = ri.request_id
         LEFT JOIN public.projects p ON p.id = r.project_id
        WHERE ri.supplier_id = $1 AND ${LIVE}
        GROUP BY r.id, p.name
        ORDER BY r.created_at DESC
        LIMIT 15`,
      [id]
    ),
  ])

  return {
    profile,
    totals: totals ?? {
      requisitions: 0, lines: 0, requisitioned: 0, completed: 0, paidShare: 0, firstDate: null, lastDate: null,
    },
    months: fillMonths(months),
    items,
    recent,
    invoices: await getInvoiceSummary(id),
  }
}

/** The last twelve months, with a zero where the supplier had none. */
function fillMonths(found: MonthPoint[]): MonthPoint[] {
  const byMonth = new Map(found.map((m) => [m.month, m.value]))
  const out: MonthPoint[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    out.push({ month: key, value: byMonth.get(key) ?? 0 })
  }
  return out
}

/** Statuses after Supply Chain has priced the requisition, when an invoice is expected. */
const PAST_PRICING = `('pending_cost_control', 'pending_admin', 'pending_finance', 'completed')`

async function getInvoiceSummary(id: string): Promise<InvoiceSummary | null> {
  try {
    const [totals, awaiting, over, recent] = await Promise.all([
      queryOne<{ count: number; verified: number; invoiced: number }>(
        `SELECT COUNT(*)::int AS count,
                COUNT(*) FILTER (WHERE i.status = 'verified')::int AS verified,
                COALESCE(SUM(i.amount), 0)::float8 AS invoiced
           FROM public.supplier_invoices i
           JOIN public.requests r ON r.id = i.request_id
          WHERE i.supplier_id = $1 AND ${LIVE}`,
        [id]
      ),
      queryOne<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM (
           SELECT DISTINCT r.id
             FROM public.request_items ri
             JOIN public.requests r ON r.id = ri.request_id
            WHERE ri.supplier_id = $1 AND ri.unit_price > 0 AND r.status IN ${PAST_PRICING}
              AND NOT EXISTS (
                SELECT 1 FROM public.supplier_invoices i WHERE i.request_id = r.id AND i.supplier_id = $1
              )
         ) x`,
        [id]
      ),
      queryOne<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM (
           SELECT i.request_id
             FROM public.supplier_invoices i
             JOIN public.requests r ON r.id = i.request_id
            WHERE i.supplier_id = $1 AND ${LIVE}
            GROUP BY i.request_id
           HAVING SUM(i.amount) > COALESCE((
                    SELECT SUM(ri.line_total) FROM public.request_items ri
                     WHERE ri.request_id = i.request_id AND ri.supplier_id = $1
                  ), 0) + 0.005
         ) x`,
        [id]
      ),
      query<InvoiceSummary['recent'][number]>(
        `SELECT i.id, i.request_id, r.purpose, i.invoice_number,
                to_char(i.invoice_date, 'YYYY-MM-DD') AS invoice_date,
                i.amount::float8 AS amount, i.status,
                COALESCE((SELECT SUM(ri.line_total) FROM public.request_items ri
                           WHERE ri.request_id = i.request_id AND ri.supplier_id = i.supplier_id), 0)::float8 AS requisitioned,
                (SELECT SUM(x.amount) FROM public.supplier_invoices x
                  WHERE x.request_id = i.request_id AND x.supplier_id = i.supplier_id)::float8 AS requisition_invoiced
           FROM public.supplier_invoices i
           JOIN public.requests r ON r.id = i.request_id
          WHERE i.supplier_id = $1 AND ${LIVE}
          ORDER BY i.invoice_date DESC, i.created_at DESC
          LIMIT 15`,
        [id]
      ),
    ])
    return {
      count: totals?.count ?? 0,
      verified: totals?.verified ?? 0,
      invoiced: totals?.invoiced ?? 0,
      awaiting: awaiting?.count ?? 0,
      overInvoiced: over?.count ?? 0,
      recent,
    }
  } catch (err) {
    if (isMissingTable(err)) return null
    throw err
  }
}
