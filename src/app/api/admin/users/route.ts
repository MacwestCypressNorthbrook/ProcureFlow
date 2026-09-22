import { query, queryOne, execute } from '@/lib/db'
import { requireRole, isElevated } from '@/lib/auth-guard'
import { NextResponse } from 'next/server'
import { setUserProjects } from '@/lib/projects'
import { normalizeRole } from '@/lib/roles'
import { inviteUser } from '@/lib/email/invite'
import type { User, UserWithProjects } from '@/lib/types'


/** Every user, each with the project sites they are assigned to. */
export async function GET() {
  const guard = await requireRole('administrator')
  if (guard.error) return guard.error

  const users = await query<UserWithProjects>(
    `SELECT u.*,
            COALESCE(
              json_agg(
                json_build_object('id', p.id, 'name', p.name, 'code', p.code)
                ORDER BY p.name
              ) FILTER (WHERE p.id IS NOT NULL),
              '[]'
            ) AS projects
       FROM public.users u
       LEFT JOIN public.project_members pm ON pm.user_id = u.id
       LEFT JOIN public.projects p ON p.id = pm.project_id
      GROUP BY u.id
      ORDER BY u.created_at DESC`
  )

  return NextResponse.json({ data: users })
}

/**
 * Create a user profile directly.
 *
 * This provisions the `public.users` row only. The person still signs in
 * through Neon Auth with this email; `getUserFromSession` matches them to this
 * row on first sign-in, so their role and project assignments are waiting for
 * them. `auth_id` is a placeholder until then.
 */
export async function POST(request: Request) {
  const guard = await requireRole('administrator')
  if (guard.error) return guard.error

  let body: { email?: string; name?: string; role?: string; phone?: string; project_ids?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  const role = normalizeRole(body.role) ?? 'engineer'

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
  }

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM public.users WHERE lower(email) = $1 LIMIT 1`,
    [email]
  )
  if (existing) {
    return NextResponse.json({ error: 'A user with that email already exists' }, { status: 409 })
  }

  try {
    const user = await queryOne<User>(
      `INSERT INTO public.users (auth_id, email, name, role, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [`pending:${email}`, email, body.name?.trim() || null, role, body.phone?.trim() || null]
    )

    if (user && Array.isArray(body.project_ids) && body.project_ids.length > 0) {
      await setUserProjects(user.id, body.project_ids, guard.user.id)
    }

    const invite = user ? await inviteUser(user, guard.user.name) : { sent: false, error: 'No user row' }

    return NextResponse.json({ data: user, invite }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

/** Update a user's role, name, email, phone, or active state. */
export async function PATCH(request: Request) {
  const guard = await requireRole('administrator')
  if (guard.error) return guard.error

  let body: {
    id?: string
    role?: string
    name?: string
    email?: string
    phone?: string
    is_active?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { id } = body
  if (!id) {
    return NextResponse.json({ error: 'A user id is required' }, { status: 400 })
  }

  const target = await queryOne<User>(`SELECT * FROM public.users WHERE id = $1 LIMIT 1`, [id])
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const sets: string[] = []
  const values: unknown[] = []

  if (body.role !== undefined) {
    const nextRole = normalizeRole(body.role)
    if (!nextRole) {
      return NextResponse.json({ error: 'A valid role is required' }, { status: 400 })
    }
    const guardResult = await guardLastAdmin(target, { role: nextRole }, guard.user.id)
    if (guardResult) return guardResult
    values.push(nextRole)
    sets.push(`role = $${values.length}`)
  }

  if (body.name !== undefined) {
    values.push(body.name.trim() || null)
    sets.push(`name = $${values.length}`)
  }

  if (body.email !== undefined) {
    const email = body.email.trim().toLowerCase()
    if (!email.includes('@')) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
    }
    const clash = await queryOne<{ id: string }>(
      `SELECT id FROM public.users WHERE lower(email) = $1 AND id <> $2 LIMIT 1`,
      [email, id]
    )
    if (clash) {
      return NextResponse.json({ error: 'Another user already uses that email' }, { status: 409 })
    }
    values.push(email)
    sets.push(`email = $${values.length}`)
  }

  if (body.phone !== undefined) {
    values.push(body.phone.trim() || null)
    sets.push(`phone = $${values.length}`)
  }

  if (body.is_active !== undefined) {
    const guardResult = await guardLastAdmin(target, { is_active: body.is_active }, guard.user.id)
    if (guardResult) return guardResult
    values.push(Boolean(body.is_active))
    sets.push(`is_active = $${values.length}`)
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 })
  }

  values.push(id)

  try {
    const user = await queryOne<User>(
      `UPDATE public.users SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    )
    return NextResponse.json({ data: user })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

/** Permanently delete a user profile. */
export async function DELETE(request: Request) {
  const guard = await requireRole('administrator')
  if (guard.error) return guard.error

  const id = new URL(request.url).searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'A user id is required' }, { status: 400 })
  }

  if (id === guard.user.id) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
  }

  const target = await queryOne<User>(`SELECT * FROM public.users WHERE id = $1 LIMIT 1`, [id])
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const guardResult = await guardLastAdmin(target, { deleting: true }, guard.user.id)
  if (guardResult) return guardResult

  await execute(`DELETE FROM public.users WHERE id = $1`, [id])
  return NextResponse.json({ success: true })
}

/**
 * Refuse a change that would remove the organization's last active admin.
 *
 * Without this, an admin can demote or disable themselves and lock everyone
 * out of the admin panel, with no way back in through the UI.
 */
async function guardLastAdmin(
  target: User,
  change: { role?: string; is_active?: boolean; deleting?: boolean },
  actorId: string
): Promise<NextResponse | null> {
  const targetIsAdmin = isElevated(target.role) && target.is_active !== false
  if (!targetIsAdmin) return null

  const stillAdmin =
    change.deleting === true
      ? false
      : change.role !== undefined
        ? isElevated(change.role)
        : change.is_active !== undefined
          ? change.is_active
          : true

  if (stillAdmin) return null

  const admins = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM public.users
      WHERE is_active AND role IN ('administrator', 'adminstrator', 'super_user', 'admin', 'superuser')`
  )

  if ((admins?.count ?? 0) <= 1) {
    return NextResponse.json(
      { error: 'This is the last active administrator — promote someone else first.' },
      { status: 409 }
    )
  }

  if (target.id === actorId) {
    return NextResponse.json(
      { error: 'You cannot remove your own administrator access.' },
      { status: 400 }
    )
  }

  return null
}
