import { NextResponse } from 'next/server'

const BETTERAUTH_URL = process.env.NEXT_PUBLIC_BETTERAUTH_URL!

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 })
  }

  const res = await fetch(`${BETTERAUTH_URL}/api/auth/get-session`, {
    headers: {
      'Authorization': authHeader,
      'Origin': BETTERAUTH_URL,
    },
  })

  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status })
  }

  return NextResponse.json(data)
}
