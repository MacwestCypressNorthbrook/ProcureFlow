import { query, queryOne, transaction } from '@/lib/db'
import { requireCapability } from '@/lib/auth-guard'
import { canActAt, currentStage } from '@/lib/workflow'
import { formatQuantity } from '@/lib/utils'
import { NextResponse } from 'next/server'
import type { Request as DbRequest } from '@/lib/types'

interface IncomingItemPrice {
  id?: string
  /** Omitted to leave the requested quantity as it is. */
  quantity?: number | string
  unitPrice?: number | string
  supplierId?: string | null
}

const toNumber = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/**
 * Supply Chain fills in what the engineer didn't know at request time: the
 * unit price (and, where it changed, the supplier) for each material, plus
 * one overall discount off the subtotal. Supply Chain may also correct a
 * quantity — a pack size, or what a vendor can actually supply — and every
 * such change is written to the requisition's history. Supply Chain may also drop lines that
 * will not be procured (already on site, duplicated, out of scope) — though
 * never every line, since a requisition with no materials is not one to
 * approve. Only the stage currently holding the
 * requisition may touch its pricing — a Lead or Cost Control reviewer sees
 * the same numbers everyone else does, read-only.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireCapability('request:review')
  if (guard.error) return guard.error

  const existing = await queryOne<DbRequest & { sent_back_to: string | null }>(
    `SELECT * FROM public.requests WHERE id = $1 LIMIT 1`,
    [id]
  )
  if (!existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  const stage = currentStage(existing.status, existing.sent_back_to)
  if (stage !== 'supply_chain' || !canActAt(guard.user.role, 'supply_chain')) {
    return NextResponse.json(
      { error: 'Pricing can only be edited while this requisition is with Supply Chain.' },
      { status: 409 }
    )
  }

  let body: { items?: IncomingItemPrice[]; removeIds?: unknown; discountAmount?: number | string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const items = Array.isArray(body.items) ? body.items : []
  const removeIds = [
    ...new Set(Array.isArray(body.removeIds) ? body.removeIds.filter((v): v is string => typeof v === 'string') : []),
  ]
  if (items.length === 0 && removeIds.length === 0) {
    return NextResponse.json({ error: 'No line items to update' }, { status: 400 })
  }

  // Every id must belong to this request — a stale form must not let one
  // requisition write prices onto, or delete, another's line items.
  const owned = await query<{
    id: string
    description: string
    quantity: string
    unit: string | null
    unit_price: string
    category: string | null
    is_subcontractor: boolean | null
  }>(
    `SELECT id, description, quantity, unit, unit_price, category, is_subcontractor
       FROM public.request_items
      WHERE request_id = $1
      ORDER BY position ASC`,
    [id]
  )
  const ownedById = new Map(owned.map((r) => [r.id, r]))
  for (const itemId of [...items.map((i) => i.id), ...removeIds]) {
    if (!itemId || !ownedById.has(itemId)) {
      return NextResponse.json(
        { error: 'One or more line items do not belong to this requisition' },
        { status: 400 }
      )
    }
  }

  const removing = new Set(removeIds)
  if (items.some((i) => removing.has(i.id!))) {
    return NextResponse.json({ error: 'A line cannot be both priced and removed' }, { status: 400 })
  }
  if (owned.length - removing.size < 1) {
    return NextResponse.json(
      { error: 'A requisition must keep at least one line. Send it back instead of removing everything.' },
      { status: 400 }
    )
  }

  const supplierIds = [
    ...new Set(items.map((i) => i.supplierId).filter((v): v is string => typeof v === 'string' && !!v)),
  ]
  if (supplierIds.length > 0) {
    const found = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM public.suppliers WHERE id = ANY($1::uuid[]) AND is_active`,
      [supplierIds]
    )
    if ((found?.count ?? 0) !== supplierIds.length) {
      return NextResponse.json({ error: 'One or more suppliers are no longer available' }, { status: 400 })
    }
  }

  // A lump-sum line (an expense, or a sub-contractor's price) is held at
  // quantity 1 with the amount in unit_price, so its quantity is not editable.
  const isLumpSum = (r: { category: string | null; is_subcontractor: boolean | null }) =>
    r.category === 'other' || (r.category === 'labour' && Boolean(r.is_subcontractor))

  const incomingQuantity = new Map<string, number>()
  for (const item of items) {
    if (item.quantity === undefined || item.quantity === null || item.quantity === '') continue
    const line = ownedById.get(item.id!)!
    const quantity = Number(item.quantity)
    if (isLumpSum(line)) {
      if (quantity !== Number(line.quantity)) {
        return NextResponse.json(
          { error: `"${line.description}" is a lump sum — change its amount, not its quantity.` },
          { status: 400 }
        )
      }
      continue
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: `Enter a quantity greater than zero for "${line.description}", or remove the line.` },
        { status: 400 }
      )
    }
    // The column holds three decimals; round here so the history and the
    // stored value agree.
    incomingQuantity.set(item.id!, Math.round(quantity * 1000) / 1000)
  }

  // Work out the new subtotal before writing anything, so a discount that is
  // too large is refused without leaving half the change saved — removed
  // lines especially cannot be brought back.
  const incomingPrice = new Map(items.map((i) => [i.id!, toNumber(i.unitPrice)]))
  const subtotal = owned
    .filter((r) => !removing.has(r.id))
    .reduce(
      (sum, r) =>
        sum +
        (incomingQuantity.get(r.id) ?? Number(r.quantity)) * (incomingPrice.get(r.id) ?? Number(r.unit_price)),
      0
    )
  const discountAmount = toNumber(body.discountAmount)

  if (discountAmount > subtotal) {
    return NextResponse.json(
      { error: 'The discount cannot be more than the materials subtotal.' },
      { status: 400 }
    )
  }

  // The deleted rows cannot be read back later, so the trail names each one —
  // what was asked for and how much — in the same transaction as the delete.
  const removedLines = owned
    .filter((r) => removing.has(r.id))
    .map((r) => `${r.description} (${formatQuantity(r.quantity)}${r.unit ? ` ${r.unit}` : ''})`)
  const quantityChanges = owned
    .filter((r) => incomingQuantity.has(r.id) && incomingQuantity.get(r.id) !== Number(r.quantity))
    .map(
      (r) =>
        `${r.description}: ${formatQuantity(r.quantity)} → ${formatQuantity(incomingQuantity.get(r.id))}${r.unit ? ` ${r.unit}` : ''}`
    )

  const removalNote = `Removed ${removedLines.length} material${removedLines.length === 1 ? '' : 's'}: ${removedLines.join('; ')}`

  const results = await transaction<DbRequest>([
    ...(removeIds.length > 0
      ? [
          [
            `DELETE FROM public.request_items WHERE request_id = $1 AND id = ANY($2::uuid[])`,
            [id, removeIds],
          ] as [string, unknown[]],
          [
            `INSERT INTO public.request_approvals (request_id, stage, action, performed_by, comment)
             VALUES ($1, 'supply_chain', 'items_removed', $2, $3)`,
            [id, guard.user.id, removalNote],
          ] as [string, unknown[]],
        ]
      : []),
    ...items.map(
      (item) =>
        [
          `UPDATE public.request_items
              SET unit_price = $2,
                  supplier_id = $3,
                  quantity = COALESCE($5, quantity)
            WHERE id = $1 AND request_id = $4`,
          [item.id, toNumber(item.unitPrice), item.supplierId || null, id, incomingQuantity.get(item.id!) ?? null],
        ] as [string, unknown[]]
    ),
    ...(quantityChanges.length > 0
      ? [
          [
            `INSERT INTO public.request_approvals (request_id, stage, action, performed_by, comment)
             VALUES ($1, 'supply_chain', 'edited', $2, $3)`,
            [id, guard.user.id, `Quantities changed — ${quantityChanges.join('; ')}.`],
          ] as [string, unknown[]],
        ]
      : []),
    // The total is taken from the rows as they stand after the statements
    // above, so it can never disagree with the line items it summarises.
    [
      `UPDATE public.requests
          SET discount_amount = $2,
              estimated_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM public.request_items WHERE request_id = $1),
              total_amount = GREATEST(
                (SELECT COALESCE(SUM(line_total), 0) FROM public.request_items WHERE request_id = $1) - $2,
                0
              ),
              updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [id, discountAmount],
    ],
  ])

  const data = results.at(-1)?.[0] ?? null
  const total = Number(data?.total_amount) || 0

  return NextResponse.json({ data, subtotal, discountAmount, total, removed: removeIds.length })
}
