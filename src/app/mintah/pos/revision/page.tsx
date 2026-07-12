import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POCard from '@/components/shared/POCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle } from 'lucide-react'

export default async function MintahPOsRevisionPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let revisionPOs: Record<string, unknown>[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('created_by', user?.id ?? '')
      .eq('status', 'revision_required')
      .order('created_at', { ascending: false })

    revisionPOs = (data as Record<string, unknown>[]) ?? []
  } catch {
    // DB may be unavailable
  }

  return (
    <DashboardLayout
      title="Revisions Needed"
      subtitle="Purchase orders sent back by Sam for revision"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'mintah'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8 animate-slide-up">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Revisions Needed</h2>
          {revisionPOs.length > 0 && (
            <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10 font-bold">
              {revisionPOs.length}
            </Badge>
          )}
        </div>

        {/* PO Grid with Rejection Reasons */}
        {revisionPOs.length > 0 ? (
          <div className="space-y-4 animate-slide-up" style={{ animationDelay: '0.05s' }}>
            {revisionPOs.map((po) => (
              <div key={po.id as string} className="space-y-2">
                {Boolean(po.sam_rejection_reason) && (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 flex items-start gap-3">
                    <AlertTriangle size="16" className="text-destructive mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-destructive mb-0.5">Rejection Reason</p>
                      <p className="text-xs text-destructive/80 leading-relaxed">{String(po.sam_rejection_reason)}</p>
                    </div>
                  </div>
                )}
                <POCard
                  po={po as unknown as Parameters<typeof POCard>[0]['po']}
                  href={`/mintah/po/${po.id}`}
                />
              </div>
            ))}
          </div>
        ) : (
          <Card className="glass-card border-border/40 animate-slide-up" style={{ animationDelay: '0.05s' }}>
            <CardContent className="p-10 text-center text-muted-foreground font-semibold">
              No purchase orders need revision.
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
