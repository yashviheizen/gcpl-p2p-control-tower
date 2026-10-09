// Shared helpers for the planning pages (plan view, compare, upload). Pure functions over the dataset.
import type { Dataset } from '@/data/dataset'
import type { PlanLine, PlanVersion, Sku, Unit } from '@/data/types'
import { convertFg } from '@/lib/units'

export const planKey = (vendorId: string, month: string) => `${vendorId}|${month}`

export function versionsFor(ds: Dataset, vendorId: string, month?: string): PlanVersion[] {
  return ds.planVersions.filter((v) => v.vendorId === vendorId && (!month || v.month === month)).sort((a, b) => (a.month === b.month ? a.versionNo - b.versionNo : a.month.localeCompare(b.month)))
}

export function activeVersionId(ds: Dataset, vendorId: string, month: string): string | null {
  return ds.activePlan[planKey(vendorId, month)] ?? null
}

export function planMonths(ds: Dataset): string[] {
  return [...new Set(ds.planVersions.map((v) => v.month))].sort()
}

const linesCache = new WeakMap<PlanLine[], Map<string, PlanLine[]>>()
/** Lines grouped by version id (cached per dataset line array). */
export function linesByVersion(ds: Dataset): Map<string, PlanLine[]> {
  let m = linesCache.get(ds.planLines)
  if (!m) {
    m = new Map()
    for (const l of ds.planLines) {
      if (!m.has(l.versionId)) m.set(l.versionId, [])
      m.get(l.versionId)!.push(l)
    }
    linesCache.set(ds.planLines, m)
  }
  return m
}

/** Converted quantity; null when the unit cannot be applied to this SKU (e.g. MT without weight). */
export function qtyIn(sku: Sku | undefined, ea: number, unit: Unit): number | null {
  if (!sku) return unit === 'EA' ? ea : null
  return convertFg(ea, sku, unit)
}

export function totalIn(ds: Dataset, lines: PlanLine[], unit: Unit): { total: number; excluded: Set<string> } {
  let total = 0
  const excluded = new Set<string>()
  for (const l of lines) {
    const v = qtyIn(ds.idx.sku.get(l.skuCode), l.qtyEa, unit)
    if (v == null) excluded.add(l.skuCode)
    else total += v
  }
  return { total, excluded }
}
