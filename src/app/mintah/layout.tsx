import { requirePageRole } from '@/lib/auth-guard'

export const dynamic = 'force-dynamic'

/**
 * Authorization boundary for the Mintah area. Runs for every nested route, so
 * typing a URL straight into the address bar is checked the same as a click.
 */
export default async function MintahLayout({ children }: { children: React.ReactNode }) {
  await requirePageRole('supply_chain')
  return <>{children}</>
}
