// Production-analysis grouping: rows (drilldown entities) × columns (days / weeks).
// Every cell, row total, column total and grand total is computed with aggregateCells over the
// same record-level ProdCells, so heatmap and table views reconcile by construction.
import type { Dataset } from '@/data/dataset'
import type { ISODate, Unit } from '@/data/types'
import { eachDay, fmtDate, weekStart, addDays } from '@/lib/dates'
import { aggregateCells, aggStatus, type CellStatus, type ProdAgg, type ProdCell, type ScopePair } from '@/lib/metrics'

export type DrillLevel = 'vendor' | 'category' | 'brand' | 'productLine' | 'sku'
export const DRILL_LEVELS: DrillLevel[] = ['vendor', 'category', 'brand', 'productLine', 'sku']
export const LEVEL_LABEL: Record<DrillLevel, string> = {
  vendor: 'Vendor',
  category: 'Category',
  brand: 'Brand',
  productLine: 'Product line',
  sku: 'SKU',
}

export type DrillPath = Partial<Record<Exclude<DrillLevel, 'sku'>, string>>

export function entityOf(ds: Dataset, p: ScopePair, level: DrillLevel): { id: string; label: string; sub?: string } {
  const h = ds.idx.hierarchy.get(p.sku.code)!
  switch (level) {
    case 'vendor':
      return { id: p.vendor.id, label: p.vendor.name, sub: p.vendor.code }
    case 'category':
      return { id: h.category.id, label: h.category.name }
    case 'brand':
      return { id: h.brand.id, label: h.brand.name }
    case 'productLine':
      return { id: h.productLine.id, label: h.productLine.name }
    case 'sku':
      return { id: p.sku.code, label: p.sku.name, sub: p.sku.code }
  }
}

export function currentLevel(path: DrillPath): DrillLevel {
  for (const l of DRILL_LEVELS) if (l !== 'sku' && !path[l]) return l
  return 'sku'
}

export function pairsOnPath(ds: Dataset, pairs: ScopePair[], path: DrillPath): ScopePair[] {
  return pairs.filter((p) => (Object.keys(path) as (keyof DrillPath)[]).every((l) => !path[l] || entityOf(ds, p, l).id === path[l]))
}

export interface Column {
  key: string
  label: string
  sub: string
  days: ISODate[]
  partial: boolean
}
export function buildColumns(from: ISODate, to: ISODate, grain: 'day' | 'week'): Column[] {
  const days = eachDay(from, to)
  if (grain === 'day') {
    const dow = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
    return days.map((d) => ({
      key: d,
      label: fmtDate(d),
      sub: dow[new Date(d + 'T00:00:00Z').getUTCDay()],
      days: [d],
      partial: false,
    }))
  }
  const map = new Map<string, ISODate[]>()
  for (const d of days) {
    const w = weekStart(d)
    if (!map.has(w)) map.set(w, [])
    map.get(w)!.push(d)
  }
  // Calendar weeks (Mon–Sun) clipped to the selected period; the label is the displayed range.
  return [...map.entries()].map(([w, ds]) => {
    const partial = ds.length < 7 || ds[0] !== w || ds[ds.length - 1] !== addDays(w, 6)
    return { key: w, label: dayRangeLabel(ds[0], ds[ds.length - 1]), sub: partial ? 'Partial week' : 'Mon–Sun', days: ds, partial }
  })
}

/** `1–4 Oct`, or `29 Sep–5 Oct` across months; a single day is `1 Oct`. */
export function dayRangeLabel(a: ISODate, b: ISODate): string {
  if (a === b) return fmtDate(a)
  return a.slice(0, 7) === b.slice(0, 7) ? `${+a.slice(8)}–${fmtDate(b)}` : `${fmtDate(a)}–${fmtDate(b)}`
}

export interface GridCell {
  cells: ProdCell[]
  agg: ProdAgg
  status: CellStatus
  /** set when the cell is exactly one vendor×SKU×date record */
  single: ProdCell | null
}
export interface GridRow {
  id: string
  label: string
  sub?: string
  pairs: ScopePair[]
  byCol: GridCell[]
  total: GridCell
  monthlyOnly: boolean
}

