'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ThemeToggle from '@/components/layout/ThemeToggle'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { ROLE_LABELS } from '@/lib/utils'
import {
  Menu,
  LayoutDashboard,
  FilePlus2,
  ClipboardCheck,
  CreditCard,
  Settings,
  LogOut,
  ArrowLeft,
  Box,
  User as UserIcon,
} from 'lucide-react'

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  href?: string
  active?: boolean
  onClick?: () => void
}

interface DashboardLayoutProps {
  children: React.ReactNode
  title: string
  subtitle?: string
  role?: string | null
  user?: { name?: string; email: string } | null
  customNav?: NavItem[]
}

const roleNavItems: Record<string, { href: string; label: string; icon: React.ReactNode }[]> = {
  minta: [
    { href: '/minta', label: 'My Dashboard', icon: <LayoutDashboard size="18" /> },
    { href: '/request', label: 'New Request', icon: <FilePlus2 size="18" /> },
  ],
  mintah: [
    { href: '/mintah', label: 'Dashboard', icon: <LayoutDashboard size="18" /> },
    { href: '/request', label: 'New Request', icon: <FilePlus2 size="18" /> },
  ],
  sam: [
    { href: '/sam', label: 'Dashboard', icon: <ClipboardCheck size="18" /> },
  ],
  finance: [
    { href: '/finance', label: 'Dashboard', icon: <CreditCard size="18" /> },
  ],
  superuser: [
    { href: '/admin', label: 'Admin Panel', icon: <Settings size="18" /> },
  ],
  admin: [
    { href: '/admin', label: 'Admin Panel', icon: <Settings size="18" /> },
  ],
}

const roleBadgeColor: Record<string, string> = {
  superuser: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  admin: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
  minta: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  mintah: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  sam: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  finance: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
}

export default function DashboardLayout({
  children,
  title,
  subtitle,
  role: serverRole,
  user: serverUser,
  customNav,
}: DashboardLayoutProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [user, setUser] = useState<{ name?: string; email: string } | null>(serverUser || null)
  const [role, setRole] = useState<string | null>(serverRole || null)
  const supabase = createClient()

  useEffect(() => {
    if (serverUser && serverRole) return

    async function fetchUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        const { data: profile } = await supabase
          .from('users')
          .select('name, email, role')
          .eq('id', authUser.id)
          .single()

        if (profile) {
          setUser({ name: profile.name, email: profile.email })
          setRole(profile.role)
        }
      }
    }
    fetchUser()
  }, [supabase, serverUser, serverRole])

  const resolvedRole = role || 'minta'
  const userInitials = user?.name ? user.name.slice(0, 2).toUpperCase() : user?.email.slice(0, 2).toUpperCase() || 'PF'

  const navItems: NavItem[] = customNav || (roleNavItems[resolvedRole] || []).map((item) => ({
    id: item.href,
    label: item.label,
    icon: item.icon,
    href: item.href,
    active: pathname === item.href,
  }))

  const sidebarContent = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col bg-card/50 dark:bg-card/30 backdrop-blur-md">
      {/* Sidebar Header */}
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background shadow-sm transition-transform duration-200">
          <Box size="16" />
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight text-foreground">ProcureFlow</span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {ROLE_LABELS[resolvedRole] || resolvedRole}
          </span>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 space-y-1 px-4 py-6">
        {navItems.map((item) => {
          const isActive = item.active !== undefined ? item.active : pathname === item.href
          const content = (
            <>
              <span className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </>
          )

          const baseClass = `group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 press-active w-full text-left`
          const activeClass = isActive
            ? 'bg-foreground text-background shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_12px_rgba(255,255,255,0.05)]'
            : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'

          if (item.href) {
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={onNavigate}
                className={`${baseClass} ${activeClass}`}
              >
                {content}
              </Link>
            )
          }

          return (
            <button
              key={item.id}
              onClick={() => {
                item.onClick?.()
                onNavigate?.()
              }}
              className={`${baseClass} ${activeClass}`}
            >
              {content}
            </button>
          )
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="border-t border-border p-4 space-y-4 bg-muted/20 dark:bg-muted/5">
        <div className="flex items-center gap-3 px-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary text-xs font-semibold ring-2 ring-primary/20">
            {userInitials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">{user?.name || 'User'}</p>
            <p className="truncate text-[10px] text-muted-foreground font-medium">{user?.email}</p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border/60 pt-3 px-1 text-xs">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            <ArrowLeft size="14" />
            Home
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                title="Sign out"
              >
                <LogOut size="16" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[256px_1fr]">
      {/* Desktop Sidebar */}
      <aside className="sticky top-0 hidden h-screen border-r border-border bg-card lg:block z-20">
        {sidebarContent()}
      </aside>

      {/* Main Container */}
      <div className="flex flex-col min-h-screen">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 backdrop-blur-md px-4 sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden transition-colors border border-border">
              <Menu size="18" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[270px] border-r border-border bg-card p-0">
              <SheetTitle className="sr-only">Dashboard Navigation</SheetTitle>
              {sidebarContent(() => setMobileOpen(false))}
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold tracking-tight text-foreground sm:text-base truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="hidden text-xs text-muted-foreground sm:block truncate">{subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {role && (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${roleBadgeColor[role] || 'bg-muted border-border'}`}>
                <span className="h-1 w-1 rounded-full bg-current" />
                {ROLE_LABELS[role] || role}
              </span>
            )}
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
