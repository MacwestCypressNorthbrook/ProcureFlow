import Link from 'next/link'

export interface StageTab {
  label: string
  href: string
  count?: number
  active?: boolean
}

/**
 * Queue / Reviewed, for a stage.
 *
 * Every reviewing role has exactly these two lists — what is waiting on them,
 * and what they have already decided — so they get the same control in the same
 * place rather than each dashboard inventing its own.
 */
export default function StageTabs({ tabs }: { tabs: StageTab[] }) {
  return (
    <nav
      className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1"
      aria-label="Stage views"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? 'page' : undefined}
          className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
            tab.active
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                tab.active ? 'bg-background/20' : 'bg-muted text-muted-foreground'
              }`}
            >
              {tab.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  )
}
