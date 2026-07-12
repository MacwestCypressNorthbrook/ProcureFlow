import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
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

export const ROLE_LABELS: Record<string, string> = {
  superuser: 'Superuser',
  minta: 'Minta (Requester)',
  mintah: 'Mintah (Procurement)',
  sam: 'Sam (Approver)',
  finance: 'Finance',
  admin: 'Admin',
  lead: 'Lead',
  employee: 'Employee',
}

export const ROLE_COLORS: Record<string, string> = {
  superuser: 'bg-purple-100 text-purple-800 border-purple-200',
  minta: 'bg-blue-100 text-blue-800 border-blue-200',
  mintah: 'bg-amber-100 text-amber-800 border-amber-200',
  sam: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  finance: 'bg-rose-100 text-rose-800 border-rose-200',
  admin: 'bg-slate-100 text-slate-800 border-slate-200',
  lead: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  employee: 'bg-gray-100 text-gray-800 border-gray-200',
}

export const PO_STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending_sam: {
    label: 'Awaiting Sam',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  pending_payment: {
    label: 'Awaiting Payment',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
  revision_required: {
    label: 'Revision Required',
    color: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-500',
  },
  completed: {
    label: 'Completed',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-gray-50 text-gray-500 border-gray-200',
    dot: 'bg-gray-400',
  },
}

export const REQUEST_STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  new: {
    label: 'New',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
  reviewing: {
    label: 'Reviewing',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  converted: {
    label: 'Converted to PO',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  rejected: {
    label: 'Rejected',
    color: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-500',
  },
  archived: {
    label: 'Archived',
    color: 'bg-gray-50 text-gray-500 border-gray-200',
    dot: 'bg-gray-400',
  },
}
