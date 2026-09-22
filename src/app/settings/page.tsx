import { redirect } from 'next/navigation'
import { getUserFromSession } from '@/lib/auth/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import SettingsClient from './SettingsClient'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const user = await getUserFromSession()
  if (!user) redirect('/auth/login?redirect=/settings')

  return (
    <DashboardLayout
      title="Settings"
      subtitle="Your profile, sign-in and appearance"
      user={{ name: user.name, email: user.email }}
      role={user.role}
    >
      <SettingsClient
        initialName={user.name}
        email={user.email}
        role={user.role}
      />
    </DashboardLayout>
  )
}
