import { query, queryOne } from '@/lib/db'
import { requireRole } from '@/lib/auth-guard'
import { NextResponse } from 'next/server'
import type { Supplier } from '@/lib/types'

/** List every supplier, including deactivated ones, with usage counts. */
export async function GET() {
  const guard = await requireRole('administrator')
  if (guard.error) return guard.error

  const suppliers = await query<Supplier & { usage_count: number }>(
    `SELECT s.*, COUNT(ri.id)::int AS usage_count
       FROM public.suppliers s
       LEFT JOIN public.request_items ri ON ri.supplier_id = s.id
      GROUP BY s.id
      ORDER BY s.is_active DESC, s.name ASC`
  )

  return NextResponse.json({ data: suppliers })
}

/** Create a supplier from the admin directory. */
export async function POST(request: Request) {
  const guard = await requireRole('administrator')
  if (guard.error) return guard.error

  let body: Record<string, string | undefined>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) {
    return NextResponse.json({ error: 'A supplier name is required' }, { status: 400 })
  }

  try {
    const supplier = await queryOne<Supplier>(
      `INSERT INTO public.suppliers (name, category, contact_name, phone, email, address, tin, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        name,
        body.category?.trim() || null,
        body.contact_name?.trim() || null,
        body.phone?.trim() || null,
        body.email?.trim() || null,
        body.address?.trim() || null,
        body.tin?.trim() || null,
        body.notes?.trim() || null,
        guard.user.id,
      ]
    )
    return NextResponse.json({ data: supplier }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('idx_suppliers_name_unique')) {
      return NextResponse.json({ error: 'A supplier with that name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
