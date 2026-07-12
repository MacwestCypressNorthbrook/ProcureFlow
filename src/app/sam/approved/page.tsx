import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POCard from '@/components/shared/POCard'
import { Card, CardContent } from '@/components/ui/card'
import type { PurchaseOrder } from '@/lib/types'

export default async function SamApprovedPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()
  let pos: PurchaseOrder[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('sam_approved_by', user?.id ?? '')
      .in('status', ['pending_payment', 'completed'])
      .order('sam_approved_at', { ascending: false })
    pos = (data as PurchaseOrder[]) ?? []
  } catch {}

  return (
    <DashboardLayout
      title="Approved POs"
      subtitle="Purchase orders you have approved"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'sam'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {pos.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pos.map((po) => (
              <POCard
                key={po.id}
                po={po}
                href={`/sam/${po.id}`}
              />
            ))}
          </div>
        ) : (
          <Card className="glass-card border-border/40">
            <CardContent className="p-12 text-center text-muted-foreground font-semibold">
              You haven&apos;t approved any POs yet.
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
