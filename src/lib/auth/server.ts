import { createNeonAuth } from '@neondatabase/auth/next/server'
import { queryOne } from '@/lib/db'

type NeonAuth = ReturnType<typeof createNeonAuth>

let instance: NeonAuth | null = null

/**
 * Build the Neon Auth client on first use, not on import.
 *
 * `createNeonAuth` throws when its cookie secret is missing. Calling it at
 * module scope meant any build environment without `NEON_AUTH_COOKIE_SECRET`
 * — a CI or Vercel build that has not been given the variable — failed while
 * collecting page data, long before a request was ever served. Deferring it
 * turns that into a clear runtime error on the one request that needs auth,
 * and lets the build succeed.
 */
function getAuth(): NeonAuth {
  if (!instance) {
    const baseUrl = process.env.NEON_AUTH_BASE_URL
    const secret = process.env.NEON_AUTH_COOKIE_SECRET
    if (!baseUrl || !secret) {
      throw new Error(
        'Neon Auth is not configured: set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET.'
      )
    }
    instance = createNeonAuth({ baseUrl, cookies: { secret } })
  }
  return instance
}

/**
 * The auth client, resolved lazily. Callers keep using `auth.getSession()`;
 * the proxy just delays construction until the first property access.
 */
export const auth = new Proxy({} as NeonAuth, {
  get(_target, property, receiver) {
    return Reflect.get(getAuth() as object, property, receiver)
  },
})

export interface ResolvedUser {
  id: string
  email: string
  name: string
  role: string
  authId: string
}

interface UserRow {
  id: string
  email: string
  name: string | null
  role: string
  auth_id: string
  is_active: boolean
}

const USER_COLUMNS = `id, email, name, role, auth_id, is_active`

function toResolvedUser(row: UserRow, fallbackName = ''): ResolvedUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name || fallbackName,
    role: row.role,
    authId: row.auth_id,
  }
}

/**
 * Resolve the signed-in user for the current request.
 *
 * The session itself comes from Neon Auth (signed, httpOnly cookie). The role
 * comes from `public.users`, keyed on the Neon Auth user id. A user with a
 * valid session but no profile row is NOT authenticated for this app — there is
 * deliberately no fallback role, since role drives approval authority.
 */
export async function getUserFromSession(): Promise<ResolvedUser | null> {
  const { data } = await auth.getSession()
  const authUser = data?.user
  if (!authUser) return null

  const profile = await getUserRow(authUser.id)
  if (profile) {
    // A deactivated account keeps its history but is not authenticated here.
    if (profile.is_active === false) return null
    return toResolvedUser(profile, authUser.name ?? '')
  }

  // First sign-in: adopt an admin-created profile, or create the least-
  // privileged one if nobody set this person up in advance.
  return await provisionUser(authUser.id, authUser.email, authUser.name ?? '')
}

async function getUserRow(authId: string): Promise<UserRow | null> {
  return await queryOne<UserRow>(
    `SELECT ${USER_COLUMNS} FROM public.users WHERE auth_id = $1 LIMIT 1`,
    [authId]
  )
}

async function provisionUser(
  authId: string,
  email: string,
  name: string
): Promise<ResolvedUser | null> {
  // An administrator may have set this person up ahead of time, in which case a
  // row already holds their role and project assignments under a placeholder
  // auth_id. Claim it rather than colliding on the unique email.
  const claimed = await queryOne<UserRow>(
    `UPDATE public.users
        SET auth_id = $1,
            name = COALESCE(NULLIF(name, ''), $3),
            updated_at = now()
      WHERE lower(email) = lower($2) AND auth_id <> $1
      RETURNING ${USER_COLUMNS}`,
    [authId, email, name]
  )
  if (claimed) {
    if (claimed.is_active === false) return null
    return toResolvedUser(claimed, name)
  }

  const row = await queryOne<UserRow>(
    `INSERT INTO public.users (auth_id, email, name, role)
     VALUES ($1, $2, $3, 'engineer')
     ON CONFLICT (auth_id) DO UPDATE SET updated_at = now()
     RETURNING ${USER_COLUMNS}`,
    [authId, email, name]
  )
  if (!row || row.is_active === false) return null
  return toResolvedUser(row, name)
}

export async function getUserProfileByAuthId(authId: string): Promise<ResolvedUser | null> {
  const row = await getUserRow(authId)
  return row ? toResolvedUser(row) : null
}
