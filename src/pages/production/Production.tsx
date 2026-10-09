import { AlertTriangle, ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, Grid3x3, Rows3, SearchCode, SearchX } from 'lucide-react'
import { startTransition, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CELL_META, CellStatusBadge, LegendSwatch, NotComparedLine, StatusLegend } from '@/components/status'
import {
  Button,
  Callout,
  Card,
  DensityControl,
  Disclosure,
  HelpTip,
  EmptyState,
  ExportButton,
  IconButton,
  Kpi,
  PageHeader,
  Segmented,
  TableWrap,
  cx,
  downloadCsv,
  td,
  tdNum,
  th,
  useDensity,
  useOriginState,
  type OriginState,
} from '@/components/ui'
import type { Dataset } from '@/data/dataset'
import type { Unit } from '@/data/types'
import { eachDay, fmtDate, fmtMonth, fmtRange, LATEST_DUE_DATE, monthOf } from '@/lib/dates'
import { useFilters, usePageFilters } from '@/lib/filters'
import { fmtNum, fmtPct, fmtQty, fmtSigned, shortSkuName } from '@/lib/format'
import { cellsFor, coverageSummary, monthlyPlanRows, runRate, scopePairs, STATUS_ORDER, thresholds, type CellStatus } from '@/lib/metrics'
import { useDataset, usePermissions } from '@/lib/store'
import { convertFg } from '@/lib/units'
import { CellDrawer, type DrawerTarget } from './CellDrawer'
import { buildColumns, buildTree, dayRangeLabel, DRILL_LEVELS, LEVEL_LABEL, type Column, type DrillLevel, type GridCell, type TreeRow } from './model'

type View = 'heatmap' | 'table'
type Grain = 'day' | 'week'
type Metric = 'plan' | 'actual' | 'att'
const METRIC_LABEL: Record<Metric, string> = { plan: 'Comparable plan', actual: 'Comparable actual', att: 'Attainment' }

// Primary values are always on the comparable basis (days with both a daily plan and a valid report):
// attainment = comparable actual ÷ comparable plan, gap = comparable actual − comparable plan.
// Everything outside that basis is flagged with a marker and itemised in the cell drawer.

function cellText(g: GridCell): string {
  const m = CELL_META[g.status]
  if (g.status === 'zero') return '0%'
  if (g.agg.attainment != null) return `${fmtPct(g.agg.attainment)}${m.glyph ? ` ${m.glyph}` : ''}`
  return m.short
}

const textTone = (s: GridCell['status']) =>
  CELL_META[s].cell
    .split(' ')
    .filter((c) => c.startsWith('text-'))
    .join(' ')

const hasComparable = (g: GridCell) => g.agg.planComparable > 0

/** Why part of the plan sits outside the comparable basis. */
function planExclusion(g: GridCell, unit: Unit): string | null {
  return g.agg.planUnreported > 0 ? `${fmtQty(g.agg.planUnreported, unit)} ${unit} scheduled plan excluded – report missing` : null
}
/** Why part of the reported actual sits outside the comparable basis. */
function actualExclusion(g: GridCell, unit: Unit): string | null {
  const a = g.agg
  const parts = [
    a.actualMonthly > 0 && `${fmtQty(a.actualMonthly, unit)} against a monthly plan`,
    a.actualNoPlan > 0 && `${fmtQty(a.actualNoPlan, unit)} with no applicable daily plan`,
    a.actualNonOp > 0 && `${fmtQty(a.actualNonOp, unit)} on non-operating days`,
  ].filter(Boolean)
  return parts.length ? `${fmtQty(a.actualUnplanned, unit)} ${unit} reported but not compared: ${parts.join(', ')}` : null
}

/** Small marker for quantities outside the comparable basis; the explanation is in the title and for screen readers. */
function ExclMark({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <span title={text} className="ml-1 inline-flex align-middle">
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-info" />
      <span className="sr-only">({text})</span>
    </span>
  )
}

const Muted = ({ children, title }: { children: ReactNode; title?: string }) => (
  <span className="text-ink-subtle" title={title}>
    {children}
  </span>
)

/** KPI disclosure body: definition plus the supporting quantities moved off the card. */
function KpiHelp({ text, rows = [] }: { text: string; rows?: [string, string][] }) {
  return (
    <>
      <span className="block">{text}</span>
      {rows.length > 0 && (
        <span className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-t border-line pt-2">
          {rows.map(([k, v]) => (
            <span key={k} className="contents">
              <span className="text-ink-muted">{k}</span>
              <span className="num text-right font-medium whitespace-nowrap">{v}</span>
            </span>
          ))}
        </span>
      )}
    </>
  )
}

const MissingChip = () => <span className="rounded-[3px] border border-dashed border-line-strong px-1 text-ink-muted">Report missing</span>

/** Comparable plan for any cell (day, week, group or total). */
function PlanValue({ g, unit }: { g: GridCell; unit: Unit }) {
  if (!g.cells.length) return <Muted>·</Muted>
  const excl = planExclusion(g, unit)
  if (hasComparable(g))
    return (
      <>
        {fmtQty(g.agg.planComparable, unit)}
        <ExclMark text={excl} />
      </>
    )
  let v: ReactNode
  if (g.status === 'monthly') v = <span className="text-info">Monthly plan</span>
  else if (g.status === 'future') v = <Muted title={`${fmtQty(g.agg.planFuture, unit)} ${unit} scheduled – not yet due`}>Not due</Muted>
  else if (g.status === 'nonOp') v = <Muted title="Non-operating day">Off</Muted>
  else if (g.status === 'noPlan') v = <Muted title={CELL_META.noPlan.description}>No plan</Muted>
  else v = <Muted>—</Muted>
  return (
    <>
      {v}
      <ExclMark text={excl} />
    </>
  )
}

/** Comparable actual. A missing report is “Report missing”, never 0. */
function ActualValue({ g, unit }: { g: GridCell; unit: Unit }) {
  if (!g.cells.length) return <Muted>·</Muted>
  const excl = actualExclusion(g, unit)
  let v: ReactNode
  if (hasComparable(g)) {
    v =
      g.status === 'zero' ? (
        <span className="font-semibold text-bad" title="Reported zero against a daily plan">
          0
        </span>
      ) : (
        <span className="font-medium text-ink">{fmtQty(g.agg.actualComparable, unit)}</span>
      )
  } else if (g.status === 'missing') v = <MissingChip />
  else if (g.status === 'monthly' || g.status === 'noPlan') v = <Muted title="Reported production is not compared with a daily target">Not compared</Muted>
  else v = <Muted>—</Muted>
  return (
    <>
      {v}
      <ExclMark text={excl} />
    </>
  )
}

