import { query, queryOne } from '@/lib/db'
import { requireCapability } from '@/lib/auth-guard'
import { createNotification } from '@/lib/notifications'
import { NextResponse } from 'next/server'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import type { PurchaseOrder } from '@/lib/types'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireCapability('po:comment')
  if (guard.error) return guard.error

  const limit = await rateLimit(`comment:${guard.user.id}`, { max: 30, windowSeconds: 60 })
  if (!limit.ok) return tooManyRequests('Too many comments at once. Give it a moment.', limit.retryAfter)

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM public.purchase_orders WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!existing) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  const data = await query(
    `SELECT c.id, c.po_id, c.user_id as author_id, c.comment as content, c.created_at,
            json_build_object('id', u.id, 'name', u.name, 'email', u.email) as author
     FROM public.po_comments c
     LEFT JOIN public.users u ON u.id = c.user_id
     WHERE c.po_id = $1
     ORDER BY c.created_at ASC`,
    [id]
  )

  return NextResponse.json({ data })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const guard = await requireCapability('po:comment')
  if (guard.error) return guard.error

  if (!body.content || !body.content.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const content = body.content.trim()

  const po = await queryOne<PurchaseOrder>(
    `SELECT id, purpose, created_by FROM public.purchase_orders WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!po) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  const commentRow = await queryOne<{
    id: string
    po_id: string
    user_id: string
    comment: string
    created_at: string
  }>(
    `INSERT INTO public.po_comments (po_id, user_id, user_name, comment)
     VALUES ($1, $2, $3, $4)
     RETURNING id, po_id, user_id, comment, created_at`,
    [id, guard.user.id, guard.user.name || guard.user.role, content]
  )

  const data = {
    ...commentRow,
    author_id: guard.user.id,
    content: commentRow?.comment,
    author: {
      id: guard.user.id,
      name: guard.user.name,
      email: guard.user.email,
    },
  }

  // If commenter is not the creator, notify the creator
  if (po.created_by && po.created_by !== guard.user.id) {
    await createNotification({
      userId: po.created_by,
      title: 'New Comment on PO',
      message: `${guard.user.name || 'A teammate'} commented on "${po.purpose}": "${content.slice(0, 80)}"`,
      type: 'info',
      target: { type: 'po', id },
    })
  }

  return NextResponse.json({ data }, { status: 201 })
}
