'use client'

import DataView, { type DataColumn, type DataFacet } from '@/components/shared/DataView'
import Link from 'next/link'
import { formatDate, formatDateShort } from '@/lib/utils'
import { statMoney } from '@/components/shared/stat-presets'
import { Mail, Phone } from 'lucide-react'

export interface SupplierRow {
  id: string
  name: string
  category: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  is_active: boolean
  created_at: string
  /** How many requisition lines have been placed against this supplier. */
  usage_count: number
  /** Value of the live requisition lines naming this supplier. */
  requisitioned?: number
}

/**
 * The supplier directory, read-only.
 *
 * Supply Chain picks suppliers while pricing a requisition and needs their
 * contact details to do it, but suppliers are reference data the Administrator
 * maintains (`admin:suppliers`) — so nothing here edits. A supplier that does
 * not exist yet is still added inline from the requisition form's picker.
 */
export default function SupplierDirectory({ suppliers }: { suppliers: SupplierRow[] }) {
  const columns: DataColumn<SupplierRow>[] = [
    {
      id: 'name',
      label: 'Supplier',
      sortable: true,
      sortValue: (s) => s.name,
      cell: (s) => (
        <div className="min-w-0 max-w-[220px]">
          <Link
            href={`/mintah/suppliers/${s.id}`}
            className="block truncate text-sm font-medium text-foreground outline-none hover:underline focus-visible:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {s.name}
          </Link>
          {s.contact_name && <p className="truncate text-xs text-muted-foreground">{s.contact_name}</p>}
        </div>
      ),
    },
    {
      id: 'category',
      label: 'Category',
      hideBelow: 'sm',
      sortable: true,
      sortValue: (s) => s.category ?? '',
      cell: (s) =>
        s.category ? (
          <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {s.category}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: 'contact',
      label: 'Contact',
      hideBelow: 'md',
      cell: (s) => (
        <div className="min-w-0 max-w-[190px] space-y-0.5">
          {s.phone && (
            <p className="flex items-center gap-1.5 truncate text-xs text-foreground">
              <Phone size={11} className="shrink-0 text-muted-foreground" />
              {s.phone}
            </p>
          )}
          {s.email && (
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Mail size={11} className="shrink-0" />
              {s.email}
            </p>
          )}
          {!s.phone && !s.email && <span className="text-xs text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      id: 'usage_count',
      label: 'Lines supplied',
      align: 'right',
      hideBelow: 'lg',
      sortable: true,
      sortValue: (s) => s.usage_count,
      cell: (s) => <span className="tabular-nums text-sm text-foreground">{s.usage_count}</span>,
    },
    {
      id: 'requisitioned',
      label: 'Requisitioned',
      align: 'right',
      hideBelow: 'lg',
      sortable: true,
      sortValue: (s) => s.requisitioned ?? 0,
      cell: (s) =>
        s.requisitioned ? (
          <span className="tabular-nums text-sm text-foreground">{statMoney(s.requisitioned)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: 'created_at',
      label: 'Added',
      hideBelow: 'sm',
      sortable: true,
      sortValue: (s) => s.created_at,
      cell: (s) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground" title={formatDate(s.created_at)}>
          {formatDateShort(s.created_at)}
        </span>
      ),
    },
    {
      id: 'is_active',
      label: 'Status',
      sortable: true,
      sortValue: (s) => (s.is_active ? 1 : 0),
      cell: (s) =>
        s.is_active ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Inactive
          </span>
        ),
    },
  ]

  const categories = Array.from(new Set(suppliers.map((s) => s.category).filter(Boolean))).sort() as string[]
  const facets: DataFacet<SupplierRow>[] = [
    {
      id: 'status',
      label: 'Status',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ],
      matches: (s, value) => (value === 'active' ? s.is_active : !s.is_active),
    },
    ...(categories.length > 1
      ? [
          {
            id: 'category',
            label: 'Category',
            options: categories.map((c) => ({ value: c, label: c })),
            matches: (s, value) => s.category === value,
          } satisfies DataFacet<SupplierRow>,
        ]
      : []),
  ]

  return (
    <DataView
      rows={suppliers}
      getRowId={(s) => s.id}
      columns={columns}
      facets={facets}
      searchPlaceholder="Search suppliers…"
      searchText={(s) => [s.name, s.category, s.contact_name, s.phone, s.email, s.address]}
      // A directory is looked up by name, not scanned by date — so this one
      // list stays alphabetical while the chronological tables lead with newest.
      defaultSort={{ id: 'name', dir: 'asc' }}
      storageKey="supply-chain-suppliers"
      emptyTitle="No suppliers yet"
      emptyMessage="Suppliers appear here once an Administrator adds them, or once one is created from a requisition."
    />
  )
}
