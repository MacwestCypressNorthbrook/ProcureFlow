import { query, queryOne } from '@/lib/db'
import { requireRole } from '@/lib/auth-guard'
import { NextResponse } from 'next/server'
import type { Supplier } from '@/lib/types'

const REQUESTER_ROLES = [
  'engineer',
  'project_lead',
  'cost_control',
  'supply_chain',
  'finance',
  'administrator',
] as const

type SupplierOption = Pick<Supplier, 'id' | 'name' | 'category' | 'contact_name' | 'phone'>

/**
 * Active suppliers for the requisition form's picker.
 *
 * `?q=` filters server-side so the payload stays small on a phone connection.
 */
export async function GET(request: Request) {
  const guard = await requireRole(...REQUESTER_ROLES)
  if (guard.error) return guard.error

  const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''

  const suppliers = q
    ? await query<SupplierOption>(
        `SELECT id, name, category, contact_name, phone
           FROM public.suppliers
          WHERE is_active AND (name ILIKE $1 OR category ILIKE $1 OR contact_name ILIKE $1)
          ORDER BY name ASC
          LIMIT 50`,
        [`%${q}%`]
      )
    : await query<SupplierOption>(
        `SELECT id, name, category, contact_name, phone
           FROM public.suppliers
          WHERE is_active
          ORDER BY name ASC
          LIMIT 50`
      )

  return NextResponse.json({ data: suppliers })
}

/**
 * Add a supplier from inside the requisition form.
 *
 * Requesters may create one so a site engineer is never blocked by a vendor
 * missing from the directory; an existing name is returned as-is rather than
 * erroring, which keeps the form's "search or add" flow seamless.
 */
export async function POST(request: Request) {
  const guard = await requireRole(...REQUESTER_ROLES)
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

  const existing = await queryOne<SupplierOption>(
    `SELECT id, name, category, contact_name, phone
       FROM public.suppliers WHERE lower(name) = lower($1) LIMIT 1`,
    [name]
  )
  if (existing) return NextResponse.json({ data: existing, existed: true })

  try {
    const supplier = await queryOne<SupplierOption>(
      `INSERT INTO public.suppliers (name, category, contact_name, phone, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, category, contact_name, phone`,
      [
        name,
        body.category?.trim() || null,
        body.contact_name?.trim() || null,
        body.phone?.trim() || null,
        guard.user.id,
      ]
    )
    return NextResponse.json({ data: supplier }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
