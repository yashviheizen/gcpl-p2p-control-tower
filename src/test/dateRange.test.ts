import { describe, expect, it } from 'vitest'
import { baseMaster, buildDataset } from '@/data/dataset'
import { DEFAULT_FILTERS } from '@/lib/filters'
import { eachDay, fmtMonthToDate, fmtRange, LATEST_DUE_DATE } from '@/lib/dates'
import { aggregateCells, cellsFor, monthlyPlanRows, runRate, scopePairs } from '@/lib/metrics'

const ds = buildDataset({ master: baseMaster, extraPlanVersions: [], extraPlanLines: [], activePlan: {}, extraBatches: [], extraReports: [] })
const f = DEFAULT_FILTERS

describe('default period 27 Sep – 9 Oct 2026', () => {
  it('defaults to the cross-month range and labels it clearly', () => {
    expect([f.dateFrom, f.dateTo]).toEqual(['2026-09-27', '2026-10-09'])
    expect(fmtRange(f.dateFrom, f.dateTo)).toBe('27 Sep – 9 Oct 2026')
  })

  it('keeps the report cutoff: 9 Oct is not due, nothing after 8 Oct is counted', () => {
    const cells = cellsFor(ds, scopePairs(ds, f), f.dateFrom, f.dateTo)
    const oct9 = cells.filter((c) => c.date === '2026-10-09')
    expect(oct9.length).toBeGreaterThan(0)
    expect(oct9.every((c) => c.status === 'future' && c.actualEa == null)).toBe(true)
    expect(LATEST_DUE_DATE).toBe('2026-10-08')
  })

  it('has September plans/reports for 27–30 Sep; no-plan and off days are never zero', () => {
    const cells = cellsFor(ds, scopePairs(ds, f), '2026-09-27', '2026-09-30')
    expect(cells.filter((c) => c.planEa != null && c.actualEa != null).length).toBeGreaterThan(0)
    expect(cells.filter((c) => c.vendorId === 'V-PAY' && c.date === '2026-09-27').every((c) => c.status === 'nonOp' && c.attainment == null)).toBe(true) // vendor calendar: off day
    expect(cells.filter((c) => ['missing', 'noPlan', 'monthly', 'nonOp'].includes(c.status)).every((c) => c.attainment == null)).toBe(true)
    // Monthly-plan vendor (Aavishkar): reported but not compared daily
    expect(cells.filter((c) => c.vendorId === 'V-AAV').every((c) => c.status === 'monthly')).toBe(true)
  })

  it('missing reports inside the period stay missing, not zero', () => {
    const rk = cellsFor(ds, scopePairs(ds, f), '2026-10-07', '2026-10-08').filter((c) => c.vendorId === 'V-RKPL')
    expect(rk.length).toBeGreaterThan(0)
    expect(rk.every((c) => c.status === 'missing' && c.actualEa == null)).toBe(true)
  })

  it('selected-period KPIs span both months; run-rate stays Oct 2026 MTD', () => {
    const pairs = scopePairs(ds, f)
    const sep = aggregateCells(ds, cellsFor(ds, pairs, '2026-09-27', '2026-09-30'), 'EA')
    const oct = aggregateCells(ds, cellsFor(ds, pairs, '2026-10-01', '2026-10-09'), 'EA')
    const all = aggregateCells(ds, cellsFor(ds, pairs, f.dateFrom, f.dateTo), 'EA')
    expect(all.planComparable).toBe(sep.planComparable + oct.planComparable)
    expect(all.actualComparable).toBe(sep.actualComparable + oct.actualComparable)
    console.log('default-period KPIs', JSON.stringify({ plan: all.planComparable, actual: all.actualComparable, att: all.attainment, gap: all.gap }))
    const rr = runRate(ds, pairs, 'EA')
    expect(rr.month).toBe('2026-10')
    expect(fmtMonthToDate(rr.month)).toBe('Oct 2026 MTD')
    expect(fmtMonthToDate('2026-09')).toBe('Sep 2026 (full month)')
    const months = [...new Set(eachDay(f.dateFrom, f.dateTo).map((d) => d.slice(0, 7)))]
    expect(months).toEqual(['2026-09', '2026-10'])
    expect(monthlyPlanRows(ds, pairs, '2026-09').every((r) => r.elapsedShare === 1)).toBe(true)
  })
})
