import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import RequestDetailClient from '@/components/shared/RequestDetailClient'

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: request, error } = await supabase
    .from('requests')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !request) {
    notFound()
  }

  return <RequestDetailClient request={request} />
}
