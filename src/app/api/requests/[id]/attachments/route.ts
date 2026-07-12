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
    .from('requests')
    .select('id')
    .eq('id', id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('request_attachments')
    .select('id, request_id, file_name, file_url, uploaded_by, created_at')
    .eq('request_id', id)
    .order('created_at', { ascending: false })

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
  const guard = await requireRole('minta', 'admin', 'superuser')
  if (guard.error) return guard.error

  if (!body.file_name || !body.file_url) {
    return NextResponse.json({ error: 'file_name and file_url are required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('requests')
    .select('id')
    .eq('id', id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('request_attachments')
    .insert({
      request_id: id,
      file_name: body.file_name,
      file_url: body.file_url,
      uploaded_by: guard.user.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
