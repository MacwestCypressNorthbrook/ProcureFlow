import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUserFromSession } from '@/lib/auth/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TickCircle, ArrowRight, Document } from '@/lib/icons'
import { dashboardPathForRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export default async function RequestSuccessPage() {
  const user = await getUserFromSession()
  if (!user) redirect('/auth/login?redirect=/request')

  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-12">
        <Card className="animate-scale-in glass-card-elevated border-border/40">
          <CardContent className="p-10 text-center">
            <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-gradient-to-br from-emerald-500/10 to-teal-500/10 mb-6 animate-pulse-soft">
              <TickCircle size="40" color="#059669" variant="Bulk" />
            </div>
            <h1 className="text-3xl font-bold mb-3 tracking-tight text-balance">Request Submitted!</h1>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
              Your request has been received. Mintah will review it and convert it into a Purchase Order for approval.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/request">
                <Button variant="outline" className="gap-2 border-border/60 hover:bg-muted/50">
                  <Document size="16" />
                  Submit Another
                </Button>
              </Link>
              <Link href={dashboardPathForRole(user.role)}>
                <Button className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-shadow">
                  Go to Dashboard
                  <ArrowRight size="16" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  )
}
