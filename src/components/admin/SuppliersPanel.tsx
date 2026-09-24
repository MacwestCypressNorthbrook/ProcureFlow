'use client'

import { useState } from 'react'
import type { Supplier } from '@/lib/types'
import { AdminButton, AdminError, AdminField, AdminModal, ConfirmPanel, adminInputClass } from './admin-ui'
import DataView, { type DataColumn, type DataFacet } from '@/components/shared/DataView'
import { Mail, Phone, Plus } from 'lucide-react'
import ExportButton from './ExportButton'
import { formatDate as csvDate, type CsvColumn } from '@/lib/csv'

export type SupplierRow = Supplier & { usage_count?: number }

type Draft = {
  name: string
  category: string
  contact_name: string
  phone: string
  email: string
  address: string
  tin: string
  notes: string
  is_active: boolean
}

const emptyDraft = (): Draft => ({
  name: '',
  category: '',
  contact_name: '',
  phone: '',
  email: '',
  address: '',
  tin: '',
  notes: '',
  is_active: true,
})

const toDraft = (s: SupplierRow): Draft => ({
  name: s.name,
  category: s.category ?? '',
  contact_name: s.contact_name ?? '',
  phone: s.phone ?? '',
  email: s.email ?? '',
  address: s.address ?? '',
  tin: s.tin ?? '',
  notes: s.notes ?? '',
  is_active: s.is_active,
})

