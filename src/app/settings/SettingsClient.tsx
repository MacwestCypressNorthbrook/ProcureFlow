'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth/client'
import { PageContainer, Panel, Field } from '@/components/shared/ui-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import ThemeToggle from '@/components/layout/ThemeToggle'
import { ROLE_LABELS } from '@/lib/utils'
import { User, Shield, Palette, LogOut, CheckCircle, AlertCircle, Lock } from 'lucide-react'

type Status = { tone: 'success' | 'error'; message: string } | null

/** Inline result banner — feedback lands next to the control that caused it. */
function StatusNote({ status }: { status: Status }) {
  if (!status) return null
  const positive = status.tone === 'success'
  return (
    <p
      role="status"
      className={`mt-3 flex items-start gap-1.5 rounded-lg border px-3 py-2 text-xs leading-relaxed ${
        positive
          ? 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-400'
          : 'border-destructive/30 bg-destructive/[0.06] text-destructive'
      }`}
    >
      {positive ? <CheckCircle size={13} className="mt-px shrink-0" /> : <AlertCircle size={13} className="mt-px shrink-0" />}
      {status.message}
    </p>
  )
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  return fallback
}

export default function SettingsClient({
  initialName,
  email,
  role,
}: {
  initialName: string
  email: string
  role: string
}) {
  const router = useRouter()

  const [name, setName] = useState(initialName)
  const [savingName, setSavingName] = useState(false)
  const [nameStatus, setNameStatus] = useState<Status>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [revokeOthers, setRevokeOthers] = useState(true)
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordStatus, setPasswordStatus] = useState<Status>(null)

  const nameDirty = name.trim() !== initialName && name.trim().length > 0

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingName(true)
    setNameStatus(null)
    try {
      const result = await authClient.updateUser({ name: name.trim() })
      if (result?.error) throw result.error
      setNameStatus({ tone: 'success', message: 'Your name has been updated.' })
      router.refresh()
    } catch (err) {
      setNameStatus({ tone: 'error', message: errorMessage(err, 'Could not update your name.') })
    } finally {
      setSavingName(false)
    }
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordStatus(null)

    if (newPassword !== confirmPassword) {
      setPasswordStatus({ tone: 'error', message: 'The new passwords do not match.' })
      return
    }
    if (newPassword.length < 8) {
      setPasswordStatus({ tone: 'error', message: 'Use at least 8 characters for your new password.' })
      return
    }

    setSavingPassword(true)
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: revokeOthers,
      })
      if (result?.error) throw result.error
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordStatus({
        tone: 'success',
        message: revokeOthers
          ? 'Password changed. Other devices have been signed out.'
          : 'Password changed.',
      })
    } catch (err) {
      setPasswordStatus({ tone: 'error', message: errorMessage(err, 'Could not change your password.') })
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <PageContainer className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {/* ── Profile ── */}
          <Panel title="Profile" icon={<User size={16} />}>
            <form onSubmit={saveName} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-medium text-muted-foreground">
                  Display name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  autoComplete="name"
                  className="max-w-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  This is the name shown beside your actions in the audit trail.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" disabled={!nameDirty || savingName}>
                  {savingName ? 'Saving…' : 'Save changes'}
                </Button>
                {nameDirty && !savingName && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setName(initialName)
                      setNameStatus(null)
                    }}
                  >
                    Discard
                  </Button>
                )}
              </div>
            </form>
            <StatusNote status={nameStatus} />
          </Panel>

          {/* ── Password ── */}
          <Panel title="Password" icon={<Lock size={16} />}>
            <form onSubmit={savePassword} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="current" className="text-xs font-medium text-muted-foreground">
                    Current password
                  </Label>
                  <Input
                    id="current"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    className="max-w-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new" className="text-xs font-medium text-muted-foreground">
                    New password
                  </Label>
                  <Input
                    id="new"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm" className="text-xs font-medium text-muted-foreground">
                    Confirm new password
                  </Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={revokeOthers}
                  onChange={(e) => setRevokeOthers(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-input accent-primary"
                />
                <span>
                  Sign out my other devices
                  <span className="block text-[11px] text-muted-foreground/80">
                    Recommended if you think someone else knows your password.
                  </span>
                </span>
              </label>

              <Button
                type="submit"
                size="sm"
                disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
              >
                {savingPassword ? 'Updating…' : 'Update password'}
              </Button>
            </form>
            <StatusNote status={passwordStatus} />
          </Panel>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-6">
          <Panel title="Account" icon={<Shield size={16} />}>
            <div className="space-y-3">
              <Field label="Email">
                <p className="break-all text-sm font-semibold text-foreground">{email}</p>
              </Field>
              <Field label="Role">
                <p className="text-sm font-semibold text-foreground">
                  {ROLE_LABELS[role] ?? role}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Roles decide what you can approve. Only an administrator can change yours.
                </p>
              </Field>
            </div>
          </Panel>

          <Panel title="Appearance" icon={<Palette size={16} />}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Theme</p>
                <p className="text-[11px] text-muted-foreground">Follows your system by default.</p>
              </div>
              <ThemeToggle />
            </div>
          </Panel>

          <Panel title="Session" icon={<LogOut size={16} />}>
            <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
              Signing out ends this session on this device only.
            </p>
            <form action="/auth/signout" method="POST">
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-muted-foreground hover:text-destructive"
              >
                <LogOut size={14} />
                Sign out
              </Button>
            </form>
          </Panel>
        </div>
      </div>
    </PageContainer>
  )
}
