import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.redirect(new URL('/auth/login', process.env.NEXT_PUBLIC_SUPABASE_URL!))
}
