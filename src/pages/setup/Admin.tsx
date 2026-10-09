import { Copy, Lock, MailPlus, Pencil, Plus, RotateCcw, ShieldAlert, Trash2, UserCheck, UserX } from 'lucide-react'
import { useState } from 'react'
import type { DemoUser, Permission, PermissionGroup, PersonaId } from '@/data/types'
import { Badge, Button, Callout, Card, EmptyState, LocalFilters, Modal, PageHeader, Pager, Select, TableWrap, Tabs, cx, td, th } from '@/components/ui'
import { fmtDateTime } from '@/lib/dates'
import { usePageFilters } from '@/lib/filters'
import { ALL_PERMISSIONS, DEFAULT_GROUPS, PERSONAS, demoNow, logActivity, store, useAppState, useDataset, usePermissions } from '@/lib/store'
import { ActivityRows, Check, EMAIL_RE, Field, SearchBox, hasErrors, inputCls, required, usePaged, type Errors } from './shared'

type Tab = 'users' | 'groups' | 'audit'
const PERM_GROUPS = [...new Set(ALL_PERMISSIONS.map((p) => p.group))]
/** Permissions the active persona must keep, so the demo cannot lock itself out of Administration. */
const LOCKOUT_PERMS: Permission[] = ['view.admin', 'admin.manage']

export default function Admin() {
  usePageFilters([])
  const { can } = usePermissions()
  const canManage = can('admin.manage')
  const users = useAppState((s) => s.users)
  const groups = useAppState((s) => s.groups)
  const activity = useAppState((s) => s.activity)
  const [tab, setTab] = useState<Tab>('users')
  return (
    <div>
      <PageHeader
        title="Administration"
        subtitle="Demo users, permission groups and audit history"
        actions={
          <>
            <Badge tone="none">Simulation</Badge>
            {!canManage && (
              <Badge tone="none" icon={Lock}>
                Read-only for this persona
              </Badge>
            )}
          </>
        }
      />
      <div className="mb-3">
        <Callout tone="warn" icon={ShieldAlert} title="Prototype simulation — not production security">
          Users, invitations and permission groups live only in this browser. Permissions control what this prototype shows; they are not enforced by any server and no authentication system is connected.
        </Callout>
      </div>
      <div className="mb-3">
        <Tabs
          label="Administration sections"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'users', label: 'Users', count: users.length },
            {
              value: 'groups',
              label: 'Permission groups',
              count: groups.length,
            },
            { value: 'audit', label: 'Audit history', count: activity.length },
          ]}
        />
      </div>
      {tab === 'users' && <UsersTab canManage={canManage} />}
      {tab === 'groups' && <GroupsTab canManage={canManage} />}
      {tab === 'audit' && <AuditTab />}
    </div>
  )
}

// ── Users ──────────────────────────────────────────────────────────────────
function setUsers(fn: (u: DemoUser[]) => DemoUser[]) {
  store.set((s) => ({ ...s, users: fn(s.users) }))
}

