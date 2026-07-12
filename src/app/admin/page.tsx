import { createClient, getUserFromSession } from '@/lib/supabase/server'
import AdminClient from '@/components/admin/AdminClient'
import type { User, Request, PurchaseOrder } from '@/lib/types'

export default async function AdminPage() {
  const supabase = await createClient()
  const user = await getUserFromSession()

  const [{ data: users }, { data: requests }, { data: pos }, { data: auditTrail }] = await Promise.all([
    supabase.from('users').select('*').order('created_at', { ascending: false }),
    supabase.from('requests').select('*').order('created_at', { ascending: false }),
    supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
    supabase
      .from('po_audit_trail')
      .select('*, po:purchase_orders!po_audit_trail_po_id_fkey(id, purpose, status), performer:users!po_audit_trail_performed_by_fkey(id, name, email)')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  return (
    <AdminClient
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'admin'}
      users={(users ?? []) as User[]}
      requests={(requests ?? []) as Request[]}
      pos={(pos ?? []) as PurchaseOrder[]}
      auditTrail={(auditTrail ?? []) as any[]}
    />
  )
}
