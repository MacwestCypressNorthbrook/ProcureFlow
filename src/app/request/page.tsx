import { requirePageCapability, isElevated } from '@/lib/auth-guard'
import { getActiveProjects, getProjectsForUser } from '@/lib/projects'
import { query } from '@/lib/db'
import RequestForm from './RequestForm'
import { dashboardPathForRole } from '@/lib/roles'
import type { SupplierOption } from '@/components/shared/SupplierPicker'

export const dynamic = 'force-dynamic'

export default async function NewRequestPage() {
  // Only roles that may raise a requisition reach this form; anyone else is
  // sent to their own dashboard rather than shown a form they cannot submit.
  const user = await requirePageCapability('request:create')

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
        dashboardPath={dashboardPathForRole(user.role)}
      />
    </>
  )
}
