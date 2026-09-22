import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/server'

/**
 * Optimistic session check only.
 *
 * Per the Next.js docs, proxy "should not be used as a full session management
 * or authorization solution" — it redirects requests with no valid session to
 * the login page and nothing more. Role authorization lives in `requireRole`
 * and in the pages themselves, where the role is read from the database.
 */
const protect = auth.middleware({ loginUrl: '/auth/login' })

export function proxy(request: NextRequest) {
  // Server Actions carry their own auth checks; don't redirect them mid-flight.
  if (request.headers.has('Next-Action')) return
  return protect(request)
}

export const config = {
  matcher: ['/minta/:path*', '/mintah/:path*', '/sam/:path*', '/finance/:path*', '/admin/:path*', '/request/:path*', '/settings/:path*'],
}
