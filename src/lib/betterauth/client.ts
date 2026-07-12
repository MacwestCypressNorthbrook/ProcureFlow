export const SESSION_COOKIE = 'betterauth_session'
export const PROFILE_COOKIE = 'pf_session'

export interface BetterAuthUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  createdAt: string
  updatedAt: string
  role: string
}

export interface BetterAuthSignInResult {
  redirect: boolean
  token: string
  user: BetterAuthUser
}

export interface UserProfile {
  token: string
  userId: string
  authId: string
  role: string
  name: string
  email: string
}

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function getProfile(): UserProfile | null {
  const raw = getCookie(PROFILE_COOKIE)
  if (!raw) return null
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString())
  } catch {
    return null
  }
}

export function getToken(): string | null {
  return getCookie(SESSION_COOKIE)
}

export async function signIn(email: string, password: string, redirect?: string): Promise<{ token: string; user: BetterAuthUser }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, redirect }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message || `Sign in failed (${res.status})`)
  }

  return res.json()
}

export async function signUp(email: string, password: string, name: string): Promise<{ token: string; user: BetterAuthUser }> {
  const res = await fetch('/api/auth/sign-up', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message || `Signup failed (${res.status})`)
  }

  return res.json()
}

export async function getSession(token: string): Promise<{ session: { token: string; userId: string; [key: string]: unknown }; user: BetterAuthUser } | null> {
  try {
    const res = await fetch('/api/auth/session', {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