function UsersTab({ canManage }: { canManage: boolean }) {
  const users = useAppState((s) => s.users)
  const groups = useAppState((s) => s.groups)
  const ds = useDataset()
  const [invite, setInvite] = useState(false)
  const [q, setQ] = useState('')
  const rows = users.filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()))
  const gName = (id: string) => groups.find((g) => g.id === id)?.name ?? id
  return (
    <div className="space-y-3">
      <LocalFilters>
        <SearchBox className="w-[260px]" value={q} onChange={setQ} label="Search users" placeholder="Search name or email…" />
      </LocalFilters>
      <Card
        bodyClass="p-0"
        title="Users"
        subtitle="Local demo users. Invitations do not send email."
        actions={
          canManage && (
            <Button size="sm" variant="primary" icon={MailPlus} onClick={() => setInvite(true)}>
              Invite user
            </Button>
          )
        }
      >
        {rows.length === 0 ? (
          <EmptyState title="No users match" />
        ) : (
          <TableWrap>
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={th}>User</th>
                  <th className={th}>Permission group</th>
                  <th className={th}>Vendor scope</th>
                  <th className={th}>Status</th>
                  {canManage && (
                    <th className={th}>
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="hover:bg-surface-muted/60">
                    <td className={td}>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-dense text-ink-muted">{u.email}</div>
                    </td>
                    <td className={td}>
                      {canManage ? (
                        <Select
                          label={`Permission group for ${u.name}`}
                          hideLabel
                          value={u.groupId}
                          onChange={(e) => {
                            const g = e.target.value
                            setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, groupId: g } : x)))
                            logActivity('Administration', 'Changed user group', u.email, `${gName(u.groupId)} → ${gName(g)}`)
                          }}
                        >
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        gName(u.groupId)
                      )}
                    </td>
                    <td className={cx(td, 'text-ink-muted')}>{u.vendorScope.length ? u.vendorScope.map((v) => ds.idx.vendor.get(v)?.name ?? v).join(', ') : 'All vendors'}</td>
                    <td className={td}>
                      {u.status === 'Active' && (
                        <Badge tone="ok" icon={UserCheck}>
                          Active
                        </Badge>
                      )}
                      {u.status === 'Invited' && (
                        <Badge tone="info" icon={MailPlus} title={u.invitedAt ? `Invited ${fmtDateTime(u.invitedAt)}` : undefined}>
                          Invited
                          {u.invitedAt ? ` · ${fmtDateTime(u.invitedAt)}` : ''}
                        </Badge>
                      )}
                      {u.status === 'Disabled' && (
                        <Badge tone="none" icon={UserX}>
                          Deactivated
                        </Badge>
                      )}
                    </td>
                    {canManage && (
                      <td className={cx(td, 'whitespace-nowrap')}>
                        {u.status === 'Disabled' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setUsers((l) => l.map((x) => (x.id === u.id ? { ...x, status: 'Active' } : x)))
                              logActivity('Administration', 'Reactivated user', u.email)
                            }}
                          >
                            Reactivate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setUsers((l) => l.map((x) => (x.id === u.id ? { ...x, status: 'Disabled' } : x)))
                              logActivity('Administration', u.status === 'Invited' ? 'Revoked invitation' : 'Deactivated user', u.email)
                            }}
                          >
                            {u.status === 'Invited' ? 'Revoke invite' : 'Deactivate'}
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      {invite && <InviteModal onClose={() => setInvite(false)} />}
    </div>
  )
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const users = useAppState((s) => s.users)
  const groups = useAppState((s) => s.groups)
  const ds = useDataset()
  const [f, setF] = useState({
    name: '',
    email: '',
    groupId: 'G-VIEWER',
    vendorScope: [] as string[],
  })
  const [err, setErr] = useState<Errors>({})
  const submit = () => {
    const email = f.email.trim().toLowerCase()
    const e: Errors = {
      name: required(f.name, 'Name'),
      email: required(email, 'Email') ?? (!EMAIL_RE.test(email) ? 'Enter a valid email address.' : users.some((u) => u.email.toLowerCase() === email) ? 'A user with this email already exists.' : undefined),
    }
    setErr(e)
    if (hasErrors(e)) return
    const u: DemoUser = {
      id: `U-${Date.now().toString(36)}`,
      name: f.name.trim(),
      email,
      groupId: f.groupId,
      status: 'Invited',
      invitedAt: demoNow(),
      vendorScope: f.vendorScope,
    }
    setUsers((l) => [...l, u])
    logActivity('Administration', 'Invited user (local demo – no email sent)', email, `Group: ${groups.find((g) => g.id === f.groupId)?.name}`)
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Invite user"
      width={520}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="invite-form" icon={MailPlus}>
            Add invitation
          </Button>
        </>
      }
    >
      <form
        id="invite-form"
        noValidate
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Full name" error={err.name}>
          <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Email" error={err.email}>
          <input className={inputCls} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Permission group" className="col-span-2">
          <select className={inputCls} value={f.groupId} onChange={(e) => setF({ ...f, groupId: e.target.value })}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="col-span-2">
          <legend className="mb-1 text-dense font-medium text-ink-muted">Vendor scope (none selected = all vendors)</legend>
          <div className="flex flex-wrap gap-3">
            {ds.vendors.map((v) => (
              <Check
                key={v.id}
                label={v.name}
                checked={f.vendorScope.includes(v.id)}
                onChange={(on) =>
                  setF({
                    ...f,
                    vendorScope: on ? [...f.vendorScope, v.id] : f.vendorScope.filter((x) => x !== v.id),
                  })
                }
              />
            ))}
          </div>
        </fieldset>
        <div className="col-span-2">
          <Callout tone="info">No email is sent — this is a local demo invitation. The user appears as “Invited” in this browser only.</Callout>
        </div>
      </form>
    </Modal>
  )
}

