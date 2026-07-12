import { NextResponse } from 'next/server'

const BETTERAUTH_URL = process.env.NEXT_PUBLIC_BETTERAUTH_URL!
const BETTERAUTH_API_KEY = process.env.NEXT_PUBLIC_BETTERAUTH_API_KEY!

export async function POST(request: Request) {
  const body = await request.json()

  // 1. Sign in via BetterAuth
  const signInRes = await fetch(`${BETTERAUTH_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BETTERAUTH_API_KEY}`,
      'Content-Type': 'application/json',
      'Origin': BETTERAUTH_URL,
    },
    body: JSON.stringify({ email: body.email, password: body.password }),
  })

  if (!signInRes.ok) {
    const err = await signInRes.json().catch(() => ({}))
    return NextResponse.json(err, { status: signInRes.status })
  }

  const { token, user } = await signInRes.json()

  // 2. Get profile from Supabase REST (or return defaults)
  let role = 'minta'
  let userId = ''
  let userName = user.name || ''
  let userEmail = user.email || ''

  try {
    const profileRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/users?select=id,role,name,email&auth_id=eq.${user.id}&limit=1`,
      {
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        },
      }
    )
    if (profileRes.ok) {
      const rows = await profileRes.json()
      if (rows.length > 0) {
        role = rows[0].role || 'minta'
        userId = rows[0].id || ''
        userName = rows[0].name || userName
        userEmail = rows[0].email || userEmail
      }
    }
  } catch {
    // Use defaults if Supabase is unavailable
  }

  // 3. Set session cookie with embedded profile data
  const sessionPayload = JSON.stringify({
    token,
    userId,
    authId: user.id,
    role,
    name: userName,
    email: userEmail,
  })
  const encoded = Buffer.from(sessionPayload).toString('base64')

  const response = NextResponse.json({
    token,
    user: { ...user, role },
    redirect: body.redirect,
  })

  response.cookies.set('pf_session', encoded, {
    path: '/',
    maxAge: 604800,
    sameSite: 'lax',
    httpOnly: false,
  })
  response.cookies.set('betterauth_session', token, {
    path: '/',
    maxAge: 604800,
    sameSite: 'lax',
    httpOnly: true,
  })

  return response
}
