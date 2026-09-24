'use client'

import { useState } from 'react'
import type { ProjectWithMemberCount, UserWithProjects } from '@/lib/types'
import { ROLES, ASSIGNABLE_ROLES, normalizeRole, roleLabel } from '@/lib/roles'
import { AdminButton, AdminError, AdminField, AdminModal, ConfirmPanel, adminInputClass } from './admin-ui'
import DataView, { type DataColumn, type DataFacet } from '@/components/shared/DataView'
import { Mail, ShieldCheck, UserPlus } from 'lucide-react'
import ExportButton from './ExportButton'
import { formatDate as csvDate, type CsvColumn } from '@/lib/csv'

/** A profile created by an admin that nobody has signed up against yet. */
const isPending = (u: UserWithProjects) => Boolean(u.auth_id?.startsWith('pending:'))

const shortDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

interface Draft {
  name: string
  email: string
  phone: string
  role: string
  is_active: boolean
  projectIds: string[]
}

const toDraft = (u: UserWithProjects): Draft => ({
  name: u.name ?? '',
  email: u.email,
  phone: u.phone ?? '',
  role: u.role,
  is_active: u.is_active !== false,
  projectIds: (u.projects ?? []).map((p) => p.id),
})

const emptyDraft = (): Draft => ({
  name: '',
  email: '',
  phone: '',
  role: 'engineer',
  is_active: true,
  projectIds: [],
})

