import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POCard from '@/components/shared/POCard'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { XCircle } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

export default async function SamRevisionPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()
  let pos: (PurchaseOrder & { sam_rejection_reason: string })[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('status', 'revision_required')
      .order('updated_at', { ascending: false })
    pos = (data as any[]) ?? []
  } catch {}

  return (
    <DashboardLayout
      title="Needs Revision"
      subtitle="Purchase orders returned for correction"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'sam'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {pos.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pos.map((po) => (
              <div key={po.id} className="relative">
                {po.sam_rejection_reason && (
                  <div className="absolute -top-2 left-4 right-4 z-10 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-1.5 flex items-start gap-1.5">
                    <XCircle size="12" className="text-destructive mt-0.5 shrink-0" />
                    <p className="text-xs text-destructive font-medium line-clamp-2">{po.sam_rejection_reason}</p>
                  </div>
                )}
                <div className="pt-6">
                  <POCard
                    po={po}
                    href={`/sam/${po.id}`}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Card className="glass-card border-border/40">
            <CardContent className="p-12 text-center text-muted-foreground font-semibold">
              No purchase orders need revision.
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
