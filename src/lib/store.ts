// Local demo persistence (localStorage). Prototype only – no server, no real security.
import { useMemo, useSyncExternalStore } from 'react'
import { baseMaster, buildDataset, type Dataset, type MasterTables } from '@/data/dataset'
import type { ActivityEntry, DemoUser, ExceptionComment, ExceptionItem, ExceptionStatus, Permission, PermissionGroup, PersonaId, PlanLine, PlanVersion, Severity, UploadBatch, VendorReport } from '@/data/types'
import { DEMO_NOW } from './dates'
import { SCENARIO, type DemoScenario } from '@/data/master'
import { detectExceptions } from './exceptions'

const KEY = 'gcpl-p2p-demo-v1'

export const ALL_PERMISSIONS: {
  id: Permission
  label: string
  group: string
}[] = [
  { id: 'view.overview', label: 'View overview', group: 'Analysis' },
  {
    id: 'view.controlTower',
    label: 'View control tower analysis',
    group: 'Analysis',
  },
  { id: 'export.data', label: 'Export tables (CSV)', group: 'Analysis' },
  { id: 'assistant.use', label: 'Use demo assistant', group: 'Analysis' },
  { id: 'view.planning', label: 'View production plans', group: 'Planning' },
  {
    id: 'plan.upload',
    label: 'Upload / activate plan versions',
    group: 'Planning',
  },
  { id: 'view.exceptions', label: 'View exceptions', group: 'Exceptions' },
  {
    id: 'exceptions.edit',
    label: 'Update exceptions (status, owner, comments)',
    group: 'Exceptions',
  },
  {
    id: 'view.dataOps',
    label: 'View reports, data quality, upload history',
    group: 'Data operations',
  },
  {
    id: 'reports.upload',
    label: 'Upload vendor reports manually',
    group: 'Data operations',
  },
  { id: 'view.masterData', label: 'View master data', group: 'Master data' },
  {
    id: 'masterData.edit',
    label: 'Maintain master data',
    group: 'Master data',
  },
  { id: 'view.admin', label: 'View administration', group: 'Administration' },
  {
    id: 'admin.manage',
    label: 'Manage users & permission groups',
    group: 'Administration',
  },
]

const ALL = ALL_PERMISSIONS.map((p) => p.id)
export const DEFAULT_GROUPS: PermissionGroup[] = [
  {
    id: 'G-PLANNER',
    name: 'Supply Planner',
    description: 'Analyses plan vs actual, manages exceptions, uploads plans.',
    builtIn: true,
    permissions: ['view.overview', 'view.controlTower', 'export.data', 'assistant.use', 'view.planning', 'plan.upload', 'view.exceptions', 'exceptions.edit', 'view.dataOps', 'view.masterData'],
  },
  {
    id: 'G-OPERATOR',
    name: 'Data Operator',
    description: 'Monitors inbox ingestion, uploads reports, fixes data quality.',
    builtIn: true,
    permissions: ['view.overview', 'view.dataOps', 'reports.upload', 'view.exceptions', 'exceptions.edit', 'view.masterData', 'masterData.edit', 'view.planning', 'assistant.use'],
  },
  {
    id: 'G-ADMIN',
    name: 'Admin',
    description: 'Full access including users and permission groups.',
    builtIn: true,
    permissions: ALL,
  },
  {
    id: 'G-VIEWER',
    name: 'Viewer',
    description: 'Read-only access to analysis and exceptions.',
    builtIn: true,
    permissions: ['view.overview', 'view.controlTower', 'view.planning', 'view.exceptions', 'assistant.use'],
  },
]

export const PERSONAS: { id: PersonaId; label: string; user: string }[] = [
  { id: 'planner', label: 'Supply Planner', user: 'Ananya Rao' },
  { id: 'operator', label: 'Data Operator', user: 'Rohit Kulkarni' },
  { id: 'admin', label: 'Admin', user: 'Farah Siddiqui' },
  { id: 'viewer', label: 'Viewer', user: 'Vikram Shah' },
]

