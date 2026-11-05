'use client'

import { useSyncExternalStore, useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import ThemeToggle from '@/components/layout/ThemeToggle'
import NotificationBell from '@/components/layout/NotificationBell'
import MobileTabBar, { type TabBarItem } from '@/components/layout/MobileTabBar'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { normalizeRole, roleLabel, roleDefinition } from '@/lib/roles'
import { cn } from '@/lib/utils'
import {
  Menu,
  LayoutDashboard,
  FilePlus2,
  ClipboardCheck,
  CreditCard,
  Settings,
  LogOut,
  ArrowLeft,
  FileText,
  Clock,
  CheckCircle,
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
  Lock,
  SlidersHorizontal,
  Search,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
  X,
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
  /** Optional override; otherwise the header title is derived from the route. */
  title?: string
  subtitle?: string
  role?: string | null
  user?: { name?: string; email: string } | null
  customNav?: NavItem[]
  /**
   * Render neutral placeholder rows instead of a role's menu.
   *
   * Loading skeletons must never render real navigation: guessing a role there
   * flashes another team's sidebar at whoever is waiting for the page.
   */
  navSkeleton?: boolean
  navBadges?: Record<string, number>
  /**
   * Nav items to render as closed rather than as a link, keyed by href, with
   * the reason shown as a tooltip. Currently how the Super User-configured
   * requisition submission window keeps "New Request" out of reach on days
   * it's closed, without hiding the item outright.
   */
  disabledNav?: Record<string, string>
}

/**
 * Header titles by route.
 *
 * The shell lives in a layout now, so it cannot receive a title from the page
 * it wraps. Deriving it from the pathname keeps the header meaningful without
 * making every page re-render the chrome just to set a string. Longest match
 * wins, so `/minta/requests` beats `/minta`.
 */
const ROUTE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  '/minta': { title: 'My Dashboard', subtitle: 'Track your requisitions through the chain' },
  '/minta/requests': { title: 'My Requests', subtitle: 'Every requisition you have raised' },
  '/minta/tracking': { title: 'Track Request Status', subtitle: 'Where each requisition sits right now' },
  '/request': { title: 'New Request', subtitle: 'Raise a requisition for review' },
  '/sam': { title: 'Project Lead Review', subtitle: 'First review of every requisition' },
  '/sam/requests': { title: 'Requisitions to Review', subtitle: 'Awaiting your approval' },
  '/sam/reviewed': { title: 'Reviewed', subtitle: 'Everything you have decided on' },
  '/sam/all': { title: 'All Requisitions', subtitle: 'Everything across the sites, with its approval trail' },
  '/mintah': { title: 'Supply Chain', subtitle: 'Specifications, quantities and suppliers' },
  '/mintah/queue': { title: 'Requisitions to Review', subtitle: 'Awaiting your approval' },
  '/mintah/requests': { title: 'All Requisitions', subtitle: 'Everything raised across the sites' },
  '/mintah/reviewed': { title: 'Reviewed', subtitle: 'Everything Supply Chain has priced and passed on' },
  '/cost-control': { title: 'Cost Control Review', subtitle: 'Rates and vendor invoices against budget' },
  '/cost-control/requests': { title: 'All Requisitions', subtitle: 'Everything across the sites' },
  '/cost-control/reviewed': { title: 'Reviewed', subtitle: 'Every audit decision you have recorded' },
  '/finance': { title: 'Finance Dashboard', subtitle: 'Disbursement and settlement' },
  '/finance/queue': { title: 'Awaiting Payment', subtitle: 'Cleared for disbursement' },
  '/finance/completed': { title: 'Completed Payments', subtitle: 'Paid and receipted' },
  '/finance/all': { title: 'All Purchase Orders', subtitle: 'Complete history' },
  '/finance/reviewed': { title: 'Reviewed', subtitle: 'Every payment you have settled' },
  '/admin': { title: 'Administration', subtitle: 'Requisitions, purchase orders and reference data' },
  '/admin/requests': { title: 'Requisitions', subtitle: 'Every request raised across the organization' },
  '/admin/reviewed': { title: 'Reviewed', subtitle: 'Every requisition Administration has closed' },
  '/settings': { title: 'Settings', subtitle: 'Your profile and preferences' },
}

/**
 * Picks the single sidebar item that best matches the current location, so
 * a parent route (e.g. `/minta`) never lights up alongside a more specific
 * child route (`/minta/requests/:id`), and so tab-based routes (`/admin?tab=x`)
 * are matched on their query string, not just the pathname.
 */
