import { execute, query } from '@/lib/db'
import type { Project } from '@/lib/types'

/**
 * Replace a user's project assignments wholesale.
 *
 * The caller sends the complete desired set, so this clears and re-inserts
 * rather than diffing — assignment lists are small and this keeps the
 * "unticked means unassigned" semantics of the admin UI exact.
 */
export async function setUserProjects(
  userId: string,
  projectIds: string[],
  assignedBy: string
): Promise<void> {
  await execute(`DELETE FROM public.project_members WHERE user_id = $1`, [userId])
  if (projectIds.length === 0) return
  await execute(
    `INSERT INTO public.project_members (project_id, user_id, assigned_by)
     SELECT unnest($1::uuid[]), $2, $3
     ON CONFLICT DO NOTHING`,
    [projectIds, userId, assignedBy]
  )
}

/** The active project sites a user may raise requisitions against. */
export async function getProjectsForUser(userId: string): Promise<Project[]> {
  return await query<Project>(
    `SELECT p.*
       FROM public.projects p
       JOIN public.project_members pm ON pm.project_id = p.id
      WHERE pm.user_id = $1 AND p.status = 'active'
      ORDER BY p.name ASC`,
    [userId]
  )
}

/** Every active project site, for admins and reviewers who work across all of them. */
export async function getActiveProjects(): Promise<Project[]> {
  return await query<Project>(
    `SELECT * FROM public.projects WHERE status = 'active' ORDER BY name ASC`
  )
}
