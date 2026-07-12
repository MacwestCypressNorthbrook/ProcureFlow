import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.redirect(new URL('/auth/login', 'http://localhost:3000'))
  response.cookies.set('betterauth_session', '', { maxAge: 0, path: '/' })
  response.cookies.set('pf_session', '', { maxAge: 0, path: '/' })
  return response
}
