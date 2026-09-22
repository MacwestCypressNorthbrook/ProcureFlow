'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth/client'
import { dashboardPathForRole } from '@/lib/roles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import ThemeToggle from '@/components/layout/ThemeToggle'
import { ArrowLeft, ArrowRight, Eye, EyeSlash, Shield } from '@/lib/icons'

function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${className}`}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="m8 9.7 4 2.3 4-2.3M12 12v4.6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

const trail = [
  { who: 'Bernard Wiafe', what: 'raised RF-001', tone: 'bg-blue-400' },
  { who: 'Mintah', what: 'converted to PO-2214', tone: 'bg-violet-400' },
  { who: 'Sam', what: 'approved · signed off', tone: 'bg-amber-400' },
  { who: 'Finance', what: 'paid & closed', tone: 'bg-emerald-400' },
]

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    let dest = redirect

    try {
      // The client rejects on failure and may also return an `error` payload.
      const result = await authClient.signIn.email({ email, password })
      if (result?.error) throw result.error
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
      setLoading(false)
      return
    }

    // Role lives in public.users, not in the auth record — resolve it server-side.
    if (!dest) {
      try {
        const res = await fetch('/api/auth/profile')
        const profile = res.ok ? await res.json() : null
        dest = dashboardPathForRole(profile?.role)
      } catch {
        dest = '/minta'
      }
    }

    router.push(dest)
    router.refresh()
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* ── Brand panel ── */}
      <div className="relative hidden overflow-hidden bg-foreground text-background lg:flex lg:flex-col lg:justify-between p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
          aria-hidden
        />
        <div className="pointer-events-none absolute -left-20 top-1/3 h-80 w-80 rounded-full bg-primary/40 blur-[120px]" aria-hidden />

        <Link href="/" className="relative flex items-center gap-2.5 w-fit">
          <BrandMark className="bg-background text-foreground" />
          <span className="text-[17px] font-semibold tracking-[-0.02em]">ProcureFlow</span>
        </Link>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] leading-tight text-balance">
            Sign in to keep the loop moving.
          </h2>
          <p className="mt-4 text-background/60 leading-relaxed">
            Requisitions, approvals and payments — every hand-off explicit, every action on record.
          </p>

          {/* audit-trail proof */}
          <div className="mt-8 rounded-2xl border border-background/10 bg-background/[0.06] p-5 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-xs font-medium text-background/70">
              <Shield size="14" variant="Bold" />
              Live audit trail · PO-2214
            </div>
            <ul className="mt-4 space-y-3">
              {trail.map((r, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${r.tone}`} />
                  <span className="text-background/90"><span className="font-semibold">{r.who}</span> {r.what}</span>
                  <span className="ml-auto font-mono text-[11px] text-background/40">{`0${i + 1}:${(i * 9 + 12) % 60}`.slice(0, 5)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="relative text-xs text-background/40">
          © {new Date().getFullYear()} ProcureFlow · Built for teams that move money carefully.
        </p>
      </div>

      {/* ── Form panel ── */}
      <div className="relative flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="absolute right-5 top-5 flex items-center gap-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft size="15" /> Home
          </Link>
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm animate-slide-up">
          <Link href="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark className="bg-foreground text-background" />
            <span className="text-[17px] font-semibold tracking-[-0.02em]">ProcureFlow</span>
          </Link>

          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome back</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Enter your credentials to continue.</p>

          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            {error && (
              <div className="animate-shake rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-11 rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">Password</Label>
                <Link href="#" className="text-xs font-medium text-primary hover:underline">Forgot?</Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-11 rounded-lg pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {showPw ? <EyeSlash size="17" /> : <Eye size="17" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="h-11 w-full gap-1.5 shadow-sm" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
              {!loading && <ArrowRight size="16" />}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            New to ProcureFlow?{' '}
            <Link href="/auth/signup" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
