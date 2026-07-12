import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POCard from '@/components/shared/POCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function MintahPOsPendingPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let pendingPOs: Record<string, unknown>[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('created_by', user?.id ?? '')
      .eq('status', 'pending_sam')
      .order('created_at', { ascending: false })

    pendingPOs = (data as Record<string, unknown>[]) ?? []
  } catch {
    // DB may be unavailable
  }

  return (
    <DashboardLayout
      title="Awaiting Sam's Approval"
      subtitle="Purchase orders pending Sam's review"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'mintah'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8 animate-slide-up">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Pending Sam&apos;s Approval</h2>
          {pendingPOs.length > 0 && (
            <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10 font-bold">
              {pendingPOs.length}
            </Badge>
          )}
        </div>

        {/* PO Grid */}
        {pendingPOs.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-slide-up" style={{ animationDelay: '0.05s' }}>
            {pendingPOs.map((po) => (
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
              No purchase orders awaiting Sam&apos;s approval.
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
