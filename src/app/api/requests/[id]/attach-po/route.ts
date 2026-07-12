import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth-guard'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireRole('mintah', 'admin', 'superuser')
  if (guard.error) return guard.error

  const contentType = request.headers.get('content-type') || ''

  let poNumber: string
  let fileName: string | null = null
  let fileUrl: string | null = null
  let fileBuffer: ArrayBuffer | null = null
  let fileMimeType: string | null = null

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    poNumber = String(formData.get('po_number') || '')
    const file = formData.get('file') as File | null
    if (file && file.size > 0) {
      fileName = file.name
      fileMimeType = file.type || 'application/pdf'
      fileBuffer = await file.arrayBuffer()
    }
  } else {
    const body = await request.json()
    poNumber = body.po_number
    fileName = body.file_name || null
    fileUrl = body.file_url || null
  }

  if (!poNumber) {
    return NextResponse.json({ error: 'po_number is required' }, { status: 400 })
  }
  if (!fileName && !fileUrl) {
    return NextResponse.json({ error: 'A PDF file or file_url is required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: req, error: reqError } = await supabase
    .from('requests')
    .select('*')
    .eq('id', id)
    .single()

  if (reqError || !req) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  if (req.status !== 'reviewing') {
    return NextResponse.json(
      { error: 'Request must be in "reviewing" status to attach a PO' },
      { status: 400 }
    )
  }

  // Upload file to Supabase Storage if we have a raw file
  if (fileBuffer && fileName) {
    const ext = fileName.split('.').pop() || 'pdf'
    const storagePath = `po-docs/${id}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`

    const { error: uploadError } = await supabase.storage
      .from('po-files')
      .upload(storagePath, fileBuffer, {
        contentType: fileMimeType || 'application/pdf',
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 400 })
    }

    fileUrl = storagePath
  }

  const descriptionWithPoNumber = `[PO#: ${poNumber}] ${req.description || ''}`.trim()

  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .insert({
      request_id: req.id,
      purpose: req.purpose,
      description: descriptionWithPoNumber,
      quantity: req.estimated_quantity,
      unit_rate: req.estimated_unit_rate,
      total_amount: req.estimated_quantity && req.estimated_unit_rate
        ? req.estimated_quantity * req.estimated_unit_rate
        : null,
      file_name: fileName,
      file_path: fileUrl,
      created_by: guard.user.id,
      status: 'pending_sam',
    })
    .select()
    .single()

  if (poError) {
    return NextResponse.json({ error: poError.message }, { status: 400 })
  }

  await supabase
    .from('requests')
    .update({ status: 'converted' })
    .eq('id', id)

  if (fileName && fileUrl) {
    await supabase.from('po_attachments').insert({
      po_id: po.id,
      file_name: fileName,
      file_url: fileUrl,
      uploaded_by: guard.user.id,
    })
  }

  await supabase.from('po_audit_trail').insert({
    po_id: po.id,
    action: 'created',
    performed_by: guard.user.id,
    notes: `PO ${poNumber} attached from external procurement system`,
  })

  return NextResponse.json({ success: true, po_id: po.id }, { status: 201 })
}