function RolePill({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${ROLES[normalizeRole(role) ?? 'engineer'].dot}`} />
      {roleLabel(role)}
    </span>
  )
}

export default function UsersPanel({
  users,
  projects,
  onChanged,
  notify,
}: {
  users: UserWithProjects[]
  projects: ProjectWithMemberCount[]
  onChanged: () => void
  notify: (msg: string, ok: boolean) => void
}) {
  const [editing, setEditing] = useState<UserWithProjects | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  /** Filters the project picker — the site list outgrew a scrollable column. */
  const [projectQuery, setProjectQuery] = useState('')

  const openCreate = () => {
    setDraft(emptyDraft())
    setError(null)
    setProjectQuery('')
    setConfirmingDelete(false)
    setCreating(true)
  }

  const openEdit = (u: UserWithProjects) => {
    setDraft(toDraft(u))
    setError(null)
    setProjectQuery('')
    setConfirmingDelete(false)
    setEditing(u)
  }

  const close = () => {
    setCreating(false)
    setEditing(null)
    setConfirmingDelete(false)
    setError(null)
  }

  const toggleProject = (id: string) =>
    setDraft((d) => ({
      ...d,
      projectIds: d.projectIds.includes(id)
        ? d.projectIds.filter((p) => p !== id)
        : [...d.projectIds, id],
    }))

  const save = async () => {
    if (!draft.email.trim().includes('@')) {
      setError('A valid email address is required.')
      return
    }
    setSaving(true)
    setError(null)

    try {
      if (creating) {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: draft.email,
            name: draft.name,
            phone: draft.phone,
            role: draft.role,
            project_ids: draft.projectIds,
          }),
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(payload.error ?? 'Could not create the user.')
          return
        }
        // The profile exists either way; the invite is what may have failed.
        if (payload.invite?.sent) {
          notify(`User created — invite sent to ${draft.email.trim()}`, true)
        } else {
          notify(`User created, but the invite email failed: ${payload.invite?.error ?? 'unknown error'}`, false)
        }
      } else if (editing) {
        const res = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editing.id,
            name: draft.name,
            email: draft.email,
            phone: draft.phone,
            role: draft.role,
            is_active: draft.is_active,
          }),
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(payload.error ?? 'Could not update the user.')
          return
        }

        // Project membership is a separate resource; a failure here must be
        // surfaced rather than silently leaving assignments stale.
        const projectsRes = await fetch(`/api/admin/users/${editing.id}/projects`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_ids: draft.projectIds }),
        })
        if (!projectsRes.ok) {
          const projectsPayload = await projectsRes.json().catch(() => ({}))
          setError(projectsPayload.error ?? 'Profile saved, but project assignments did not update.')
          onChanged()
          return
        }
        notify('User updated', true)
      }

      close()
      onChanged()
    } catch {
      setError('Network error — nothing was saved.')
    } finally {
      setSaving(false)
    }
  }

  const resendInvite = async () => {
    if (!editing) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${editing.id}/invite`, { method: 'POST' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'The invite could not be sent.')
        return
      }
      notify(`Invite re-sent to ${editing.email}`, true)
    } catch {
      setError('Network error — the invite was not sent.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!editing) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users?id=${encodeURIComponent(editing.id)}`, { method: 'DELETE' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'Could not delete the user.')
        setConfirmingDelete(false)
        return
      }
      notify('User deleted', true)
      close()
      onChanged()
    } catch {
      setError('Network error — the user was not deleted.')
    } finally {
      setSaving(false)
    }
  }

  const needle = projectQuery.trim().toLowerCase()
  const visibleProjects = needle
    ? projects.filter((p) =>
        [p.name, p.code, p.site_location].some((field) =>
          (field ?? '').toLowerCase().includes(needle)
        )
      )
    : projects

  const userCsv: CsvColumn<UserWithProjects>[] = [
    { header: 'Name', value: (u) => u.name ?? '' },
    { header: 'Email', value: (u) => u.email },
    { header: 'Role', value: (u) => roleLabel(u.role) },
    {
      header: 'Status',
      value: (u) => (u.is_active === false ? 'Disabled' : isPending(u) ? 'Invited' : 'Active'),
    },
    { header: 'Project sites', value: (u) => (u.projects ?? []).map((p) => p.name).join('; ') },
    { header: 'Phone', value: (u) => u.phone ?? '' },
    { header: 'Created', value: (u) => csvDate(u.created_at) },
  ]

  const columns: DataColumn<UserWithProjects>[] = [
    {
      id: 'name',
      label: 'User',
      sortable: true,
      sortValue: (u) => u.name ?? u.email,
      cell: (u) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
            {(u.name ?? u.email).slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{u.name ?? 'Unnamed'}</p>
            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'role',
      label: 'Role',
      sortable: true,
      sortValue: (u) => roleLabel(u.role),
      cell: (u) => <RolePill role={u.role} />,
    },
    {
      id: 'projects',
      label: 'Project sites',
      hideBelow: 'md',
      sortable: true,
      sortValue: (u) => (u.projects ?? []).length,
      cell: (u) => {
        const assigned = u.projects ?? []
        if (assigned.length === 0) {
          return <span className="text-xs text-muted-foreground">None</span>
        }

        // Two names and a count, never the whole list: a lead on fifteen sites
        // used to stretch this cell until the whole table scrolled sideways.
        // The full list is on hover, and in the drawer when they open the row.
        const shown = assigned.slice(0, 2)
        const rest = assigned.length - shown.length

        return (
          <div
            className="flex max-w-[260px] flex-wrap items-center gap-1"
            title={assigned.map((p) => p.name).join(', ')}
          >
            {shown.map((p) => (
              <span
                key={p.id}
                className="max-w-[150px] truncate rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-foreground"
              >
                {p.name}
              </span>
            ))}
            {rest > 0 && (
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                +{rest}
              </span>
            )}
          </div>
        )
      },
    },
    {
      id: 'status',
      label: 'Access',
      hideBelow: 'sm',
      sortable: true,
      sortValue: (u) => (u.is_active === false ? 'Disabled' : isPending(u) ? 'Invited' : 'Active'),
      cell: (u) =>
        u.is_active === false ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Disabled</span>
        ) : isPending(u) ? (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            Invited
          </span>
        ) : (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            Active
          </span>
        ),
    },
    {
      id: 'created_at',
      label: 'Joined',
      hideBelow: 'lg',
      sortable: true,
      sortValue: (u) => u.created_at,
      cell: (u) => <span className="text-xs text-muted-foreground">{shortDate(u.created_at)}</span>,
    },
  ]

  const presentRoles = Array.from(new Set(users.map((u) => u.role))).sort()
  const facets: DataFacet<UserWithProjects>[] = [
    {
      id: 'role',
      label: 'Role',
      options: presentRoles.map((r) => ({ value: r, label: roleLabel(r) })),
      matches: (u, value) => u.role === value,
    },
    {
      id: 'access',
      label: 'Access',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'invited', label: 'Invited' },
        { value: 'disabled', label: 'Disabled' },
      ],
      matches: (u, value) =>
        value === 'disabled'
          ? u.is_active === false
          : value === 'invited'
            ? u.is_active !== false && isPending(u)
            : u.is_active !== false && !isPending(u),
    },
    {
      id: 'assignment',
      label: 'Projects',
      options: [
        { value: 'assigned', label: 'Has projects' },
        { value: 'unassigned', label: 'No projects' },
      ],
      matches: (u, value) =>
        value === 'assigned' ? (u.projects ?? []).length > 0 : (u.projects ?? []).length === 0,
    },
  ]

  const open = creating || editing !== null

  return (
    <div className="space-y-5">
      <DataView
        rows={users}
        getRowId={(u) => u.id}
        columns={columns}
        facets={facets}
        searchPlaceholder="Search by name or email…"
        searchText={(u) => [u.name, u.email, u.phone, ...(u.projects ?? []).map((p) => p.name)]}
        defaultSort={{ id: 'created_at', dir: 'desc' }}
        defaultView="grid"
        storageKey="admin-users"
        onRowClick={openEdit}
        emptyTitle="No users yet"
        emptyMessage="People appear here once they are added or sign in."
        toolbarExtra={(visible) => (
          <>
            <ExportButton rows={visible} columns={userCsv} section="users" />
            <AdminButton type="button" onClick={openCreate} className="shrink-0">
              <UserPlus size={16} /> Add user
            </AdminButton>
          </>
        )}
        renderCard={(u) => (
          <article className="surface flex h-full flex-col rounded-xl p-4 transition-colors hover:border-ring">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                {(u.name ?? u.email).slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{u.name ?? 'Unnamed'}</p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
              {u.is_active === false ? (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Disabled
                </span>
              ) : isPending(u) ? (
                <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  Invited
                </span>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <RolePill role={u.role} />
              {(u.projects ?? []).slice(0, 2).map((p) => (
                <span key={p.id} className="max-w-[160px] truncate rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                  {p.name}
                </span>
              ))}
              {(u.projects ?? []).length > 2 && (
                <span className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">
                  +{(u.projects ?? []).length - 2}
                </span>
              )}
              {(u.projects ?? []).length === 0 && (
                <span className="text-[11px] text-muted-foreground">No projects assigned</span>
              )}
            </div>

            <p className="mt-auto pt-3 text-[11px] text-muted-foreground">Joined {shortDate(u.created_at)}</p>
          </article>
        )}
      />

      <AdminModal
        open={open}
        onClose={close}
        wide
        title={creating ? 'Add user' : 'Manage user'}
        description={creating ? 'Set up a profile before the person first signs in.' : editing?.email}
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
              {saving ? 'Saving…' : creating ? 'Create user' : 'Save changes'}
            </AdminButton>
          </>
        }
      >
        <div className="space-y-4">
          <AdminError message={error} />

          {editing && isPending(editing) && !confirmingDelete && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm font-semibold text-foreground">Waiting on sign-up</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {editing.name ?? editing.email} has not created a password yet. They need to sign up at{' '}
                <span className="font-medium text-foreground">/auth/signup</span> using{' '}
                <span className="font-medium text-foreground">{editing.email}</span> — their role and
                projects are already waiting on this profile.
              </p>
              <AdminButton
                type="button"
                variant="outline"
                className="mt-3"
                onClick={resendInvite}
                disabled={saving}
              >
                <Mail size={15} /> Resend invite
              </AdminButton>
            </div>
          )}

          {confirmingDelete && editing && (
            <ConfirmPanel
              message={`Permanently delete ${editing.name ?? editing.email}? Their requisitions and purchase orders remain, but are no longer attributed to them. Disabling the account is reversible.`}
              confirmLabel="Delete user"
              busy={saving}
              onConfirm={remove}
              onCancel={() => setConfirmingDelete(false)}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Full name">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Kwame Mensah"
                className={adminInputClass}
              />
            </AdminField>
            <AdminField label="Email" required>
              <input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                placeholder="name@company.com"
                className={adminInputClass}
              />
            </AdminField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Phone">
              <input
                type="tel"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="+233…"
                className={adminInputClass}
              />
            </AdminField>
            <AdminField label="Role" required>
              <select
                value={normalizeRole(draft.role) ?? 'engineer'}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                className={`${adminInputClass} appearance-none`}
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLES[r].label}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {ROLES[normalizeRole(draft.role) ?? 'engineer'].description}
              </p>
            </AdminField>
          </div>

          <AdminField
            label="Project sites"
            hint="Engineers can only raise requisitions against the sites ticked here."
          >
            {projects.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3.5 py-3 text-sm text-muted-foreground">
                No project sites exist yet. Create one in the Projects section first.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    <span className="font-semibold text-foreground">{draft.projectIds.length}</span> of{' '}
                    {projects.length} selected
                  </p>
                  {draft.projectIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, projectIds: [] })}
                      className="text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {projects.length > 6 && (
                  <input
                    type="search"
                    value={projectQuery}
                    onChange={(e) => setProjectQuery(e.target.value)}
                    placeholder="Filter sites…"
                    className={adminInputClass}
                  />
                )}

                <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
                  {visibleProjects.length === 0 && (
                    <p className="px-2.5 py-3 text-sm text-muted-foreground">
                      No site matches “{projectQuery}”.
                    </p>
                  )}
                  {visibleProjects.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={draft.projectIds.includes(p.id)}
                      onChange={() => toggleProject(p.id)}
                      className="h-5 w-5 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{p.name}</span>
                      {(p.code || p.site_location) && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {[p.code, p.site_location].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    {p.status !== 'active' && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {p.status === 'on_hold' ? 'On hold' : 'Archived'}
                      </span>
                    )}
                  </label>
                  ))}
                </div>
              </div>
            )}
          </AdminField>

          {!creating && (
            <label className="flex items-center justify-between gap-4 rounded-lg border border-border px-3.5 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">Account active</span>
                <span className="block text-xs text-muted-foreground">
                  Disabled users keep their history but lose access to the app.
                </span>
              </span>
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                className="h-5 w-5 shrink-0 accent-primary"
              />
            </label>
          )}

          {creating && (
            <p className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" />
              This sets up the profile only. The person signs in with this email through the normal login;
              their role and project assignments are applied the moment they do.
            </p>
          )}
        </div>
      </AdminModal>
    </div>
  )
}
