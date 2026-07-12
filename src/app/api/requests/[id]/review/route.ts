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

  const supabase = await createClient()

  const { data: existing, error: fetchError } = await supabase
    .from('requests')
    .select('id, status')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  if (existing.status !== 'new') {
    return NextResponse.json(
      { error: 'Can only mark requests with status "new" as reviewing' },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('requests')
    .update({
      status: 'reviewing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
