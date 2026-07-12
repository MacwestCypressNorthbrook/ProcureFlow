import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import RequestCard from '@/components/shared/RequestCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, Clock, CheckCircle } from 'lucide-react'

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
    <DashboardLayout
      title="My Dashboard"
      subtitle="Track your submitted requisitions and their current status"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'minta'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4 mb-8 stagger animate-slide-up">
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                  <FileText size="22" className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{stats.totalRequests}</p>
                  <p className="text-xs text-muted-foreground font-semibold">Total Requests</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                  <Clock size="22" className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground font-semibold">Pending Review</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle size="22" className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{stats.converted}</p>
                  <p className="text-xs text-muted-foreground font-semibold">Converted to PO</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* My Requests */}
        <section className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-xl font-bold tracking-tight text-foreground">My Requests</h2>
            {myRequests && myRequests.length > 0 && (
              <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10 font-bold">
                {myRequests.length}
              </Badge>
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
                  <FileText size="32" className="text-muted-foreground" />
                </div>
                <p className="text-muted-foreground mb-4 font-semibold">
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
      </div>
    </DashboardLayout>
  )
}
