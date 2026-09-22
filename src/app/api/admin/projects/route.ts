import { query, queryOne } from '@/lib/db'
import { requireRole } from '@/lib/auth-guard'
import { NextResponse } from 'next/server'
import type { Project, ProjectWithMemberCount } from '@/lib/types'

const PROJECT_STATUSES = ['active', 'on_hold', 'archived']

/** List every project site with how many people are assigned to it. */
export async function GET() {
  const guard = await requireRole('administrator')
  if (guard.error) return guard.error

  const projects = await query<ProjectWithMemberCount>(
    `SELECT p.*, COUNT(pm.user_id)::int AS member_count
       FROM public.projects p
       LEFT JOIN public.project_members pm ON pm.project_id = p.id
      GROUP BY p.id
      ORDER BY p.status = 'archived', p.name ASC`
  )

  return NextResponse.json({ data: projects })
}

/** Create a project site. */
export async function POST(request: Request) {
  const guard = await requireRole('administrator')
  if (guard.error) return guard.error

  let body: Record<string, string | undefined>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) {
    return NextResponse.json({ error: 'A project name is required' }, { status: 400 })
  }

  const status = body.status?.trim() || 'active'
  if (!PROJECT_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Status must be one of: ${PROJECT_STATUSES.join(', ')}` }, { status: 400 })
  }

  try {
    const project = await queryOne<Project>(
      `INSERT INTO public.projects (name, code, site_location, client, description, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        name,
        body.code?.trim() || null,
        body.site_location?.trim() || null,
        body.client?.trim() || null,
        body.description?.trim() || null,
        status,
        guard.user.id,
      ]
    )
    return NextResponse.json({ data: project }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('projects_code_key')) {
      return NextResponse.json({ error: 'That project code is already in use' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
