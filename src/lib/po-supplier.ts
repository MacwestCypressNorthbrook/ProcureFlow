import { query, queryOne } from '@/lib/db'

/**
 * The link between a purchase order and its supplier.
 *
 * `purchase_orders.supplier_id` arrives with migration 017, and migrations are
 * applied by hand — so code that reaches production first must keep working
 * without it. Every reader and writer asks here first and falls back to the
 * vendor name, which is all older POs have anyway.
 */

let known: boolean | null = null
let checkedAt = 0

export async function poHasSupplierColumn(): Promise<boolean> {
  // A present column never disappears, so "yes" is cached for good; "no" is
  // re-checked each minute so applying the migration takes effect without a deploy.
  if (known === true || (known === false && Date.now() - checkedAt < 60_000)) return known
  try {
    const row = await queryOne<{ present: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'purchase_orders' AND column_name = 'supplier_id'
       ) AS present`
    )
    known = row?.present === true
  } catch {
    known = false
  }
  checkedAt = Date.now()
  return known
}

/** Same normalization as the UI's vendorKey() and migration 017. */
export const vendorKey = (name: string | null | undefined) =>
  (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Work out which supplier an order is for.
 *
 * An explicit id wins, if it names a real supplier. Otherwise the typed vendor
 * name is matched — first against the suppliers on this requisition, then the
 * whole directory — and only an unambiguous match is taken. No match is fine:
 * the order keeps its vendor name and simply is not linked.
 */
export async function resolvePoSupplier(
  requestId: string,
  supplierId: string | null | undefined,
  vendorName: string | null | undefined
): Promise<{ id: string; name: string } | null> {
  if (supplierId) {
    const row = await queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM public.suppliers WHERE id = $1 LIMIT 1`,
      [supplierId]
    ).catch(() => null)
    if (row) return row
  }

  const key = vendorKey(vendorName)
  if (!key) return null

  const onRequisition = await query<{ id: string; name: string }>(
    `SELECT DISTINCT s.id, s.name
       FROM public.request_items ri
       JOIN public.suppliers s ON s.id = ri.supplier_id
      WHERE ri.request_id = $1`,
    [requestId]
  )
  const local = onRequisition.filter((s) => vendorKey(s.name) === key)
  if (local.length === 1) return local[0]
  if (local.length > 1) return null

  const directory = await query<{ id: string; name: string }>(
    `SELECT id, name FROM public.suppliers
      WHERE regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = $1`,
    [key]
  )
  return directory.length === 1 ? directory[0] : null
}
