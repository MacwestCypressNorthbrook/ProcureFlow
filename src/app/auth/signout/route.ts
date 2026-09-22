import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth/server'

export async function POST(request: NextRequest) {
  try {
    await auth.signOut()
  } catch {
    // Already signed out, or the auth service is unreachable — clear locally anyway.
  }
  return NextResponse.redirect(new URL('/auth/login', request.url), { status: 303 })
}
