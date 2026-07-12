'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { signUp } from '@/lib/betterauth/client'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UserAdd } from '@/lib/icons'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('minta')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await signUp(email, password, name)
      const betterAuthUser = result.user

      const supabase = createClient()
      const { error: dbError } = await supabase.from('users').upsert({
        email,
        name,
        role,
        auth_id: betterAuthUser.id,
      })

      if (dbError) {
        setError(`Account created but profile setup failed: ${dbError.message}`)
        setLoading(false)
        return
      }

      router.push('/auth/login')
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Signup failed'
      setError(message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center mesh-gradient noise-overlay px-4 py-8">
      <div className="w-full max-w-4xl animate-scale-in">
        <div className="grid md:grid-cols-2 rounded-3xl overflow-hidden glass-card-elevated shadow-2xl shadow-black/10">
          {/* Image side */}
          <div className="relative hidden md:block">
            <Image
              src="/images/step-team.jpg"
              alt="Team working together"
              width={600}
              height={800}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-8 text-white">
              <h2 className="text-2xl font-bold mb-2">Join ProcureFlow</h2>
              <p className="text-white/80 text-sm leading-relaxed">
                Create your account and start participating in the procurement workflow.
              </p>
            </div>
          </div>
          {/* Form side */}
          <div className="p-8 sm:p-10">
            <div className="flex flex-col items-center md:items-start mb-6">
              <Link href="/" className="inline-flex items-center gap-2 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground font-bold text-sm shadow-md shadow-primary/20">
                  PF
                </div>
              </Link>
              <h1 className="text-2xl font-bold">Create Account</h1>
              <p className="text-muted-foreground text-sm mt-1">Join ProcureFlow with your role</p>
            </div>
            <form onSubmit={handleSignup} className="space-y-3.5">
              {error && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="minta">Minta (Requester)</option>
                  <option value="mintah">Mintah (Procurement)</option>
                  <option value="sam">Sam (Approver)</option>
                  <option value="finance">Finance</option>
                  <option value="superuser">Superuser (Admin)</option>
                </select>
              </div>
              <Button type="submit" className="w-full h-10 gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-shadow press-active" disabled={loading}>
                <UserAdd size="16" />
                {loading ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>
            <div className="mt-5 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/auth/login" className="text-primary font-medium hover:underline">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