// ── Permission groups ──────────────────────────────────────────────────────
function setGroups(fn: (g: PermissionGroup[]) => PermissionGroup[]) {
  store.set((s) => ({ ...s, groups: fn(s.groups) }))
}

function GroupsTab({ canManage }: { canManage: boolean }) {
  const groups = useAppState((s) => s.groups)
  const users = useAppState((s) => s.users)
  const personaGroup = useAppState((s) => s.personaGroup)
  const persona = useAppState((s) => s.persona)
  const [selId, setSelId] = useState(groups[0]?.id)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const sel = groups.find((g) => g.id === selId) ?? groups[0]
  const activeGroupId = personaGroup[persona]
  const builtinDefault = DEFAULT_GROUPS.find((d) => d.id === sel.id)
  const modified = builtinDefault && (builtinDefault.permissions.length !== sel.permissions.length || builtinDefault.permissions.some((p) => !sel.permissions.includes(p)) || builtinDefault.name !== sel.name)
  const inUse = users.some((u) => u.groupId === sel.id) || Object.values(personaGroup).includes(sel.id)

  const togglePerm = (p: Permission, on: boolean) => {
    setGroups((gs) =>
      gs.map((g) =>
        g.id === sel.id
          ? {
              ...g,
              permissions: on ? [...g.permissions, p] : g.permissions.filter((x) => x !== p),
            }
          : g,
      ),
    )
    logActivity('Administration', on ? 'Granted permission' : 'Revoked permission', sel.name, ALL_PERMISSIONS.find((x) => x.id === p)?.label)
  }

  return (
    <div className="space-y-3">
      <Card title="Demo personas" subtitle="Which permission group each demo persona uses. Changes apply immediately to navigation and page access.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PERSONAS.map((p) => (
            <div key={p.id} className={cx('rounded-md border px-3 py-2', p.id === persona ? 'border-accent/50 bg-accent-soft/40' : 'border-line')}>
              <div className="mb-1 flex items-center justify-between gap-2 text-body">
                <span className="font-medium">
                  {p.label} <span className="font-normal text-ink-muted">· {p.user}</span>
                </span>
                {p.id === persona && <Badge tone="accent">Current</Badge>}
              </div>
              <Select
                label={`Permission group for ${p.label} persona`}
                hideLabel
                className="w-full [&>select]:w-full"
                disabled={!canManage}
                value={personaGroup[p.id]}
                onChange={(e) => {
                  const g = e.target.value
                  const target = groups.find((x) => x.id === g)!
                  store.set((s) => ({
                    ...s,
                    personaGroup: { ...s.personaGroup, [p.id as PersonaId]: g },
                  }))
                  logActivity('Administration', 'Changed persona group', p.label, `${groups.find((x) => x.id === personaGroup[p.id])?.name} → ${target.name}`)
                }}
              >
                {groups.map((g) => {
                  const locksOut = p.id === persona && !LOCKOUT_PERMS.every((x) => g.permissions.includes(x))
                  return (
                    <option key={g.id} value={g.id} disabled={locksOut}>
                      {g.name}
                      {locksOut ? ' (no admin access)' : ''}
                    </option>
                  )
                })}
              </Select>
            </div>
          ))}
        </div>
        {canManage && <p className="mt-2 text-dense text-ink-muted">Your current persona can only be moved to a group that keeps administration access, so the demo cannot lock itself out.</p>}
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card
          bodyClass="p-2"
          title="Groups"
          actions={
            canManage && (
              <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>
                New
              </Button>
            )
          }
        >
          <ul role="listbox" aria-label="Permission groups" className="space-y-0.5">
            {groups.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={g.id === sel.id}
                  onClick={() => setSelId(g.id)}
                  className={cx('flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-body', g.id === sel.id ? 'bg-accent-soft text-accent-ink' : 'hover:bg-surface-muted')}
                >
                  <span className="min-w-0 truncate font-medium">{g.name}</span>
                  <span className="num shrink-0 text-label text-ink-subtle">
                    {g.permissions.length}/{ALL_PERMISSIONS.length}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title={
            <span className="inline-flex items-center gap-2">
              {sel.name}
              {sel.builtIn ? <Badge tone="none">Built-in</Badge> : <Badge tone="accent">Custom</Badge>}
              {modified && <Badge tone="warn">Modified</Badge>}
              {sel.id === activeGroupId && <Badge tone="info">Current persona</Badge>}
            </span>
          }
          subtitle={`${sel.description || 'No description'} · ${users.filter((u) => u.groupId === sel.id).length} user(s)`}
          actions={
            canManage && (
              <>
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setRenaming(true)}>
                  Rename
                </Button>
                {builtinDefault && (
                  <Button
                    size="sm"
                    icon={RotateCcw}
                    disabled={!modified}
                    onClick={() => {
                      setGroups((gs) => gs.map((g) => (g.id === sel.id ? { ...builtinDefault } : g)))
                      logActivity('Administration', 'Reset permission group to defaults', builtinDefault.name)
                    }}
                  >
                    Reset to defaults
                  </Button>
                )}
                {!sel.builtIn && (
                  <Button
                    size="sm"
                    variant="danger"
                    icon={Trash2}
                    disabled={inUse}
                    title={inUse ? 'Group is assigned to users or personas' : undefined}
                    onClick={() => {
                      setGroups((gs) => gs.filter((g) => g.id !== sel.id))
                      logActivity('Administration', 'Deleted permission group', sel.name)
                      setSelId(groups[0].id)
                    }}
                  >
                    Delete
                  </Button>
                )}
              </>
            )
          }
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {PERM_GROUPS.map((pg) => (
              <fieldset key={pg} className="rounded-md border border-line px-3 py-2">
                <legend className="px-1 text-label font-semibold text-ink-muted">{pg}</legend>
                <div className="space-y-1.5">
                  {ALL_PERMISSIONS.filter((p) => p.group === pg).map((p) => {
                    const locked = sel.id === activeGroupId && LOCKOUT_PERMS.includes(p.id) && sel.permissions.includes(p.id)
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-2">
                        <Check
                          label={p.label}
                          checked={sel.permissions.includes(p.id)}
                          disabled={!canManage || locked}
                          title={locked ? 'Kept on so the current persona cannot lock itself out of Administration' : undefined}
                          onChange={(on) => togglePerm(p.id, on)}
                        />
                        <span className="shrink-0 font-mono text-label text-ink-subtle">{p.id}</span>
                      </div>
                    )
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          {sel.id === activeGroupId && canManage && <p className="mt-3 text-dense text-ink-muted">Administration permissions stay on for the group your current persona uses, so you cannot lock yourself out mid-demo.</p>}
        </Card>
      </div>
      {creating && (
        <CreateGroupModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setSelId(id)
            setCreating(false)
          }}
        />
      )}
      {renaming && <RenameGroupModal group={sel} onClose={() => setRenaming(false)} />}
    </div>
  )
}

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const groups = useAppState((s) => s.groups)
  const [f, setF] = useState({
    name: '',
    description: '',
    cloneFrom: 'G-VIEWER',
  })
  const [err, setErr] = useState<Errors>({})
  const submit = () => {
    const e: Errors = {
      name: required(f.name, 'Group name') ?? (groups.some((g) => g.name.toLowerCase() === f.name.trim().toLowerCase()) ? 'A group with this name already exists.' : undefined),
    }
    setErr(e)
    if (hasErrors(e)) return
    const src = groups.find((g) => g.id === f.cloneFrom)
    const g: PermissionGroup = {
      id: `G-${Date.now().toString(36).toUpperCase()}`,
      name: f.name.trim(),
      description: f.description.trim(),
      builtIn: false,
      permissions: src ? [...src.permissions] : [],
    }
    setGroups((gs) => [...gs, g])
    logActivity('Administration', 'Created permission group', g.name, src ? `Cloned from ${src.name}` : 'Empty')
    onCreated(g.id)
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="New permission group"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="group-form" icon={Copy}>
            Create group
          </Button>
        </>
      }
    >
      <form
        id="group-form"
        noValidate
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Group name" error={err.name}>
          <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Regional planner – East" />
        </Field>
        <Field label="Description">
          <input className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="Start from (clone permissions)">
          <select className={inputCls} value={f.cloneFrom} onChange={(e) => setF({ ...f, cloneFrom: e.target.value })}>
            <option value="">No permissions</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  )
}