function activeHrefFor(hrefs: string[], pathname: string, currentTab: string | null): string | null {
  let best: string | null = null
  let bestScore = -1
  for (const href of hrefs) {
    const [itemPath, itemQuery] = href.split('?')
    if (itemQuery) {
      const itemTab = new URLSearchParams(itemQuery).get('tab')
      if (pathname === itemPath && currentTab === itemTab) {
        const score = href.length
        if (score > bestScore) {
          bestScore = score
          best = href
        }
      }
    } else {
      const matches = pathname === itemPath || (itemPath !== '/' && pathname.startsWith(itemPath + '/'))
      if (matches && !currentTab) {
        const score = itemPath.length
        if (score > bestScore) {
          bestScore = score
          best = href
        }
      }
    }
  }
  return best
}

function titleForPath(pathname: string): { title: string; subtitle?: string } {
  let best: { title: string; subtitle?: string } | null = null
  let bestLength = -1
  for (const [route, meta] of Object.entries(ROUTE_TITLES)) {
    if ((pathname === route || pathname.startsWith(route + '/')) && route.length > bestLength) {
      best = meta
      bestLength = route.length
    }
  }
  return best ?? { title: 'ProcureFlow' }
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
      // No "All Orders" here. A purchase order only exists at the final stage,
      // raised by the Administrator, and the Project Lead has no action on one
      // — `po:approve` is Cost Control's and `po:pay` is Finance's. Their real
      // question, "what happened to the requisitions I approved", is answered
      // by Reviewed (which shows where each one is now) and All Requisitions.
      // A PO deep-linked from a notification still opens at /sam/:id.
      items: [
        { href: '/sam/requests', label: 'Awaiting Review', icon: <ClipboardCheck size={18} /> },
        { href: '/sam/reviewed', label: 'Reviewed', icon: <ClipboardList size={18} /> },
        { href: '/sam/all', label: 'All Requisitions', icon: <FileText size={18} /> },
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
        { href: '/mintah/reviewed', label: 'Reviewed', icon: <ClipboardList size={18} /> },
        { href: '/mintah/requests', label: 'All Requisitions', icon: <FileText size={18} /> },
      ],
    },
    {
      label: 'Reference Data',
      items: [{ href: '/mintah/suppliers', label: 'Suppliers', icon: <Truck size={18} /> }],
    },
  ],
  cost_control: [
    {
      label: 'Review',
      items: [
        { href: '/cost-control', label: 'Awaiting Review', icon: <Scale size={18} /> },
        { href: '/cost-control/reviewed', label: 'Reviewed', icon: <ClipboardList size={18} /> },
        { href: '/cost-control/requests', label: 'All Requisitions', icon: <FileText size={18} /> },
      ],
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
      items: [
        { href: '/finance/reviewed', label: 'Reviewed', icon: <ClipboardList size={18} /> },
        { href: '/finance/all', label: 'All POs', icon: <Receipt size={18} /> },
        { href: '/finance/requests', label: 'All Requisitions', icon: <FileText size={18} /> },
      ],
    },
  ],
  // Procurement only. People, the audit trail, email templates and workspace
  // preferences are Super User territory and must not appear here.
  administrator: [
    {
      label: 'Final Authorization',
      items: [
        { href: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
        { href: '/admin/requests', label: 'Awaiting Authorization', icon: <ClipboardCheck size={18} /> },
        { href: '/admin/reviewed', label: 'Reviewed', icon: <ClipboardList size={18} /> },
        { href: '/admin?tab=pos', label: 'Purchase Orders', icon: <FileCheck2 size={18} /> },
        { href: '/admin?tab=invoices', label: 'Invoices', icon: <Receipt size={18} /> },
      ],
    },
    {
      label: 'Reference Data',
      items: [
        { href: '/admin?tab=projects', label: 'Project Sites', icon: <Building2 size={18} /> },
        { href: '/admin?tab=suppliers', label: 'Suppliers', icon: <Truck size={18} /> },
      ],
    },
  ],
  super_user: [
    {
      label: 'Operations',
      items: [
        { href: '/admin', label: 'Admin Overview', icon: <LayoutDashboard size={18} /> },
        { href: '/admin?tab=requests', label: 'All Requisitions', icon: <FileText size={18} /> },
        { href: '/admin/reviewed', label: 'Reviewed', icon: <ClipboardList size={18} /> },
        { href: '/admin?tab=pos', label: 'Purchase Orders', icon: <FileCheck2 size={18} /> },
        { href: '/admin?tab=invoices', label: 'Invoices', icon: <Receipt size={18} /> },
      ],
    },
    {
      label: 'Cross-Department Dashboards',
      items: [
        // Where the purchase order is raised. Super User is elevated, so it
        // holds `request:convert` and may act here like the Administrator.
        { href: '/admin/requests', label: 'Administrator', icon: <FileCheck2 size={18} /> },
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
        { href: '/admin?tab=settings', label: 'Workspace Preferences', icon: <SlidersHorizontal size={18} /> },
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

/*
  The rail and the open panel, both 24px off the edge.

  The grid column reserves the space on pointer devices, where the sidebar is
  always on screen. A touch device gets the drawer and the tab bar instead, so
  it reserves nothing.
*/
const RAIL_PAD = 'pointer-fine:md:grid-cols-[112px_minmax(0,1fr)]'
const OPEN_PAD = 'pointer-fine:md:grid-cols-[300px_minmax(0,1fr)]'

/*
  The four footer actions: a vertical stack on the collapsed rail, a single row
  once it expands.

  This is done with flex-wrap against a width, NOT with absolute offsets. The
  previous version positioned each button at a hardcoded `top`/`left` inside a
  container that animated between 200px and 44px tall, which meant any state
  where the box had shrunk but the buttons had not left three of the four
  sitting past the sidebar's bottom edge, where `overflow-hidden` clipped them
  — you saw Sign out and nothing else.

  Wrapping removes that whole class of bug. At `w-11` only one 44px button fits
  per line, so they stack; at full width all four fit, so they form a row. The
  container's height is auto in both cases, so nothing can ever overflow it,
  and width is still animatable, so the transition survives.
*/
const actionBox =
  // `shrink-0` matters now that these are flex items: without it a narrow
  // drawer would squeeze the 44px squares into slivers rather than wrapping.
  'grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground press-active'

/*
  The sidebar's open state, remembered per browser.

  It used to be a `pinned` flag on top of a hover-to-expand rail: the panel
  opened because the pointer happened to cross it and closed when it left. That
  reads as the chrome reacting to the mouse rather than to the person — and it
  cost labels, since a collapsed rail showed bare icons until you hovered it.
  Two CSS pseudo-classes (`hover:` and `focus-within:`) drove the width, so a
  clicked link kept the panel open through its own focus, which took a
  `suppressHover` flag and a manual `blur()` to work around.

  Now the person decides, once, with a button; `collapsed` is the only state and
  nothing reopens behind their back. Expanded is the default — labels visible
  until someone asks for more room.
*/
const COLLAPSE_KEY = 'pf-sidebar-collapsed'
const COLLAPSE_EVENT = 'pf-sidebar-collapse'

function subscribeCollapsed(callback: () => void) {
  window.addEventListener(COLLAPSE_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(COLLAPSE_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export default function DashboardLayout({
  children,
  title,
  subtitle,
  role: serverRole,
  user: serverUser,
  customNav,
  navBadges,
  navSkeleton = false,
  disabledNav,
}: DashboardLayoutProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false)
  const searchRef = useRef<HTMLInputElement>(null)
  const routeMeta = titleForPath(pathname)
  const headerTitle = title ?? routeMeta.title
  const headerSubtitle = subtitle ?? routeMeta.subtitle
  // The server resolves both of these from the session on every request, so
  // they are authoritative props — mirroring them into state only cost a render.
  const role = serverRole ?? null
  const user = serverUser ?? null

  /** Clearing the menu filter is all a navigation needs to do now. */
  const afterNavigate = () => setQuery('')

  /*
    ⌘\ (Ctrl+\ on Windows) collapses and expands the sidebar, the way every
    editor and Apple's own apps do it. Ignored while typing, so it can never
    swallow a backslash someone meant to enter.
  */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '\\' || !(e.metaKey || e.ctrlKey)) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      try {
        localStorage.setItem(COLLAPSE_KEY, readCollapsed() ? '0' : '1')
      } catch {
        /* nothing to remember in private mode */
      }
      window.dispatchEvent(new Event(COLLAPSE_EVENT))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toggleCollapsed = () => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '0' : '1')
    } catch {
      /* private mode: the sidebar still toggles, it just will not be remembered */
    }
    window.dispatchEvent(new Event(COLLAPSE_EVENT))
  }

  // Normalizing first means a legacy value such as `sam` or `mintah` still
  // gets its proper sidebar instead of silently falling back to the engineer's.
  const resolvedRole = normalizeRole(role) ?? 'engineer'
  /** Custom nav items keep their `onClick` / `active` flags — they drive in-page sections. */
  const baseSections = navSkeleton
    ? []
    : customNav
      ? [{ label: 'Navigation', items: customNav as SidebarItem[] }]
      : roleNavSections[resolvedRole] || roleNavSections.engineer

  // Check if base navigation already includes account or settings to prevent duplicate items
  const alreadyHasSettings = baseSections.some((s) =>
    s.items.some((item) =>
      item.label.toLowerCase().includes('settings') ||
      item.label.toLowerCase().includes('users') ||
      item.label.toLowerCase().includes('roles') ||
      item.href === '/settings'
    )
  )

  // Every role gets its own account settings — a signed-in user should never
  // have to guess where their profile and password live.
  const sections: { label: string; items: SidebarItem[] }[] = navSkeleton
    ? []
    : [
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

  // Computed once across every item so exactly one sidebar entry lights up —
  // never a parent route alongside its more specific child.
  const activeHref = activeHrefFor(
    sections.flatMap((s) => s.items.map((i) => i.href).filter((h): h is string => !!h)),
    pathname,
    currentTab
  )

  /*
    The phone's tabs: the first four destinations of the role's leading section,
    which is the work that role came to do. Taken from the same menu the
    sidebar renders, so a role's navigation is never defined twice.
  */
  const tabItems: TabBarItem[] = sections
    .flatMap((section) => section.items)
    .filter((item): item is SidebarItem & { href: string } => Boolean(item.href))
    .slice(0, 4)
    .map((item) => ({
      href: item.href,
      label: item.label.replace(/^(All|My) /, ''),
      icon: item.icon,
      badge: navBadges?.[item.href],
    }))
  const activeIsTab = tabItems.some((t) => t.href === activeHref)

  const trimmedQuery = query.trim()
  const searchTerm = trimmedQuery.toLowerCase()
  const visibleSections = searchTerm
    ? sections
        .map((s) => ({
          label: s.label,
          items: s.items.filter((i) => i.label.toLowerCase().includes(searchTerm)),
        }))
        .filter((s) => s.items.length > 0)
    : sections

  /*
    Searching the menu always shows labels — a filtered list of anonymous icons
    answers nothing. Otherwise the person's own choice stands.
  */
  const open = !collapsed || searchTerm.length > 0

  const renderInner = (open: boolean, onNavigate?: () => void, onToggle?: () => void) => {
    const isEngineer = resolvedRole === 'engineer'
    const createItem = isEngineer
      ? { href: '/request', label: 'New Request', icon: <FilePlus2 size={20} /> }
      : { href: '/', label: 'Home', icon: <ArrowLeft size={20} /> }

    return (
      <div className="flex h-full flex-col gap-3 p-4">
        {/*
          Who is signed in, and the one control that opens and closes the
          sidebar. Identity is a link to Settings — the obvious destination when
          you tap your own name — rather than the hidden pin toggle it was.
        */}
        {/*
          Open, identity and the toggle share a row. On the rail there is only
          room for one 44px square per line, so they stack — otherwise the
          toggle falls outside the panel and `overflow-hidden` eats the one
          control that brings the sidebar back.
        */}
        <div className={cn('flex shrink-0 gap-2', open ? 'items-center' : 'flex-col items-center')}>
          <Link
            href="/settings"
            onClick={onNavigate}
            title={open ? undefined : `${user?.name || user?.email || 'Account'} · ${roleLabel(resolvedRole)}`}
            className="group/id flex h-11 min-w-0 flex-1 items-center gap-3 rounded-xl text-left press-active"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {userInitials}
            </span>
            {open && (
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-medium leading-tight text-foreground">
                  {user?.name || user?.email || 'ProcureFlow'}
                </span>
                <span className="truncate text-[13px] leading-tight text-muted-foreground">
                  {roleLabel(resolvedRole)}
                </span>
              </span>
            )}
          </Link>

          {/* Hidden on touch: the drawer has no rail to collapse to. */}
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              aria-pressed={!open}
              aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
              title={`${open ? 'Collapse' : 'Expand'} sidebar  ⌘\\`}
              className="hidden h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground press-active pointer-fine:md:grid"
            >
              {open ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
          )}
        </div>

        {open ? (
          <div className="relative flex h-11 shrink-0 items-center rounded-xl border border-border bg-background/60 focus-within:border-ring">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search menu"
              placeholder="Search menu"
              className="h-full w-full rounded-[inherit] bg-transparent pl-3.5 pr-10 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear menu search"
                className="absolute right-1.5 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={15} />
              </button>
            ) : (
              <Search size={17} aria-hidden className="pointer-events-none absolute right-3 text-muted-foreground" />
            )}
          </div>
        ) : (
          /* Collapsed: searching needs the labels, so this opens the panel and
             puts the cursor in the field in one move. */
          <button
            type="button"
            onClick={() => {
              onToggle?.()
              requestAnimationFrame(() => searchRef.current?.focus())
            }}
            aria-label="Search menu"
            title="Search menu"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground press-active"
          >
            <Search size={17} />
          </button>
        )}

        <nav
          className="-mx-1 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1"
          aria-label="Main navigation"
        >
          {navSkeleton && (
            <div className="space-y-6" aria-hidden>
              {[4, 3].map((count, gi) => (
                <div key={gi}>
                  <div className="mb-2 ml-3 h-2 w-16 animate-pulse rounded bg-muted" />
                  <div className="space-y-1.5">
                    {Array.from({ length: count }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl px-1 py-2">
                        <div className="h-[18px] w-[18px] shrink-0 animate-pulse rounded bg-muted" />
                        {open && <div className="h-3 flex-1 animate-pulse rounded bg-muted" />}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!navSkeleton &&
            visibleSections.map((section, si) => (
              <div key={si}>
                {open ? (
                  <p className="whitespace-nowrap px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {section.label}
                  </p>
                ) : (
                  // Collapsed, the group's name cannot be shown — but the
                  // grouping still can, so the rail keeps its rhythm instead of
                  // becoming one undifferentiated column of glyphs.
                  si > 0 && <div aria-hidden className="mx-3 my-2 border-t border-border/70" />
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const href = item.href
                    const isActive = item.active ?? (href ? href === activeHref : false)
                    const badgeCount = href ? navBadges?.[href] : undefined
                    const disabledReason = href ? disabledNav?.[href] : undefined

                    // The selected row's tint. One element, sized to the row,
                    // so there is no geometry to re-aim when the width changes.
                    const pill = isActive ? (
                      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-xl bg-primary/10" />
                    ) : null

                    const body = (
                      <>
                        <span className="relative z-10 grid w-11 shrink-0 place-items-center">
                          {item.icon}
                        </span>
                        {open && (
                          <span className="relative z-10 min-w-0 flex-1 truncate whitespace-nowrap">
                            {item.label}
                          </span>
                        )}
                        {badgeCount !== undefined && badgeCount > 0 && (
                          <span
                            className={cn(
                              'absolute z-10 grid place-items-center rounded-full bg-primary font-semibold text-primary-foreground',
                              open
                                ? 'right-2.5 h-[20px] min-w-[20px] px-1.5 text-[11px]'
                                : 'right-1.5 top-1.5 h-[16px] min-w-[16px] px-1 text-[10px]'
                            )}
                          >
                            {badgeCount > 99 ? '99+' : badgeCount}
                          </span>
                        )}
                        {disabledReason && (
                          <Lock size={14} className="relative z-10 shrink-0 text-muted-foreground" />
                        )}
                      </>
                    )

                    // 44px: Apple's minimum target, and short enough that a
                    // ten-item menu no longer needs scrolling to see it all.
                    const rowClass = cn(
                      'relative flex h-11 w-full items-center gap-3 rounded-xl text-left text-[15px] transition-colors duration-150',
                      disabledReason ? 'cursor-not-allowed opacity-50' : 'press-active',
                      isActive
                        ? 'font-semibold text-primary'
                        : 'font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    )
                    // On the rail the label is gone, so the icon carries a
                    // tooltip and an accessible name of its own.
                    const railLabel = open ? undefined : item.label

                    if (item.onClick) {
                      const handleClick = item.onClick
                      return (
                        <button
                          key={item.label}
                          onClick={() => {
                            handleClick()
                            onNavigate?.()
                          }}
                          title={railLabel}
                          aria-label={railLabel}
                          className={rowClass}
                        >
                          {pill}
                          {body}
                        </button>
                      )
                    }

                    if (disabledReason) {
                      return (
                        <span
                          key={href}
                          title={open ? disabledReason : `${item.label} — ${disabledReason}`}
                          aria-disabled="true"
                          aria-label={railLabel}
                          className={rowClass}
                        >
                          {pill}
                          {body}
                        </span>
                      )
                    }

                    if (!href) return null

                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => {
                          onNavigate?.()
                        }}
                        title={railLabel}
                        aria-label={railLabel}
                        aria-current={isActive ? 'page' : undefined}
                        className={rowClass}
                      >
                        {pill}
                        {body}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          {!navSkeleton && visibleSections.length === 0 && (
            <p className="px-3 pt-4 text-xs text-muted-foreground">No matches</p>
          )}
        </nav>

        <div
          className={cn(
            // Height is auto and the children are in normal flow, so no button
            // can be pushed outside the box and clipped. At rail width one
            // 44px square fits per line, so the four stack; open, they form a row.
            'flex shrink-0 flex-wrap gap-2 border-t border-border/60 pt-3',
            open ? 'w-full' : 'w-11'
          )}
        >
          <ThemeToggle className={actionBox} />
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            onClick={onNavigate}
            className={actionBox}
          >
            <Settings size={20} />
          </Link>
          <Link
            href={createItem.href}
            aria-label={createItem.label}
            title={createItem.label}
            onClick={onNavigate}
            className={actionBox}
          >
            {createItem.icon}
          </Link>
          <form action="/auth/signout" method="POST" className="contents">
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className={cn(
                actionBox,
                'transition-colors duration-200 hover:bg-destructive hover:text-destructive-foreground'
              )}
            >
              <LogOut size={20} />
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div
      // 56px of tab bar on touch; nothing to clear on a pointer device.
      style={{ '--pf-tabbar-h': tabItems.length > 0 ? '56px' : '0px' } as React.CSSProperties}
      className={cn(
        'min-h-screen bg-background transition-[grid-template-columns] duration-300 pointer-fine:md:grid',
        collapsed ? RAIL_PAD : OPEN_PAD
      )}
    >
      <div aria-hidden className="hidden pointer-fine:md:block" />

      {/*
        The hover rail is for pointing devices only.

        `pointer-fine` gates it on a mouse or trackpad, so a tablet never gets
        a panel that only opens on a hover it cannot perform. Touch devices —
        phones and tablets alike — get the Sheet drawer and its hamburger
        instead. Width alone could not make this call: an iPad Pro and a laptop
        are both 1024px, and only one of them can hover.
      */}
      <aside
        aria-label="Sidebar"
        className={cn(
          'fixed bottom-6 left-6 top-6 z-40 hidden flex-col overflow-hidden rounded-3xl pointer-fine:md:flex',
          // The material: a frosted panel the page scrolls beneath, lifted off
          // the background by layered shadow rather than a heavy border.
          'border border-border/60 bg-card/80 shadow-[0_4px_6px_rgba(0,0,0,0.02),0_12px_24px_rgba(0,0,0,0.04),0_24px_48px_rgba(0,0,0,0.06)] backdrop-blur-2xl backdrop-saturate-150',
          'transition-[width] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]',
          open ? 'w-[252px]' : 'w-[76px]'
        )}
      >
        {renderInner(open, afterNavigate, toggleCollapsed)}
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        {/* Keyboard users land here first and can jump the whole menu. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md backdrop-saturate-150 sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            {/* 44×44, the HIG minimum — it was 36 and sat under the thumb's
                accuracy on a phone. */}
            <SheetTrigger
              aria-label="Open navigation"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground press-active pointer-fine:md:hidden"
            >
              <Menu size={20} />
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[min(86vw,320px)] border-r border-border bg-card p-0"
              style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              <SheetTitle className="sr-only">Dashboard Navigation</SheetTitle>
              {renderInner(true, () => {
                setMobileOpen(false)
                setQuery('')
              })}
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">
              {headerTitle}
            </h1>
            {headerSubtitle && (
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{headerSubtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />

            {role && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${roleDefinition(role)?.accent ?? 'bg-muted text-muted-foreground'}`}
              >
                <span className="h-1 w-1 rounded-full bg-current" />
                {roleLabel(role)}
              </span>
            )}
          </div>
        </header>

        {/*
          `--pf-tabbar-h` is published here so a page with its own bottom-pinned
          action bar can sit above the tab bar instead of underneath it.
        */}
        <main
          id="main"
          className="flex-1 overflow-y-auto pb-[calc(var(--pf-tabbar-h)+env(safe-area-inset-bottom,0px))] pointer-fine:md:pb-0"
        >
          {children}
        </main>

        <MobileTabBar
          items={tabItems}
          activeHref={activeHref}
          moreActive={!activeIsTab}
          onMore={() => setMobileOpen(true)}
        />
      </div>
    </div>
  )
}