/** Attainment on the comparable basis; N/A whenever there is no comparable plan. */
function AttText({ g }: { g: GridCell }) {
  if (!g.cells.length) return <Muted>·</Muted>
  if (g.agg.attainment != null) return <span className={cx('font-semibold', textTone(g.status))}>{cellText(g)}</span>
  if (g.status === 'monthly') return <span className="text-info">Daily N/A</span>
  if (g.status === 'nonOp') return <Muted>Off</Muted>
  if (g.status === 'future') return <Muted>Not due</Muted>
  return <Muted title="No comparable plan">N/A</Muted>
}

function MetricValue({ metric, g, unit }: { metric: Metric; g: GridCell; unit: Unit }) {
  return metric === 'plan' ? <PlanValue g={g} unit={unit} /> : metric === 'actual' ? <ActualValue g={g} unit={unit} /> : <AttText g={g} />
}

function describe(g: GridCell, unit: Unit) {
  const a = g.agg
  const m = CELL_META[g.status]
  const att = a.attainment != null ? `attainment ${fmtPct(a.attainment)}` : 'attainment N/A'
  return hasComparable(g) ? `comparable plan ${fmtQty(a.planComparable, unit)}, comparable actual ${fmtQty(a.actualComparable, unit)}, ${att}` : m.label
}

