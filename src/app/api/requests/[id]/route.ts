import { queryOne, execute } from '@/lib/db'
import { getRequestItems } from '@/lib/requests'
import { requireCapability } from '@/lib/auth-guard'
import { isElevated, normalizeRole } from '@/lib/roles'
import { NextResponse } from 'next/server'
import type { Request as DbRequest } from '@/lib/types'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireCapability('po:view')
  if (guard.error) return guard.error

  const data = await queryOne<
    DbRequest & { requestor?: { id: string; name: string; email: string; role: string } }
  >(
    `SELECT r.*,
            json_build_object(
              'id', u.id,
              'name', u.name,
              'email', u.email,
              'role', u.role
            ) as requestor
     FROM public.requests r
     LEFT JOIN public.users u ON u.id = r.created_by
     WHERE r.id = $1
     LIMIT 1`,
    [id]
  )

  if (!data) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  const items = await getRequestItems(id)

  return NextResponse.json({ data: { ...data, items } })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const guard = await requireCapability('request:edit')
  if (guard.error) return guard.error

  const existing = await queryOne<DbRequest>(
    `SELECT id, created_by, status FROM public.requests WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  // Leads and elevated roles may edit any request; everyone else, their own.
  const mayEditAny = isElevated(guard.user.role) || normalizeRole(guard.user.role) === 'project_lead'

  if (!mayEditAny && existing.created_by !== guard.user.id) {
    return NextResponse.json({ error: 'Only the owner or leads can update this request' }, { status: 403 })
  }

  const estQty = body.estimated_quantity ? Number(body.estimated_quantity) : null
  const estRate = body.estimated_unit_rate ? Number(body.estimated_unit_rate) : null
  const totalAmount = estQty && estRate ? estQty * estRate : null

  const data = await queryOne<DbRequest>(
    `UPDATE public.requests
     SET purpose = COALESCE($1, purpose),
         description = COALESCE($2, description),
         department = COALESCE($3, department),
         estimated_quantity = COALESCE($4, estimated_quantity),
         estimated_unit_rate = COALESCE($5, estimated_unit_rate),
         total_amount = COALESCE($6, total_amount),
         guest_name = COALESCE($7, guest_name),
         guest_email = COALESCE($8, guest_email),
         updated_at = now()
     WHERE id = $9
     RETURNING *`,
    [
      body.purpose,
      body.description,
      body.department,
      estQty,
      estRate,
      totalAmount,
      body.guest_name,
      body.guest_email,
      id,
    ]
  )

  return NextResponse.json({ data })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireCapability('request:edit')
  if (guard.error) return guard.error

  const existing = await queryOne<DbRequest>(
    `SELECT id, created_by, status FROM public.requests WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  if (!isElevated(guard.user.role) && existing.created_by !== guard.user.id) {
    return NextResponse.json({ error: 'Only the owner can delete this request' }, { status: 403 })
  }

  await execute(`DELETE FROM public.requests WHERE id = $1`, [id])
  return NextResponse.json({ success: true })
}
