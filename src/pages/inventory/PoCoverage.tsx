import { AlertOctagon, AlertTriangle, ArrowUp, CheckCircle2, ClipboardCheck, MinusCircle, type LucideIcon } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { AssumptionNote, Badge, Callout, Card, CellText, EmptyState, ExportButton, HelpTip, Kpi, LocalFilters, PageHeader, Segmented, TableWrap, cx, downloadCsv, td, tdNum, th, useOriginState, type Tone } from '@/components/ui'
import type { PlanGranularity, PoLine } from '@/data/types'
import { eachDay, fmtDate, fmtMonth, monthEnd, monthOf } from '@/lib/dates'
import { useFilters, usePageFilters } from '@/lib/filters'
import { fmtPct, fmtQty } from '@/lib/format'
import { convertOrNull, scopePairs } from '@/lib/metrics'
import { useDataset, usePermissions } from '@/lib/store'
import { ExpandToggle, HeadPeriod, MtExclusionNote, qtyText, SkuLink, stickyTd, stickyTh, subTh, sumUnit } from './shared'

type CovStatus = 'noPlan' | 'noPo' | 'under' | 'covered' | 'over'
const COV_META: Record<CovStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  noPo: { label: 'No PO', tone: 'bad', icon: AlertOctagon },
  under: { label: 'Under-covered', tone: 'warn', icon: AlertTriangle },
  covered: { label: 'Covered', tone: 'ok', icon: CheckCircle2 },
  over: { label: 'PO above plan', tone: 'info', icon: ArrowUp },
  noPlan: { label: 'No plan', tone: 'none', icon: MinusCircle },
}
const OVER_PCT = 120

interface Row {
  key: string
  vendorName: string
  skuCode: string
  granularity: PlanGranularity | null
  planEa: number | null
  poEa: number
  receivedEa: number
  coveredEa: number
  uncoveredEa: number
  coveragePct: number | null
  status: CovStatus
  lines: PoLine[]
  otherMonthLines: PoLine[]
}

