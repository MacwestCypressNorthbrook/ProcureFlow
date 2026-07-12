import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POCard from '@/components/shared/POCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { PurchaseOrder } from '@/lib/types'

export default async function SamAllPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()
  let pos: PurchaseOrder[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .order('created_at', { ascending: false })
    pos = (data as PurchaseOrder[]) ?? []
  } catch {}

  return (
    <DashboardLayout
      title="All Purchase Orders"
      subtitle="Complete history of purchase orders"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'sam'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-lg font-bold tracking-tight text-foreground">All POs</h2>
          <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10 font-bold">
            {pos.length}
          </Badge>
        </div>
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
              No purchase orders found.
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
