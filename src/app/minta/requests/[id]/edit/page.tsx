import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Lock } from 'lucide-react'
import Link from 'next/link'
import EditRequestForm from './EditRequestForm'

export default async function EditRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUserFromSession()
  const supabase = await createClient()

  let request: Record<string, unknown> | null = null

  try {
    const { data } = await supabase
      .from('requests')
      .select('*')
      .eq('id', id)
      .single()
    request = data as Record<string, unknown> | null
  } catch {
    // DB may be unavailable
  }

  if (!request) {
    return (
      <DashboardLayout
        title="Edit Request"
        user={user ? { name: user.name, email: user.email } : null}
        role={user?.role ?? 'minta'}
      >
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <Card className="glass-card border-border/40">
            <CardContent className="p-10 text-center">
              <p className="text-muted-foreground font-semibold">Request not found.</p>
              <Link href="/minta/requests" className="inline-flex items-center gap-1 text-primary text-sm font-semibold hover:underline mt-3">
                ← Back to requests
              </Link>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    )
  }

  const status = request.status as string
  const canEdit = status === 'new' || status === 'reviewing'

  // Parse description for pre-fill
  let descriptionText = (request.description as string) || ''
  let richData: Record<string, unknown> | null = null
  if (descriptionText.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(descriptionText)
      if (parsed && parsed.type === 'rich_requisition') {
        richData = parsed
      }
    } catch {
      // Use raw description
    }
  }

  return (
    <DashboardLayout
      title="Edit Request"
      subtitle={request.purpose as string}
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'minta'}
    >
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href={`/minta/requests/${id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft size="14" />
          Back to request
        </Link>

        {!canEdit ? (
          <Card className="glass-card border-border/40">
            <CardContent className="p-10 text-center">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-amber-500/10 mb-4">
                <Lock size="24" className="text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-foreground font-semibold mb-1">This request cannot be edited</p>
              <p className="text-xs text-muted-foreground mb-4">
                Requests with status <strong>&quot;{status}&quot;</strong> are read-only. Only requests with status &quot;new&quot; or &quot;reviewing&quot; can be modified.
              </p>
              <Link href={`/minta/requests/${id}`} className="inline-flex items-center gap-1 text-primary text-sm font-semibold hover:underline">
                ← View request details
              </Link>
            </CardContent>
          </Card>
        ) : (
          <EditRequestForm
            requestId={id}
            initialData={{
              purpose: (request.purpose as string) || '',
              description: descriptionText,
              estimated_quantity: (request.estimated_quantity as number) || 0,
              estimated_unit_rate: (request.estimated_unit_rate as number) || 0,
              guest_name: (request.guest_name as string) || '',
              guest_email: (request.guest_email as string) || '',
            }}
          />
        )}
      </div>
    </DashboardLayout>
  )
}
