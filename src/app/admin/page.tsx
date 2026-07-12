import { createClient } from '@/lib/supabase/server'
import AdminClient from '@/components/admin/AdminClient'
import type { User, Request, PurchaseOrder } from '@/lib/types'

export default async function AdminPage() {
  const supabase = await createClient()

  const [{ data: users }, { data: requests }, { data: pos }] = await Promise.all([
    supabase.from('users').select('*').order('created_at', { ascending: false }),
    supabase.from('requests').select('*').order('created_at', { ascending: false }),
    supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
  ])

  return (
    <AdminClient
      users={(users ?? []) as User[]}
      requests={(requests ?? []) as Request[]}
      pos={(pos ?? []) as PurchaseOrder[]}
    />
  )
}
