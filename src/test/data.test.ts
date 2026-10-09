import { describe, expect, it } from 'vitest'
import { baseMaster, buildDataset } from '@/data/dataset'
import { aggregateCells, cellsFor, coverageSummary, scopePairs, runRate, attainment } from '@/lib/metrics'
import { detectExceptions } from '@/lib/exceptions'
import { convertFg } from '@/lib/units'

const ds = buildDataset({ master: baseMaster, extraPlanVersions: [], extraPlanLines: [], activePlan: {}, extraBatches: [], extraReports: [] })
const f = { dateFrom: '2026-10-01', dateTo: '2026-10-09', vendorIds: [], hierarchy: null, search: '', unit: 'EA' as const }

describe('demo dataset', () => {
  it('summary', () => {
    const pairs = scopePairs(ds, f)
    const cells = cellsFor(ds, pairs, f.dateFrom, f.dateTo)
    const agg = aggregateCells(ds, cells, 'EA')
    console.log('records', ds.productionRecords.length, ds.dispatchRecords.length, ds.vendorReports.length, ds.uploadBatches.length)
    console.log('agg', JSON.stringify(agg))
    const cov = coverageSummary(ds, ds.vendors)
    console.log('coverage', cov.current, cov.stale, cov.missing, cov.rows.filter(r=>r.freshness!=='Current').map(r=>`${r.vendor.name}/${r.type}/${r.freshness}/${r.latestValidDate}`))
    console.log('runrate', JSON.stringify(runRate(ds, pairs, 'EA')))
    const ex = detectExceptions(ds)
    console.log('exceptions', ex.length, ex.map(e=>`${e.severity} ${e.kind}: ${e.title}`).join('\n'))
    expect(agg.planComparable).toBeGreaterThan(0)
  })
  it('heatmap totals reconcile: sum of per-pair aggregates equals total aggregate', () => {
    for (const unit of ['EA', 'CS', 'MT'] as const) {
      const pairs = scopePairs(ds, f)
      const total = aggregateCells(ds, cellsFor(ds, pairs, f.dateFrom, f.dateTo), unit)
      const parts = pairs.map((p) => aggregateCells(ds, cellsFor(ds, [p], f.dateFrom, f.dateTo), unit))
      expect(parts.reduce((a, p) => a + p.actual, 0)).toBeCloseTo(total.actual, 6)
      expect(parts.reduce((a, p) => a + p.planComparable, 0)).toBeCloseTo(total.planComparable, 6)
    }
  })
  it('attainment is like-for-like: actuals without a daily plan (monthly-plan vendor) are excluded', () => {
    const cells = cellsFor(ds, scopePairs(ds, f), f.dateFrom, f.dateTo)
    const agg = aggregateCells(ds, cells, 'EA')
    const planned = cells.filter((c) => c.status !== 'noPlan' && c.status !== 'monthly' && c.status !== 'nonOp' && c.status !== 'future' && c.status !== 'missing')
    const plannedActual = planned.reduce((a, c) => a + (c.actualEa ?? 0), 0)
    expect(agg.actualUnplanned).toBeGreaterThan(0)
    expect(agg.actual - agg.actualUnplanned).toBe(plannedActual)
    expect(agg.attainment).toBeCloseTo((plannedActual / agg.planComparable) * 100, 6)
  })
  it('attainment with zero denominator is null (No plan), not infinity', () => {
    expect(attainment(100, 0)).toBeNull()
    expect(attainment(null, 100)).toBeNull()
    expect(attainment(90, 100)).toBe(90)
  })
  it('units convert through case pack; MT only with weight', () => {
    const sku = ds.idx.sku.get('FG1004011')!
    expect(convertFg(960, sku, 'CS')).toBe(10)
    expect(convertFg(1000, ds.idx.sku.get('FG1004021')!, 'MT')).toBeNull()
  })
})
