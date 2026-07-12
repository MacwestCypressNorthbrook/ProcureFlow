import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import RequestCard from '@/components/shared/RequestCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function MintahReviewingPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let reviewingRequests: Record<string, unknown>[] = []

  try {
    const { data } = await supabase
      .from('requests')
      .select('*')
      .eq('status', 'reviewing')
      .order('created_at', { ascending: false })

    reviewingRequests = (data as Record<string, unknown>[]) ?? []
  } catch {
    // DB may be unavailable
  }

  return (
    <DashboardLayout
      title="Under Review"
      subtitle="Requests currently being reviewed"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'mintah'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8 animate-slide-up">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Requests Under Review</h2>
          {reviewingRequests.length > 0 && (
            <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10 font-bold">
              {reviewingRequests.length}
            </Badge>
          )}
        </div>

        {/* Requests Grid */}
        {reviewingRequests.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-slide-up" style={{ animationDelay: '0.05s' }}>
            {reviewingRequests.map((req) => (
              <RequestCard
                key={req.id as string}
                request={req as unknown as Parameters<typeof RequestCard>[0]['request']}
                href={`/mintah/requests/${req.id}`}
              />
            ))}
          </div>
        ) : (
          <Card className="glass-card border-border/40 animate-slide-up" style={{ animationDelay: '0.05s' }}>
            <CardContent className="p-10 text-center text-muted-foreground font-semibold">
              No requests currently under review.
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
