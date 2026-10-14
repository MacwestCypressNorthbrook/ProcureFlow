'use client'

import Link from 'next/link'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TabBarItem {
  href: string
  label: string
  icon: React.ReactNode
  badge?: number
}

/**
 * The phone's primary navigation.
 *
 * A drawer made every single move on a phone cost two taps — open the menu,
 * then choose — and put the menu button at the top of the screen, the hardest
 * place to reach one-handed. The four destinations a role actually works in
 * live down here instead, inside the thumb's arc, exactly as iOS puts a tab
 * bar. "More" still opens the full menu for everything else.
 *
 * Four, not seven: a tab bar that scrolls or wraps stops being glanceable, so
 * the long tail belongs behind More.
 */
export default function MobileTabBar({
  items,
  activeHref,
  onMore,
  moreActive,
}: {
  items: TabBarItem[]
  activeHref: string | null
  onMore: () => void
  /** True when the open drawer is showing a destination that is not a tab. */
  moreActive?: boolean
}) {
  if (items.length === 0) return null

  return (
    <nav
      aria-label="Primary"
      className={cn(
        // Pinned to the edge, above the page but below sheets and modals.
        'fixed inset-x-0 bottom-0 z-30 pointer-fine:md:hidden',
        // The material: the page shows through, so scrolling content stays
        // legible under the bar rather than meeting a hard opaque strip.
        'border-t border-border/70 bg-background/80 backdrop-blur-xl backdrop-saturate-150'
      )}
      style={{
        // The home-indicator area on a notched phone. Content never sits in it;
        // the bar's own background extends through it so the blur reaches the edge.
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <ul className="flex items-stretch">
        {items.map((item) => {
          const isActive = item.href === activeHref && !moreActive
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                // 44pt minimum, and the whole column is the target — not just
                // the glyph — so a hurried thumb still lands on it.
                className={cn(
                  'flex h-[56px] flex-col items-center justify-center gap-0.5 px-1 transition-colors duration-200',
                  isActive ? 'text-primary' : 'text-muted-foreground active:text-foreground'
                )}
              >
                <span className="relative grid h-6 w-6 place-items-center">
                  {item.icon}
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -right-2 -top-1.5 grid h-[16px] min-w-[16px] place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </span>
                <span className="w-full truncate text-center text-[10px] font-medium leading-tight">
                  {item.label}
                </span>
              </Link>
            </li>
          )
        })}

        <li className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onMore}
            aria-label="More navigation"
            className={cn(
              'flex h-[56px] w-full flex-col items-center justify-center gap-0.5 px-1 transition-colors duration-200',
              moreActive ? 'text-primary' : 'text-muted-foreground active:text-foreground'
            )}
          >
            <span className="grid h-6 w-6 place-items-center">
              <MoreHorizontal size={20} />
            </span>
            <span className="text-[10px] font-medium leading-tight">More</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
