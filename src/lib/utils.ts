import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { ROLES, roleLabel, roleDefinition } from '@/lib/roles'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return '—'
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
  }).format(amount)
}

/**
 * A count, not money: "45", "50.6", "5,000" — never "45.000".
 *
 * Postgres returns NUMERIC quantities as fixed-scale strings ("45.000"), which
 * read as currency when printed raw. Only the decimals a quantity actually has
 * are shown, up to the column's three.
 */
export function formatQuantity(quantity: number | string | null | undefined): string {
  if (quantity === null || quantity === undefined || quantity === '') return '—'
  const n = Number(quantity)
  if (!Number.isFinite(n)) return String(quantity)
  return new Intl.NumberFormat('en-GH', { maximumFractionDigits: 3 }).format(n)
}

/** "27 Sept 2026" — the dense-table form of {@link formatDate}, same fixed zone. */
export function formatDateShort(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Accra',
  })
}

/**
 * Always rendered in Accra, where the business operates.
 *
 * Without a fixed zone this formats in the server's zone during SSR and the
 * viewer's zone after hydration, so the two disagree — and a requisition raised
 * late in the day shows a different date depending on where it is read.
 */
export function formatDate(date: string | Date | null): string {
  if (!date) return '—'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Accra',
  })
}

/**
 * Role labels and colours, derived from `lib/roles.ts`.
 *
 * Kept as lookup maps for existing call sites, but they are built from the
 * canonical definitions plus their legacy aliases so nothing can drift. Prefer
 * `roleLabel()` / `roleDefinition()` from `lib/roles` in new code.
 */
const LEGACY_ROLE_KEYS = [
  'minta',
  'mintah',
  'sam',
  'admin',
  'superuser',
  'adminstrator',
  'lead',
  'employee',
]

export const ROLE_LABELS: Record<string, string> = Object.fromEntries([
  ...Object.values(ROLES).map((r) => [r.id, r.label]),
  ...LEGACY_ROLE_KEYS.map((key) => [key, roleLabel(key)]),
])

export const ROLE_COLORS: Record<string, string> = Object.fromEntries([
  ...Object.values(ROLES).map((r) => [r.id, r.accent]),
  ...LEGACY_ROLE_KEYS.map((key) => [key, roleDefinition(key)?.accent ?? 'bg-muted text-muted-foreground']),
])

export const PO_STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  draft: {
    label: 'Draft',
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  },
  pending_cost_control: {
    label: 'With Cost Control',
    color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    dot: 'bg-cyan-500',
  },
  pending_finance: {
    label: 'Awaiting Payment',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
  partially_paid: {
    label: 'Part-paid',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  sent_back: {
    label: 'Sent Back',
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
  },
  paid: {
    label: 'Paid',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  rejected: {
    label: 'Rejected',
    color: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-500',
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  },
}

export const REQUEST_STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  draft: {
    label: 'Draft',
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  },
  pending_lead: {
    label: 'With Project Lead',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dot: 'bg-indigo-500',
  },
  pending_supply_chain: {
    label: 'With Supply Chain',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  pending_admin: {
    // Administration is the closing stage now: this is the last thing that
    // happens to a requisition before it is completed.
    label: 'Final authorization',
    color: 'bg-violet-50 text-violet-700 border-violet-200',
    dot: 'bg-violet-500',
  },
  pending_cost_control: {
    label: 'With Cost Control',
    color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    dot: 'bg-cyan-500',
  },
  pending_finance: {
    label: 'With Finance',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
  sent_back: {
    label: 'Sent Back',
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
  },
  completed: {
    label: 'Completed',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  rejected: {
    label: 'Rejected',
    color: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-500',
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  },
}