function RenameGroupModal({ group, onClose }: { group: PermissionGroup; onClose: () => void }) {
  const groups = useAppState((s) => s.groups)
  const [f, setF] = useState({
    name: group.name,
    description: group.description,
  })
  const [err, setErr] = useState<Errors>({})
  const submit = () => {
    const e: Errors = {
      name: required(f.name, 'Group name') ?? (groups.some((g) => g.id !== group.id && g.name.toLowerCase() === f.name.trim().toLowerCase()) ? 'A group with this name already exists.' : undefined),
    }
    setErr(e)
    if (hasErrors(e)) return
    setGroups((gs) => gs.map((g) => (g.id === group.id ? { ...g, name: f.name.trim(), description: f.description.trim() } : g)))
    logActivity('Administration', 'Renamed permission group', group.id, `${group.name} → ${f.name.trim()}`)
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Rename ${group.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="rename-form">
            Save
          </Button>
        </>
      }
    >
      <form
        id="rename-form"
        noValidate
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Group name" error={err.name}>
          <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Description">
          <input className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
      </form>
    </Modal>
  )
}

// ── Audit ──────────────────────────────────────────────────────────────────
function AuditTab() {
  const activity = useAppState((s) => s.activity)
  const [area, setArea] = useState('')
  const [q, setQ] = useState('')
  const areas = [...new Set(activity.map((a) => a.area))].sort()
  const rows = [...activity].sort((a, b) => b.at.localeCompare(a.at)).filter((a) => (!area || a.area === area) && (!q || `${a.by} ${a.action} ${a.target} ${a.detail ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  const pg = usePaged(rows)
  return (
    <div className="space-y-3">
      <LocalFilters>
        <Select label="Area" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">All areas</option>
          {areas.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </Select>
        <SearchBox className="w-[260px]" value={q} onChange={setQ} label="Search audit history" placeholder="Search user, action, record…" />
      </LocalFilters>
      <Card bodyClass="p-0" title="Audit history" subtitle="Every demo change recorded in this browser (exceptions, planning, uploads, master data, administration)">
        {rows.length === 0 ? (
          <EmptyState title="No activity matches">Clear the page filters to see all entries.</EmptyState>
        ) : (
          <>
            <TableWrap>
              <table className="w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className={th}>When</th>
                    <th className={th}>By</th>
                    <th className={th}>Area</th>
                    <th className={th}>Action</th>
                    <th className={th}>Record</th>
                    <th className={th}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  <ActivityRows entries={pg.slice} showArea />
                </tbody>
              </table>
            </TableWrap>
            <Pager page={pg.page} pages={pg.pages} onPage={pg.setPage} total={rows.length} label="entries" />
          </>
        )}
      </Card>
    </div>
  )
}
