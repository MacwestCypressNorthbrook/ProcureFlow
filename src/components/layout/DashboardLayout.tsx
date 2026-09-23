

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ThemeToggle from '@/components/layout/ThemeToggle'
import NotificationBell from '@/components/layout/NotificationBell'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { normalizeRole, roleLabel, roleDefinition } from '@/lib/roles'
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
  FileText,
  Clock,
  CheckCircle,
  ShoppingBag,
  Eye,
  Banknote,
  Receipt,
  Scale,
  Users,
  Building2,
  Truck,
  Mail,
  History,
  FileCheck2,
} from 'lucide-react'

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  href?: string
  active?: boolean
  onClick?: () => void
  badge?: number
}

/** What the sidebar actually renders — either a link or an in-page section switch. */
type SidebarItem = {
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
  navBadges?: Record<string, number>
}

const roleNavSections: Record<string, { label: string; items: { href: string; label: string; icon: React.ReactNode }[] }[]> = {
  engineer: [
    {
      label: 'Overview',
      items: [{ href: '/minta', label: 'Dashboard', icon: <LayoutDashboard size={18} /> }],
    },
    {
      label: 'Requests',
      items: [
        { href: '/request', label: 'New Request', icon: <FilePlus2 size={18} /> },
        { href: '/minta/requests', label: 'My Requests', icon: <FileText size={18} /> },
        { href: '/minta/tracking', label: 'Track Status', icon: <Clock size={18} /> },
      ],
    },
  ],
  project_lead: [
    {
      label: 'Overview',
      items: [{ href: '/sam', label: 'Dashboard', icon: <LayoutDashboard size={18} /> }],
    },
    {
      label: 'Review',
      items: [
        { href: '/sam/requests', label: 'Awaiting Review', icon: <ClipboardCheck size={18} /> },
        { href: '/sam/all', label: 'All Orders', icon: <ShoppingBag size={18} /> },
      ],
    },
  ],
  supply_chain: [
    {
      label: 'Overview',
      items: [{ href: '/mintah', label: 'Dashboard', icon: <LayoutDashboard size={18} /> }],
    },
    {
      label: 'Review',
      items: [
        { href: '/mintah/queue', label: 'Awaiting Review', icon: <Eye size={18} /> },
        { href: '/mintah/requests', label: 'All Requisitions', icon: <FileText size={18} /> },
      ],
    },
    {
      label: 'Purchase Orders',
      items: [{ href: '/mintah/pos', label: 'Purchase Orders', icon: <ShoppingBag size={18} /> }],
    },
  ],
  cost_control: [
    {
      label: 'Overview',
      items: [{ href: '/cost-control', label: 'Awaiting Review', icon: <Scale size={18} /> }],
    },
  ],
  finance: [
    {
      label: 'Overview',
      items: [{ href: '/finance', label: 'Dashboard', icon: <LayoutDashboard size={18} /> }],
    },
    {
      label: 'Payments',
      items: [
        { href: '/finance/queue', label: 'Awaiting Payment', icon: <Banknote size={18} /> },
        { href: '/finance/completed', label: 'Completed', icon: <CheckCircle size={18} /> },
      ],
    },
    {
      label: 'History',
      items: [{ href: '/finance/all', label: 'All POs', icon: <Receipt size={18} /> }],
    },
  ],
  administrator: [
    {
      label: 'Core Workflow',
      items: [
        { href: '/admin', label: 'Admin Dashboard', icon: <LayoutDashboard size={18} /> },
        { href: '/admin/requests', label: 'Raise Purchase Orders', icon: <ShoppingBag size={18} /> },
        { href: '/admin?tab=pos', label: 'Purchase Orders', icon: <FileCheck2 size={18} /> },
        { href: '/admin?tab=requests', label: 'All Requisitions', icon: <FileText size={18} /> },
      ],
    },
    {
      label: 'Management',
      items: [
        { href: '/admin?tab=users', label: 'Users & Roles', icon: <Users size={18} /> },
        { href: '/admin?tab=projects', label: 'Project Sites', icon: <Building2 size={18} /> },
        { href: '/admin?tab=suppliers', label: 'Suppliers', icon: <Truck size={18} /> },
        { href: '/admin?tab=emails', label: 'Email Templates', icon: <Mail size={18} /> },
        { href: '/admin?tab=audit', label: 'Audit Trail', icon: <History size={18} /> },
      ],
    },
  ],
  super_user: [
    {
      label: 'Operations',
      items: [
        { href: '/admin', label: 'Admin Overview', icon: <LayoutDashboard size={18} /> },
        { href: '/admin/requests', label: 'Raise Purchase Orders', icon: <ShoppingBag size={18} /> },
        { href: '/admin?tab=pos', label: 'Purchase Orders', icon: <FileCheck2 size={18} /> },
        { href: '/admin?tab=requests', label: 'All Requisitions', icon: <FileText size={18} /> },
      ],
    },
    {
      label: 'Cross-Department Dashboards',
      items: [
        { href: '/sam/requests', label: 'Project Lead', icon: <ClipboardCheck size={18} /> },
        { href: '/mintah/queue', label: 'Supply Chain', icon: <Eye size={18} /> },
        { href: '/cost-control', label: 'Cost Control', icon: <Scale size={18} /> },
        { href: '/finance', label: 'Finance', icon: <CreditCard size={18} /> },
      ],
    },
    {
      label: 'System Management',
      items: [
        { href: '/admin?tab=users', label: 'Users & Roles', icon: <Users size={18} /> },
        { href: '/admin?tab=projects', label: 'Project Sites', icon: <Building2 size={18} /> },
        { href: '/admin?tab=suppliers', label: 'Suppliers', icon: <Truck size={18} /> },
        { href: '/admin?tab=emails', label: 'Email Templates', icon: <Mail size={18} /> },
        { href: '/admin?tab=audit', label: 'Audit Trail', icon: <History size={18} /> },
      ],
    },
  ],
}

