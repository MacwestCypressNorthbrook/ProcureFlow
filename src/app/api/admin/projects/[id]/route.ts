import { execute, queryOne } from '@/lib/db'
import { requireRole } from '@/lib/auth-guard'
import { NextResponse } from 'next/server'
import type { Project } from '@/lib/types'

const PROJECT_STATUSES = ['active', 'on_hold', 'archived']
const EDITABLE = ['name', 'code', 'site_location', 'client', 'description', 'status'] as const

/** Update a project site. Only the fields present in the body are touched. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('administrator')
  if (guard.error) return guard.error

  const { id } = await params

  let body: Record<string, string | undefined>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (body.status !== undefined && !PROJECT_STATUSES.includes(body.status ?? '')) {
    return NextResponse.json({ error: `Status must be one of: ${PROJECT_STATUSES.join(', ')}` }, { status: 400 })
  }
  if (body.name !== undefined && !body.name?.trim()) {
    return NextResponse.json({ error: 'A project name is required' }, { status: 400 })
  }

  const sets: string[] = []
  const values: unknown[] = []
  for (const field of EDITABLE) {
    if (body[field] === undefined) continue
    const raw = body[field]?.trim()
    values.push(field === 'name' || field === 'status' ? raw : raw || null)
    sets.push(`${field} = $${values.length}`)
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 })
  }

  values.push(id)

  try {
    const project = await queryOne<Project>(
      `UPDATE public.projects SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    )
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    return NextResponse.json({ data: project })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('projects_code_key')) {
      return NextResponse.json({ error: 'That project code is already in use' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

/**
 * Delete a project site.
 *
 * Refused while requisitions still reference it — archiving keeps the audit
 * trail readable, whereas deleting would silently null out their project.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('administrator')
  if (guard.error) return guard.error

  const { id } = await params

  const inUse = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM public.requests WHERE project_id = $1`,
    [id]
  )

  if ((inUse?.count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `This project has ${inUse?.count} requisition(s) against it. Archive it instead of deleting.`,
      },
      { status: 409 }
    )
  }

  await execute(`DELETE FROM public.projects WHERE id = $1`, [id])
  return NextResponse.json({ success: true })
}
