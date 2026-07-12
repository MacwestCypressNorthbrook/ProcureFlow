import { NextResponse } from 'next/server'

const BETTERAUTH_URL = process.env.NEXT_PUBLIC_BETTERAUTH_URL!
const BETTERAUTH_API_KEY = process.env.NEXT_PUBLIC_BETTERAUTH_API_KEY!

export async function POST(request: Request) {
  const body = await request.json()

  const res = await fetch(`${BETTERAUTH_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BETTERAUTH_API_KEY}`,
      'Content-Type': 'application/json',
      'Origin': BETTERAUTH_URL,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status })
  }

  return NextResponse.json(data)
}
