import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth-guard'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireRole('minta', 'admin', 'superuser', 'sam', 'finance')
  if (guard.error) return guard.error

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('id', id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('po_comments')
    .select('id, po_id, author_id, content, created_at, author:users!po_comments_author_id_fkey(id, name, email)')
    .eq('po_id', id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const guard = await requireRole('minta', 'admin', 'superuser', 'sam', 'finance')
  if (guard.error) return guard.error

  if (!body.content || !body.content.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('id', id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('po_comments')
    .insert({
      po_id: id,
      author_id: guard.user.id,
      content: body.content.trim(),
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
