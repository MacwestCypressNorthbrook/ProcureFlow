'use client'

import { useSyncExternalStore, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import ThemeToggle from '@/components/layout/ThemeToggle'
import NotificationBell from '@/components/layout/NotificationBell'
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
  ChevronDown,
  ClipboardList,
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
      // by Reviewed, which is requisition-centric, filterable and exportable.
      // A PO deep-linked from a notification still opens at /sam/:id.
      items: [
        { href: '/sam/requests', label: 'Awaiting Review', icon: <ClipboardCheck size={18} /> },
        { href: '/sam/reviewed', label: 'Reviewed', icon: <ClipboardList size={18} /> },
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
        { href: '/admin/requests', label: 'Requisitions', icon: <FileText size={18} /> },
        { href: '/admin/reviewed', label: 'Reviewed', icon: <ClipboardList size={18} /> },
        { href: '/admin?tab=pos', label: 'Purchase Orders', icon: <FileCheck2 size={18} /> },
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

/** Collapsed 84px rail and pinned 264px panel sit 24px from the edge. */
// Only reserved on pointer devices, where the rail is actually rendered; on a
// touch device the drawer floats over the content and reserves nothing.
const RAIL_PAD = 'pointer-fine:md:grid-cols-[116px_minmax(0,1fr)]'
const PINNED_PAD = 'pointer-fine:md:grid-cols-[300px_minmax(0,1fr)]'

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

const PIN_KEY = 'pf-sidebar-pinned'

function subscribePinned(callback: () => void) {
  window.addEventListener('pf-sidebar-pin', callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener('pf-sidebar-pin', callback)
    window.removeEventListener('storage', callback)
  }
}

function readPinned() {
  try {
    return localStorage.getItem(PIN_KEY) === '1'
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
  /**
   * Hold the rail closed after a navigation, until the pointer actually leaves.
   *
   * Two things conspired to keep it open after a click. The clicked link keeps
   * DOM focus, so `focus-within:w-[264px]` held the panel open indefinitely —
   * until you clicked somewhere else entirely. And the pointer is normally
   * still over the sidebar at that moment, so `hover:w-[264px]` held it open
   * too. Neither can be cleared by React state alone, because both are CSS
   * pseudo-classes; the fix is to blur the link and then stop matching those
   * variants at all until the pointer genuinely leaves.
   */
  const [suppressHover, setSuppressHover] = useState(false)
  const pinned = useSyncExternalStore(subscribePinned, readPinned, () => false)
  const routeMeta = titleForPath(pathname)
  const headerTitle = title ?? routeMeta.title
  const headerSubtitle = subtitle ?? routeMeta.subtitle
  // The server resolves both of these from the session on every request, so
  // they are authoritative props — mirroring them into state only cost a render.
  const role = serverRole ?? null
  const user = serverUser ?? null

  /**
   * What a sidebar item does after it has done its navigating.
   *
   * A pinned sidebar stays open: pinning is an explicit request to keep it
   * that way, and collapsing it would quietly override the user. Everything
   * else collapses back to the rail so the page they just asked for is not
   * sitting behind a 264px panel.
   */
  const closeAfterNavigate = () => {
    setQuery('')
    if (pinned) return
    // Drop focus off the clicked link, or `focus-within` re-opens the panel
    // the moment the pointer leaves.
    if (typeof document !== 'undefined') {
      const active = document.activeElement
      if (active instanceof HTMLElement) active.blur()
    }
    setSuppressHover(true)
  }

  const togglePin = () => {
    try {
      localStorage.setItem(PIN_KEY, pinned ? '0' : '1')
    } catch {}
    window.dispatchEvent(new Event('pf-sidebar-pin'))
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

  const forceOpen = pinned || searchTerm.length > 0

  const renderInner = (open: boolean, onNavigate?: () => void) => {
    const reveal = (visible: boolean) =>
      visible
        ? 'opacity-100'
        : 'opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100'

    const isEngineer = resolvedRole === 'engineer'
    const createItem = isEngineer
      ? { href: '/request', label: 'New Request', icon: <FilePlus2 size={20} /> }
      : { href: '/', label: 'Home', icon: <ArrowLeft size={20} /> }

    return (
      <div className="flex h-full flex-col gap-4 p-5">
        <button
          type="button"
          onClick={togglePin}
          aria-pressed={pinned}
          title={pinned ? 'Unpin sidebar' : 'Keep sidebar open'}
          className="relative flex h-11 w-full shrink-0 items-center gap-4 rounded-xl text-left press-active"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {userInitials}
          </span>
          <span className={cn('flex min-w-0 flex-1 flex-col', reveal(open))}>
            <span className="truncate text-[15px] font-medium text-foreground">
              {user?.name || user?.email || 'ProcureFlow'}
            </span>
            <span className="truncate text-[13px] text-muted-foreground">{roleLabel(resolvedRole)}</span>
          </span>
          <ChevronDown
            size={18}
            className={cn(
              'shrink-0 text-muted-foreground transition-all duration-300',
              reveal(open),
              pinned && 'rotate-180'
            )}
          />
        </button>

        <div
          className={cn(
            'relative flex h-11 shrink-0 items-center rounded-[10px] border border-border transition-all duration-300',
            open ? 'w-full' : 'w-11 group-hover:w-full group-focus-within:w-full'
          )}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search menu"
            placeholder="Search menu"
            className={cn(
              'absolute inset-0 h-full w-full rounded-[inherit] bg-transparent pl-3.5 pr-11 text-sm text-foreground outline-none placeholder:text-muted-foreground',
              reveal(open)
            )}
          />
          <Search size={18} className="pointer-events-none absolute right-[11px] top-[13px] text-muted-foreground" />
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="Main navigation">
          {navSkeleton && (
            <div className="space-y-6" aria-hidden>
              {[4, 3].map((count, gi) => (
                <div key={gi}>
                  <div className="mb-2 ml-3 h-2 w-16 animate-pulse rounded bg-muted" />
                  <div className="space-y-1.5">
                    {Array.from({ length: count }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl px-1 py-2">
                        <div className="h-[18px] w-[18px] shrink-0 animate-pulse rounded bg-muted" />
                        <div className={cn('h-3 flex-1 animate-pulse rounded bg-muted', reveal(open))} />
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
                <p
                  className={cn(
                    'whitespace-nowrap px-1 pb-1 pt-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70',
                    reveal(open)
                  )}
                >
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const href = item.href
                    const isActive = item.active ?? (href ? href === activeHref : false)
                    const badgeCount = href ? navBadges?.[href] : undefined
                    const disabledReason = href ? disabledNav?.[href] : undefined

                    const pill = isActive ? (
                      <span
                        aria-hidden
                        className={cn(
                          'pointer-events-none absolute rounded-xl bg-primary/10 transition-all duration-300',
                          open
                            ? 'left-0 top-0 h-14 w-full'
                            : 'left-0 top-[6px] h-11 w-11 group-hover:top-0 group-hover:h-14 group-hover:w-full'
                        )}
                      />
                    ) : null

                    const body = (
                      <>
                        <span
                          className={cn(
                            'relative z-10 flex w-11 shrink-0 justify-center transition-transform duration-200',
                            isActive ? 'scale-110' : 'group-hover/item:scale-105'
                          )}
                        >
                          {item.icon}
                        </span>
                        <span className={cn('relative z-10 flex-1 whitespace-nowrap', reveal(open))}>
                          {item.label}
                        </span>
                        {badgeCount !== undefined && badgeCount > 0 && (
                          <span
                            className={cn(
                              'absolute z-10 grid h-[22px] min-w-[22px] place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground transition-all duration-200',
                              open
                                ? 'right-2 top-[17px]'
                                : 'right-1.5 top-1.5 group-hover:right-2 group-hover:top-[17px]'
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

                    const rowClass = cn(
                      'group/item relative flex h-14 w-full items-center gap-4 rounded-xl text-left text-[15px] font-medium',
                      disabledReason ? 'cursor-not-allowed opacity-50' : 'press-active',
                      isActive
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-primary'
                    )

                    if (item.onClick) {
                      const handleClick = item.onClick
                      return (
                        <button
                          key={item.label}
                          onClick={() => {
                            handleClick()
                            onNavigate?.()
                          }}
                          className={rowClass}
                        >
                          {pill}
                          {body}
                        </button>
                      )
                    }

                    if (disabledReason) {
                      return (
                        <span key={href} title={disabledReason} aria-disabled="true" className={rowClass}>
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
            <p className={cn('whitespace-nowrap px-1 pt-4 text-xs text-muted-foreground', reveal(open))}>
              No matches
            </p>
          )}
        </nav>

        <div
          className={cn(
            // Height is auto and the children are in normal flow, so no button
            // can be pushed outside the box and clipped. Only the width moves.
            'flex shrink-0 flex-wrap gap-2 transition-[width] duration-300',
            open ? 'w-full' : 'w-11 group-hover:w-full group-focus-within:w-full'
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
      className={cn(
        'min-h-screen bg-background transition-[grid-template-columns] duration-300 pointer-fine:md:grid',
        pinned ? PINNED_PAD : RAIL_PAD
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
        onMouseLeave={() => setSuppressHover(false)}
        className={cn(
          'fixed bottom-8 left-6 top-6 z-40 hidden flex-col overflow-hidden rounded-3xl border border-border/70 bg-card/90 shadow-xl backdrop-blur-xl transition-[width] duration-300 ease-out pointer-fine:md:flex',
          // Dropping `group` while suppressed stops every `group-hover:` child
          // utility matching too, so the labels, the pill and the action row
          // collapse with the width instead of lingering inside an 84px rail.
          !suppressHover && 'group',
          forceOpen
            ? 'w-[264px]'
            : suppressHover
              ? 'w-[84px]'
              : 'w-[84px] hover:w-[264px] focus-within:w-[264px]'
        )}
      >
        {renderInner(forceOpen, closeAfterNavigate)}
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-fine:md:hidden">
              <Menu size={18} />
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] border-r border-border bg-card p-0">
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

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
