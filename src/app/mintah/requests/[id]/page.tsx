import { createClient, getUserFromSession } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import MintahRequestDetailClient from '@/components/shared/MintahRequestDetailClient'
import { resolveAttachments } from '@/lib/resolve-file-url'

export default async function MintahRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const user = await getUserFromSession()

  const [{ data: request, error }, { data: attachments }] = await Promise.all([
    supabase
      .from('requests')
      .select('*')
      .eq('id', id)
      .single(),
    supabase
      .from('request_attachments')
      .select('id, request_id, file_name, file_url, uploaded_by, created_at')
      .eq('request_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (error || !request) {
    notFound()
  }

  const resolvedAttachments = await resolveAttachments((attachments as any) ?? [])

  return (
    <MintahRequestDetailClient
      request={request}
      attachments={resolvedAttachments}
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'mintah'}
    />
  )
}