export default function PoCoverage() {
  usePageFilters(['date', 'vendor', 'product', 'unit'], {
    date: 'Coverage uses the month of the period end date',
  })
  const ds = useDataset()
  const { filters: f } = useFilters()
  const { can } = usePermissions()
  const origin = useOriginState('PO Coverage')
  const unit = f.unit
  const month = monthOf(f.dateTo)
  const spansMonths = monthOf(f.dateFrom) !== month
  const [view, setView] = useState<'all' | 'gaps'>('all')
  const [open, setOpen] = useState<Set<string>>(new Set())

  const rows = useMemo<Row[]>(() => {
    const mStart = `${month}-01`
    const mEnd = monthEnd(month)
    return scopePairs(ds, f).map(({ vendor, sku }) => {
      const key = `${vendor.id}|${sku.code}`
      const granularity = ds.idx.planGranularity.get(`${vendor.id}|${month}`) ?? null
      let planEa: number | null = null
      if (granularity === 'Monthly') planEa = ds.idx.monthlyPlan.get(`${key}|${month}`) ?? null
      else if (granularity === 'Daily') {
        let t = 0
        let any = false
        for (const d of eachDay(mStart, mEnd)) {
          const q = ds.idx.dailyPlan.get(`${key}|${d}`)
          if (q != null) {
            t += q
            any = true
          }
        }
        planEa = any ? t : null
      }
      const all = ds.poLines.filter((l) => l.vendorId === vendor.id && l.skuCode === sku.code)
      const lines = all.filter((l) => l.deliveryDate >= mStart && l.deliveryDate <= mEnd)
      const otherMonthLines = all.filter((l) => !lines.includes(l))
      const poEa = lines.reduce((a, l) => a + l.orderedEa, 0)
      const receivedEa = lines.reduce((a, l) => a + l.receivedEa, 0)
      const plan = planEa ?? 0
      const coveredEa = Math.min(plan, poEa)
      const uncoveredEa = Math.max(0, plan - poEa)
      const coveragePct = plan > 0 ? (poEa / plan) * 100 : null
      const status: CovStatus = plan <= 0 ? 'noPlan' : poEa === 0 ? 'noPo' : coveragePct! < 100 ? 'under' : coveragePct! > OVER_PCT ? 'over' : 'covered'
      return {
        key,
        vendorName: vendor.name,
        skuCode: sku.code,
        granularity,
        planEa,
        poEa,
        receivedEa,
        coveredEa,
        uncoveredEa,
        coveragePct,
        status,
        lines,
        otherMonthLines,
      }
    })
  }, [ds, f, month])

  const shown = useMemo(() => {
    const list = view === 'gaps' ? rows.filter((r) => r.status === 'noPo' || r.status === 'under') : rows
    return [...list].sort((a, b) => b.uncoveredEa - a.uncoveredEa || a.vendorName.localeCompare(b.vendorName))
  }, [rows, view])

  const totals = useMemo(() => {
    const s = (pick: (r: Row) => number | null) =>
      sumUnit(
        ds,
        rows.map((r) => ({ skuCode: r.skuCode, ea: pick(r) })),
        unit,
      )
    const plan = s((r) => r.planEa)
    const po = s((r) => r.poEa)
    const covered = s((r) => r.coveredEa)
    const uncovered = s((r) => r.uncoveredEa)
    return {
      plan: plan.total,
      po: po.total,
      covered: covered.total,
      uncovered: uncovered.total,
      excluded: [...new Set([...plan.excluded, ...po.excluded])],
      poLines: rows.reduce((a, r) => a + r.lines.length, 0),
      gapLines: rows.filter((r) => r.status === 'noPo' || r.status === 'under').length,
    }
  }, [rows, ds, unit])

  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const exportCsv = () =>
    downloadCsv(`po_coverage_${month}_${unit}.csv`, [
      ['Demo data – demo calculation, not connected to GCPL systems'],
      ['Vendor', 'SKU', 'Plan granularity', `Plan (${unit})`, `PO qty (${unit})`, `Covered (${unit})`, `Uncovered (${unit})`, 'Coverage %', 'Status', 'PO lines'],
      ...shown.map((r) => [
        r.vendorName,
        r.skuCode,
        r.granularity ?? 'None',
        convertOrNull(ds, r.skuCode, r.planEa, unit),
        convertOrNull(ds, r.skuCode, r.poEa, unit),
        convertOrNull(ds, r.skuCode, r.coveredEa, unit),
        convertOrNull(ds, r.skuCode, r.uncoveredEa, unit),
        r.coveragePct == null ? null : Math.round(r.coveragePct * 10) / 10,
        COV_META[r.status].label,
        r.lines.map((l) => `${l.poNumber}/${l.lineNo}`).join(' '),
      ]),
    ])

  const overallPct = totals.plan ? (totals.covered / totals.plan) * 100 : null

  return (
    <>
      <PageHeader
        title="PO coverage"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            Active production plan vs purchase-order quantity per vendor–SKU · {fmtMonth(month)} · {unit}
          </span>
        }
        actions={<ExportButton onClick={exportCsv} disabled={!can('export.data') || !shown.length} />}
      />
      <div className="space-y-6">
        <AssumptionNote>
          Demo calculation: coverage = PO quantity ÷ active plan quantity for the month; formula pending GCPL confirmation. Covered = min(plan, PO qty); uncovered = plan − covered. PO lines count toward the month of their delivery date.
        </AssumptionNote>

        {spansMonths && (
          <Callout tone="info" title={`Showing ${fmtMonth(month)} only`} details="PO coverage is evaluated per month. Change the period end date to view another month.">
            The selected period spans more than one month; coverage uses the month of the period end ({fmtDate(f.dateTo, true)}).
          </Callout>
        )}

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          <Kpi
            label="Plan quantity"
            value={fmtQty(totals.plan, unit)}
            unit={unit}
            period={fmtMonth(month)}
            help="Full-month quantity from the active plan version: daily plans summed over the month; monthly plans used as-is (no daily split)."
          />
          <Kpi label="PO quantity" value={fmtQty(totals.po, unit)} unit={unit} period={fmtMonth(month)} sub={`${totals.poLines} PO line(s)`} help="Ordered quantity on PO lines with a delivery date in the month." />
          <Kpi label="Covered" value={fmtQty(totals.covered, unit)} unit={unit} period={fmtMonth(month)} sub={`${fmtPct(overallPct)} of plan`} help="Sum over lines of min(plan, PO qty). Excess PO on one SKU does not offset another." />
          <Kpi
            label="Uncovered"
            value={fmtQty(totals.uncovered, unit)}
            unit={unit}
            period={fmtMonth(month)}
            status={
              totals.uncovered > 0 ? (
                <Badge tone="warn" icon={AlertTriangle}>
                  Plan without PO
                </Badge>
              ) : (
                <Badge tone="ok" icon={CheckCircle2}>
                  Fully covered
                </Badge>
              )
            }
          />
          <Kpi
            label="Lines with gaps"
            value={totals.gapLines}
            unit={`of ${rows.length}`}
            status={
              totals.gapLines ? (
                <Badge tone="warn" icon={AlertTriangle}>
                  Review
                </Badge>
              ) : undefined
            }
            help="Vendor–SKU lines that are under-covered or have no PO for the month."
          />
        </div>

        <Card
          title="Coverage by vendor × SKU"
          subtitle="Expand a line to see its PO lines"
          bodyClass="p-0"
          actions={
            <LocalFilters className="py-1">
              <Segmented
                size="sm"
                label="Lines shown"
                value={view}
                onChange={setView}
                options={[
                  { value: 'all', label: `All (${rows.length})` },
                  { value: 'gaps', label: `Gaps only (${totals.gapLines})` },
                ]}
              />
            </LocalFilters>
          }
        >
          {shown.length ? (
            <TableWrap maxHeight={560}>
              <table className="w-full min-w-[1040px] border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className={cx(th, stickyTh)}>SKU</th>
                    <th className={th}>Vendor</th>
                    <th className={th}>Plan type</th>
                    <th className={cx(th, 'text-right')}>
                      <HeadPeriod title={`Plan (${unit})`}>Full month · active version</HeadPeriod>
                    </th>
                    <th className={cx(th, 'text-right')}>
                      <HeadPeriod title={`PO qty (${unit})`}>Delivery in month</HeadPeriod>
                    </th>
                    <th className={cx(th, 'text-right')}>Covered ({unit})</th>
                    <th className={cx(th, 'text-right')}>Uncovered ({unit})</th>
                    <th className={cx(th, 'text-right')}>
                      <span className="inline-flex items-center gap-0.5">
                        Coverage
                        <HelpTip label="How coverage is calculated" align="right">
                          Coverage % = PO quantity ÷ plan quantity × 100. Under 100% = under-covered; above {OVER_PCT}% = PO above plan (shown for review, not as a problem). Demo thresholds.
                        </HelpTip>
                      </span>
                    </th>
                    <th className={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const isOpen = open.has(r.key)
                    const meta = COV_META[r.status]
                    return (
                      <Fragment key={r.key}>
                        <tr className="group hover:bg-surface-muted">
                          <td className={cx(td, stickyTd, 'max-w-[260px] group-hover:bg-surface-muted')}>
                            <div className="flex items-center gap-1">
                              <ExpandToggle open={isOpen} onClick={() => toggle(r.key)} label={`PO lines for ${r.skuCode} at ${r.vendorName}`} />
                              <SkuLink ds={ds} code={r.skuCode} origin={origin} />
                            </div>
                          </td>
                          <td className={cx(td, 'max-w-[180px]')}>
                            <CellText text={r.vendorName} />
                          </td>
                          <td className={cx(td, 'whitespace-nowrap text-dense text-ink-muted')}>{r.granularity === 'Monthly' ? 'Monthly plan' : r.granularity === 'Daily' ? 'Daily (summed)' : 'No plan'}</td>
                          <td className={tdNum}>{qtyText(ds, r.skuCode, r.planEa, unit)}</td>
                          <td className={tdNum}>{r.poEa ? qtyText(ds, r.skuCode, r.poEa, unit) : <span className="text-ink-subtle">0</span>}</td>
                          <td className={tdNum}>{r.planEa ? qtyText(ds, r.skuCode, r.coveredEa, unit) : '—'}</td>
                          <td className={cx(tdNum, r.uncoveredEa > 0 && 'font-semibold text-warn')}>{r.planEa ? qtyText(ds, r.skuCode, r.uncoveredEa, unit) : '—'}</td>
                          <td className={tdNum}>
                            {r.coveragePct == null ? (
                              '—'
                            ) : (
                              <span className="inline-flex items-center justify-end gap-2">
                                <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-none-soft" aria-hidden>
                                  <span
                                    className={cx('absolute inset-y-0 left-0 rounded-full', r.coveragePct < 100 ? 'bg-warn' : 'bg-ok')}
                                    style={{
                                      width: `${Math.min(100, r.coveragePct)}%`,
                                    }}
                                  />
                                </span>
                                {fmtPct(r.coveragePct)}
                              </span>
                            )}
                          </td>
                          <td className={td}>
                            <Badge tone={meta.tone} icon={meta.icon}>
                              {meta.label}
                            </Badge>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={9} className="border-b border-line bg-surface-muted px-4 py-3">
                              <PoLinesTable row={r} month={month} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className={cx(td, stickyTd, 'bg-surface-muted')}>Total · {rows.length} lines in scope</td>
                    <td className={cx(td, 'bg-surface-muted')} colSpan={2} />
                    <td className={cx(tdNum, 'bg-surface-muted')}>{fmtQty(totals.plan, unit)}</td>
                    <td className={cx(tdNum, 'bg-surface-muted')}>{fmtQty(totals.po, unit)}</td>
                    <td className={cx(tdNum, 'bg-surface-muted')}>{fmtQty(totals.covered, unit)}</td>
                    <td className={cx(tdNum, 'bg-surface-muted')}>{fmtQty(totals.uncovered, unit)}</td>
                    <td className={cx(tdNum, 'bg-surface-muted')}>{fmtPct(overallPct)}</td>
                    <td className={cx(td, 'bg-surface-muted')} />
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
          ) : (
            <EmptyState icon={ClipboardCheck} title={rows.length ? 'No coverage gaps' : 'No vendor–SKU lines match the filters'}>
              {rows.length ? 'Every line in scope has PO quantity at or above plan.' : 'Adjust the vendor or product filters, or reset them.'}
            </EmptyState>
          )}
        </Card>
        <MtExclusionNote ds={ds} codes={totals.excluded} />
      </div>
    </>
  )
}

function PoLinesTable({ row, month }: { row: Row; month: string }) {
  const ds = useDataset()
  const { filters } = useFilters()
  const unit = filters.unit
  const all = [...row.lines, ...row.otherMonthLines]
  if (!all.length) return <p className="text-dense text-ink-muted">No purchase-order lines for this vendor–SKU.</p>
  return (
    <div className="max-w-[860px]">
      <div className="mb-1.5 text-dense font-semibold text-ink-muted">Purchase-order lines · lines delivering outside {fmtMonth(month)} are listed but not counted</div>
      <table className="w-full border-separate border-spacing-0 rounded border border-line bg-surface">
        <thead>
          <tr>
            <th className={subTh}>PO no.</th>
            <th className={cx(subTh, 'text-right')}>Line</th>
            <th className={cx(subTh, 'text-right')}>Ordered ({unit})</th>
            <th className={cx(subTh, 'text-right')}>Received ({unit})</th>
            <th className={cx(subTh, 'text-right')}>Open ({unit})</th>
            <th className={subTh}>Delivery date</th>
            <th className={subTh}>PO status</th>
            <th className={subTh}>Counted</th>
          </tr>
        </thead>
        <tbody>
          {all.map((l) => {
            const counted = row.lines.includes(l)
            return (
              <tr key={l.id} className={cx(!counted && 'text-ink-muted')}>
                <td className={cx(td, 'num')}>{l.poNumber}</td>
                <td className={tdNum}>{l.lineNo}</td>
                <td className={tdNum}>{qtyText(ds, l.skuCode, l.orderedEa, unit)}</td>
                <td className={tdNum}>{qtyText(ds, l.skuCode, l.receivedEa, unit)}</td>
                <td className={tdNum}>{qtyText(ds, l.skuCode, l.orderedEa - l.receivedEa, unit)}</td>
                <td className={cx(td, 'num')}>{fmtDate(l.deliveryDate, true)}</td>
                <td className={td}>{l.status}</td>
                <td className={td}>
                  {counted ? (
                    <Badge tone="accent" icon={CheckCircle2}>
                      {fmtMonth(month)}
                    </Badge>
                  ) : (
                    <Badge tone="none" icon={MinusCircle}>
                      Other month
                    </Badge>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
