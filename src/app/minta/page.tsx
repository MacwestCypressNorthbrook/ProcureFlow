import { getUserFromSession, createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import RequestCard from '@/components/shared/RequestCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dash, Document, ShoppingCart, TickCircle } from '@/lib/icons'

export default async function MintaPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let myRequests: Record<string, unknown>[] = []
  try {
    const { data } = await supabase
      .from('requests')
      .select('*')
      .eq('created_by', user?.id ?? '')
      .order('created_at', { ascending: false })
    myRequests = (data as Record<string, unknown>[]) ?? []
  } catch {
    // DB may be unavailable
  }

  const stats = {
    totalRequests: myRequests?.length ?? 0,
    converted: myRequests?.filter((r) => r.status === 'converted').length ?? 0,
    pending: myRequests?.filter((r) => r.status === 'new' || r.status === 'reviewing').length ?? 0,
  }

  return (
    <div className="min-h-screen mesh-gradient noise-overlay">
      <Header />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 animate-slide-up">
          <h1 className="text-3xl font-bold tracking-tight mb-1">
            My Dashboard
          </h1>
          <p className="text-muted-foreground">
            Track your requests and their status
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8 stagger">
          <Card className="glass-card-elevated border-border/40 elastic-hover flecto-reflect scroll-reveal">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                  <Document size="22" color="#2563eb" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{stats.totalRequests}</p>
                  <p className="text-xs text-muted-foreground font-medium">My Requests</p>
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
                  <p className="text-3xl font-bold tracking-tight">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground font-medium">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 elastic-hover flecto-reflect scroll-reveal">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                  <TickCircle size="22" color="#059669" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{stats.converted}</p>
                  <p className="text-xs text-muted-foreground font-medium">Converted</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* My Requests */}
        <section className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-xl font-semibold">My Requests</h2>
            {myRequests && myRequests.length > 0 && (
              <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10">{myRequests.length}</Badge>
            )}
          </div>
          {myRequests && myRequests.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {myRequests.map((req) => (
                <RequestCard
                  key={req.id as string}
                  request={req as unknown as Parameters<typeof RequestCard>[0]['request']}
                  href={`/request`}
                />
              ))}
            </div>
          ) : (
            <Card className="glass-card border-border/40">
              <CardContent className="p-10 text-center">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/[0.06] mb-4">
                  <Document size="32" color="currentColor" className="text-muted-foreground" />
                </div>
                <p className="text-muted-foreground mb-4 font-medium">
                  You haven&apos;t submitted any requests yet.
                </p>
                <a href="/request" className="inline-flex items-center gap-1 text-primary text-sm font-semibold hover:underline">
                  Submit your first request
                  <span className="text-lg">→</span>
                </a>
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  )
}
