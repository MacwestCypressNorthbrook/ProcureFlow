import { queryOne, execute } from '@/lib/db'
import { requireCapability } from '@/lib/auth-guard'
import { createNotification } from '@/lib/notifications'
import { NextResponse } from 'next/server'
import type { Request as DbRequest } from '@/lib/types'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireCapability('request:review')
  if (guard.error) return guard.error

  const existing = await queryOne<DbRequest>(
    `SELECT id, purpose, created_by, status FROM public.requests WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  await execute(
    `UPDATE public.requests
     SET status = 'under_review', updated_at = now()
     WHERE id = $1`,
    [id]
  )

  if (existing.created_by) {
    await createNotification({
      userId: existing.created_by,
      title: 'Requisition Under Review',
      message: `Your requisition "${existing.purpose}" is currently being reviewed.`,
      type: 'info',
      target: { type: 'request', id },
      sendEmailAlert: true,
    })
  }

  return NextResponse.json({ success: true })
}
