import { requirePageRole } from '@/lib/auth-guard'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { getRequestWindowSettings, isRequestDayBlocked, blockedDaysLabel } from '@/lib/settings'

export const dynamic = 'force-dynamic'

/**
 * The persistent shell for this area.
 *
 * Living in a layout rather than in each page is what keeps the sidebar,
 * header and session lookup alive across navigations — Next.js re-renders only
 * the page slot, so moving between screens no longer rebuilds the chrome.
 */
export default async function AreaLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageRole('engineer')

  const requestWindow = await getRequestWindowSettings()
  const disabledNav = isRequestDayBlocked(requestWindow)
    ? { '/request': `Submissions are closed on ${blockedDaysLabel(requestWindow.blockedDays)} — try again tomorrow.` }
    : undefined

  return (
    <DashboardLayout user={{ name: user.name, email: user.email }} role={user.role} disabledNav={disabledNav}>
      {children}
    </DashboardLayout>
  )
}
