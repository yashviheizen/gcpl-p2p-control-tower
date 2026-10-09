// Metric calculations. Every number shown in the app is derived here from the record-level dataset,
// so overview, heatmap, tables, SKU detail and exports reconcile.
import type { Dataset } from '@/data/dataset'
import { reportKey } from '@/data/dataset'
import type { ISODate, ReportType, Sku, Unit, Vendor, VendorReport } from '@/data/types'
import { operatingDayInfo } from './calendar'
import { addDays, DEMO_TODAY, diffDays, eachDay, LATEST_DUE_DATE, monthEnd, monthOf } from './dates'
import { convertFg, type UnitExclusion } from './units'

// ── Filters / scope ─────────────────────────────────────────────────────────
export type HierarchyLevel = 'category' | 'brand' | 'productLine' | 'dt' | 'sku'
export interface HierarchySel {
  level: HierarchyLevel
  id: string
  label: string
}
export interface AnalysisFilters {
  dateFrom: ISODate
  dateTo: ISODate
  vendorIds: string[] // empty = all
  hierarchy: HierarchySel | null
  search: string // SKU / DT code or name
  unit: Unit
}

export function skuMatchesScope(ds: Dataset, skuCode: string, f: Pick<AnalysisFilters, 'hierarchy' | 'search'>): boolean {
  const h = ds.idx.hierarchy.get(skuCode)
  if (!h) return false
  if (f.hierarchy) {
    const { level, id } = f.hierarchy
    const ok =
      (level === 'category' && h.category.id === id) || (level === 'brand' && h.brand.id === id) || (level === 'productLine' && h.productLine.id === id) || (level === 'dt' && h.dt.code === id) || (level === 'sku' && h.sku.code === id)
    if (!ok) return false
  }
  const q = f.search.trim().toLowerCase()
  if (q) {
    const hay = `${h.sku.code} ${h.sku.name} ${h.dt.code} ${h.dt.name}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

export interface ScopePair {
  vendor: Vendor
  sku: Sku
}
/** Vendor–SKU pairs (from mappings) inside the current scope. */
export function scopePairs(ds: Dataset, f: AnalysisFilters): ScopePair[] {
  const out: ScopePair[] = []
  for (const m of ds.vendorSkuMaps) {
    if (f.vendorIds.length && !f.vendorIds.includes(m.vendorId)) continue
    if (!skuMatchesScope(ds, m.skuCode, f)) continue
    const vendor = ds.idx.vendor.get(m.vendorId)
    const sku = ds.idx.sku.get(m.skuCode)
    if (vendor && sku) out.push({ vendor, sku })
  }
  return out
}
export function scopeVendors(ds: Dataset, f: AnalysisFilters): Vendor[] {
  const ids = new Set(scopePairs(ds, f).map((p) => p.vendor.id))
  return ds.vendors.filter((v) => ids.has(v.id))
}

// ── Thresholds (demo assumptions, editable in Master Data → Parameters) ─────
export function thresholds(ds: Dataset) {
  return {
    low: ds.idx.param.attainLow ?? 90,
    high: ds.idx.param.attainHigh ?? 110,
  }
}

// ── Production cell classification ──────────────────────────────────────────
/**
 * `monthly` = the vendor plans monthly, so no daily plan exists and daily attainment is not applicable.
 * `noPlan`  = no applicable plan exists at all for that vendor/SKU/date.
 */
export type CellStatus = 'below' | 'within' | 'above' | 'monthly' | 'noPlan' | 'missing' | 'zero' | 'nonOp' | 'future'

export interface ProdCell {
  vendorId: string
  skuCode: string
  date: ISODate
  planEa: number | null
  actualEa: number | null
  attainment: number | null
  status: CellStatus
  report: VendorReport | null
  reason: string
  monthlyPlan: boolean
}

export function attainment(actual: number | null, plan: number | null): number | null {
  if (actual == null || plan == null || plan === 0) return null // zero denominator → "No plan", never ∞
  return (actual / plan) * 100
}

export function prodCell(ds: Dataset, vendor: Vendor, sku: Sku, date: ISODate): ProdCell {
  const planEa = ds.idx.dailyPlan.get(`${vendor.id}|${sku.code}|${date}`) ?? null
  const monthlyPlan = ds.idx.planGranularity.get(`${vendor.id}|${monthOf(date)}`) === 'Monthly'
  const base = {
    vendorId: vendor.id,
    skuCode: sku.code,
    date,
    planEa,
    monthlyPlan,
  }
  const rep = ds.idx.report.get(reportKey(vendor.id, 'Production', date)) ?? null
  const rec = ds.idx.production.get(`${vendor.id}|${sku.code}|${date}`)
  if (date > LATEST_DUE_DATE) {
    return {
      ...base,
      actualEa: null,
      attainment: null,
      status: 'future',
      report: null,
      reason: date === DEMO_TODAY ? 'Today – report due tomorrow morning' : 'Future date',
    }
  }
  const day = operatingDayInfo(ds, vendor, date)
  if (!day.operating) {
    return {
      ...base,
      actualEa: rec?.qtyEa ?? null,
      attainment: null,
      status: 'nonOp',
      report: rep,
      reason: day.reason ?? 'Non-operating day',
    }
  }
  if (!rep || rep.status === 'Rejected') {
    return {
      ...base,
      actualEa: null,
      attainment: null,
      status: 'missing',
      report: rep,
      reason: rep ? 'Report received but rejected at validation' : 'No production report received',
    }
  }
  const actualEa = rec ? rec.qtyEa : null
  if ((planEa == null || planEa === 0) && monthlyPlan) {
    return {
      ...base,
      actualEa,
      attainment: null,
      status: 'monthly',
      report: rep,
      reason: 'Monthly plan – daily attainment not applicable',
    }
  }
  if (planEa == null || planEa === 0) {
    return {
      ...base,
      actualEa,
      attainment: null,
      status: 'noPlan',
      report: rep,
      reason: actualEa ? 'Production reported without a plan for this date' : 'No plan for this date',
    }
  }
  if (actualEa == null) {
    return {
      ...base,
      actualEa: null,
      attainment: null,
      status: 'missing',
      report: rep,
      reason: 'SKU line not present in the received report',
    }
  }
  if (actualEa === 0)
    return {
      ...base,
      actualEa,
      attainment: 0,
      status: 'zero',
      report: rep,
      reason: 'Vendor reported zero production',
    }
  const att = attainment(actualEa, planEa)!
  const t = thresholds(ds)
  const status: CellStatus = att < t.low ? 'below' : att > t.high ? 'above' : 'within'
  return {
    ...base,
    actualEa,
    attainment: att,
    status,
    report: rep,
    reason: '',
  }
}

// ── Aggregation ─────────────────────────────────────────────────────────────
export interface ProdAgg {
  /** Plan on dates up to the latest due date (daily plans only) */
  planDue: number
  /** Plan on dates where a valid report exists – the attainment denominator */
  planComparable: number
  /** All actual reported in scope (comparable + not compared) */
  actual: number
  /** Actual on reported dates that have a daily plan – the attainment numerator */
  actualComparable: number
  /** Part of `actual` with no daily plan to compare against – kept out of attainment. = monthly + noPlan + nonOp */
  actualUnplanned: number
  /** …of which: vendor plans monthly (daily attainment N/A) */
  actualMonthly: number
  /** …of which: no applicable plan for that SKU/date */
  actualNoPlan: number
  /** …of which: produced on a non-operating day */
  actualNonOp: number
  /** Plan on future dates within the period */
  planFuture: number
  /** Plan on days whose report is missing/rejected */
  planUnreported: number
  attainment: number | null
  gap: number // actualComparable − planComparable
  counts: Record<CellStatus, number>
  excluded: UnitExclusion[]
}

export function emptyCounts(): Record<CellStatus, number> {
  return {
    below: 0,
    within: 0,
    above: 0,
    monthly: 0,
    noPlan: 0,
    missing: 0,
    zero: 0,
    nonOp: 0,
    future: 0,
  }
}

export function aggregateCells(ds: Dataset, cells: ProdCell[], unit: Unit): ProdAgg {
  const agg: ProdAgg = {
    planDue: 0,
    planComparable: 0,
    actual: 0,
    actualComparable: 0,
    actualUnplanned: 0,
    actualMonthly: 0,
    actualNoPlan: 0,
    actualNonOp: 0,
    planFuture: 0,
    planUnreported: 0,
    attainment: null,
    gap: 0,
    counts: emptyCounts(),
    excluded: [],
  }
  const excluded = new Map<string, UnitExclusion>()
  for (const c of cells) {
    agg.counts[c.status]++
    const sku = ds.idx.sku.get(c.skuCode)!
    const cv = (ea: number | null) => {
      if (ea == null) return 0
      const v = convertFg(ea, sku, unit)
      if (v == null) {
        excluded.set(sku.code, {
          skuCode: sku.code,
          reason: 'No kg/EA weight in master data – excluded from MT totals',
        })
        return 0
      }
      return v
    }
    const p = cv(c.planEa)
    if (c.status === 'future') {
      agg.planFuture += p
      continue
    }
    if (c.status === 'nonOp') {
      const a = cv(c.actualEa)
      agg.actual += a
      agg.actualNonOp += a
      continue
    }
    agg.planDue += p
    if (c.status === 'missing') {
      agg.planUnreported += p
      continue
    }
    agg.planComparable += p
    const a = cv(c.actualEa)
    agg.actual += a
    if (c.status === 'monthly') agg.actualMonthly += a
    else if (c.status === 'noPlan') agg.actualNoPlan += a
    else agg.actualComparable += a
  }
  // Like-for-like: only actuals that have a daily plan count towards attainment and gap.
  agg.actualUnplanned = agg.actualMonthly + agg.actualNoPlan + agg.actualNonOp
  agg.attainment = agg.planComparable > 0 ? (agg.actualComparable / agg.planComparable) * 100 : null
  agg.gap = agg.actualComparable - agg.planComparable
  agg.excluded = [...excluded.values()]
  return agg
}

export function cellsFor(ds: Dataset, pairs: ScopePair[], from: ISODate, to: ISODate): ProdCell[] {
  const days = eachDay(from, to)
  const out: ProdCell[] = []
  for (const p of pairs) for (const d of days) out.push(prodCell(ds, p.vendor, p.sku, d))
  return out
}

/** Classify an aggregated attainment into the same risk buckets (no plan if denominator 0). */
export function aggStatus(ds: Dataset, a: ProdAgg): CellStatus {
  if (a.attainment == null) {
    if (a.counts.missing > 0 && a.planComparable === 0 && a.planDue > 0) return 'missing'
    if (a.planFuture > 0 && a.planDue === 0) return 'future'
    if (a.counts.monthly > 0) return 'monthly'
    if (a.counts.nonOp > 0 && a.counts.noPlan === 0 && a.planDue === 0) return 'nonOp'
    return 'noPlan'
  }
  const t = thresholds(ds)
  if (a.actualComparable === 0) return 'zero'
  return a.attainment < t.low ? 'below' : a.attainment > t.high ? 'above' : 'within'
}

// ── Monthly-plan handling (no invented daily distribution) ──────────────────
export interface MonthlyPlanRow {
  vendorId: string
  skuCode: string
  month: string
  monthPlanEa: number
  mtdActualEa: number
  /** Share of operating days elapsed – shown as context only, not used to split the plan */
  elapsedShare: number
}
export function monthlyPlanRows(ds: Dataset, pairs: ScopePair[], month: string): MonthlyPlanRow[] {
  const out: MonthlyPlanRow[] = []
  const start = `${month}-01`
  const end = monthEnd(month)
  for (const p of pairs) {
    const mp = ds.idx.monthlyPlan.get(`${p.vendor.id}|${p.sku.code}|${month}`)
    if (mp == null) continue
    let actual = 0
    for (const d of eachDay(start, end < LATEST_DUE_DATE ? end : LATEST_DUE_DATE)) actual += ds.idx.production.get(`${p.vendor.id}|${p.sku.code}|${d}`)?.qtyEa ?? 0
    const days = eachDay(start, end).filter((d) => operatingDayInfo(ds, p.vendor, d).operating)
    const elapsed = days.filter((d) => d <= LATEST_DUE_DATE).length
    out.push({
      vendorId: p.vendor.id,
      skuCode: p.sku.code,
      month,
      monthPlanEa: mp,
      mtdActualEa: actual,
      elapsedShare: days.length ? elapsed / days.length : 0,
    })
  }
  return out
}

// ── Run-rate ────────────────────────────────────────────────────────────────
export interface RunRate {
  month: string
  monthPlan: number
  mtdActual: number
  reportedDays: number
  remainingDays: number
  avgDaily: number | null
  requiredDaily: number | null
  projected: number | null
  projectedAttainment: number | null
}
/** Run-rate for daily-plan pairs in the month containing `asOf` (demo calculation). */
export function runRate(ds: Dataset, pairs: ScopePair[], unit: Unit, month = monthOf(DEMO_TODAY)): RunRate {
  const start = `${month}-01`
  const end = monthEnd(month)
  let monthPlan = 0
  let mtdActual = 0
  const reportedDaysSet = new Set<string>()
  const remainingSet = new Set<string>()
  for (const p of pairs) {
    for (const d of eachDay(start, end)) {
      const plan = ds.idx.dailyPlan.get(`${p.vendor.id}|${p.sku.code}|${d}`)
      if (plan != null) monthPlan += convertFg(plan, p.sku, unit) ?? 0
      const info = operatingDayInfo(ds, p.vendor, d)
      if (!info.operating) continue
      if (d <= LATEST_DUE_DATE) {
        const rep = ds.idx.report.get(reportKey(p.vendor.id, 'Production', d))
        const rec = ds.idx.production.get(`${p.vendor.id}|${p.sku.code}|${d}`)
        if (rep && rep.status !== 'Rejected') {
          reportedDaysSet.add(d)
          if (rec) mtdActual += convertFg(rec.qtyEa, p.sku, unit) ?? 0
        }
      } else remainingSet.add(d)
    }
  }
  const reportedDays = reportedDaysSet.size
  const remainingDays = remainingSet.size
  const avgDaily = reportedDays ? mtdActual / reportedDays : null
  const requiredDaily = remainingDays ? Math.max(0, monthPlan - mtdActual) / remainingDays : null
  const projected = avgDaily != null ? mtdActual + avgDaily * remainingDays : null
  return {
    month,
    monthPlan,
    mtdActual,
    reportedDays,
    remainingDays,
    avgDaily,
    requiredDaily,
    projected,
    projectedAttainment: projected != null && monthPlan ? (projected / monthPlan) * 100 : null,
  }
}

// ── Reporting coverage / freshness ──────────────────────────────────────────
export const DAILY_REPORT_TYPES: ReportType[] = ['Production', 'Dispatch', 'FG Inventory']
export const ALL_REPORT_TYPES: ReportType[] = ['Production', 'Dispatch', 'FG Inventory', 'RM Inventory', 'PM Inventory']

export type Freshness = 'Current' | 'Stale' | 'Missing'
export interface ReportFreshness {
  vendor: Vendor
  type: ReportType
  latest: VendorReport | null
  latestValidDate: ISODate | null
  expectedDate: ISODate | null
  freshness: Freshness
  missingDates: ISODate[] // expected operating dates without a valid report (in lookback)
  ageDays: number | null
}

/** Latest operating day on or before `d` for the vendor. */
export function lastOperatingDay(ds: Dataset, vendor: Vendor, d: ISODate): ISODate {
  let x = d
  for (let i = 0; i < 14; i++) {
    if (operatingDayInfo(ds, vendor, x).operating) return x
    x = addDays(x, -1)
  }
  return d
}

export function reportFreshness(ds: Dataset, vendor: Vendor, type: ReportType, lookbackFrom: ISODate = '2026-10-01'): ReportFreshness {
  const reports = ds.vendorReports.filter((r) => r.vendorId === vendor.id && r.type === type)
  const valid = reports.filter((r) => r.status !== 'Rejected')
  const latest = reports.reduce<VendorReport | null>((a, r) => (!a || r.reportDate > a.reportDate || (r.reportDate === a.reportDate && r.receivedAt > a.receivedAt) ? r : a), null)
  const latestValidDate = valid.reduce<ISODate | null>((a, r) => (!a || r.reportDate > a ? r.reportDate : a), null)
  const weekly = type === 'RM Inventory' || type === 'PM Inventory'
  const expectedDate = weekly ? null : lastOperatingDay(ds, vendor, LATEST_DUE_DATE)
  const missingDates: ISODate[] = []
  if (!weekly) {
    for (const d of eachDay(lookbackFrom, LATEST_DUE_DATE)) {
      if (!operatingDayInfo(ds, vendor, d).operating) continue
      const r = ds.idx.report.get(reportKey(vendor.id, type, d))
      if (!r || r.status === 'Rejected') missingDates.push(d)
    }
  }
  const ageDays = latestValidDate ? diffDays(LATEST_DUE_DATE, latestValidDate) : null
  const staleLimit = weekly ? (ds.idx.param.staleDaysWeekly ?? 4) : (ds.idx.param.staleDaysDaily ?? 1)
  let freshness: Freshness = 'Current'
  if (!latestValidDate) freshness = 'Missing'
  else if (!weekly && expectedDate && latestValidDate < expectedDate) {
    // Expected report not in yet → Missing; latest valid data older than the stale limit → Stale
    freshness = diffDays(expectedDate, latestValidDate) > staleLimit ? 'Stale' : 'Missing'
  } else if (weekly && ageDays != null && ageDays > staleLimit) freshness = 'Stale'
  return {
    vendor,
    type,
    latest,
    latestValidDate,
    expectedDate,
    freshness,
    missingDates,
    ageDays,
  }
}

export function coverageSummary(ds: Dataset, vendors: Vendor[], types: ReportType[] = DAILY_REPORT_TYPES) {
  const rows = vendors.flatMap((v) => types.map((t) => reportFreshness(ds, v, t)))
  return {
    rows,
    current: rows.filter((r) => r.freshness === 'Current').length,
    stale: rows.filter((r) => r.freshness === 'Stale').length,
    missing: rows.filter((r) => r.freshness === 'Missing').length,
    total: rows.length,
  }
}

// ── Dispatch ────────────────────────────────────────────────────────────────
export function dispatchedEa(ds: Dataset, vendorId: string, skuCode: string, from: ISODate, to: ISODate): number {
  return (ds.idx.dispatch.get(`${vendorId}|${skuCode}`) ?? []).filter((d) => d.date >= from && d.date <= to).reduce((a, d) => a + d.qtyEa, 0)
}
export function producedEa(ds: Dataset, vendorId: string, skuCode: string, from: ISODate, to: ISODate): number {
  let t = 0
  for (const d of eachDay(from, to < LATEST_DUE_DATE ? to : LATEST_DUE_DATE)) t += ds.idx.production.get(`${vendorId}|${skuCode}|${d}`)?.qtyEa ?? 0
  return t
}

// ── FG inventory ────────────────────────────────────────────────────────────
export function latestFgSnapshot(ds: Dataset, vendorId: string, skuCode: string, asOf: ISODate = LATEST_DUE_DATE) {
  let best = null as Dataset['fgSnapshots'][number] | null
  for (const s of ds.fgSnapshots) {
    if (s.vendorId !== vendorId || s.skuCode !== skuCode || s.snapshotDate > asOf) continue
    if (!best || s.snapshotDate > best.snapshotDate) best = s
  }
  return best
}
/** Baseline = mean of Monday snapshots in the N weeks before the latest snapshot (demo assumption). */
export function fgBaseline(ds: Dataset, vendorId: string, skuCode: string, asOf: ISODate): { value: number | null; dates: ISODate[] } {
  const weeks = ds.idx.param.baselineWeeks ?? 4
  const from = addDays(asOf, -7 * weeks)
  const snaps = ds.fgSnapshots.filter((s) => s.vendorId === vendorId && s.skuCode === skuCode && s.snapshotDate >= from && s.snapshotDate < asOf && new Date(s.snapshotDate).getUTCDay() === 1)
  if (!snaps.length) return { value: null, dates: [] }
  return {
    value: snaps.reduce((a, s) => a + s.qtyEa, 0) / snaps.length,
    dates: snaps.map((s) => s.snapshotDate),
  }
}

export function convertOrNull(ds: Dataset, skuCode: string, ea: number | null, unit: Unit): number | null {
  if (ea == null) return null
  const sku = ds.idx.sku.get(skuCode)
  return sku ? convertFg(ea, sku, unit) : null
}

export const STATUS_ORDER: CellStatus[] = ['below', 'within', 'above', 'zero', 'monthly', 'noPlan', 'missing', 'nonOp', 'future']
