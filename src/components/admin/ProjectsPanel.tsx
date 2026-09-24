'use client'

import { useState } from 'react'
import type { ProjectWithMemberCount } from '@/lib/types'
import { AdminButton, AdminError, AdminField, AdminModal, ConfirmPanel, adminInputClass } from './admin-ui'
import DataView, { type DataColumn, type DataFacet } from '@/components/shared/DataView'
import { MapPin, Plus, Users as UsersIcon } from 'lucide-react'
import ExportButton from './ExportButton'
import { formatDate as csvDate, type CsvColumn } from '@/lib/csv'

const STATUSES: { value: string; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'archived', label: 'Archived' },
]

const statusStyle: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  on_hold: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  archived: 'bg-muted text-muted-foreground',
}

type Draft = {
  name: string
  code: string
  site_location: string
  client: string
  description: string
  status: string
}

const emptyDraft = (): Draft => ({
  name: '',
  code: '',
  site_location: '',
  client: '',
  description: '',
  status: 'active',
})

const toDraft = (p: ProjectWithMemberCount): Draft => ({
  name: p.name,
  code: p.code ?? '',
  site_location: p.site_location ?? '',
  client: p.client ?? '',
  description: p.description ?? '',
  status: p.status,
})

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyle[status] ?? 'bg-muted text-muted-foreground'}`}>
      {STATUSES.find((s) => s.value === status)?.label ?? status}
    </span>
  )
}

export default function ProjectsPanel({
  projects,
  onChanged,
  notify,
}: {
  projects: ProjectWithMemberCount[]
  onChanged: () => void
  notify: (msg: string, ok: boolean) => void
}) {
  const [editing, setEditing] = useState<ProjectWithMemberCount | null>(null)
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

  const openEdit = (project: ProjectWithMemberCount) => {
    setDraft(toDraft(project))
    setError(null)
    setConfirmingDelete(false)
    setEditing(project)
  }

  const close = () => {
    setCreating(false)
    setEditing(null)
    setConfirmingDelete(false)
    setError(null)
  }

  const save = async () => {
    if (!draft.name.trim()) {
      setError('A project name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(editing ? `/api/admin/projects/${editing.id}` : '/api/admin/projects', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'Could not save the project.')
        return
      }
      notify(editing ? 'Project updated' : 'Project created', true)
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
      const res = await fetch(`/api/admin/projects/${editing.id}`, { method: 'DELETE' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'Could not delete the project.')
        setConfirmingDelete(false)
        return
      }
      notify('Project deleted', true)
      close()
      onChanged()
    } catch {
      setError('Network error — the project was not deleted.')
    } finally {
      setSaving(false)
    }
  }

  const projectCsv: CsvColumn<ProjectWithMemberCount>[] = [
    { header: 'Name', value: (p) => p.name },
    { header: 'Code', value: (p) => p.code ?? '' },
    { header: 'Location', value: (p) => p.site_location ?? '' },
    { header: 'Client', value: (p) => p.client ?? '' },
    { header: 'Status', value: (p) => p.status },
    { header: 'Members', value: (p) => p.member_count ?? 0 },
    { header: 'Created', value: (p) => csvDate(p.created_at) },
  ]

  const columns: DataColumn<ProjectWithMemberCount>[] = [
    {
      id: 'name',
      label: 'Project',
      sortable: true,
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
          {p.code && <p className="truncate font-mono text-xs text-muted-foreground">{p.code}</p>}
        </div>
      ),
    },
    {
      id: 'site_location',
      label: 'Location',
      hideBelow: 'md',
      sortable: true,
      sortValue: (p) => p.site_location ?? '',
      cell: (p) => <span className="text-xs text-muted-foreground">{p.site_location || '—'}</span>,
    },
    {
      id: 'client',
      label: 'Client',
      hideBelow: 'lg',
      sortable: true,
      sortValue: (p) => p.client ?? '',
      cell: (p) => <span className="text-xs text-muted-foreground">{p.client || '—'}</span>,
    },
    {
      id: 'member_count',
      label: 'Assigned',
      align: 'right',
      hideBelow: 'sm',
      sortable: true,
      sortValue: (p) => p.member_count,
      cell: (p) => <span className="text-sm tabular-nums text-foreground">{p.member_count}</span>,
    },
    {
      id: 'status',
      label: 'Status',
      sortable: true,
      sortValue: (p) => p.status,
      cell: (p) => <StatusPill status={p.status} />,
    },
  ]

  const facets: DataFacet<ProjectWithMemberCount>[] = [
    {
      id: 'status',
      label: 'Status',
      options: STATUSES,
      matches: (p, value) => p.status === value,
    },
    {
      id: 'assignment',
      label: 'Team',
      options: [
        { value: 'staffed', label: 'Has members' },
        { value: 'empty', label: 'No members' },
      ],
      matches: (p, value) => (value === 'staffed' ? p.member_count > 0 : p.member_count === 0),
    },
  ]

  const open = creating || editing !== null

  return (
    <div className="space-y-5">
      <DataView
        rows={projects}
        getRowId={(p) => p.id}
        columns={columns}
        facets={facets}
        searchPlaceholder="Search projects…"
        searchText={(p) => [p.name, p.code, p.site_location, p.client]}
        defaultSort={{ id: 'name', dir: 'asc' }}
        defaultView="grid"
        storageKey="admin-projects"
        onRowClick={openEdit}
        emptyTitle="No project sites yet"
        emptyMessage="Create one so engineers can raise requisitions against a site."
        toolbarExtra={(visible) => (
          <>
            <ExportButton rows={visible} columns={projectCsv} section="project-sites" />
            <AdminButton type="button" onClick={openCreate} className="shrink-0">
              <Plus size={16} /> New project
            </AdminButton>
          </>
        )}
        renderCard={(p) => (
          <article className="surface flex h-full flex-col rounded-xl p-4 transition-colors hover:border-ring">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                {p.code && <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{p.code}</p>}
              </div>
              <StatusPill status={p.status} />
            </div>

            <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
              {p.site_location && (
                <p className="flex items-center gap-1.5">
                  <MapPin size={13} className="shrink-0" />
                  <span className="truncate">{p.site_location}</span>
                </p>
              )}
              <p className="flex items-center gap-1.5">
                <UsersIcon size={13} className="shrink-0" />
                {p.member_count} assigned
              </p>
            </div>
          </article>
        )}
      />

      <AdminModal
        open={open}
        onClose={close}
        title={editing ? 'Manage project' : 'New project site'}
        description={editing ? editing.name : 'Engineers raise requisitions against a project site.'}
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
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create project'}
            </AdminButton>
          </>
        }
      >
        <div className="space-y-4">
          <AdminError message={error} />

          {confirmingDelete && editing && (
            <ConfirmPanel
              message={`Delete "${editing.name}"? Archiving keeps it out of the pickers while preserving its history.`}
              confirmLabel="Delete project"
              busy={saving}
              onConfirm={remove}
              onCancel={() => setConfirmingDelete(false)}
            />
          )}

          <AdminField label="Project name" required>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Adenta Phase 2"
              className={adminInputClass}
            />
          </AdminField>

          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Project code">
              <input
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                placeholder="MACWL-OPS-2026"
                className={adminInputClass}
              />
            </AdminField>
            <AdminField label="Status">
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                className={`${adminInputClass} appearance-none`}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </AdminField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Site location">
              <input
                value={draft.site_location}
                onChange={(e) => setDraft({ ...draft, site_location: e.target.value })}
                placeholder="Adenta, Greater Accra"
                className={adminInputClass}
              />
            </AdminField>
            <AdminField label="Client">
              <input
                value={draft.client}
                onChange={(e) => setDraft({ ...draft, client: e.target.value })}
                placeholder="Client or department"
                className={adminInputClass}
              />
            </AdminField>
          </div>

          <AdminField label="Description">
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={3}
              placeholder="Scope or notes for this site"
              className={`${adminInputClass} h-auto resize-none py-2.5`}
            />
          </AdminField>
        </div>
      </AdminModal>
    </div>
  )
}