// Legacy role values still stored on older rows.
roleNavSections.minta = roleNavSections.engineer
roleNavSections.mintah = roleNavSections.supply_chain
roleNavSections.sam = roleNavSections.project_lead
roleNavSections.lead = roleNavSections.project_lead
roleNavSections.superuser = roleNavSections.super_user
roleNavSections.admin = roleNavSections.administrator
roleNavSections.adminstrator = roleNavSections.administrator


export default function DashboardLayout({
  children,
  title,
  subtitle,
  role: serverRole,
  user: serverUser,
  customNav,
  navBadges,
}: DashboardLayoutProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  // The server resolves both of these from the session on every request, so
  // they are authoritative props — mirroring them into state only cost a render.
  const role = serverRole ?? null
  const user = serverUser ?? null

  // Normalizing first means a legacy value such as `sam` or `mintah` still
  // gets its proper sidebar instead of silently falling back to the engineer's.
  const resolvedRole = normalizeRole(role) ?? 'engineer'
  /** Custom nav items keep their `onClick` / `active` flags — they drive in-page sections. */
  const baseSections = customNav
    ? [{ label: 'Navigation', items: customNav as SidebarItem[] }]
    : roleNavSections[resolvedRole] || roleNavSections.engineer

  // Check if base navigation already includes account or settings to prevent duplicate items
  const alreadyHasSettings = baseSections.some((s) =>
    s.items.some((item) => item.label.toLowerCase() === 'settings' || item.href === '/settings')
  )

  // Every role gets its own account settings — a signed-in user should never
  // have to guess where their profile and password live.
  const sections: { label: string; items: SidebarItem[] }[] = [
    ...baseSections,
    ...(alreadyHasSettings
      ? []
      : [
        {
          label: 'Account',
          items: [{ href: '/settings', label: 'Settings', icon: <Settings size={18} /> }],
        },
      ]),
  ]

  const userInitials = (user?.name || user?.email || 'U')
    .slice(0, 2)
    .toUpperCase()

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
            {roleLabel(resolvedRole)}
          </span>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {sections.map((section, si) => (
          <div key={si}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const href = item.href
                const isActive =
                  item.active ??
                  (href ? pathname === href || (href !== '/' && pathname.startsWith(href + '/')) : false)
                const badgeCount = href ? navBadges?.[href] : undefined
                const content = (
                  <>
                    <span className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}>
                      {item.icon}
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {badgeCount !== undefined && badgeCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                  </>
                )

                const baseClass = 'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 press-active w-full text-left'
                const activeClass = isActive
                  ? 'bg-foreground text-background shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_12px_rgba(255,255,255,0.05)]'
                  : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'

                if (item.onClick) {
                  const handleClick = item.onClick
                  return (
                    <button
                      key={item.label}
                      onClick={() => { handleClick(); onNavigate?.() }}
                      className={`${baseClass} ${activeClass}`}
                    >
                      {content}
                    </button>
                  )
                }

                if (!href) return null

                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    className={`${baseClass} ${activeClass}`}
                  >
                    {content}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
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
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[272px_1fr]">
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
              <Menu size={18} />
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

          <div className="flex items-center gap-3">
            {/* In-app Notification Bell */}
            <NotificationBell />

            {role && (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${roleDefinition(role)?.accent ?? 'bg-muted text-muted-foreground'}`}>
                <span className="h-1 w-1 rounded-full bg-current" />
                {roleLabel(role)}
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
