import { describe, expect, it } from 'vitest'
import { MONTHLY_PLAN_TIP } from '@/components/status'
import { baseMaster, buildDataset } from '@/data/dataset'
import { DEFAULT_FILTERS } from '@/lib/filters'
import { aggregateCells, cellsFor, scopePairs, type ProdCell } from '@/lib/metrics'
import { groupStatus } from '@/pages/production/model'

const ds = buildDataset({ master: baseMaster, extraPlanVersions: [], extraPlanLines: [], activePlan: {}, extraBatches: [], extraReports: [] })
const f = DEFAULT_FILTERS
const cells = cellsFor(ds, scopePairs(ds, f), f.dateFrom, f.dateTo)
const aav = cells.filter((c) => c.vendorId === 'V-AAV')

describe('monthly-plan heatmap cells', () => {
  it('explains the monthly status in one shared sentence', () => {
    expect(MONTHLY_PLAN_TIP).toBe('Daily attainment unavailable: this vendor plans monthly.')
  })

  it('keeps non-operating and future days distinct from monthly-plan days', () => {
    const group = (cs: ProdCell[]) => groupStatus(ds, cs, aggregateCells(ds, cs, 'EA'))
    const byDate = (d: string) => group(aav.filter((c) => c.date === d))
    expect(byDate('2026-09-28')).toBe('monthly')
    expect(byDate('2026-10-09')).toBe('future')
    const off = [...new Set(aav.filter((c) => c.status === 'nonOp').map((c) => c.date))]
    expect(off.length).toBeGreaterThan(0)
    for (const d of off) expect(byDate(d)).toBe('nonOp')
  })

  it('rolls a missed report for a monthly-plan vendor up as “Report missing”, not “No plan”', () => {
    const missed: ProdCell[] = aav.filter((c) => c.date === '2026-09-28').map((c) => ({ ...c, status: 'missing', actualEa: null, report: null }))
    expect(groupStatus(ds, missed, aggregateCells(ds, missed, 'EA'))).toBe('missing')
  })

  it('leaves monthly-plan calculations unchanged: no comparable plan, actual kept as monthly', () => {
    const a = aggregateCells(ds, aav, 'EA')
    expect(a.planComparable).toBe(0)
    expect(a.attainment).toBeNull()
    expect(a.actualMonthly).toBeGreaterThan(0)
    expect(a.actualComparable).toBe(0)
  })
})
