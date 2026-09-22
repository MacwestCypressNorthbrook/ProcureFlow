import { query } from '@/lib/db'
import { sendUserInviteEmail } from '@/lib/email/client'
import { ROLE_LABELS } from '@/lib/utils'
import type { User } from '@/lib/types'

/**
 * Email a newly provisioned user their sign-up instructions.
 *
 * A delivery failure must never fail the request — the profile row is already
 * created and the admin can resend the invite from the Users panel.
 */
export async function inviteUser(
  user: User,
  invitedByName?: string | null
): Promise<{ sent: boolean; error?: string }> {
  try {
    const projects = await query<{ name: string }>(
      `SELECT p.name
         FROM public.project_members pm
         JOIN public.projects p ON p.id = pm.project_id
        WHERE pm.user_id = $1
        ORDER BY p.name`,
      [user.id]
    )

    const result = await sendUserInviteEmail({
      recipientEmail: user.email,
      recipientName: user.name,
      roleLabel: ROLE_LABELS[user.role] ?? user.role,
      projectNames: projects.map((p) => p.name),
      invitedByName,
    })

    if (result.mocked) {
      return { sent: false, error: 'No email provider configured — the invite was not delivered.' }
    }
    if (!result.success) {
      return { sent: false, error: result.error ?? 'Delivery failed' }
    }
    return { sent: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Invite email failed:', msg)
    return { sent: false, error: msg }
  }
}
