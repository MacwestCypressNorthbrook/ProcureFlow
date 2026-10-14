'use client'

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  LayoutGrid,
  Rows3,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'

/* ============================================================
   DataView — the shared list surface.

   Every list in the app runs through this: search, facet filters,
   column sorting, pagination and a table/grid toggle. Pages supply
   columns and a card renderer; the filtering machinery is identical
   everywhere so the behaviour never drifts between screens.
   ============================================================ */

export interface DataColumn<T> {
  id: string
  label: string
  align?: 'left' | 'right'
  /** Drop the column below this breakpoint to keep narrow screens readable. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
  sortable?: boolean
  /** Value used for sorting; defaults to no sorting for this column. */
  sortValue?: (row: T) => string | number | null | undefined
  cell: (row: T) => React.ReactNode
  headClassName?: string
}

export interface DataFacet<T> {
  id: string
  label: string
  options: Array<{ value: string; label: string }>
  matches: (row: T, value: string) => boolean
}

type ViewMode = 'table' | 'grid'
type SortDir = 'asc' | 'desc'

const HIDE: Record<string, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
}

const PAGE_SIZES = [10, 25, 50, 100]

/* ------------------------------------------------------------------
   View preferences live in an external store rather than component
   state. Reading localStorage during render would break hydration,
   and restoring it from an effect would cascade an extra render, so
   useSyncExternalStore reads it with an empty server snapshot instead.
   ------------------------------------------------------------------ */

interface Prefs {
  view?: ViewMode
  pageSize?: number
}

/**
 * What the viewer has narrowed the list to. Held for the browser tab's session
 * so that opening a record and coming back — by the back button or the page's
 * own "Back to …" link — lands on the same filtered, sorted page rather than
 * the full list.
 */
interface Session {
  term?: string
  facets?: Record<string, string>
  sort?: { id: string; dir: SortDir } | null
  page?: number
}

const cache = new Map<string, string>()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Cache key → storage slot. Keys without a storage slot live in memory only. */
function storageFor(key: string): { store: 'local' | 'session'; slot: string } | null {
  if (key.startsWith('prefs:') && key.length > 'prefs:'.length) {
    return { store: 'local', slot: `dataview:${key.slice('prefs:'.length)}` }
  }
  if (key.startsWith('session:') && key.length > 'session:'.length) {
    return { store: 'session', slot: `dataview:${key.slice('session:'.length)}` }
  }
  return null
}

function webStorage(store: 'local' | 'session'): Storage {
  return store === 'local' ? window.localStorage : window.sessionStorage
}

function readStored(key: string): string {
  if (!cache.has(key)) {
    let raw = ''
    const target = storageFor(key)
    if (target) {
      try {
        raw = webStorage(target.store).getItem(target.slot) ?? ''
      } catch {
        /* private mode or blocked storage: fall back to defaults */
      }
    }
    cache.set(key, raw)
  }
  return cache.get(key) ?? ''
}

function writeStored(key: string, value: object) {
  const raw = JSON.stringify(value)
  cache.set(key, raw)
  const target = storageFor(key)
  if (target) {
    try {
      webStorage(target.store).setItem(target.slot, raw)
    } catch {
      /* a convenience; ignore write failures */
    }
  }
  listeners.forEach((listener) => listener())
}

function parseStored<V>(raw: string): V {
  if (!raw) return {} as V
  try {
    return JSON.parse(raw) as V
  } catch {
    return {} as V
  }
}



const controlClass =
  'h-10 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

/**
 * Make a sort value comparable.
 *
 * Postgres timestamps arrive as `Date` objects, which fall through to the string
 * comparison below and sort by the weekday their `toString()` starts with —
 * "Fri" before "Mon" before "Sat". Dates become their epoch instead, and numeric
 * strings become numbers so "10" sorts after "9".
 */
function sortable(value: string | number | Date | null | undefined): string | number | null | undefined {
  if (value instanceof Date) return value.getTime()
  return value
}

