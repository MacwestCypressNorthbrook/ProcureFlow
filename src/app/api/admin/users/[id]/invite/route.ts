import { queryOne } from '@/lib/db'
import { requireRole } from '@/lib/auth-guard'
import { inviteUser } from '@/lib/email/invite'
import { NextResponse } from 'next/server'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import type { User } from '@/lib/types'

/**
 * Re-send the sign-up invitation for a user who has not claimed their account.
 *
 * Only meaningful while `auth_id` is still the `pending:` placeholder — once
 * they have signed up there is nothing to invite them to.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('administrator')
  if (guard.error) return guard.error

  const limit = await rateLimit(`invite:${guard.user.id}`, { max: 10, windowSeconds: 600 })
  if (!limit.ok) return tooManyRequests('Too many invitations sent. Wait a few minutes.', limit.retryAfter)

  const { id } = await params

  const user = await queryOne<User>(`SELECT * FROM public.users WHERE id = $1 LIMIT 1`, [id])
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  if (!user.auth_id?.startsWith('pending:')) {
    return NextResponse.json(
      { error: 'That user has already completed sign-up.' },
      { status: 409 }
    )
  }

  const invite = await inviteUser(user, guard.user.name)
  if (!invite.sent) {
    return NextResponse.json({ error: invite.error ?? 'The invite could not be sent.' }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
