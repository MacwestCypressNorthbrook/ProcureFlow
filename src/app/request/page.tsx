import { CalendarClock } from 'lucide-react'
import Link from 'next/link'
import { requirePageCapability, isElevated } from '@/lib/auth-guard'
import { getActiveProjects, getProjectsForUser } from '@/lib/projects'
import { query } from '@/lib/db'
import RequestForm from './RequestForm'
import { dashboardPathForRole } from '@/lib/roles'
import { getRequestWindowSettings, isRequestDayBlocked, blockedDaysLabel } from '@/lib/settings'
import type { SupplierOption } from '@/components/shared/SupplierPicker'

export const dynamic = 'force-dynamic'

export default async function NewRequestPage() {
  // Only roles that may raise a requisition reach this form; anyone else is
  // sent to their own dashboard rather than shown a form they cannot submit.
  const user = await requirePageCapability('request:create')
  const dashboardPath = dashboardPathForRole(user.role)

  // The submission window is a Super User decision, not a blanket lockout —
  // elevated roles still need to raise or fix a requisition on a closed day.
  if (!isElevated(user.role)) {
    const requestWindow = await getRequestWindowSettings()
    if (isRequestDayBlocked(requestWindow)) {
      return (
        <div className="mx-auto max-w-lg px-5 py-16 text-center">
          <CalendarClock size={56} className="mx-auto text-muted-foreground" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
            New requests are closed today
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Requisitions cannot be raised on {blockedDaysLabel(requestWindow.blockedDays)}. Come back tomorrow, or
            reach your Project Lead if this is urgent.
          </p>
          <Link
            href={dashboardPath}
            className="mt-7 inline-flex h-12 items-center justify-center rounded-lg bg-primary px-6 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Back to dashboard
          </Link>
        </div>
      )
    }
  }

  // Fetched on the server so the form is usable on first paint — a site
  // engineer on mobile data should not wait on a picker to populate.
  const [projects, suppliers] = await Promise.all([
    isElevated(user.role) ? getActiveProjects() : getProjectsForUser(user.id),
    query<SupplierOption>(
      `SELECT id, name, category, contact_name, phone
         FROM public.suppliers
        WHERE is_active
        ORDER BY name ASC`
    ),
  ])

  return (
    <>
      <RequestForm
        requester={{ name: user.name, email: user.email }}
        projects={projects}
        suppliers={suppliers}
        dashboardPath={dashboardPath}
      />
    </>
  )
}
