import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POCard from '@/components/shared/POCard'
import { Card, CardContent } from '@/components/ui/card'
import type { PurchaseOrder } from '@/lib/types'

export default async function FinancePendingPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()
  let pos: PurchaseOrder[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('status', 'pending_payment')
      .order('sam_approved_at', { ascending: true })
    pos = (data as PurchaseOrder[]) ?? []
  } catch {}

  return (
    <DashboardLayout
      title="Pending Payment"
      subtitle="Approved purchase orders awaiting payment"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'finance'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {pos.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pos.map((po) => (
              <POCard
                key={po.id}
                po={po}
                href={`/finance/${po.id}`}
              />
            ))}
          </div>
        ) : (
          <Card className="glass-card border-border/40">
            <CardContent className="p-12 text-center text-muted-foreground font-semibold">
              No purchase orders pending payment.
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
