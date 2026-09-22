import { requireRole, isElevated } from '@/lib/auth-guard'
import { getActiveProjects, getProjectsForUser } from '@/lib/projects'
import { NextResponse } from 'next/server'

/**
 * Project sites the signed-in user may raise a requisition against.
 *
 * Engineers see only the sites they are assigned to. Elevated roles, who work
 * across the whole organization, see every active site.
 */
export async function GET() {
  const guard = await requireRole(
    'engineer',
    'project_lead',
    'cost_control',
    'supply_chain',
    'finance',
    'administrator'
  )
  if (guard.error) return guard.error

  const projects = isElevated(guard.user.role)
    ? await getActiveProjects()
    : await getProjectsForUser(guard.user.id)

  return NextResponse.json({ data: projects })
}
