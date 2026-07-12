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
  const guard = await requireRole('minta', 'admin', 'superuser')
  if (guard.error) return guard.error

  const contentType = request.headers.get('content-type') || ''

  let fileName: string
  let fileUrl: string

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'A file is required' }, { status: 400 })
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

    fileName = file.name
    const storagePath = `request-docs/${id}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`

    const fileBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('po-files')
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/pdf',
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 400 })
    }

    fileUrl = storagePath

    const { data, error } = await supabase
      .from('request_attachments')
      .insert({
        request_id: id,
        file_name: fileName,
        file_url: fileUrl,
        uploaded_by: guard.user.id,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data }, { status: 201 })
  }

  // Fallback: JSON body (for backwards compat with data URLs)
  const body = await request.json()
  fileName = body.file_name
  fileUrl = body.file_url

  if (!fileName || !fileUrl) {
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
      file_name: fileName,
      file_url: fileUrl,
      uploaded_by: guard.user.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
