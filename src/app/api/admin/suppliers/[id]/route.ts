import { execute, queryOne } from '@/lib/db'
import { requireRole } from '@/lib/auth-guard'
import { NextResponse } from 'next/server'
import type { Supplier } from '@/lib/types'

const TEXT_FIELDS = ['name', 'category', 'contact_name', 'phone', 'email', 'address', 'tin', 'notes'] as const

/** Update a supplier, including activating or deactivating it. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('administrator')
  if (guard.error) return guard.error

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const sets: string[] = []
  const values: unknown[] = []

  for (const field of TEXT_FIELDS) {
    if (body[field] === undefined) continue
    const raw = typeof body[field] === 'string' ? (body[field] as string).trim() : ''
    if (field === 'name' && !raw) {
      return NextResponse.json({ error: 'A supplier name is required' }, { status: 400 })
    }
    values.push(field === 'name' ? raw : raw || null)
    sets.push(`${field} = $${values.length}`)
  }

  if (body.is_active !== undefined) {
    values.push(Boolean(body.is_active))
    sets.push(`is_active = $${values.length}`)
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 })
  }

  values.push(id)

  try {
    const supplier = await queryOne<Supplier>(
      `UPDATE public.suppliers SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    )
    if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    return NextResponse.json({ data: supplier })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('idx_suppliers_name_unique')) {
      return NextResponse.json({ error: 'A supplier with that name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

/**
 * Delete a supplier.
 *
 * Refused once requisition lines reference it, so historical requisitions keep
 * showing who the material was sourced from. Deactivate instead.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('administrator')
  if (guard.error) return guard.error

  const { id } = await params

  const inUse = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM public.request_items WHERE supplier_id = $1`,
    [id]
  )

  if ((inUse?.count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `This supplier is used on ${inUse?.count} requisition line(s). Deactivate it instead of deleting.`,
      },
      { status: 409 }
    )
  }

  await execute(`DELETE FROM public.suppliers WHERE id = $1`, [id])
  return NextResponse.json({ success: true })
}