/** A select that reads as a dropdown: the native arrow is suppressed, so draw one. */
function SelectShell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      {children}
      <ChevronDown
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export default function DataView<T>({
  rows,
  getRowId,
  columns,
  searchText,
  searchPlaceholder = 'Search…',
  facets = [],
  renderCard,
  onRowClick,
  defaultSort,
  defaultView = 'table',
  storageKey,
  initialPageSize = 25,
  emptyTitle = 'Nothing to show',
  emptyMessage = 'No records match your filters.',
  toolbarExtra,
  onVisibleRows,
  compact = false,
  initialTerm = '',
}: {
  rows: T[]
  getRowId: (row: T) => string
  columns: DataColumn<T>[]
  searchText?: (row: T) => Array<string | null | undefined>
  searchPlaceholder?: string
  facets?: DataFacet<T>[]
  renderCard?: (row: T) => React.ReactNode
  onRowClick?: (row: T) => void
  defaultSort?: { id: string; dir: SortDir }
  defaultView?: ViewMode
  /**
   * Persists the view mode and page size per list, per browser, and the
   * search, filters, sort and page per list for the tab's session.
   */
  storageKey?: string
  initialPageSize?: number
  emptyTitle?: string
  emptyMessage?: string
  /**
   * Extra toolbar content. Given a function, it receives the rows the viewer is
   * actually looking at — filtered, searched and sorted, across every page — so
   * an export can match the screen instead of dumping the raw list.
   */
  toolbarExtra?: React.ReactNode | ((visibleRows: T[]) => React.ReactNode)
  /** Told the rows the viewer is looking at, in order, whenever they change. */
  onVisibleRows?: (rows: T[]) => void
  /** Dashboard preview mode: no toolbar, no pagination, renders every row given. */
  compact?: boolean
  /** Pre-filled search, used to focus a record arrived at from a deep link. */
  initialTerm?: string
}) {
  const [showFilters, setShowFilters] = useState(false)

  const prefKey = `prefs:${storageKey ?? ''}`
  const prefsRaw = useSyncExternalStore(
    subscribe,
    () => readStored(prefKey),
    () => ''
  )
  const prefs = useMemo(() => parseStored<Prefs>(prefsRaw), [prefsRaw])

  // A deep link that pre-fills the search is focusing one record, so it must
  // not be overridden by — or overwrite — whatever the viewer had filtered to
  // last time; that instance keeps its filters in memory only.
  const instanceId = useId()
  const sessionKey = storageKey && !initialTerm ? `session:${storageKey}` : `memory:${instanceId}`
  const sessionRaw = useSyncExternalStore(
    subscribe,
    () => readStored(sessionKey),
    () => ''
  )
  const session = useMemo(() => parseStored<Session>(sessionRaw), [sessionRaw])
  const updateSession = (patch: Session) => writeStored(sessionKey, { ...session, ...patch })

  const term = session.term ?? initialTerm
  const page = session.page ?? 1
  const setPage = (next: number) => updateSession({ page: next })

  // Restored values are dropped when they no longer apply — a project that has
  // since left the list, or a column that is gone — so a stale filter can never
  // silently hide every row behind a select that reads "All".
  const facetValues = useMemo(() => {
    const out: Record<string, string> = {}
    for (const facet of facets) {
      const value = session.facets?.[facet.id]
      if (value && facet.options.some((o) => o.value === value)) out[facet.id] = value
    }
    return out
  }, [session.facets, facets])

  const storedSort = session.sort
  const sort =
    storedSort === undefined
      ? defaultSort ?? null
      : storedSort === null || columns.some((c) => c.id === storedSort.id && c.sortable && c.sortValue)
        ? storedSort
        : defaultSort ?? null
  const setSort = (next: { id: string; dir: SortDir } | null) => updateSession({ sort: next })

  const view: ViewMode = renderCard ? prefs.view ?? defaultView : 'table'
  const pageSize =
    prefs.pageSize && PAGE_SIZES.includes(prefs.pageSize) ? prefs.pageSize : initialPageSize

  const setView = (next: ViewMode) => writeStored(prefKey, { ...prefs, view: next })

  // Narrowing the result set must not strand the viewer past the end, so every
  // input that changes the result set returns to the first page with it.
  const setPageSize = (next: number) => {
    writeStored(prefKey, { ...prefs, pageSize: next })
    setPage(1)
  }
  const setTerm = (next: string) => updateSession({ term: next, page: 1 })
  const setFacetValues = (next: Record<string, string>) => updateSession({ facets: next, page: 1 })

  const sortableColumns = useMemo(
    () => columns.filter((c) => c.sortable && c.sortValue),
    [columns]
  )

  const activeFacetCount = Object.values(facetValues).filter(Boolean).length

  /* ── filter → search → sort ─────────────────────────────────────────── */
  const processed = useMemo(() => {
    let out = rows

    for (const facet of facets) {
      const value = facetValues[facet.id]
      if (value) out = out.filter((row) => facet.matches(row, value))
    }

    const q = term.trim().toLowerCase()
    if (q && searchText) {
      out = out.filter((row) =>
        searchText(row).some((field) => (field ?? '').toLowerCase().includes(q))
      )
    }

    if (sort) {
      const column = columns.find((c) => c.id === sort.id)
      if (column?.sortValue) {
        const factor = sort.dir === 'asc' ? 1 : -1
        out = [...out].sort((a, b) => {
          const av = sortable(column.sortValue!(a))
          const bv = sortable(column.sortValue!(b))
          // Nulls always sink, regardless of direction.
          if (av == null && bv == null) return 0
          if (av == null) return 1
          if (bv == null) return -1
          if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor
          return String(av).localeCompare(String(bv), undefined, { numeric: true }) * factor
        })
      }
    }

    return out
  }, [rows, facets, facetValues, term, searchText, sort, columns])

  /*
    Tell the caller what is on screen — but only when it actually changed.

    `processed` is rebuilt whenever its inputs change identity, and `columns`,
    `facets` and `searchText` are normally fresh arrays and closures on every
    render. So `processed` is a new array almost every render, while its
    CONTENTS are usually identical. A caller that holds those rows in state
    would then set state on every render, re-render, and set it again — an
    endless loop that pins the tab and leaves clicks unanswered.

    Comparing the row ids settles it: a caller hears about a real change and
    nothing else. The `rows` prop's own identity is part of the comparison, so
    fresh data from the server is still passed on even when the ids match.
  */
  const emitted = useRef<{ rows: T[]; ids: string } | null>(null)
  useEffect(() => {
    if (!onVisibleRows) return
    const ids = processed.map(getRowId).join('\u0000')
    if (emitted.current && emitted.current.rows === rows && emitted.current.ids === ids) return
    emitted.current = { rows, ids }
    onVisibleRows(processed)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass a fresh closure each render
  }, [processed, rows])

  const total = processed.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, pageCount)
  const start = (safePage - 1) * pageSize
  const pageRows = compact ? processed : processed.slice(start, start + pageSize)

  const toggleSort = (id: string) =>
    setSort(
      sort?.id === id
        ? { id, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
        : { id, dir: 'asc' }
    )

  const clearAll = () => updateSession({ term: '', facets: {}, page: 1 })

  const hasToolbar =
    !compact && (Boolean(searchText) || facets.length > 0 || Boolean(renderCard) || Boolean(toolbarExtra))

  return (
    <div className="space-y-3">
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      {hasToolbar && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            {searchText && (
              <div className="relative w-full lg:w-80">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className={`${controlClass} w-full pl-10 pr-9`}
                />
                {term && (
                  <button
                    type="button"
                    onClick={() => setTerm('')}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

            {facets.length > 0 && (
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
                className={`${controlClass} inline-flex shrink-0 items-center gap-1.5 font-medium lg:hidden`}
              >
                <SlidersHorizontal size={15} />
                Filters
                {activeFacetCount > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                    {activeFacetCount}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Facets: inline from lg, collapsed behind the Filters button below it */}
            <div className={`${showFilters ? 'flex' : 'hidden'} w-full flex-col gap-2 sm:flex-row lg:flex lg:w-auto`}>
              {facets.map((facet) => (
                <SelectShell key={facet.id} className="w-full lg:w-auto">
                  <select
                    value={facetValues[facet.id] ?? ''}
                    onChange={(e) => setFacetValues({ ...facetValues, [facet.id]: e.target.value })}
                    aria-label={facet.label}
                    className={`${controlClass} w-full appearance-none pr-9 font-medium`}
                  >
                    <option value="">{facet.label}: All</option>
                    {facet.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </SelectShell>
              ))}

              {/* Grid mode has no column headers to click, so sorting moves here. */}
              {view === 'grid' && sortableColumns.length > 0 && (
                <SelectShell className="w-full lg:w-auto">
                  <select
                    value={sort ? `${sort.id}:${sort.dir}` : ''}
                    onChange={(e) => {
                      const [id, dir] = e.target.value.split(':')
                      setSort(id ? { id, dir: dir as SortDir } : null)
                    }}
                    aria-label="Sort by"
                    className={`${controlClass} w-full appearance-none pr-9 font-medium`}
                  >
                    <option value="">Sort: Default</option>
                    {sortableColumns.map((c) => (
                      <optgroup key={c.id} label={c.label}>
                        <option value={`${c.id}:asc`}>{c.label} ↑</option>
                        <option value={`${c.id}:desc`}>{c.label} ↓</option>
                      </optgroup>
                    ))}
                  </select>
                </SelectShell>
              )}

              {(term || activeFacetCount > 0) && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>

            {typeof toolbarExtra === 'function' ? toolbarExtra(processed) : toolbarExtra}

            {renderCard && (
              <div className="inline-flex shrink-0 rounded-lg border border-input bg-card p-0.5" role="group" aria-label="View mode">
                <button
                  type="button"
                  onClick={() => setView('table')}
                  aria-pressed={view === 'table'}
                  title="Table view"
                  className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
                    view === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Rows3 size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setView('grid')}
                  aria-pressed={view === 'grid'}
                  title="Grid view"
                  className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
                    view === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <LayoutGrid size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────── */}
      {total === 0 ? (
        <div className="surface rounded-xl px-6 py-16 text-center">
          <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length > 0 ? 'No records match your filters.' : emptyMessage}
          </p>
          {rows.length > 0 && (term || activeFacetCount > 0) && (
            <button
              type="button"
              onClick={clearAll}
              className="mt-4 text-sm font-medium text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : view === 'grid' && renderCard ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pageRows.map((row) => (
            <div
              key={getRowId(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'cursor-pointer' : undefined}
            >
              {renderCard(row)}
            </div>
          ))}
        </div>
      ) : (
        <div className="surface overflow-hidden rounded-xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {columns.map((c) => {
                    const isSorted = sort?.id === c.id
                    const canSort = c.sortable && c.sortValue
                    return (
                      <th
                        key={c.id}
                        scope="col"
                        aria-sort={isSorted ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                        className={`h-10 border-r border-border/70 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground last:border-r-0 ${
                          c.align === 'right' ? 'text-right' : 'text-left'
                        } ${c.hideBelow ? HIDE[c.hideBelow] : ''} ${c.headClassName ?? ''}`}
                      >
                        {canSort ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.id)}
                            className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
                              c.align === 'right' ? 'flex-row-reverse' : ''
                            } ${isSorted ? 'text-foreground' : ''}`}
                          >
                            {c.label}
                            {isSorted ? (
                              sort!.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                            ) : (
                              <ChevronsUpDown size={12} className="opacity-40" />
                            )}
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={getRowId(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={`group border-b border-border last:border-0 transition-colors ${
                      onRowClick ? 'cursor-pointer hover:bg-muted/40' : ''
                    }`}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.id}
                        className={`border-r border-border/50 px-3 py-3 text-sm last:border-r-0 ${
                          c.align === 'right' ? 'text-right' : ''
                        } ${c.hideBelow ? HIDE[c.hideBelow] : ''}`}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Pagination ──────────────────────────────────────────────── */}
      {!compact && total > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-medium tabular-nums text-foreground">{start + 1}</span>–
            <span className="font-medium tabular-nums text-foreground">{Math.min(start + pageSize, total)}</span> of{' '}
            <span className="font-medium tabular-nums text-foreground">{total}</span>
          </p>

          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Rows per page"
              className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size} / page</option>
              ))}
            </select>

            {pageCount > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, safePage - 1))}
                  disabled={safePage === 1}
                  aria-label="Previous page"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-card text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>

                {pageNumbers(safePage, pageCount).map((p, i) =>
                  p === '…' ? (
                    <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p as number)}
                      aria-current={p === safePage ? 'page' : undefined}
                      className={`h-9 min-w-9 rounded-lg px-2 text-xs font-medium tabular-nums transition-colors ${
                        p === safePage
                          ? 'bg-primary text-primary-foreground'
                          : 'border border-input bg-card text-foreground hover:bg-muted'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() => setPage(Math.min(pageCount, safePage + 1))}
                  disabled={safePage === pageCount}
                  aria-label="Next page"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-card text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Compact page list: always the first and last page, with a window around the current one. */
function pageNumbers(current: number, count: number): Array<number | '…'> {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const out: Array<number | '…'> = [1]
  const from = Math.max(2, current - 1)
  const to = Math.min(count - 1, current + 1)
  if (from > 2) out.push('…')
  for (let p = from; p <= to; p++) out.push(p)
  if (to < count - 1) out.push('…')
  out.push(count)
  return out
}
