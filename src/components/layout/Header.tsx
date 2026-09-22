'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import type { User } from '@/lib/types'
import { ROLE_LABELS } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import ThemeToggle from '@/components/layout/ThemeToggle'
import {
  Menu,
  Document,
  ClipboardTick,
  Card,
  Setting,
  Logout,
  User as UserIcon,
  Dash,
  ArrowRight,
} from '@/lib/icons'

const roleNavItems: Record<string, { href: string; label: string; icon: React.ReactNode }[]> = {
  minta: [
    { href: '/minta', label: 'Dashboard', icon: <Dash size="16" /> },
    { href: '/request', label: 'New Request', icon: <Document size="16" /> },
  ],
  mintah: [
    { href: '/mintah', label: 'Dashboard', icon: <Dash size="16" /> },
    { href: '/request', label: 'New Request', icon: <Document size="16" /> },
  ],
  sam: [{ href: '/sam', label: 'Dashboard', icon: <ClipboardTick size="16" /> }],
  finance: [{ href: '/finance', label: 'Dashboard', icon: <Card size="16" /> }],
  superuser: [
    { href: '/admin', label: 'Admin Panel', icon: <Setting size="16" /> },
    { href: '/mintah', label: 'Mintah View', icon: <Dash size="16" /> },
    { href: '/sam', label: 'Sam View', icon: <ClipboardTick size="16" /> },
    { href: '/finance', label: 'Finance View', icon: <Card size="16" /> },
  ],
  admin: [{ href: '/admin', label: 'Admin Panel', icon: <Setting size="16" /> }],
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-[10px] bg-foreground text-background shadow-sm transition-transform duration-200 group-hover:scale-105">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="m8 9.7 4 2.3 4-2.3M12 12v4.6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">
        Procure<span className="text-primary">Flow</span>
      </span>
    </Link>
  )
}

export default function Header() {
  const [profile, setProfile] = useState<{ name: string; role: string } | null>(null)
  const [resolved, setResolved] = useState(false)
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()

  // The session cookie is httpOnly, so the profile (and role) is fetched
  // from the server rather than read out of document.cookie.
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((p) => {
        if (cancelled) return
        if (p) setProfile({ name: p.name, role: p.role })
        setResolved(true)
      })
      .catch(() => {
        if (!cancelled) setResolved(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 8)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const role = profile?.role ?? null
  const navItems = role ? (roleNavItems[role] ?? []) : []
  const roleLabel = role ? ROLE_LABELS[role] ?? role : null

  return (
    <header
      className={`sticky top-0 z-50 w-full glass-nav transition-[border-color,box-shadow] duration-300 ${
        scrolled ? 'border-b border-border shadow-[var(--shadow-xs)]' : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-0.5">
          <Link
            href="/request"
            className="px-3.5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted press-active"
          >
            New Request
          </Link>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg transition-colors press-active ${
                pathname === item.href
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Desktop User Area */}
        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          {profile ? (
            <>
              {roleLabel && (
                <span className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  {roleLabel}
                </span>
              )}
              <Separator orientation="vertical" className="mx-1 h-5" />
              <form action="/auth/signout" method="POST">
                <Button variant="ghost" size="sm" type="submit" className="h-9 gap-1.5 text-muted-foreground hover:text-destructive">
                  <Logout size="15" />
                  Sign Out
                </Button>
              </form>
            </>
          ) : resolved ? (
            <Link href="/auth/login">
              <Button size="sm" className="h-9 gap-1.5 px-4 shadow-sm">
                Sign In
                <ArrowRight size="15" />
              </Button>
            </Link>
          ) : (
            <div className="h-9 w-24 animate-pulse rounded-lg bg-muted" aria-hidden />
          )}
        </div>

        {/* Mobile */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors press-active">
              <Menu size="20" />
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] border-l border-border bg-card p-0">
              <SheetTitle className="flex items-center px-6 py-5 border-b border-border">
                <Logo />
              </SheetTitle>
              <div className="flex flex-col p-4 gap-1">
                {roleLabel && (
                  <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    {roleLabel}
                  </span>
                )}
                <Link
                  href="/request"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg hover:bg-muted transition-colors press-active"
                >
                  <Document size="16" color="currentColor" />
                  New Request
                </Link>
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors press-active ${
                      pathname === item.href
                        ? 'bg-muted text-foreground'
                        : 'hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                ))}
                <Separator className="my-3" />
                {profile ? (
                  <form action="/auth/signout" method="POST">
                    <button
                      type="submit"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium text-muted-foreground rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors press-active"
                    >
                      <Logout size="16" />
                      Sign Out
                    </button>
                  </form>
                ) : resolved ? (
                  <Link href="/auth/login" onClick={() => setOpen(false)}>
                    <Button className="w-full gap-1.5">
                      <UserIcon size="16" />
                      Sign In
                    </Button>
                  </Link>
                ) : (
                  <div className="h-10 w-full animate-pulse rounded-lg bg-muted" aria-hidden />
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