const DEFAULT_USERS: DemoUser[] = [
  {
    id: 'U-1',
    name: 'Ananya Rao',
    email: 'ananya.rao@example.com',
    groupId: 'G-PLANNER',
    status: 'Active',
    invitedAt: null,
    vendorScope: [],
  },
  {
    id: 'U-2',
    name: 'Meera Iyer',
    email: 'meera.iyer@example.com',
    groupId: 'G-PLANNER',
    status: 'Active',
    invitedAt: null,
    vendorScope: ['V-VAN', 'V-PAY'],
  },
  {
    id: 'U-3',
    name: 'Rohit Kulkarni',
    email: 'rohit.k@example.com',
    groupId: 'G-OPERATOR',
    status: 'Active',
    invitedAt: null,
    vendorScope: [],
  },
  {
    id: 'U-4',
    name: 'Farah Siddiqui',
    email: 'farah.s@example.com',
    groupId: 'G-ADMIN',
    status: 'Active',
    invitedAt: null,
    vendorScope: [],
  },
  {
    id: 'U-5',
    name: 'Vikram Shah',
    email: 'vikram.shah@example.com',
    groupId: 'G-VIEWER',
    status: 'Active',
    invitedAt: null,
    vendorScope: [],
  },
  {
    id: 'U-6',
    name: 'Karthik Menon',
    email: 'karthik.m@example.com',
    groupId: 'G-PLANNER',
    status: 'Invited',
    invitedAt: '2026-10-07T12:00:00+05:30',
    vendorScope: ['V-RKPL'],
  },
]

export interface ExceptionOverride {
  status?: ExceptionStatus
  owner?: string | null
  dueDate?: string | null
  severity?: Severity
}

export interface AppState {
  version: 1
  persona: PersonaId
  personaGroup: Record<PersonaId, string>
  groups: PermissionGroup[]
  users: DemoUser[]
  exceptionOverrides: Record<string, ExceptionOverride>
  comments: ExceptionComment[]
  activity: ActivityEntry[]
  /** Demo dataset scenario the persisted master/edits belong to */
  scenario?: DemoScenario
  master: MasterTables
  extraPlanVersions: PlanVersion[]
  extraPlanLines: PlanLine[]
  activePlan: Record<string, string>
  extraBatches: UploadBatch[]
  extraReports: VendorReport[]
  sidebarCollapsed: boolean
  assistantOpen: boolean
}

const SEED_ACTIVITY: ActivityEntry[] = [
  {
    id: 'A-1',
    at: '2026-10-08T17:42:00+05:30',
    by: 'Ananya Rao',
    area: 'Exceptions',
    action: 'Status changed to Investigating',
    target: 'EX-PERF-BELOW-SAI01-FG1004011',
  },
  {
    id: 'A-2',
    at: '2026-10-08T09:15:00+05:30',
    by: 'Rohit Kulkarni',
    area: 'Exceptions',
    action: 'Status changed to Waiting on vendor',
    target: 'EX-DQ-STALE-RKP03-Production',
    detail: 'Emailed RKPL PPC team (demo – no email sent)',
  },
  {
    id: 'A-3',
    at: '2026-10-05T11:20:00+05:30',
    by: 'Ananya Rao',
    area: 'Planning',
    action: 'Uploaded correction plan v2',
    target: 'PV-SAI-202610-v2',
  },
  {
    id: 'A-4',
    at: '2026-10-07T12:00:00+05:30',
    by: 'Farah Siddiqui',
    area: 'Administration',
    action: 'Invited user',
    target: 'karthik.m@example.com',
  },
  {
    id: 'A-5',
    at: '2026-09-30T16:05:00+05:30',
    by: 'Farah Siddiqui',
    area: 'Master data',
    action: 'Added calendar exception',
    target: 'CE-1 · 2 Oct · Gandhi Jayanti',
  },
]
const SEED_COMMENTS: ExceptionComment[] = [
  {
    id: 'C-1',
    exceptionId: 'EX-PERF-BELOW-SAI01-FG1004011',
    at: '2026-10-08T17:40:00+05:30',
    by: 'Ananya Rao',
    text: 'Shortfall visible since 1 Oct. Asked Sai for line-wise downtime log. Correction plan v2 already lifts volume from 12 Oct.',
  },
  {
    id: 'C-2',
    exceptionId: 'EX-DQ-STALE-RKP03-Production',
    at: '2026-10-08T09:16:00+05:30',
    by: 'Rohit Kulkarni',
    text: 'No emails from ppc@rkpl since 7 Oct morning. Followed up by phone.',
  },
]