function HeatCell({ g, onOpen, label }: { g: GridCell; onOpen: () => void; label: string }) {
  if (!g.cells.length)
    return (
      <span className="block text-center text-label text-ink-subtle" style={{ height: 'var(--heat-h)', lineHeight: 'var(--heat-h)' }}>
        ·
      </span>
    )
  const m = CELL_META[g.status]
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}: ${m.label}${g.agg.attainment != null ? `, attainment ${fmtPct(g.agg.attainment)}` : ''}. Open details`}
      title={m.label}
      style={{ height: 'var(--heat-h)' }}
      className={cx('num flex w-full items-center justify-center rounded-[3px] text-label font-medium whitespace-nowrap outline-offset-1 hover:ring-2 hover:ring-accent/40 focus-visible:outline-2 focus-visible:outline-accent', m.cell)}
    >
      {g.status === 'monthly' ? 'Mthly' : cellText(g)}
    </button>
  )
}

/** Heatmap period total: comparable plan, comparable actual, attainment – the KPI basis. */
function TotalCell({ g, unit, onOpen, label }: { g: GridCell; unit: Unit; onOpen: () => void; label: string }) {
  return (
    <button type="button" onClick={onOpen} className={cx('grid w-full items-center gap-3 rounded text-right text-dense hover:bg-accent-soft/60', TOTAL_GRID)} aria-label={`${label}, period total: ${describe(g, unit)}. Open details`}>
      {g.status === 'monthly' ? (
        // Monthly-plan rows have no daily comparison: one label across the three sub-columns instead of three clipped ones.
        <span className="col-span-3 text-info" title="Monthly plan – actual is not compared with a daily target; daily attainment N/A">
          Monthly plan · not compared
        </span>
      ) : (
        <>
          <span className="num text-ink-muted">
            <PlanValue g={g} unit={unit} />
          </span>
          <span className="num">
            <ActualValue g={g} unit={unit} />
          </span>
          <span className="num">
            <AttText g={g} />
          </span>
        </>
      )}
    </button>
  )
}

const CHILD_NOUN: Record<DrillLevel, [string, string]> = {
  vendor: ['vendor', 'vendors'],
  category: ['category', 'categories'],
  brand: ['brand', 'brands'],
  productLine: ['product line', 'product lines'],
  sku: ['SKU', 'SKUs'],
}
const childCountText = (r: TreeRow) => (r.childLevel ? `${r.childCount} ${CHILD_NOUN[r.childLevel][r.childCount === 1 ? 0 : 1]}` : '')

const INDENT = 12

/** What "Back to all vendors" restores; kept for this browser session only. */
interface ReturnState {
  focus: string
  prev: string[]
  open: string
  idx: number | null
  mainTop: number
  gridTop: number
  gridLeft: number
}
const RETURN_KEY = 'gcpl-p2p-production-return'
function writeReturn(rec: ReturnState) {
  try {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify(rec))
  } catch {
    /* storage unavailable: Back still works, without scroll restoration */
  }
}
function readReturn(focus: string | null): ReturnState | null {
  try {
    const rec = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? 'null') as ReturnState | null
    return rec && rec.focus === focus ? rec : null
  } catch {
    return null
  }
}
/** Legend items shown inline; the complete legend lives in “Legend & definitions”. */
const COMMON_LEGEND: CellStatus[] = ['below', 'within', 'above', 'zero', 'missing', 'monthly', 'future']

/** Labelled toolbar section; the visible label only appears where there is room. */
function ToolGroup({ label, short, first, children }: { label: string; short: string; first?: boolean; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={cx('flex items-center gap-1.5', first ? 'pr-2.5' : 'border-l border-line px-2.5', 'last:pr-0')}>
      <span aria-hidden className="hidden text-label text-ink-subtle min-[1400px]:inline">
        {short}
      </span>
      {children}
    </div>
  )
}
/** SKU row action (Investigate): overlays the row end on hover or keyboard focus, so it never takes name width. */
const ROW_ACTION =
  'absolute top-1/2 right-0 grid h-6 -translate-y-1/2 place-items-center rounded text-accent-ink opacity-0 shadow-[-6px_0_6px_-2px_var(--color-surface)] group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-accent-soft focus-visible:opacity-100 [@media(hover:none)]:static [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100'
/** Heatmap period-total sub-columns: comparable plan, comparable actual, attainment (expand for long values). */
const TOTAL_GRID = 'grid-cols-[minmax(74px,auto)_minmax(74px,auto)_minmax(50px,auto)] whitespace-nowrap'
const VENDOR_BG = 'bg-[#f7f7f8]'
const rowBg = (r: TreeRow) => (r.depth === 0 ? VENDOR_BG : 'bg-surface')
/** Group separators: vendor groups get a stronger rule than child groups. */
const groupTop = (r: TreeRow, i: number) => (i === 0 ? '' : r.depth === 0 ? 'border-t border-t-line-strong' : 'border-t border-t-line')

/** Identifying cell: one line with guides, chevron, name and child count; row actions appear on hover/focus. */
function EntityCell({ r, onToggle, onViewVendor, focused, origin, periodAtt }: { r: TreeRow; onToggle: () => void; onViewVendor: () => void; focused: boolean; origin: OriginState; periodAtt?: ReactNode }) {
  const name = r.level === 'sku' ? shortSkuName(r.label) : r.label
  const count = childCountText(r)
  return (
    <>
      {Array.from({ length: r.depth }, (_, i) => (
        <span key={i} aria-hidden className="absolute top-0 bottom-0 w-px bg-line" style={{ left: 18 + i * INDENT }} />
      ))}
      <div className="relative flex items-center gap-0.5" style={{ paddingLeft: r.depth * INDENT }}>
        {r.expandable ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={r.expanded}
            aria-label={`${r.expanded ? 'Collapse' : 'Expand'} ${LEVEL_LABEL[r.level].toLowerCase()} ${r.label} (${count})`}
            className="-ml-1 grid h-6 w-6 shrink-0 place-items-center rounded text-ink-muted hover:bg-black/5 hover:text-ink"
          >
            <ChevronRight size={14} aria-hidden className={cx('transition-transform', r.expanded && 'rotate-90')} />
          </button>
        ) : (
          <span className="-ml-1 w-6 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className={cx('min-w-0 truncate leading-4', r.depth === 0 ? 'text-body font-semibold text-ink' : 'text-dense text-ink')} title={r.level === 'sku' ? `${r.label} · ${r.id}` : `${LEVEL_LABEL[r.level]}: ${r.label}`}>
              {name}
            </span>
            {r.expandable && (
              <span className="shrink-0 text-label whitespace-nowrap text-ink-subtle" title={count}>
                {r.childCount}
                <span className="sr-only"> {CHILD_NOUN[r.childLevel!][r.childCount === 1 ? 0 : 1]}</span>
              </span>
            )}
          </div>
          {(r.level === 'sku' || r.monthlyOnly) && (
            <div className="truncate text-label leading-4">
              {r.level === 'sku' && <span className="text-ink-subtle">{r.id}</span>}
              {r.level === 'sku' && r.monthlyOnly && <span className="text-ink-subtle"> · </span>}
              {r.monthlyOnly && <span className="text-info">Monthly plan</span>}
            </div>
          )}
        </div>
        {periodAtt}
        {r.level === 'vendor' && !focused && (
          // Persistent subtle icon; the "View vendor" label slides out over the name end on hover / keyboard focus.
          <button
            type="button"
            onClick={onViewVendor}
            aria-label={`View ${r.label} production`}
            title="View vendor – applies the vendor filter across pages"
            className="group/va relative grid h-6 w-6 shrink-0 place-items-center rounded-r text-ink-subtle outline-offset-0 group-hover:text-accent-ink hover:bg-accent-soft hover:text-accent-ink focus-visible:bg-accent-soft focus-visible:text-accent-ink [@media(hover:none)]:h-8 [@media(hover:none)]:w-8 [@media(hover:none)]:text-accent-ink"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 right-full hidden h-full items-center rounded-l bg-accent-soft pr-0.5 pl-1.5 text-label font-medium whitespace-nowrap text-accent-ink shadow-[-6px_0_6px_-2px_var(--color-surface)] group-hover/va:flex group-focus-visible/va:flex"
            >
              View vendor
            </span>
            <ArrowUpRight size={14} aria-hidden />
          </button>
        )}
        {r.level === 'sku' && (
          <Link to={`/sku/${r.id}`} state={origin} aria-label={`Investigate SKU ${r.label}`} title="Investigate SKU" className={cx(ROW_ACTION, rowBg(r), 'w-6')}>
            <SearchCode size={14} aria-hidden />
          </Link>
        )}
      </div>
    </>
  )
}

/** Compact period attainment beside the entity name (Table view with attainment rows hidden). */
function PeriodAttBadge({ g, onOpen, label }: { g: GridCell; onOpen: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Period attainment (comparable basis)"
      aria-label={`${label}, period attainment: ${g.agg.attainment != null ? fmtPct(g.agg.attainment) : 'N/A'}. Open details`}
      className="num shrink-0 rounded px-1 text-dense hover:bg-accent-soft"
    >
      <AttText g={g} />
    </button>
  )
}

/** Horizontal scroll state of the grid, for the scroll buttons. */
function useHScroll() {
  const ref = useRef<HTMLDivElement>(null)
  const [s, setS] = useState({ left: false, right: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const left = el.scrollLeft > 2
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
      setS((p) => (p.left === left && p.right === right ? p : { left, right }))
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  })
  const by = (dx: number) => ref.current?.scrollBy({ left: dx, behavior: 'smooth' })
  return [ref, s.left, s.right, by] as const
}

const ENTITY_W = 'w-[208px] min-w-[208px] max-w-[208px]'
const METRIC_W = 'w-[118px] min-w-[118px]'
const METRIC_LEFT = 'left-[208px]'

/** Width of an element (for offsets that follow content-sized sticky columns). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.offsetWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Grid height that fills the viewport below its own top edge (single internal scroll area). */
function useFillHeight(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null)
  const [h, setH] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const main = el.closest('main')
    const update = () => {
      const top = el.getBoundingClientRect().top + (main?.scrollTop ?? 0) - (main?.getBoundingClientRect().top ?? 0)
      const legend = (el.parentElement?.nextElementSibling as HTMLElement | null)?.offsetHeight ?? 36
      const avail = (main?.clientHeight ?? window.innerHeight) - top - legend - 18 // legend row + bottom padding
      setH(Math.max(320, Math.round(avail)))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [dep])
  return [ref, h] as const
}

export default function Production() {
  usePageFilters(['date', 'vendor', 'product', 'unit'])
  const ds = useDataset()
  const { filters, setFilters, reset } = useFilters()
  const { can } = usePermissions()
  const [sp, setSp] = useSearchParams()
  const origin = useOriginState('Production analysis')
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null)
  const view = (sp.get('view') as View) ?? 'heatmap'
  const grain = (sp.get('grain') as Grain) ?? 'day'
  const unit = filters.unit
  const openParam = sp.get('open') ?? ''
  const expanded = useMemo(() => new Set(openParam ? openParam.split(',') : []), [openParam])
  const showAtt = sp.get('att') === '1'
  const metrics: Metric[] = showAtt ? ['plan', 'actual', 'att'] : ['plan', 'actual']
  const [scrollRef, canScrollLeft, canScrollRight, scrollByX] = useHScroll()
  const [totalRef, totalW_px] = useWidth<HTMLTableCellElement>()
  const density = useDensity()
  const [fillRef, fillH] = useFillHeight(`${view}|${grain}|${unit}|${density}|${filters.vendorIds.join()}`)

  const setParam = (patch: Record<string, string | null>, replace = true) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k)
      else next.set(k, v)
    }
    setSp(next, { replace, state: undefined })
  }

  // KPI scope = global filters only. Inline expansion never narrows it.
  const pairs = useMemo(() => scopePairs(ds, filters), [ds, filters])
  const columns = useMemo(() => buildColumns(filters.dateFrom, filters.dateTo, grain), [filters.dateFrom, filters.dateTo, grain])
  const cells = useMemo(() => cellsFor(ds, pairs, filters.dateFrom, filters.dateTo), [ds, pairs, filters.dateFrom, filters.dateTo])
  const tree = useMemo(() => buildTree(ds, pairs, cells, columns, unit, expanded), [ds, pairs, cells, columns, unit, expanded])
  const rr = useMemo(() => runRate(ds, pairs, unit, monthOf(LATEST_DUE_DATE)), [ds, pairs, unit])
  const months = useMemo(() => [...new Set(eachDay(filters.dateFrom, filters.dateTo).map(monthOf))], [filters.dateFrom, filters.dateTo])
  const monthly = useMemo(() => months.flatMap((m) => monthlyPlanRows(ds, pairs, m)), [ds, pairs, months])
  const t = thresholds(ds)
  // Missing / stale production reports for vendors in scope – kept visible above the grid.
  const cov = useMemo(() => {
    const vendors = [...new Map(pairs.map((p) => [p.vendor.id, p.vendor])).values()]
    return coverageSummary(ds, vendors, ['Production'])
  }, [ds, pairs])
  const covTitle = cov.rows
    .filter((r) => r.freshness !== 'Current')
    .map((r) => `${r.vendor.name}: ${r.freshness}`)
    .join('\n')
  // Development-only integrity check (totals are computed from records, never from visible rows).
  useEffect(() => {
    if (import.meta.env.DEV && !tree.reconciles) console.error('[production] vendor, child and column totals do not reconcile with the period total')
  }, [tree.reconciles])
  const g = tree.grand.agg
  const period = fmtRange(filters.dateFrom, filters.dateTo)

  // Vendor view = the shared (global) vendor filter set to one vendor. "View vendor" pushes a history entry, so
  // browser Back and "Back to all vendors" both return to the previous entry with its filters, expanded rows and scroll.
  const navigate = useNavigate()
  const focusedVendor = filters.vendorIds.length === 1 ? ds.idx.vendor.get(filters.vendorIds[0]) : undefined
  const focusParam = sp.get('focus')
  const canReturn = focusParam != null && focusedVendor?.id === focusParam && sp.has('prev')
  const prevIds = (sp.get('prev') ?? '').split(',').filter(Boolean)
  const prevLabel = prevIds.length === 0 ? 'all vendors' : prevIds.length === 1 ? (ds.idx.vendor.get(prevIds[0])?.name ?? '1 vendor') : `${prevIds.length} vendors`
  // Last vendor view this page entered. Set synchronously by "View vendor", since the URL commits as a transition after the filter change.
  const lastFocus = useRef(focusParam)
  const viewVendor = (id: string) => {
    const main = document.querySelector('main')
    const rec: ReturnState = {
      focus: id,
      prev: filters.vendorIds,
      open: openParam,
      idx: (window.history.state as { idx?: number } | null)?.idx ?? null,
      mainTop: main?.scrollTop ?? 0,
      gridTop: scrollRef.current?.scrollTop ?? 0,
      gridLeft: scrollRef.current?.scrollLeft ?? 0,
    }
    writeReturn(rec)
    // `prev` may be empty (= all vendors), so it is set directly. The vendor's immediate child level opens; deeper levels stay collapsed.
    const next = new URLSearchParams(sp)
    next.set('focus', id)
    next.set('prev', filters.vendorIds.join(','))
    next.set('open', id)
    lastFocus.current = id
    // One transition, so the URL (back link, expanded rows) and the vendor filter (KPIs, header) commit together.
    startTransition(() => {
      setSp(next, { state: undefined })
      setFilters({ vendorIds: [id] })
    })
    main?.scrollTo({ top: 0 })
  }
  const restoreScroll = (rec: ReturnState | null) => {
    if (!rec) return
    // Two frames: filters → tree → fill-height re-render before the saved offsets fit again.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document.querySelector('main')?.scrollTo({ top: rec.mainTop })
        scrollRef.current?.scrollTo({ top: rec.gridTop, left: rec.gridLeft })
      }),
    )
  }
  const returnToScope = () => {
    const rec = readReturn(focusParam)
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (rec && rec.idx != null && idx === rec.idx + 1) {
      navigate(-1) // the effect below restores filters and scroll, exactly as browser Back does
      return
    }
    // Opened directly (no previous entry from this page): restore what was saved, if anything.
    lastFocus.current = null
    setFilters({ vendorIds: rec?.prev ?? prevIds })
    setParam({ focus: null, prev: null, open: rec?.open ?? null })
    restoreScroll(rec)
  }
  // Browser Back/Forward across a vendor view: keep the shared vendor filter in step with the URL. Handled on
  // popstate and read from the real URL, because a quick Back can pop before the router has committed the vendor view.
  useEffect(() => {
    const onPop = () => {
      if (!window.location.pathname.endsWith('/production')) return
      const focus = new URLSearchParams(window.location.search).get('focus')
      const was = lastFocus.current
      lastFocus.current = focus
      const ids = filters.vendorIds
      if (was === focus) return
      if (was && !focus && ids.length === 1 && ids[0] === was) {
        const rec = readReturn(was)
        setFilters({ vendorIds: rec?.prev ?? [] })
        restoreScroll(rec)
      } else if (focus && !(ids.length === 1 && ids[0] === focus)) {
        setFilters({ vendorIds: [focus] })
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.vendorIds])

  const toggle = (r: TreeRow) => {
    const next = new Set(expanded)
    if (r.expanded) {
      for (const k of [...next]) if (k === r.key || k.startsWith(r.key + '>')) next.delete(k)
    } else next.add(r.key)
    setParam({ open: [...next].join(',') })
  }
  const anyExpanded = tree.rows.some((r) => r.expanded)
  const allExpanded = tree.allKeys.length > 0 && tree.allKeys.every((k) => expanded.has(k))

  const colRange = (c: Column) => dayRangeLabel(c.days[0], c.days[c.days.length - 1])
  const openCell = (row: TreeRow | null, col: Column | null, cell: GridCell) => {
    const where = row ? `${LEVEL_LABEL[row.level]}${row.trail.length ? ` in ${row.trail.join(' › ')}` : ''}` : 'All vendors in scope'
    setDrawer({
      title: cell.single ? `${shortSkuName(ds.idx.sku.get(cell.single.skuCode)!.name)} · ${col?.label}` : `${row ? row.label : 'All vendors'} · ${col ? col.label : 'Period total'}`,
      subtitle: cell.single ? `${ds.idx.vendor.get(cell.single.vendorId)!.name} · ${cell.single.skuCode} · ${fmtDate(cell.single.date)} · ${unit}` : `${where} · ${col ? colRange(col) : period} · ${unit}`,
      cell,
    })
  }

  const totalLabel = filters.vendorIds.length ? 'Total in scope' : 'All vendors'
  // With a single vendor the total row would repeat the vendor row exactly, so it is omitted.
  const showTotalRow = tree.vendorCount > 1
  const exportCsv = () => {
    const rows: (string | number | null)[][] = [
      [
        'Level',
        'Path',
        'Entity',
        'Column',
        'From',
        'To',
        `Comparable plan (${unit})`,
        `Comparable actual (${unit})`,
        'Attainment %',
        `Gap (${unit})`,
        'Status',
        `Plan awaiting reports (${unit})`,
        `Future plan (${unit})`,
        `Actual vs monthly plan (${unit})`,
        `Actual with no daily plan (${unit})`,
        `Actual on non-operating days (${unit})`,
        `Total reported actual (${unit})`,
      ],
    ]
    const push = (level: string, trail: string, name: string, col: string, from: string, to: string, c: GridCell) => {
      const a = c.agg
      const comp = hasComparable(c)
      rows.push([
        level,
        trail,
        name,
        col,
        from,
        to,
        comp ? a.planComparable : null,
        comp ? a.actualComparable : null,
        a.attainment == null ? null : +a.attainment.toFixed(2),
        comp ? a.gap : null,
        CELL_META[c.status].label,
        a.planUnreported,
        a.planFuture,
        a.actualMonthly,
        a.actualNoPlan,
        a.actualNonOp,
        a.actual,
      ])
    }
    for (const r of tree.rows) {
      const trail = r.trail.join(' > ')
      columns.forEach((c, i) => push(LEVEL_LABEL[r.level], trail, r.label, c.label, c.days[0], c.days[c.days.length - 1], r.byCol[i]))
      push(LEVEL_LABEL[r.level], trail, r.label, 'Period total', filters.dateFrom, filters.dateTo, r.total)
    }
    push('Total', '', totalLabel, 'Period total', filters.dateFrom, filters.dateTo, tree.grand)
    downloadCsv(`production-comparison-${filters.dateFrom}_${filters.dateTo}-${unit}-demo.csv`, rows)
  }

  const isFuture = (c: Column) => c.days[0] > LATEST_DUE_DATE
  // Heatmap day columns 50px; table quantity columns ≥84px and grow for long values (whitespace-nowrap).
  const colW = view === 'heatmap' ? (grain === 'day' ? 'min-w-[48px] w-[48px]' : 'min-w-[88px]') : grain === 'day' ? 'min-w-[84px]' : 'min-w-[104px]'
  const totalW = view === 'table' ? 'min-w-[112px]' : 'min-w-[180px]'
  const stickyR = 'sticky right-0 shadow-[inset_2px_0_0_var(--color-line-strong)]'
  const openRowTotal = (r: TreeRow) => openCell(r, null, r.total)

  return (
    <div>
      <PageHeader
        back={
          canReturn ? (
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-dense">
              <button type="button" onClick={returnToScope} className="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">
                <ArrowLeft size={14} aria-hidden /> Back to {prevLabel}
              </button>
              <span aria-hidden className="text-ink-subtle">
                ·
              </span>
              <span role="status" className="text-ink-muted">
                Vendor filter applied across pages.
              </span>
            </div>
          ) : undefined
        }
        title={focusedVendor ? `Production analysis · ${focusedVendor.name}` : 'Production analysis'}
        subtitle={
          <>
            {focusedVendor ? 'Vendor view' : filters.vendorIds.length > 1 ? `${filters.vendorIds.length} vendors` : `All vendors (${tree.vendorCount})`} · plan vs actual · {period} · {unit} · actuals through {fmtDate(LATEST_DUE_DATE)}
          </>
        }
      />

      {!pairs.length ? (
        <Card>
          <EmptyState icon={SearchX} title="No vendor–SKU mappings match the current filters" action={<Button onClick={reset}>Reset global filters</Button>}>
            Adjust the vendor, product or SKU/DT search in the global filter bar.
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* KPI cards: label, value + unit, at most one short status line; supporting detail lives in the (i) disclosure. */}
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi
              label="Comparable plan"
              value={fmtQty(g.planComparable, unit)}
              unit={unit}
              sub="Days with a valid report"
              help={
                <KpiHelp
                  text="Daily plan on days with a valid production report – the attainment denominator. Plan without a report and plan for future dates is kept out and never compared against zero."
                  rows={[
                    ['Excluded – report missing', `${fmtQty(g.planUnreported, unit)} ${unit}`],
                    ['Future plan · not yet due', `${fmtQty(g.planFuture, unit)} ${unit}`],
                  ]}
                />
              }
            />
            <Kpi
              label="Comparable actual"
              value={fmtQty(g.actualComparable, unit)}
              unit={unit}
              sub="Same days as the plan"
              help={
                <KpiHelp
                  text={`Reported production on days that have a daily plan and a valid report, converted per SKU into ${unit} before summing. Actual without a daily plan is listed under “Excluded from comparison”.`}
                  rows={[
                    ['Reported-zero vendor-days', fmtNum(g.counts.zero)],
                    ['Reported but not compared', `${fmtQty(g.actualUnplanned, unit)} ${unit}`],
                  ]}
                />
              }
            />
            <Kpi
              label="Attainment"
              value={g.attainment == null ? 'N/A' : fmtPct(g.attainment, 1)}
              status={<CellStatusBadge status={tree.grand.status} />}
              help={<KpiHelp text={`Comparable actual ÷ comparable plan × 100. Bands (provisional): below ${t.low}% is below plan, ${t.low}–${t.high}% within range, above ${t.high}% above plan.`} />}
            />
            <Kpi
              label="Gap vs plan"
              value={fmtSigned(g.gap, unit)}
              unit={unit}
              sub={g.planComparable > 0 ? (g.gap < 0 ? 'Shortfall' : g.gap > 0 ? 'Ahead of plan' : 'On plan') : 'No comparable plan'}
              help={<KpiHelp text="Actual minus plan: comparable actual − comparable plan. Negative is a shortfall against plan." />}
            />
            <div className="col-span-2 grid lg:col-span-1">
              <Kpi
                label="Run-rate"
                period={`${fmtMonth(rr.month)} MTD`}
                value={fmtQty(rr.avgDaily, unit)}
                unit={`${unit}/day`}
                sub={rr.projectedAttainment == null ? 'Projection N/A' : `Projected ${fmtPct(rr.projectedAttainment)}`}
                helpAlign="right"
                help={
                  <KpiHelp
                    text={`Daily-plan vendors in ${fmtMonth(rr.month)}, independent of the selected period. Average = MTD actual ÷ reported operating days. Required = (month plan − MTD actual) ÷ remaining operating days. Projected = (MTD actual + average × remaining days) ÷ month plan.`}
                    rows={[
                      ['Required daily rate', `${fmtQty(rr.requiredDaily, unit)} ${unit}/day`],
                      ['Month plan', `${fmtQty(rr.monthPlan, unit)} ${unit}`],
                      ['MTD actual', `${fmtQty(rr.mtdActual, unit)} ${unit}`],
                      ['Reported / remaining days', `${rr.reportedDays} / ${rr.remainingDays}`],
                    ]}
                  />
                }
              />
            </div>
          </div>
          <NotComparedLine
            agg={g}
            unit={unit}
            className="mb-6"
            extra={
              (cov.missing > 0 || cov.stale > 0) && (
                <Link to="/data/reports" state={origin} className="inline-flex items-center gap-1.5 py-0.5 text-dense text-warn hover:underline" title={covTitle}>
                  <AlertTriangle size={14} aria-hidden />
                  <span>
                    Production reports: {cov.missing > 0 && `${cov.missing} missing`}
                    {cov.missing > 0 && cov.stale > 0 && ' · '}
                    {cov.stale > 0 && `${cov.stale} stale`}
                  </span>
                </Link>
              )
            }
          />

          {unit === 'MT' && g.excluded.length > 0 && (
            <div className="-mt-3 mb-6">
              <Callout tone="warn" title={`${g.excluded.length} SKU(s) excluded from MT totals`}>
                {g.excluded.map((e) => {
                  const s = ds.idx.sku.get(e.skuCode)
                  return (
                    <div key={e.skuCode}>
                      {e.skuCode} · {s?.name}: {e.reason}
                    </div>
                  )
                })}
              </Callout>
            </div>
          )}

          <Card
            bodyClass="p-0"
            title={
              <span className="inline-flex items-center gap-1">
                {view === 'table' ? 'Plan vs actual' : 'Attainment heatmap'}
                <span className="font-normal text-ink-subtle">· {unit}</span>
                <HelpTip label="How to use this grid">
                  Hierarchy: {DRILL_LEVELS.map((l) => LEVEL_LABEL[l]).join(' → ')}. Use the chevron to expand a row in place – other rows, totals and KPIs stay as they are. “View vendor” opens a focused analysis by setting the global vendor
                  filter. {view === 'table' ? 'Click a value or the period attainment' : 'Click a cell'} for its source records. All values use the comparable basis that the KPIs use.
                </HelpTip>
              </span>
            }
            actions={
              <div className="flex flex-wrap items-center gap-y-2">
                <ToolGroup label="Time grain" short="Grain" first>
                  <Segmented
                    label="Time grain"
                    size="sm"
                    value={grain}
                    onChange={(v) => setParam({ grain: v })}
                    options={[
                      { value: 'day', label: 'Day' },
                      { value: 'week', label: 'Week' },
                    ]}
                  />
                </ToolGroup>
                <ToolGroup label="View" short="View">
                  <Segmented
                    label="View"
                    size="sm"
                    value={view}
                    onChange={(v) => setParam({ view: v })}
                    options={[
                      { value: 'heatmap', label: 'Heatmap', icon: Grid3x3 },
                      { value: 'table', label: 'Table', icon: Rows3 },
                    ]}
                  />
                  {view === 'table' && (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-dense text-ink-muted">
                      <input type="checkbox" role="switch" aria-checked={showAtt} checked={showAtt} onChange={(e) => setParam({ att: e.target.checked ? '1' : null })} className="h-3.5 w-3.5 accent-[var(--color-accent)]" />
                      Attainment rows
                    </label>
                  )}
                </ToolGroup>
                <ToolGroup label="Row density" short="Density">
                  <DensityControl />
                </ToolGroup>
                <ToolGroup label="Grid actions" short="Actions">
                  <span className="inline-flex items-center" role="group" aria-label="Rows and dates">
                    <IconButton icon={ChevronLeft} label="Scroll to earlier dates" title="Earlier dates" disabled={!canScrollLeft} onClick={() => scrollByX(-320)} />
                    <IconButton icon={ChevronRight} label="Scroll to later dates" title="Later dates" disabled={!canScrollRight} onClick={() => scrollByX(320)} />
                    <IconButton icon={ChevronsUpDown} label="Expand all rows" title="Expand all" disabled={allExpanded} onClick={() => setParam({ open: tree.allKeys.join(',') })} />
                    <IconButton icon={ChevronsDownUp} label="Collapse all rows" title="Collapse all" disabled={!anyExpanded} onClick={() => setParam({ open: null })} />
                  </span>
                  <ExportButton onClick={exportCsv} disabled={!can('export.data') || !pairs.length} />
                </ToolGroup>
              </div>
            }
          >
            <div className="relative">
              <div
                ref={(el) => {
                  scrollRef.current = el
                  fillRef.current = el
                }}
                className="scroll-thin relative max-w-full overflow-auto"
                style={{ maxHeight: fillH ?? 'calc(100vh - 300px)' }}
              >
                <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className={cx(th, 'left-0 z-20', ENTITY_W, view === 'heatmap' && 'border-r')}>Vendor / hierarchy</th>
                      {view === 'table' && <th className={cx(th, METRIC_LEFT, 'z-20 border-r', METRIC_W)}>Metric</th>}
                      {columns.map((c) => (
                        <th key={c.key} className={cx(th, colW, view === 'table' ? 'text-right' : 'px-0.5 text-center', isFuture(c) && 'text-ink-subtle')}>
                          {grain === 'day' ? (
                            <span className="text-label leading-4 whitespace-nowrap" title={`${c.sub} ${c.label}`}>
                              <span className="font-normal text-ink-subtle">{c.sub}</span> <span className="font-medium">{view === 'heatmap' ? +c.key.slice(8) : c.label}</span>
                            </span>
                          ) : (
                            <span className={cx('text-label leading-4 font-medium whitespace-nowrap', c.partial && 'text-warn')} title={c.sub}>
                              {c.label}
                              {c.partial && <span className="sr-only"> (partial week)</span>}
                            </span>
                          )}
                        </th>
                      ))}
                      <th aria-hidden className={cx(th, 'w-full p-0')} />
                      <th ref={totalRef} className={cx(th, stickyR, 'z-20 text-right', totalW)}>
                        {(() => {
                          const help = (
                            <HelpTip label="About period totals" align="right">
                              Period total on the comparable basis: plan and actual on days with both a daily plan and a valid report – the same scope as the KPIs. A dot marks quantities kept out of the comparison; open the cell for
                              “Additional quantities”. Totals are computed from records, so expanded rows are never double-counted.
                            </HelpTip>
                          )
                          return view === 'table' ? (
                            <div className="-my-1 inline-flex h-4 items-center gap-0.5 text-label font-medium text-ink">Period total{help}</div>
                          ) : (
                            <div className={cx('-my-1 grid h-4 items-center gap-2 text-label font-medium text-ink', TOTAL_GRID)}>
                              <span>Period plan</span>
                              <span>Actual</span>
                              <span className="inline-flex items-center justify-end">Att.{help}</span>
                            </div>
                          )
                        })()}
                      </th>
                    </tr>
                  </thead>
                  {view === 'heatmap' ? (
                    <tbody>
                      {tree.rows.map((r, ri) => (
                        <tr key={r.key} className="group">
                          <td data-key={r.key} data-depth={r.depth} className={cx('sticky left-0 z-[5] border-r border-line py-0.5 pr-1 pl-2.5 align-middle', ENTITY_W, rowBg(r), groupTop(r, ri))}>
                            <EntityCell r={r} onToggle={() => toggle(r)} onViewVendor={() => viewVendor(r.id)} focused={!!focusedVendor} origin={origin} />
                          </td>
                          {columns.map((c, i) => (
                            <td key={c.key} className={cx('px-[2px] py-[4px] align-middle', colW, rowBg(r), groupTop(r, ri))}>
                              <HeatCell g={r.byCol[i]} label={`${r.label}, ${c.label}`} onOpen={() => openCell(r, c, r.byCol[i])} />
                            </td>
                          ))}
                          <td aria-hidden className={cx('w-full p-0', rowBg(r), groupTop(r, ri))} />
                          <td className={cx(stickyR, 'z-[5] px-2.5 py-0.5', rowBg(r), groupTop(r, ri))}>
                            <TotalCell g={r.total} unit={unit} label={r.label} onOpen={() => openRowTotal(r)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  ) : (
                    tree.rows.map((r, ri) => (
                      <tbody key={r.key}>
                        {metrics.map((metric, mi) => {
                          const top = mi === 0 ? groupTop(r, ri) : ''
                          return (
                            <tr key={metric}>
                              {mi === 0 && (
                                <td rowSpan={metrics.length} data-key={r.key} data-depth={r.depth} className={cx('sticky left-0 z-[5] py-[var(--cell-py)] pr-1 pl-2.5 align-top', ENTITY_W, rowBg(r), top)}>
                                  <EntityCell
                                    r={r}
                                    onToggle={() => toggle(r)}
                                    onViewVendor={() => viewVendor(r.id)}
                                    focused={!!focusedVendor}
                                    origin={origin}
                                    periodAtt={showAtt ? undefined : <PeriodAttBadge g={r.total} label={r.label} onOpen={() => openRowTotal(r)} />}
                                  />
                                </td>
                              )}
                              <th scope="row" className={cx('sticky z-[5] border-r border-line px-2.5 py-[var(--cell-py)] text-left text-label font-medium whitespace-nowrap text-ink-muted', METRIC_LEFT, METRIC_W, rowBg(r), top)}>
                                {METRIC_LABEL[metric]}
                              </th>
                              {columns.map((c, i) => {
                                const cell = r.byCol[i]
                                return (
                                  <td key={c.key} className={cx('num px-2.5 py-[var(--cell-py)] text-right text-dense whitespace-nowrap', colW, rowBg(r), top)}>
                                    {cell.cells.length ? (
                                      <button
                                        type="button"
                                        onClick={() => openCell(r, c, cell)}
                                        aria-label={`${r.label}, ${c.label}, ${METRIC_LABEL[metric].toLowerCase()}: ${describe(cell, unit)}. Open details`}
                                        className="-mx-1 rounded px-1 text-right hover:bg-accent-soft"
                                      >
                                        <MetricValue metric={metric} g={cell} unit={unit} />
                                      </button>
                                    ) : (
                                      <Muted>·</Muted>
                                    )}
                                  </td>
                                )
                              })}
                              <td aria-hidden className={cx('w-full p-0', rowBg(r), top)} />
                              <td className={cx(stickyR, 'num z-[5] px-2.5 py-[var(--cell-py)] text-right text-dense font-medium whitespace-nowrap', rowBg(r), top)}>
                                <button
                                  type="button"
                                  onClick={() => openRowTotal(r)}
                                  aria-label={`${r.label}, period ${METRIC_LABEL[metric].toLowerCase()}: ${describe(r.total, unit)}. Open details`}
                                  className="-mx-1 rounded px-1 hover:bg-accent-soft"
                                >
                                  <MetricValue metric={metric} g={r.total} unit={unit} />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    ))
                  )}
                  {showTotalRow &&
                    (view === 'heatmap' ? (
                      <tfoot>
                        <tr>
                          <td className={cx(td, 'sticky bottom-0 left-0 z-[15] border-t-2 border-r border-t-line-strong bg-surface-muted py-1 font-semibold')}>
                            {totalLabel} <span className="font-normal text-ink-muted">({tree.vendorCount})</span>
                          </td>
                          {columns.map((c, i) => (
                            <td key={c.key} className="sticky bottom-0 z-[6] border-t-2 border-t-line-strong bg-surface-muted px-[2px] py-[4px]">
                              <HeatCell g={tree.colTotals[i]} label={`${totalLabel}, ${c.label}`} onOpen={() => openCell(null, c, tree.colTotals[i])} />
                            </td>
                          ))}
                          <td aria-hidden className="sticky bottom-0 z-[6] w-full border-t-2 border-t-line-strong bg-surface-muted p-0" />
                          <td className={cx(stickyR, 'bottom-0 z-[15] border-t-2 border-t-line-strong bg-surface-muted px-2.5 py-1 font-semibold')}>
                            <TotalCell g={tree.grand} unit={unit} label={totalLabel} onOpen={() => openCell(null, null, tree.grand)} />
                          </td>
                        </tr>
                      </tfoot>
                    ) : (
                      <tfoot>
                        {metrics.map((metric, mi) => {
                          const top = mi === 0 ? 'border-t-2 border-t-line-strong' : ''
                          return (
                            <tr key={metric} className="bg-surface-muted">
                              {mi === 0 && (
                                <td rowSpan={metrics.length} className={cx('sticky left-0 z-[5] bg-surface-muted py-[var(--cell-py)] pr-1 pl-2.5 align-top', ENTITY_W, top)}>
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="text-body font-semibold">
                                      {totalLabel} <span className="font-normal text-ink-muted">({tree.vendorCount})</span>
                                    </span>
                                    {!showAtt && <PeriodAttBadge g={tree.grand} label={totalLabel} onOpen={() => openCell(null, null, tree.grand)} />}
                                  </div>
                                </td>
                              )}
                              <th scope="row" className={cx('sticky z-[5] border-r border-line bg-surface-muted px-2.5 py-[var(--cell-py)] text-left text-label font-medium whitespace-nowrap text-ink-muted', METRIC_LEFT, METRIC_W, top)}>
                                {METRIC_LABEL[metric]}
                              </th>
                              {columns.map((c, i) => {
                                const cell = tree.colTotals[i]
                                return (
                                  <td key={c.key} className={cx('num px-2.5 py-[var(--cell-py)] text-right text-dense font-medium whitespace-nowrap', colW, top)}>
                                    <button
                                      type="button"
                                      onClick={() => openCell(null, c, cell)}
                                      aria-label={`${totalLabel}, ${c.label}, ${METRIC_LABEL[metric].toLowerCase()}: ${describe(cell, unit)}. Open details`}
                                      className="-mx-1 rounded px-1 hover:bg-accent-soft"
                                    >
                                      <MetricValue metric={metric} g={cell} unit={unit} />
                                    </button>
                                  </td>
                                )
                              })}
                              <td aria-hidden className={cx('w-full p-0', top)} />
                              <td className={cx(stickyR, 'num z-[5] bg-surface-muted px-2.5 py-[var(--cell-py)] text-right text-dense font-semibold whitespace-nowrap', top)}>
                                <button
                                  type="button"
                                  onClick={() => openCell(null, null, tree.grand)}
                                  aria-label={`${totalLabel}, period ${METRIC_LABEL[metric].toLowerCase()}: ${describe(tree.grand, unit)}. Open details`}
                                  className="-mx-1 rounded px-1 hover:bg-accent-soft"
                                >
                                  <MetricValue metric={metric} g={tree.grand} unit={unit} />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tfoot>
                    ))}
                </table>
              </div>
              {canScrollRight && <div aria-hidden className={cx('pointer-events-none absolute top-0 bottom-0 w-6 bg-gradient-to-l from-black/[0.06] to-transparent', '')} style={{ right: totalW_px }} />}
            </div>
            <div className="border-t border-line px-4 py-2">
              <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5">
                {view === 'heatmap' ? (
                  <StatusLegend statuses={COMMON_LEGEND} className="min-w-0 flex-1" />
                ) : (
                  <ul aria-label="Table legend" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-label text-ink-muted">
                    <li>
                      <MissingChip /> no valid report
                    </li>
                    <li>
                      <span className="font-semibold text-bad">0</span> reported zero
                    </li>
                    <li>
                      <span className="text-info">Monthly plan</span> daily N/A
                    </li>
                    <li>Not due · future</li>
                    <li>Off · non-operating</li>
                    <li className="inline-flex items-center">
                      <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-info" />
                      excludes some quantities
                    </li>
                  </ul>
                )}
                <Disclosure summary="Legend & definitions" className="basis-full [&[open]]:basis-full">
                  <div className="grid gap-x-6 gap-y-3 rounded-[var(--radius-card)] bg-surface-muted/70 px-3 py-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <dl className="grid content-start gap-y-1.5 text-label">
                      {STATUS_ORDER.map((st) => (
                        <div key={st} className="grid grid-cols-[176px_minmax(0,1fr)] items-start gap-x-2">
                          <dt className="flex items-center gap-1.5 font-medium text-ink">
                            <LegendSwatch status={st} />
                            {CELL_META[st].label}
                          </dt>
                          <dd className="text-ink-muted">{CELL_META[st].description}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="space-y-1.5 text-label text-ink-muted">
                      <p>
                        <span className="font-medium text-ink">Comparable plan</span> – daily plan on days with a valid report. <span className="font-medium text-ink">Comparable actual</span> – reported production on those days.
                      </p>
                      <p>
                        <span className="font-medium text-ink">Attainment</span> = comparable actual ÷ comparable plan × 100 (N/A when there is no comparable plan). <span className="font-medium text-ink">Gap</span> = comparable actual −
                        comparable plan.
                      </p>
                      <p>
                        Plan awaiting a missing report, future plan, and actual reported against a monthly plan, with no applicable daily plan or on non-operating days are kept out and itemised in the cell details. Missing reports are never
                        treated as zero.
                      </p>
                      <p>
                        Thresholds {t.low}% / {t.high}% are provisional (editable in Admin); “Above plan” is amber – over-production is reviewed, not treated as good. A{' '}
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-info align-middle" aria-hidden /> dot marks a total that excludes some quantities.
                      </p>
                    </div>
                  </div>
                </Disclosure>
              </div>
            </div>
          </Card>

          {monthly.length > 0 && (
            <Card
              className="mt-4"
              title={
                <span className="inline-flex items-center gap-0.5">
                  Monthly-plan vendors
                  <HelpTip label="About monthly plans">
                    These vendors plan by month. The plan is not split by day, so daily cells show “Monthly” (daily attainment N/A) and are compared month-to-date here instead. “Operating days elapsed” is context only – it is not used to
                    derive a daily target.
                  </HelpTip>
                </span>
              }
              subtitle="Month-to-date actual vs monthly plan"
              bodyClass="p-0"
            >
              <TableWrap>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={th}>Vendor</th>
                      <th className={th}>SKU</th>
                      <th className={th}>Month</th>
                      <th className={cx(th, 'text-right')}>Month plan ({unit})</th>
                      <th className={cx(th, 'text-right')}>
                        Actual MTD to {LATEST_DUE_DATE.slice(8)} Oct ({unit})
                      </th>
                      <th className={cx(th, 'text-right')}>% of month plan</th>
                      <th className={cx(th, 'text-right')}>Operating days elapsed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map((m) => {
                      const sku = ds.idx.sku.get(m.skuCode)!
                      const plan = convertFg(m.monthPlanEa, sku, unit)
                      const act = convertFg(m.mtdActualEa, sku, unit)
                      return (
                        <tr key={`${m.vendorId}${m.skuCode}${m.month}`}>
                          <td className={td}>{ds.idx.vendor.get(m.vendorId)!.name}</td>
                          <td className={td}>
                            <Link to={`/sku/${sku.code}`} state={origin} className="text-accent-ink hover:underline">
                              {shortSkuName(sku.name)}
                            </Link>{' '}
                            <span className="text-dense text-ink-muted">{sku.code}</span>
                          </td>
                          <td className={td}>{fmtMonth(m.month)}</td>
                          <td className={tdNum}>{fmtQty(plan, unit)}</td>
                          <td className={tdNum}>{fmtQty(act, unit)}</td>
                          <td className={tdNum}>{fmtPct(m.monthPlanEa ? (m.mtdActualEa / m.monthPlanEa) * 100 : null, 1)}</td>
                          <td className={tdNum}>{fmtPct(m.elapsedShare * 100)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableWrap>
            </Card>
          )}
        </>
      )}

      <CellDrawer ds={ds as Dataset} target={drawer} unit={unit} origin={origin} onClose={() => setDrawer(null)} />
    </div>
  )
}
