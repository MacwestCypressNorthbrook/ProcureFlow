import { getUserFromSession, type ResolvedUser } from '@/lib/auth/server'
import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import {
  dashboardPathForRole,
  isElevated,
  roleSatisfies,
  can,
  type Capability,
} from '@/lib/roles'

export { isElevated, roleSatisfies }

/**
 * Page-level authorization for a role-scoped route segment.
 *
 * The proxy only establishes *authentication*; this is what stops someone
 * typing another team's dashboard into the address bar with a valid session.
 * An unauthorized user is sent to their own dashboard rather than shown an
 * error, since there is always somewhere legitimate for them to be.
 */
export async function requirePageRole(...allowedRoles: string[]): Promise<ResolvedUser> {
  const user = await getUserFromSession()
  if (!user) redirect('/auth/login')
  if (!roleSatisfies(user.role, allowedRoles)) redirect(dashboardPathForRole(user.role))
  return user
}

/** Page-level guard expressed as a workflow capability. */
export async function requirePageCapability(capability: Capability): Promise<ResolvedUser> {
  const user = await getUserFromSession()
  if (!user) redirect('/auth/login')
  if (!can(user.role, capability)) redirect(dashboardPathForRole(user.role))
  return user
}

type GuardResult =
  | { user: ResolvedUser; error?: never }
  | { user?: never; error: NextResponse }

function forbid(role: string): GuardResult {
  return {
    error: NextResponse.json(
      { error: `Forbidden — your role (${role}) cannot perform this action.` },
      { status: 403 }
    ),
  }
}

/** API guard: the caller must hold one of the listed roles. */
export async function requireRole(...allowedRoles: string[]): Promise<GuardResult> {
  const user = await getUserFromSession()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!roleSatisfies(user.role, allowedRoles)) return forbid(user.role)
  return { user }
}

/**
 * API guard expressed as a workflow capability.
 *
 * Preferred over `requireRole` for anything that moves a requisition or
 * purchase order along, so the permitted roles are defined once in
 * `lib/roles.ts` rather than restated at each route.
 */
export async function requireCapability(capability: Capability): Promise<GuardResult> {
  const user = await getUserFromSession()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!can(user.role, capability)) return forbid(user.role)
  return { user }
}