export default function SuppliersPanel({
  suppliers,
  onChanged,
  notify,
}: {
  suppliers: SupplierRow[]
  onChanged: () => void
  notify: (msg: string, ok: boolean) => void
}) {
  const [editing, setEditing] = useState<SupplierRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const openCreate = () => {
    setDraft(emptyDraft())
    setError(null)
    setConfirmingDelete(false)
    setCreating(true)
  }

  const openEdit = (s: SupplierRow) => {
    setDraft(toDraft(s))
    setError(null)
    setConfirmingDelete(false)
    setEditing(s)
  }

  const close = () => {
    setCreating(false)
    setEditing(null)
    setConfirmingDelete(false)
    setError(null)
  }

  const save = async () => {
    if (!draft.name.trim()) {
      setError('A supplier name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(editing ? `/api/admin/suppliers/${editing.id}` : '/api/admin/suppliers', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'Could not save the supplier.')
        return
      }
      notify(editing ? 'Supplier updated' : 'Supplier added', true)
      close()
      onChanged()
    } catch {
      setError('Network error — nothing was saved.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!editing) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/suppliers/${editing.id}`, { method: 'DELETE' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'Could not delete the supplier.')
        setConfirmingDelete(false)
        return
      }
      notify('Supplier deleted', true)
      close()
      onChanged()
    } catch {
      setError('Network error — the supplier was not deleted.')
    } finally {
      setSaving(false)
    }
  }

  const supplierCsv: CsvColumn<SupplierRow>[] = [
    { header: 'Name', value: (s) => s.name },
    { header: 'Category', value: (s) => s.category ?? '' },
    { header: 'Contact', value: (s) => s.contact_name ?? '' },
    { header: 'Phone', value: (s) => s.phone ?? '' },
    { header: 'Email', value: (s) => s.email ?? '' },
    { header: 'Active', value: (s) => s.is_active },
    { header: 'Times used', value: (s) => s.usage_count ?? 0 },
    { header: 'Created', value: (s) => csvDate(s.created_at) },
  ]

  const columns: DataColumn<SupplierRow>[] = [
    {
      id: 'name',
      label: 'Supplier',
      sortable: true,
      sortValue: (s) => s.name,
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
          {s.contact_name && <p className="truncate text-xs text-muted-foreground">{s.contact_name}</p>}
        </div>
      ),
    },
    {
      id: 'category',
      label: 'Category',
      hideBelow: 'md',
      sortable: true,
      sortValue: (s) => s.category ?? '',
      cell: (s) => <span className="text-xs text-muted-foreground">{s.category || '—'}</span>,
    },
    {
      id: 'phone',
      label: 'Phone',
      hideBelow: 'sm',
      sortable: true,
      sortValue: (s) => s.phone ?? '',
      cell: (s) => <span className="text-xs tabular-nums text-muted-foreground">{s.phone || '—'}</span>,
    },
    {
      id: 'usage_count',
      label: 'Used',
      align: 'right',
      hideBelow: 'lg',
      sortable: true,
      sortValue: (s) => s.usage_count ?? 0,
      cell: (s) => <span className="text-sm tabular-nums text-foreground">{s.usage_count ?? 0}</span>,
    },
    {
      id: 'is_active',
      label: 'Status',
      sortable: true,
      sortValue: (s) => (s.is_active ? 'Active' : 'Inactive'),
      cell: (s) =>
        s.is_active ? (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            Active
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Inactive</span>
        ),
    },
  ]

  const categories = Array.from(new Set(suppliers.map((s) => s.category).filter(Boolean))).sort() as string[]
  const facets: DataFacet<SupplierRow>[] = [
    {
      id: 'category',
      label: 'Category',
      options: categories.map((c) => ({ value: c, label: c })),
      matches: (s, value) => s.category === value,
    },
    {
      id: 'status',
      label: 'Status',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ],
      matches: (s, value) => (value === 'active' ? s.is_active : !s.is_active),
    },
  ]

  const open = creating || editing !== null

  return (
    <div className="space-y-5">
      <DataView
        rows={suppliers}
        getRowId={(s) => s.id}
        columns={columns}
        facets={facets}
        searchPlaceholder="Search suppliers…"
        searchText={(s) => [s.name, s.category, s.contact_name, s.phone, s.email, s.notes]}
        defaultSort={{ id: 'name', dir: 'asc' }}
        defaultView="grid"
        storageKey="admin-suppliers"
        onRowClick={openEdit}
        emptyTitle="No suppliers yet"
        emptyMessage="Add vendors here so engineers can pick them on a requisition."
        toolbarExtra={(visible) => (
          <>
            <ExportButton rows={visible} columns={supplierCsv} section="suppliers" />
            <AdminButton type="button" onClick={openCreate} className="shrink-0">
              <Plus size={16} /> New supplier
            </AdminButton>
          </>
        )}
        renderCard={(s) => (
          <article className="surface flex h-full flex-col rounded-xl p-4 transition-colors hover:border-ring">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{s.name}</p>
                {s.category && <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.category}</p>}
              </div>
              {!s.is_active && (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Inactive
                </span>
              )}
            </div>

            <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
              {s.contact_name && <p className="truncate">{s.contact_name}</p>}
              {s.phone && (
                <p className="flex items-center gap-1.5">
                  <Phone size={13} className="shrink-0" />
                  <span className="truncate">{s.phone}</span>
                </p>
              )}
              {s.email && (
                <p className="flex items-center gap-1.5">
                  <Mail size={13} className="shrink-0" />
                  <span className="truncate">{s.email}</span>
                </p>
              )}
            </div>

            {s.usage_count !== undefined && (
              <p className="mt-auto pt-3 text-[11px] tabular-nums text-muted-foreground">
                Used on {s.usage_count} requisition {s.usage_count === 1 ? 'line' : 'lines'}
              </p>
            )}
          </article>
        )}
      />

      <AdminModal
        open={open}
        onClose={close}
        wide
        title={editing ? 'Manage supplier' : 'New supplier'}
        description={editing ? editing.name : 'Vendors here appear in the requisition form picker.'}
        footer={
          <>
            {editing && !confirmingDelete && (
              <AdminButton
                type="button"
                variant="ghost"
                className="sm:mr-auto"
                onClick={() => setConfirmingDelete(true)}
                disabled={saving}
              >
                Delete
              </AdminButton>
            )}
            <AdminButton type="button" variant="outline" onClick={close} disabled={saving}>
              Cancel
            </AdminButton>
            <AdminButton type="button" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add supplier'}
            </AdminButton>
          </>
        }
      >
        <div className="space-y-4">
          <AdminError message={error} />

          {confirmingDelete && editing && (
            <ConfirmPanel
              message={`Delete "${editing.name}"? Deactivating hides it from new requisitions while keeping past ones readable.`}
              confirmLabel="Delete supplier"
              busy={saving}
              onConfirm={remove}
              onCancel={() => setConfirmingDelete(false)}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Supplier name" required>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Ashanti Steel Ltd"
                className={adminInputClass}
              />
            </AdminField>
            <AdminField label="Category">
              <input
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                placeholder="Steel, cement, haulage…"
                className={adminInputClass}
              />
            </AdminField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Contact person">
              <input
                value={draft.contact_name}
                onChange={(e) => setDraft({ ...draft, contact_name: e.target.value })}
                className={adminInputClass}
              />
            </AdminField>
            <AdminField label="Phone">
              <input
                type="tel"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="+233…"
                className={adminInputClass}
              />
            </AdminField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Email">
              <input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className={adminInputClass}
              />
            </AdminField>
            <AdminField label="TIN">
              <input
                value={draft.tin}
                onChange={(e) => setDraft({ ...draft, tin: e.target.value })}
                placeholder="Tax identification number"
                className={adminInputClass}
              />
            </AdminField>
          </div>

          <AdminField label="Address">
            <input
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              className={adminInputClass}
            />
          </AdminField>

          <AdminField label="Notes">
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              rows={3}
              className={`${adminInputClass} h-auto resize-none py-2.5`}
            />
          </AdminField>

          <label className="flex items-center justify-between gap-4 rounded-lg border border-border px-3.5 py-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">Active</span>
              <span className="block text-xs text-muted-foreground">
                Inactive suppliers stay on past requisitions but cannot be picked on new ones.
              </span>
            </span>
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
              className="h-5 w-5 shrink-0 accent-primary"
            />
          </label>
        </div>
      </AdminModal>
    </div>
  )
}
