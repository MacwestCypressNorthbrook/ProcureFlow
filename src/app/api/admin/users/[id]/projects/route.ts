import { query, queryOne } from '@/lib/db'
import { requireRole } from '@/lib/auth-guard'
import { setUserProjects } from '@/lib/projects'
import { NextResponse } from 'next/server'
import type { Project } from '@/lib/types'

/** The project sites currently assigned to a user. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('administrator')
  if (guard.error) return guard.error

  const { id } = await params

  const projects = await query<Project>(
    `SELECT p.*
       FROM public.projects p
       JOIN public.project_members pm ON pm.project_id = p.id
      WHERE pm.user_id = $1
      ORDER BY p.name ASC`,
    [id]
  )

  return NextResponse.json({ data: projects })
}

/**
 * Replace a user's project assignments with the supplied set.
 *
 * The body carries the complete list, so omitting an id unassigns it.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('administrator')
  if (guard.error) return guard.error

  const { id } = await params

  let body: { project_ids?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!Array.isArray(body.project_ids) || body.project_ids.some((p) => typeof p !== 'string')) {
    return NextResponse.json({ error: 'project_ids must be an array of project ids' }, { status: 400 })
  }
  const projectIds = body.project_ids as string[]

  const exists = await queryOne<{ id: string }>(`SELECT id FROM public.users WHERE id = $1`, [id])
  if (!exists) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (projectIds.length > 0) {
    const found = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM public.projects WHERE id = ANY($1::uuid[])`,
      [projectIds]
    )
    if ((found?.count ?? 0) !== projectIds.length) {
      return NextResponse.json({ error: 'One or more projects no longer exist' }, { status: 400 })
    }
  }

  try {
    await setUserProjects(id, projectIds, guard.user.id)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({ success: true, count: projectIds.length })
}
