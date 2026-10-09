// Global analysis filters: persisted locally, carried across navigation and drilldowns.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Unit } from '@/data/types'
import { DEMO_TODAY } from './dates'
import type { AnalysisFilters, HierarchySel } from './metrics'
import { useDataset } from './store'

const KEY = 'gcpl-p2p-filters-v1'
// Bumped when the default period changes, so saved sessions still on the old default move to the new one.
const DEFAULTS_KEY = 'gcpl-p2p-filter-defaults'
const DEFAULTS_VERSION = '2'
const PREVIOUS_DEFAULT = { dateFrom: '2026-10-01', dateTo: DEMO_TODAY }
export const DEFAULT_FILTERS: AnalysisFilters = {
  dateFrom: '2026-09-27',
  dateTo: DEMO_TODAY,
  vendorIds: [],
  hierarchy: null,
  search: '',
  unit: 'EA',
}

export type FilterKey = 'date' | 'vendor' | 'product' | 'unit'
export const ALL_FILTER_KEYS: FilterKey[] = ['date', 'vendor', 'product', 'unit']

interface FilterCtx {
  filters: AnalysisFilters
  setFilters: (patch: Partial<AnalysisFilters>) => void
  reset: () => void
  applicable: FilterKey[]
  setApplicable: (k: FilterKey[], note?: Partial<Record<FilterKey, string>>) => void
  notes: Partial<Record<FilterKey, string>>
}
const Ctx = createContext<FilterCtx | null>(null)

function load(): AnalysisFilters {
  try {
    const raw = localStorage.getItem(KEY)
    const saved: AnalysisFilters = raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : DEFAULT_FILTERS
    if (localStorage.getItem(DEFAULTS_KEY) === DEFAULTS_VERSION) return saved
    localStorage.setItem(DEFAULTS_KEY, DEFAULTS_VERSION)
    // Only the untouched old default period is replaced; custom ranges and other settings are kept.
    const onOldDefault = saved.dateFrom === PREVIOUS_DEFAULT.dateFrom && saved.dateTo === PREVIOUS_DEFAULT.dateTo
    return onOldDefault ? { ...saved, dateFrom: DEFAULT_FILTERS.dateFrom, dateTo: DEFAULT_FILTERS.dateTo } : saved
  } catch {
    return DEFAULT_FILTERS
  }
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setState] = useState<AnalysisFilters>(load)
  const [applicable, setApp] = useState<FilterKey[]>(ALL_FILTER_KEYS)
  const [notes, setNotes] = useState<Partial<Record<FilterKey, string>>>({})
  const location = useLocation()
  const navigate = useNavigate()
  const ds = useDataset()

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(filters))
    } catch {
      /* ignore */
    }
  }, [filters])

  const setFilters = useCallback((patch: Partial<AnalysisFilters>) => setState((f) => ({ ...f, ...patch })), [])
  const reset = useCallback(() => setState(DEFAULT_FILTERS), [])
  const setApplicable = useCallback((k: FilterKey[], note: Partial<Record<FilterKey, string>> = {}) => {
    setApp(k)
    setNotes(note)
  }, [])

  // Apply f_* overrides carried by drilldown links, then strip them from the URL.
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    const keys = [...p.keys()].filter((k) => k.startsWith('f_'))
    if (!keys.length) return
    const patch: Partial<AnalysisFilters> = {}
    const v = p.get('f_vendor')
    if (v) patch.vendorIds = v.split(',')
    const sku = p.get('f_sku')
    const dt = p.get('f_dt')
    if (sku) {
      const s = ds.idx.sku.get(sku)
      patch.hierarchy = {
        level: 'sku',
        id: sku,
        label: s ? `${s.name} (${s.code})` : sku,
      } satisfies HierarchySel
      patch.search = ''
    } else if (dt) {
      const d = ds.dts.find((x) => x.code === dt)
      patch.hierarchy = {
        level: 'dt',
        id: dt,
        label: d ? `${d.code} · ${d.name}` : dt,
      }
      patch.search = ''
    }
    const from = p.get('f_from')
    const to = p.get('f_to')
    if (from) patch.dateFrom = from
    if (to) patch.dateTo = to
    setState((f) => ({ ...f, ...patch }))
    keys.forEach((k) => p.delete(k))
    const q = p.toString()
    navigate({ pathname: location.pathname, search: q ? `?${q}` : '' }, { replace: true, state: location.state })
  }, [location.search, location.pathname, location.state, navigate, ds])

  const value = useMemo(() => ({ filters, setFilters, reset, applicable, setApplicable, notes }), [filters, setFilters, reset, applicable, setApplicable, notes])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useFilters() {
  const c = useContext(Ctx)
  if (!c) throw new Error('FilterProvider missing')
  return c
}

/** Pages declare which global filters apply to them; the bar disables the rest. */
export function usePageFilters(keys: FilterKey[], notes: Partial<Record<FilterKey, string>> = {}) {
  const { setApplicable } = useFilters()
  const sig = keys.join(',') + JSON.stringify(notes)
  useEffect(() => {
    setApplicable(keys, notes)
    return () => setApplicable(ALL_FILTER_KEYS, {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, setApplicable])
}

export function unitLabel(u: Unit) {
  return u === 'EA' ? 'EA' : u === 'CS' ? 'CS' : 'MT'
}

export function isDefaultFilters(f: AnalysisFilters) {
  return f.dateFrom === DEFAULT_FILTERS.dateFrom && f.dateTo === DEFAULT_FILTERS.dateTo && !f.vendorIds.length && !f.hierarchy && !f.search && f.unit === DEFAULT_FILTERS.unit
}
