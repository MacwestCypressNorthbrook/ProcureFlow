import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POCard from '@/components/shared/POCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function MintahPOsCompletedPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let completedPOs: Record<string, unknown>[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('created_by', user?.id ?? '')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })

    completedPOs = (data as Record<string, unknown>[]) ?? []
  } catch {
    // DB may be unavailable
  }

  return (
    <DashboardLayout
      title="Completed POs"
      subtitle="Successfully completed purchase orders"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'mintah'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8 animate-slide-up">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Completed Purchase Orders</h2>
          {completedPOs.length > 0 && (
            <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10 font-bold">
              {completedPOs.length}
            </Badge>
          )}
        </div>

        {/* PO Grid */}
        {completedPOs.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-slide-up" style={{ animationDelay: '0.05s' }}>
            {completedPOs.map((po) => (
              <POCard
                key={po.id as string}
                po={po as unknown as Parameters<typeof POCard>[0]['po']}
                href={`/mintah/po/${po.id}`}
              />
            ))}
          </div>
        ) : (
          <Card className="glass-card border-border/40 animate-slide-up" style={{ animationDelay: '0.05s' }}>
            <CardContent className="p-10 text-center text-muted-foreground font-semibold">
              No completed purchase orders yet.
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
