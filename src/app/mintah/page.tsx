import { getUserFromSession, createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import RequestCard from '@/components/shared/RequestCard'
import POCard from '@/components/shared/POCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Document, ShoppingCart, Warning2 } from '@/lib/icons'

export default async function MintahPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let requests: Record<string, unknown>[] = []
  let myPOs: Record<string, unknown>[] = []
  let allPOs: Record<string, unknown>[] = []

  try {
    const [reqsRes, myPoRes, allPoRes] = await Promise.all([
      supabase
        .from('requests')
        .select('*')
        .in('status', ['new', 'reviewing'])
        .order('created_at', { ascending: false }),
      supabase
        .from('purchase_orders')
        .select('*')
        .eq('created_by', user?.id ?? '')
        .order('created_at', { ascending: false }),
      supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false }),
    ])
    requests = (reqsRes.data as Record<string, unknown>[]) ?? []
    myPOs = (myPoRes.data as Record<string, unknown>[]) ?? []
    allPOs = (allPoRes.data as Record<string, unknown>[]) ?? []
  } catch {
    // DB may be unavailable
  }

  const stats = {
    newRequests: requests?.length ?? 0,
    myPOs: myPOs?.length ?? 0,
    pendingSam: allPOs?.filter((po) => po.status === 'pending_sam').length ?? 0,
    completed: allPOs?.filter((po) => po.status === 'completed').length ?? 0,
  }

  return (
    <div className="min-h-screen mesh-gradient noise-overlay">
      <Header />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 animate-slide-up">
          <h1 className="text-3xl font-bold tracking-tight mb-1">
            Mintah Dashboard
          </h1>
          <p className="text-muted-foreground">
            Review requests and manage Purchase Orders
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger">
          <Card className="glass-card-elevated border-border/40 elastic-hover flecto-reflect scroll-reveal">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                  <Document size="22" color="#2563eb" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{stats.newRequests}</p>
                  <p className="text-xs text-muted-foreground font-medium">New Requests</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 elastic-hover flecto-reflect scroll-reveal">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                  <ShoppingCart size="22" color="#d97706" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{stats.myPOs}</p>
                  <p className="text-xs text-muted-foreground font-medium">My POs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 elastic-hover flecto-reflect scroll-reveal">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                  <Warning2 size="22" color="#ea580c" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{stats.pendingSam}</p>
                  <p className="text-xs text-muted-foreground font-medium">Awaiting Sam</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 elastic-hover flecto-reflect scroll-reveal">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                  <ShoppingCart size="22" color="#059669" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{stats.completed}</p>
                  <p className="text-xs text-muted-foreground font-medium">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* New Requests */}
        <section className="mb-10 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-xl font-semibold">New Requests</h2>
            {requests && requests.length > 0 && (
              <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10">{requests.length}</Badge>
            )}
          </div>
          {requests && requests.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {requests.map((req) => (
                <RequestCard
                  key={req.id as string}
                  request={req as unknown as Parameters<typeof RequestCard>[0]['request']}
                  href={`/mintah/requests/${req.id}`}
                />
              ))}
            </div>
          ) : (
            <Card className="glass-card border-border/40">
              <CardContent className="p-10 text-center text-muted-foreground font-medium">
                No new requests to review.
              </CardContent>
            </Card>
          )}
        </section>

        {/* My POs */}
        <section className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-xl font-semibold">My Purchase Orders</h2>
            {myPOs && myPOs.length > 0 && (
              <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10">{myPOs.length}</Badge>
            )}
          </div>
          {myPOs && myPOs.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {myPOs.map((po) => (
                <POCard
                  key={po.id as string}
                  po={po as unknown as Parameters<typeof POCard>[0]['po']}
                  href={`/mintah/po/${po.id}`}
                />
              ))}
            </div>
          ) : (
            <Card className="glass-card border-border/40">
              <CardContent className="p-10 text-center text-muted-foreground font-medium">
                No POs created yet. Convert a request to get started.
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  )
}
