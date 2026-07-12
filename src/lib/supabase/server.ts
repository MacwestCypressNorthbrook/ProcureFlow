import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export interface ResolvedUser {
  id: string
  email: string
  name: string
  role: string
  authId: string
}

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component.
          }
        },
      },
    }
  )
}

export async function getUserFromSession(): Promise<ResolvedUser | null> {
  const cookieStore = await cookies()
  const sessionRaw = cookieStore.get('pf_session')?.value
  if (!sessionRaw) return null

  try {
    const decoded = Buffer.from(sessionRaw, 'base64').toString()
    const session = JSON.parse(decoded)

    const supabase = await createClient()
    const { data: profile, error } = await supabase
      .from('users')
      .select('id, email, name, role, auth_id')
      .eq('auth_id', session.authId)
      .limit(1)
      .maybeSingle()

    if (error || !profile) return null

    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role,
      authId: profile.auth_id,
    }
  } catch {
    return null
  }
}

export async function getUserProfileByAuthId(authId: string): Promise<ResolvedUser | null> {
  try {
    const supabase = await createClient()
    const { data: profile, error } = await supabase
      .from('users')
      .select('id, email, name, role, auth_id')
      .eq('auth_id', authId)
      .limit(1)
      .maybeSingle()

    if (error || !profile) return null

    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role,
      authId: profile.auth_id,
    }
  } catch {
    return null
  }
}
