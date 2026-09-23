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

export function formatDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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
    label: 'Awaiting PO document',
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
