import { requirePageRole } from '@/lib/auth-guard'

export const dynamic = 'force-dynamic'

/**
 * Authorization boundary for the Sam area. Runs for every nested route, so
 * typing a URL straight into the address bar is checked the same as a click.
 */
export default async function SamLayout({ children }: { children: React.ReactNode }) {
  await requirePageRole('project_lead', 'cost_control', 'supply_chain')
  return <>{children}</>
}