function defaultState(): AppState {
  return {
    version: 1,
    persona: 'planner',
    personaGroup: {
      planner: 'G-PLANNER',
      operator: 'G-OPERATOR',
      admin: 'G-ADMIN',
      viewer: 'G-VIEWER',
    },
    groups: DEFAULT_GROUPS,
    users: DEFAULT_USERS,
    exceptionOverrides: {},
    comments: SEED_COMMENTS,
    activity: SEED_ACTIVITY,
    scenario: SCENARIO,
    master: baseMaster,
    extraPlanVersions: [],
    extraPlanLines: [],
    activePlan: {},
    extraBatches: [],
    extraReports: [],
    sidebarCollapsed: false,
    assistantOpen: false,
  }
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as AppState
    if (parsed.version !== 1) return defaultState()
    const merged = { ...defaultState(), ...parsed }
    // Switching demo scenario: persisted master/edits belong to the other dataset → start that data fresh
    if ((parsed.scenario ?? 'core') !== SCENARIO) {
      const d = defaultState()
      return { ...merged, scenario: SCENARIO, master: d.master, extraPlanVersions: [], extraPlanLines: [], activePlan: {}, extraBatches: [], extraReports: [] }
    }
    // Add newly introduced demo vendors without resetting existing edits or uploads.
    const existingVendorIds = new Set(merged.master.vendors.map((v) => v.id))
    const addedVendors = baseMaster.vendors.filter((v) => !existingVendorIds.has(v.id))
    const addedVendorIds = new Set(addedVendors.map((v) => v.id))
    merged.master = {
      ...merged.master,
      vendors: [...merged.master.vendors, ...addedVendors],
      vendorSkuMaps: [...merged.master.vendorSkuMaps, ...baseMaster.vendorSkuMaps.filter((m) => addedVendorIds.has(m.vendorId))],
    }
    return merged
  } catch {
    return defaultState()
  }
}

let state: AppState = load()
const listeners = new Set<() => void>()

function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* storage unavailable – demo continues in memory */
  }
  listeners.forEach((l) => l())
}

export const store = {
  get: () => state,
  set(updater: (s: AppState) => AppState) {
    state = updater(state)
    emit()
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  reset() {
    state = defaultState()
    emit()
  },
}

let actSeq = 0
export function currentUserName(s: AppState = state): string {
  return PERSONAS.find((p) => p.id === s.persona)?.user ?? 'Demo user'
}
/** Demo clock: fixed date with an advancing minute so activity ordering is stable. */
export function demoNow(): string {
  const d = new Date()
  return `${DEMO_NOW.slice(0, 11)}${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}+05:30`
}
export function logActivity(area: string, action: string, target: string, detail?: string) {
  store.set((s) => ({
    ...s,
    activity: [
      {
        id: `A-${Date.now()}-${++actSeq}`,
        at: demoNow(),
        by: currentUserName(s),
        area,
        action,
        target,
        detail,
      },
      ...s.activity,
    ],
  }))
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()))
}

// Dataset is memoised on the slices that affect it
let dsCache: { key: unknown[]; ds: Dataset } | null = null
export function getDataset(s: AppState = state): Dataset {
  const key = [s.master, s.extraPlanVersions, s.extraPlanLines, s.activePlan, s.extraBatches, s.extraReports]
  if (dsCache && dsCache.key.every((k, i) => k === key[i])) return dsCache.ds
  const ds = buildDataset({
    master: s.master,
    extraPlanVersions: s.extraPlanVersions,
    extraPlanLines: s.extraPlanLines,
    activePlan: s.activePlan,
    extraBatches: s.extraBatches,
    extraReports: s.extraReports,
  })
  dsCache = { key, ds }
  return ds
}
export function useDataset(): Dataset {
  return useAppState(getDataset)
}

let exCache: { ds: Dataset; list: ExceptionItem[] } | null = null
function baseExceptions(ds: Dataset) {
  if (exCache?.ds === ds) return exCache.list
  exCache = { ds, list: detectExceptions(ds) }
  return exCache.list
}
/** Detected exceptions with locally persisted edits applied. */
export function useExceptions(): ExceptionItem[] {
  const ds = useDataset()
  const overrides = useAppState((s) => s.exceptionOverrides)
  return useMemo(() => baseExceptions(ds).map((e) => ({ ...e, ...overrides[e.id] })), [ds, overrides])
}

export function usePermissions() {
  const persona = useAppState((s) => s.persona)
  const groupId = useAppState((s) => s.personaGroup[s.persona])
  const groups = useAppState((s) => s.groups)
  const group = groups.find((g) => g.id === groupId) ?? groups[0]
  const can = (p: Permission) => group.permissions.includes(p)
  return {
    persona,
    group,
    can,
    user: PERSONAS.find((p) => p.id === persona)!.user,
  }
}

export const OWNERS = ['Ananya Rao', 'Meera Iyer', 'Rohit Kulkarni', 'Karthik Menon', 'Farah Siddiqui']
