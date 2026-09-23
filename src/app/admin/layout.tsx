import { requirePageRole } from '@/lib/auth-guard'
import DashboardLayout from '@/components/layout/DashboardLayout'

export const dynamic = 'force-dynamic'

/**
 * Authorization boundary for the Admin area. Runs for every nested route, so
 * typing a URL straight into the address bar is checked the same as a click.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageRole('administrator')

  return (
    <DashboardLayout user={{ name: user.name, email: user.email }} role={user.role}>
      {children}
    </DashboardLayout>
  )
}
