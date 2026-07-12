import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import RequestCard from '@/components/shared/RequestCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, Eye } from 'lucide-react'

export default async function MintahRequestsPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let newRequests: Record<string, unknown>[] = []
  let reviewingRequests: Record<string, unknown>[] = []

  try {
    const [newRes, reviewingRes] = await Promise.all([
      supabase
        .from('requests')
        .select('*')
        .eq('status', 'new')
        .order('created_at', { ascending: false }),
      supabase
        .from('requests')
        .select('*')
        .eq('status', 'reviewing')
        .order('created_at', { ascending: false }),
    ])
    newRequests = (newRes.data as Record<string, unknown>[]) ?? []
    reviewingRequests = (reviewingRes.data as Record<string, unknown>[]) ?? []
  } catch {
    // DB may be unavailable
  }

  const allRequests = [...newRequests, ...reviewingRequests]

  return (
    <DashboardLayout
      title="Incoming Requests"
      subtitle="Review and process incoming requisitions"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'mintah'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8 animate-slide-up">
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                  <FileText size="22" className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{newRequests.length}</p>
                  <p className="text-xs text-muted-foreground font-semibold">New</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                  <Eye size="22" className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{reviewingRequests.length}</p>
                  <p className="text-xs text-muted-foreground font-semibold">Under Review</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Requests Grid */}
        <section className="animate-slide-up" style={{ animationDelay: '0.05s' }}>
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-xl font-bold tracking-tight text-foreground">All Incoming Requests</h2>
            {allRequests.length > 0 && (
              <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10 font-bold">
                {allRequests.length}
              </Badge>
            )}
          </div>
          {allRequests.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allRequests.map((req) => (
                <RequestCard
                  key={req.id as string}
                  request={req as unknown as Parameters<typeof RequestCard>[0]['request']}
                  href={`/mintah/requests/${req.id}`}
                />
              ))}
            </div>
          ) : (
            <Card className="glass-card border-border/40">
              <CardContent className="p-10 text-center text-muted-foreground font-semibold">
                No incoming requests at the moment.
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}
