import { query, queryOne, transaction } from '@/lib/db'
import { requireCapability } from '@/lib/auth-guard'
import { canActAt, currentStage } from '@/lib/workflow'
import { NextResponse } from 'next/server'
import type { Request as DbRequest } from '@/lib/types'

interface IncomingItemPrice {
  id?: string
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
 * one overall discount off the subtotal. Only the stage currently holding the
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

  let body: { items?: IncomingItemPrice[]; discountAmount?: number | string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) {
    return NextResponse.json({ error: 'No line items to update' }, { status: 400 })
  }

  // Every id must belong to this request — a stale form must not let one
  // requisition write prices onto another's line items.
  const owned = await query<{ id: string }>(
    `SELECT id FROM public.request_items WHERE request_id = $1`,
    [id]
  )
  const ownedIds = new Set(owned.map((r) => r.id))
  for (const item of items) {
    if (!item.id || !ownedIds.has(item.id)) {
      return NextResponse.json(
        { error: 'One or more line items do not belong to this requisition' },
        { status: 400 }
      )
    }
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

  await transaction(
    items.map((item) => [
      `UPDATE public.request_items
          SET unit_price = $2,
              supplier_id = $3
        WHERE id = $1 AND request_id = $4`,
      [item.id, toNumber(item.unitPrice), item.supplierId || null, id],
    ])
  )

  const discountAmount = toNumber(body.discountAmount)

  const subtotalRow = await queryOne<{ subtotal: string }>(
    `SELECT COALESCE(SUM(line_total), 0)::numeric AS subtotal FROM public.request_items WHERE request_id = $1`,
    [id]
  )
  const subtotal = Number(subtotalRow?.subtotal) || 0

  if (discountAmount > subtotal) {
    return NextResponse.json(
      { error: 'The discount cannot be more than the materials subtotal.' },
      { status: 400 }
    )
  }

  const total = subtotal - discountAmount

  const data = await queryOne<DbRequest>(
    `UPDATE public.requests
        SET discount_amount = $2, total_amount = $3, updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id, discountAmount, total]
  )

  return NextResponse.json({ data, subtotal, discountAmount, total })
}
