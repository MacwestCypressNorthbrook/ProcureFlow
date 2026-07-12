import { NextResponse, type NextRequest } from 'next/server'

const PROFILE_COOKIE = 'pf_session'

interface SessionProfile {
  role: string
  userId: string
  authId: string
  name: string
  email: string
}

function getProfileFromCookie(request: NextRequest): SessionProfile | null {
  const raw = request.cookies.get(PROFILE_COOKIE)?.value
  if (!raw) return null
  try {
    const decoded = Buffer.from(raw, 'base64').toString()
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

const ROLE_ROUTES: Record<string, string[]> = {
  minta: ['/minta'],
  mintah: ['/mintah'],
  sam: ['/sam'],
  finance: ['/finance'],
  admin: ['/admin'],
  superuser: ['/admin', '/mintah', '/sam', '/finance', '/minta'],
}

function isRouteMatch(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(route + '/')
}

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request })

  const profile = getProfileFromCookie(request)
  const isAuthenticated = !!profile
  const pathname = request.nextUrl.pathname

  const protectedPaths = ['/mintah', '/sam', '/finance', '/admin', '/minta']
  const isProtected = protectedPaths.some((path) =>
    isRouteMatch(pathname, path)
  )

  if (isProtected && !isAuthenticated) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  if (isAuthenticated && profile) {
    const allowedRoutes = ROLE_ROUTES[profile.role] ?? []
    const isAuthorized = allowedRoutes.some((route) => isRouteMatch(pathname, route))

    if (isProtected && !isAuthorized) {
      const defaultRoute = allowedRoutes[0] ?? '/auth/login'
      const url = request.nextUrl.clone()
      url.pathname = defaultRoute
      return NextResponse.redirect(url)
    }
  }

  return response
}
