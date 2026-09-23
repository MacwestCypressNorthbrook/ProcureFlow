import { redirect } from 'next/navigation'
import { getUserFromSession } from '@/lib/auth/server'
import DashboardLayout from '@/components/layout/DashboardLayout'

export const dynamic = 'force-dynamic'

/** Settings is open to every signed-in role, so it guards on session alone. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserFromSession()
  if (!user) redirect('/auth/login?redirect=/settings')

  return (
    <DashboardLayout user={{ name: user.name, email: user.email }} role={user.role}>
      {children}
    </DashboardLayout>
  )
}