/** Status of a group of record cells: uniform non-operating / future groups keep that status. */
export function groupStatus(ds: Dataset, cells: ProdCell[], agg: ProdAgg): CellStatus {
  if (cells.length === 1) return cells[0].status
  if (cells.length && cells.every((c) => c.status === 'nonOp')) return 'nonOp'
  if (cells.length && cells.every((c) => c.status === 'future' || c.status === 'nonOp')) return 'future'
  return aggStatus(ds, agg)
}

export function makeGridCell(ds: Dataset, cells: ProdCell[], unit: Unit): GridCell {
  const agg = aggregateCells(ds, cells, unit)
  return {
    cells,
    agg,
    status: groupStatus(ds, cells, agg),
    single: cells.length === 1 ? cells[0] : null,
  }
}

export function buildGrid(ds: Dataset, pairs: ScopePair[], allCells: ProdCell[], level: DrillLevel, columns: Column[], unit: Unit) {
  const rowMap = new Map<string, { id: string; label: string; sub?: string; pairs: ScopePair[] }>()
  for (const p of pairs) {
    const e = entityOf(ds, p, level)
    if (!rowMap.has(e.id)) rowMap.set(e.id, { ...e, pairs: [] })
    rowMap.get(e.id)!.pairs.push(p)
  }
  const pairRow = new Map<string, string>()
  for (const r of rowMap.values()) for (const p of r.pairs) pairRow.set(`${p.vendor.id}|${p.sku.code}`, r.id)
  const colOf = new Map<string, number>()
  columns.forEach((c, i) => c.days.forEach((d) => colOf.set(d, i)))

  const bucket = new Map<string, ProdCell[]>() // rowId|colIdx
  const rowCells = new Map<string, ProdCell[]>()
  const colCells: ProdCell[][] = columns.map(() => [])
  for (const c of allCells) {
    const rid = pairRow.get(`${c.vendorId}|${c.skuCode}`)
    const ci = colOf.get(c.date)
    if (rid == null || ci == null) continue
    const k = `${rid}|${ci}`
    if (!bucket.has(k)) bucket.set(k, [])
    bucket.get(k)!.push(c)
    if (!rowCells.has(rid)) rowCells.set(rid, [])
    rowCells.get(rid)!.push(c)
    colCells[ci].push(c)
  }
  const rows: GridRow[] = [...rowMap.values()]
    .map((r) => {
      const rc = rowCells.get(r.id) ?? []
      return {
        ...r,
        byCol: columns.map((_, i) => makeGridCell(ds, bucket.get(`${r.id}|${i}`) ?? [], unit)),
        total: makeGridCell(ds, rc, unit),
        monthlyOnly: rc.length > 0 && rc.every((c) => c.monthlyPlan || c.status === 'future' || c.status === 'nonOp') && rc.some((c) => c.monthlyPlan),
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
  const colTotals = colCells.map((cc) => makeGridCell(ds, cc, unit))
  const grand = makeGridCell(
    ds,
    allCells.filter((c) => colOf.has(c.date) && pairRow.has(`${c.vendorId}|${c.skuCode}`)),
    unit,
  )
  return { rows, colTotals, grand }
}

// ---------------------------------------------------------------------------
// Expandable hierarchy (Vendor → Category → Brand → Product line → SKU).
// Each visible row is computed from its own record cells. Expanding a node never changes the
// KPI scope, and totals come from the record cells – never from summing visible rows – so
// expanded descendants cannot be double-counted.

export interface TreeRow extends GridRow {
  /** unique path key, e.g. `V-SAI>CAT-1>BR-2` */
  key: string
  level: DrillLevel
  depth: number
  vendorId: string
  expandable: boolean
  expanded: boolean
  /** labels of the ancestors, outermost first */
  trail: string[]
  /** level and number of immediate children in the current filtered scope (0 for SKUs) */
  childLevel: DrillLevel | null
  childCount: number
  /** immediate children reconcile with this row (only checked when expanded) */
  childrenReconcile: boolean | null
}

const childLevel = (l: DrillLevel): DrillLevel | null => DRILL_LEVELS[DRILL_LEVELS.indexOf(l) + 1] ?? null
const pairKey = (vendorId: string, skuCode: string) => `${vendorId}|${skuCode}`

function groupBy(ds: Dataset, pairs: ScopePair[], level: DrillLevel) {
  const m = new Map<string, { id: string; label: string; sub?: string; pairs: ScopePair[] }>()
  for (const p of pairs) {
    const e = entityOf(ds, p, level)
    if (!m.has(e.id)) m.set(e.id, { ...e, pairs: [] })
    m.get(e.id)!.pairs.push(p)
  }
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export function buildTree(ds: Dataset, pairs: ScopePair[], allCells: ProdCell[], columns: Column[], unit: Unit, expanded: Set<string>) {
  const colOf = new Map<string, number>()
  columns.forEach((c, i) => c.days.forEach((d) => colOf.set(d, i)))
  const byPair = new Map<string, ProdCell[]>()
  const colCells: ProdCell[][] = columns.map(() => [])
  const inScope: ProdCell[] = []
  for (const c of allCells) {
    const ci = colOf.get(c.date)
    if (ci == null) continue
    const k = pairKey(c.vendorId, c.skuCode)
    if (!byPair.has(k)) byPair.set(k, [])
    byPair.get(k)!.push(c)
    colCells[ci].push(c)
    inScope.push(c)
  }

  const makeRow = (g: { id: string; label: string; sub?: string; pairs: ScopePair[] }, level: DrillLevel, depth: number, key: string, trail: string[]): TreeRow => {
    const rc = g.pairs.flatMap((p) => byPair.get(pairKey(p.vendor.id, p.sku.code)) ?? [])
    const buckets: ProdCell[][] = columns.map(() => [])
    for (const c of rc) buckets[colOf.get(c.date)!].push(c)
    const next = childLevel(level)
    const expandable = next != null
    return {
      childLevel: next,
      childCount: next ? groupBy(ds, g.pairs, next).length : 0,
      ...g,
      key,
      level,
      depth,
      vendorId: g.pairs[0].vendor.id,
      trail,
      expandable,
      expanded: expandable && expanded.has(key),
      childrenReconcile: null,
      byCol: buckets.map((b) => makeGridCell(ds, b, unit)),
      total: makeGridCell(ds, rc, unit),
      monthlyOnly: rc.length > 0 && rc.every((c) => c.monthlyPlan || c.status === 'future' || c.status === 'nonOp') && rc.some((c) => c.monthlyPlan),
    }
  }

  const rows: TreeRow[] = []
  const expandableKeys: string[] = []
  const walk = (groupPairs: ScopePair[], level: DrillLevel, depth: number, parentKey: string, trail: string[]): TreeRow[] => {
    const out: TreeRow[] = []
    for (const g of groupBy(ds, groupPairs, level)) {
      const key = parentKey ? `${parentKey}>${g.id}` : g.id
      const row = makeRow(g, level, depth, key, trail)
      rows.push(row)
      out.push(row)
      const next = childLevel(level)
      if (next) expandableKeys.push(key)
      if (row.expanded && next) {
        const kids = walk(g.pairs, next, depth + 1, key, [...trail, g.label])
        row.childrenReconcile = (['actual', 'actualComparable', 'planComparable'] as const).every((k) => Math.abs(kids.reduce((a, r) => a + r.total.agg[k], 0) - row.total.agg[k]) < 1e-6)
      }
    }
    return out
  }
  const top = walk(pairs, 'vendor', 0, '', [])
  // Expand-all keys need every node, not just visible ones.
  const allKeys: string[] = []
  const collect = (groupPairs: ScopePair[], level: DrillLevel, parentKey: string) => {
    const next = childLevel(level)
    if (!next) return
    for (const g of groupBy(ds, groupPairs, level)) {
      const key = parentKey ? `${parentKey}>${g.id}` : g.id
      allKeys.push(key)
      collect(g.pairs, next, key)
    }
  }
  collect(pairs, 'vendor', '')

  const colTotals = colCells.map((cc) => makeGridCell(ds, cc, unit))
  const grand = makeGridCell(ds, inScope, unit)
  const sums = (k: 'actual' | 'actualComparable' | 'planComparable') => [top.reduce((a, r) => a + r.total.agg[k], 0), colTotals.reduce((a, c) => a + c.agg[k], 0)].every((v) => Math.abs(v - grand.agg[k]) < 1e-6)
  const reconciles = sums('actual') && sums('actualComparable') && sums('planComparable') && rows.every((r) => r.childrenReconcile !== false)
  return { rows, vendorCount: top.length, colTotals, grand, reconciles, allKeys, visibleExpandable: expandableKeys }
}
