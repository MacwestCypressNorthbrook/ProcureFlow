import { redirect } from 'next/navigation'
import { getUserFromSession } from '@/lib/auth/server'
import SettingsClient from './SettingsClient'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const user = await getUserFromSession()
  if (!user) redirect('/auth/login?redirect=/settings')

  return (
    <>
      <SettingsClient
        initialName={user.name}
        email={user.email}
        role={user.role}
      />
    </>
  )
}
