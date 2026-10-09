// Overview – "what needs my attention today" for the current global filter scope.
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, ChevronDown, ChevronRight, Filter } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { legendText } from '@/pages/inventory/shared'
import { CELL_META, CellStatusBadge, ExStatusBadge, FreshnessBadge, NotComparedLine, SeverityBadge } from '@/components/status'
import { AssumptionNote, Button, Card, CellText, Details, EmptyState, HelpTip, Kpi, PageHeader, TableWrap, cx, td, tdNum, th, useOriginState } from '@/components/ui'
import { titleWithoutVendor } from '@/lib/exceptions'
import type { ExceptionItem, Severity } from '@/data/types'
import { DEMO_TODAY, LATEST_DUE_DATE, eachDay, fmtDate, fmtMonth, fmtRange, monthOf } from '@/lib/dates'
import { useFilters, usePageFilters } from '@/lib/filters'
import { fmtCompact, fmtPct, fmtQty, fmtSigned } from '@/lib/format'
import { filterLink } from '@/lib/links'
import { ALL_REPORT_TYPES, aggStatus, aggregateCells, cellsFor, convertOrNull, coverageSummary, monthlyPlanRows, runRate, scopePairs, skuMatchesScope, thresholds, type ProdCell } from '@/lib/metrics'
import { useDataset, useExceptions } from '@/lib/store'

const OPEN_STATUSES = new Set(['Open', 'Investigating', 'Waiting on vendor'])
const SEV_RANK: Record<Severity, number> = { High: 0, Medium: 1, Low: 2 }
const VENDOR_COLORS = ['#0d7c74', '#3b6fc4', '#8a5cc2', '#b86e00', '#c2456b']

/** Issues shown by default; the full list lives on Exceptions. */
const TOP_ISSUES = 5

export default function Overview() {
  usePageFilters(['date', 'vendor', 'product', 'unit'])
  const ds = useDataset()
  const { filters, reset } = useFilters()
  const exceptions = useExceptions()
  const origin = useOriginState('Overview')
  const unit = filters.unit
  const [expanded, setExpanded] = useState<string | null>(null)

  const pairs = useMemo(() => scopePairs(ds, filters), [ds, filters])
  const vendors = useMemo(() => ds.vendors.filter((v) => pairs.some((p) => p.vendor.id === v.id)), [ds, pairs])
  const skuCount = useMemo(() => new Set(pairs.map((p) => p.sku.code)).size, [pairs])
  const cells = useMemo(() => cellsFor(ds, pairs, filters.dateFrom, filters.dateTo), [ds, pairs, filters.dateFrom, filters.dateTo])
  const agg = useMemo(() => aggregateCells(ds, cells, unit), [ds, cells, unit])
  const rr = useMemo(() => runRate(ds, pairs, unit), [ds, pairs, unit])
  const coverage = useMemo(() => coverageSummary(ds, vendors, ALL_REPORT_TYPES), [ds, vendors])
  const reportGaps = coverage.rows.filter((r) => r.freshness !== 'Current')
  const monthly = useMemo(() => monthlyPlanRows(ds, pairs, monthOf(DEMO_TODAY)), [ds, pairs])
  const t = thresholds(ds)

  const scopedEx = useMemo(
    () =>
      exceptions
        .filter((e) => OPEN_STATUSES.has(e.status))
        .filter((e) => !e.vendorId || !filters.vendorIds.length || filters.vendorIds.includes(e.vendorId))
        .filter((e) => !e.skuCode || skuMatchesScope(ds, e.skuCode, filters))
        .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || (b.impactEa ?? 0) - (a.impactEa ?? 0)),
    [exceptions, filters, ds],
  )
  const highCount = scopedEx.filter((e) => e.severity === 'High').length

  // Daily production vs plan – only comparable (reported) vendor-days contribute; unreported days stay blank.
  const prodSeries = useMemo(() => {
    const byDay = new Map<string, ProdCell[]>()
    for (const c of cells) {
      if (!byDay.has(c.date)) byDay.set(c.date, [])
      byDay.get(c.date)!.push(c)
    }
    return eachDay(filters.dateFrom, filters.dateTo).map((d) => {
      const a = aggregateCells(ds, byDay.get(d) ?? [], unit)
      const reported = a.planComparable > 0
      return {
        date: d,
        label: fmtDate(d),
        plan: d <= LATEST_DUE_DATE ? (reported ? a.planComparable : null) : a.planFuture || null,
        actual: reported ? a.actualComparable : null,
        unreported: a.planUnreported || null,
        future: d > LATEST_DUE_DATE,
      }
    })
  }, [cells, ds, unit, filters.dateFrom, filters.dateTo])

  // FG inventory trend per vendor (no carry-forward: a missing snapshot is a gap, never zero).
  const fg = useMemo(() => {
    const to = filters.dateTo < LATEST_DUE_DATE ? filters.dateTo : LATEST_DUE_DATE
    const days = filters.dateFrom <= to ? eachDay(filters.dateFrom, to) : []
    const pairKeys = new Set(pairs.map((p) => `${p.vendor.id}|${p.sku.code}`))
    const sums = new Map<string, number>()
    const excluded = new Set<string>()
    for (const s of ds.fgSnapshots) {
      if (s.snapshotDate < filters.dateFrom || s.snapshotDate > to || !pairKeys.has(`${s.vendorId}|${s.skuCode}`)) continue
      const v = convertOrNull(ds, s.skuCode, s.qtyEa, unit)
      if (v == null) {
        excluded.add(s.skuCode)
        continue
      }
      const k = `${s.vendorId}|${s.snapshotDate}`
      sums.set(k, (sums.get(k) ?? 0) + v)
    }
    const rows = days.map((d) => {
      const row: Record<string, number | string | null> = {
        date: d,
        label: fmtDate(d),
      }
      for (const v of vendors) row[v.id] = sums.get(`${v.id}|${d}`) ?? null
      return row
    })
    return { rows, excluded: [...excluded] }
  }, [ds, pairs, vendors, unit, filters.dateFrom, filters.dateTo])

  // Per-vendor summary with links into filtered detail screens.
  const vendorRows = useMemo(
    () =>
      vendors.map((v) => {
        const vc = cells.filter((c) => c.vendorId === v.id)
        const a = aggregateCells(ds, vc, unit)
        const missingDays = new Set(vc.filter((c) => c.status === 'missing').map((c) => c.date)).size
        const open = scopedEx.filter((e) => e.vendorId === v.id).length
        const isMonthly = vc.some((c) => c.monthlyPlan)
        return { v, a, status: aggStatus(ds, a), missingDays, open, isMonthly }
      }),
    [vendors, cells, ds, unit, scopedEx],
  )

  const period = fmtRange(filters.dateFrom, filters.dateTo)
  const scopeText = `${period} · ${vendors.length} vendor${vendors.length === 1 ? '' : 's'} · ${skuCount} SKU${skuCount === 1 ? '' : 's'} · ${unit}`

  if (!pairs.length)
    return (
      <>
        <PageHeader title="Overview" subtitle="No vendor–SKU combinations in scope" />
        <Card>
          <EmptyState icon={Filter} title="No vendor–SKU combinations match the current filters" action={<Button onClick={reset}>Reset filters</Button>}>
            The selected vendor and product filters do not overlap in the demo master data. Adjust or reset the global filters.
          </EmptyState>
        </Card>
      </>
    )

  const notComparedVendors = vendorRows.filter((r) => r.isMonthly).map((r) => r.v.name)

  return (
    <>
      {/* 1–2. Title, reporting context, scope and freshness */}
      <PageHeader
        title="Overview"
        subtitle={
          <>
            {scopeText} · actuals through {fmtDate(LATEST_DUE_DATE)} · reports current{' '}
            <span className="num">
              {coverage.current} of {coverage.total}
            </span>
          </>
        }
        actions={
          <Link
            to={filterLink('/production', {})}
            className="inline-flex h-[30px] items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-body font-medium text-ink shadow-[var(--shadow-card)] hover:bg-surface-muted"
          >
            <BarChart3 size={16} aria-hidden /> Production analysis
          </Link>
        }
      />

      {/* 3. Attention strip – counts derived from the filtered scope */}
      <AttentionStrip highCount={highCount} openCount={scopedEx.length} gaps={reportGaps} origin={origin} />

      {/* 4. KPI row – one comparable scope for all four */}
      <div className="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          label="Comparable plan"
          value={fmtQty(agg.planComparable, unit)}
          unit={unit}
          help={<>Daily plan on vendor-days that have a valid production report. Plan on days with a missing/rejected report and on future days is excluded, so attainment is not distorted. Monthly plans are not split by day.</>}
          sub="Daily-plan vendor-days with a valid report"
          to={filterLink('/production', {})}
        />
        <Kpi
          label="Comparable actual"
          value={fmtQty(agg.actualComparable, unit)}
          unit={unit}
          help="Reported production on the same vendor-days as comparable plan. Missing reports are never counted as zero."
          sub={agg.counts.zero > 0 ? `Includes ${agg.counts.zero} reported-zero vendor-day${agg.counts.zero === 1 ? '' : 's'}` : 'Same vendor-days as comparable plan'}
          to={filterLink('/production', {})}
        />
        <Kpi
          label="Attainment"
          value={fmtPct(agg.attainment, 1)}
          status={<CellStatusBadge status={aggStatus(ds, agg)} />}
          help={
            <>
              Comparable actual ÷ comparable plan × 100. No comparable plan shows “No plan”, never a percentage. Range {t.low}–{t.high}% is a provisional demo threshold; above range is flagged for review, not treated as good.
            </>
          }
        />
        <Kpi label="Gap vs plan" value={fmtSigned(agg.gap, unit)} unit={unit} help="Comparable actual − comparable plan." sub={agg.gap < 0 ? 'Shortfall against plan' : agg.gap > 0 ? 'Over plan – review' : undefined} />
      </div>
      <NotComparedLine agg={agg} unit={unit} className="mb-6" />
      {agg.excluded.length > 0 && <AssumptionNote className="-mt-4 mb-6">MT totals exclude {agg.excluded.map((e) => e.skuCode).join(', ')} – no kg/EA weight in master data.</AssumptionNote>}

      {/* 5. Prioritised issues */}
      <Card
        className="mb-6"
        title="Prioritised issues"
        subtitle={scopedEx.length > TOP_ISSUES ? `Top ${TOP_ISSUES} of ${scopedEx.length} open exceptions in scope · by severity, then quantity impact` : 'Open exceptions in scope · by severity, then quantity impact'}
        bodyClass="p-0"
        actions={
          <Link to="/exceptions" className="inline-flex items-center gap-1 text-body font-medium text-accent-ink hover:underline">
            View all exceptions <span className="num font-normal text-ink-muted">({scopedEx.length})</span>
            <ArrowRight size={14} aria-hidden />
          </Link>
        }
      >
        {scopedEx.length ? (
          <TableWrap>
            <table className="w-full min-w-[960px] table-fixed border-collapse">
              <thead>
                <tr>
                  <th className={cx(th, 'w-10')}>
                    <span className="sr-only">Expand</span>
                  </th>
                  <th className={cx(th, 'w-[92px]')}>Severity</th>
                  <th className={cx(th, 'min-w-[260px]')}>Issue</th>
                  <th className={cx(th, 'w-[180px]')}>Vendor</th>
                  <th className={cx(th, 'w-[104px] text-right')}>Impact (EA)</th>
                  <th className={cx(th, 'w-[132px]')}>Owner</th>
                  <th className={cx(th, 'w-[76px]')}>Due</th>
                  <th className={cx(th, 'w-[168px]')}>Status</th>
                </tr>
              </thead>
              <tbody>
                {scopedEx.slice(0, TOP_ISSUES).map((e) => (
                  <IssueRow key={e.id} e={e} open={expanded === e.id} onToggle={() => setExpanded(expanded === e.id ? null : e.id)} vendorName={e.vendorId ? (ds.idx.vendor.get(e.vendorId)?.name ?? '—') : '—'} origin={origin} />
                ))}
              </tbody>
            </table>
            {scopedEx.length > TOP_ISSUES && (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-dense text-ink-subtle">
                <span>
                  Showing top <span className="num">{TOP_ISSUES}</span> of <span className="num">{scopedEx.length}</span>
                </span>
                <Link to="/exceptions" className="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">
                  View all {scopedEx.length} exceptions <ArrowRight size={14} aria-hidden />
                </Link>
              </div>
            )}
          </TableWrap>
        ) : (
          <EmptyState title="No open exceptions in scope">Nothing currently flagged for the selected vendors and products.</EmptyState>
        )}
      </Card>

      {/* 6. Charts */}
      <div className="mb-6 grid gap-4 xl:grid-cols-2">
        <Card
          title={
            <span className="inline-flex items-center gap-0.5">
              Production vs plan
              <HelpTip label="About this chart">Comparable vendor-days only. Blank days have no valid report (missing or non-operating) – never plotted as zero. Plan after {fmtDate(LATEST_DUE_DATE)} is shown for reference.</HelpTip>
            </span>
          }
          subtitle={`Daily · comparable actual vs plan · ${unit}`}
          actions={
            <div className="text-right text-dense leading-tight">
              <div className="flex items-center justify-end gap-0.5 text-ink-muted">
                {fmtMonth(rr.month)} run-rate projection
                <HelpTip label="How the projection is calculated" align="right">
                  Daily-plan vendors only: MTD actual + average daily actual ({fmtQty(rr.avgDaily, unit)}) × remaining operating days ({rr.remainingDays}). Required daily rate to close: {fmtQty(rr.requiredDaily, unit)} {unit}. A demo
                  calculation, not a forecast.
                </HelpTip>
              </div>
              <div>
                <span className="num text-title font-semibold text-ink">{fmtPct(rr.projectedAttainment, 0)}</span>{' '}
                <span className="text-ink-muted">
                  {rr.projected != null ? (
                    <>
                      · {fmtQty(rr.projected, unit)} of {fmtQty(rr.monthPlan, unit)} {unit}
                    </>
                  ) : (
                    'No reported days'
                  )}
                </span>
              </div>
            </div>
          }
        >
          <div className="h-[260px]" role="img" aria-label="Daily comparable actual production versus plan">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={prodSeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--color-ink-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--color-line-strong)' }} interval="preserveStartEnd" minTickGap={14} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--color-ink-muted)' }} tickLine={false} axisLine={false} tickFormatter={fmtCompact} width={50} />
                <Tooltip content={<ProdTooltip unit={unit} />} />
                <Legend wrapperStyle={{ fontSize: 13 }} formatter={legendText} />
                <Bar dataKey="actual" name="Comparable actual" fill="var(--color-series-actual)" radius={[2, 2, 0, 0]} maxBarSize={18} />
                <Line dataKey="plan" name="Plan" stroke="var(--color-series-plan)" strokeWidth={2} dot={false} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card
          title={
            <span className="inline-flex items-center gap-0.5">
              FG inventory
              <HelpTip label="About this chart">
                Breaks in a line mean no FG snapshot was received for that date (no carry-forward).
                {fg.excluded.length > 0 && <> MT excludes {fg.excluded.join(', ')} (no weight).</>}
              </HelpTip>
            </span>
          }
          subtitle={`By vendor · ${unit}`}
          actions={
            <Link to="/fg-inventory" className="text-body font-medium text-accent-ink hover:underline">
              FG detail
            </Link>
          }
        >
          <div className="h-[260px]" role="img" aria-label="FG inventory by vendor over time">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fg.rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--color-ink-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--color-line-strong)' }} interval="preserveStartEnd" minTickGap={14} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--color-ink-muted)' }} tickLine={false} axisLine={false} tickFormatter={fmtCompact} width={50} />
                <Tooltip
                  formatter={(v) => (v == null ? 'No report' : `${fmtQty(Number(v), unit)} ${unit}`)}
                  contentStyle={{
                    fontSize: 13,
                    borderRadius: 6,
                    borderColor: 'var(--color-line)',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 13 }} formatter={legendText} />
                {vendors.map((v, i) => (
                  <Line key={v.id} dataKey={v.id} name={v.name} stroke={VENDOR_COLORS[i % VENDOR_COLORS.length]} strokeWidth={2} dot={false} connectNulls={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* 7. Vendor summary + supporting records */}
      <Card title="Vendor summary" subtitle="Select a vendor to open its production analysis" bodyClass="p-0" className="mb-6">
        <TableWrap>
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr>
                <th className={th}>Vendor</th>
                <th className={cx(th, 'text-right')}>Comparable plan</th>
                <th className={cx(th, 'text-right')}>Comparable actual</th>
                <th className={cx(th, 'text-right')}>Attainment</th>
                <th className={cx(th, 'text-right')}>Gap</th>
                <th className={cx(th, 'text-right')}>Not compared</th>
                <th className={cx(th, 'text-right')}>Missing days</th>
                <th className={cx(th, 'text-right')}>Open issues</th>
                <th className={th}>
                  <span className="sr-only">Links</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {vendorRows.map(({ v, a, status, missingDays, open, isMonthly }) => (
                <tr key={v.id} className="hover:bg-surface-muted">
                  <td className={td}>
                    <Link to={filterLink('/production', { vendor: v.id })} state={origin} className="font-medium text-ink hover:text-accent-ink hover:underline">
                      {v.name}
                    </Link>
                    <div className="text-label text-ink-subtle">
                      {v.code} · {v.location.split(',')[0]}
                    </div>
                  </td>
                  <td className={tdNum}>{isMonthly && !a.planComparable ? <span className="text-ink-muted">Monthly plan</span> : fmtQty(a.planComparable, unit)}</td>
                  <td className={tdNum}>{isMonthly && !a.planComparable ? <span className="text-ink-muted">—</span> : fmtQty(a.actualComparable, unit)}</td>
                  <td className={tdNum}>
                    {a.attainment != null ? (
                      <span className="inline-flex flex-col items-end">
                        <span className="font-medium">{fmtPct(a.attainment, 1)}</span>
                        <CellStatusBadge status={status} className="text-dense" />
                      </span>
                    ) : (
                      <span className="text-dense text-ink-muted">{isMonthly ? 'Daily attainment N/A' : CELL_META[status].label}</span>
                    )}
                  </td>
                  <td className={tdNum}>{a.attainment != null ? fmtSigned(a.gap, unit) : '—'}</td>
                  <td className={tdNum}>{a.actualUnplanned > 0 ? <span className="text-ink-muted">{fmtQty(a.actualUnplanned, unit)}</span> : '—'}</td>
                  <td className={tdNum}>{missingDays ? <span className="font-medium text-bad">{missingDays}</span> : 0}</td>
                  <td className={tdNum}>{open}</td>
                  <td className={cx(td, 'text-dense whitespace-nowrap')}>
                    <Link to={filterLink('/dispatch', { vendor: v.id })} state={origin} className="mr-3 text-accent-ink hover:underline">
                      Dispatch
                    </Link>
                    <Link to={filterLink('/fg-inventory', { vendor: v.id })} state={origin} className="mr-3 text-accent-ink hover:underline">
                      FG
                    </Link>
                    <Link to={filterLink('/data/reports', { vendor: v.id })} state={origin} className="text-accent-ink hover:underline">
                      Reports
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      {monthly.length > 0 && (
        <Details
          className="mb-3"
          summary={
            <>
              Monthly-plan vendors · {notComparedVendors.join(', ')}
              <span className="font-normal text-ink-muted">· month-to-date vs monthly plan ({fmtMonth(monthOf(DEMO_TODAY))})</span>
            </>
          }
        >
          <TableWrap>
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className={th}>Vendor · SKU</th>
                  <th className={cx(th, 'text-right')}>Month plan ({unit})</th>
                  <th className={cx(th, 'text-right')}>Actual MTD ({unit})</th>
                  <th className={cx(th, 'text-right')}>% of month plan</th>
                  <th className={cx(th, 'text-right')}>Operating days elapsed</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => {
                  const plan = convertOrNull(ds, m.skuCode, m.monthPlanEa, unit)
                  const act = convertOrNull(ds, m.skuCode, m.mtdActualEa, unit)
                  return (
                    <tr key={`${m.vendorId}${m.skuCode}`} className="hover:bg-surface-muted">
                      <td className={td}>
                        {ds.idx.vendor.get(m.vendorId)!.name}
                        <div className="num text-label text-ink-subtle">{m.skuCode}</div>
                      </td>
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
          <AssumptionNote className="px-4 py-3">Monthly plans are not split into a daily target; “operating days elapsed” is context only.</AssumptionNote>
        </Details>
      )}
      <Details summary="Calculation assumptions">
        <ul className="list-disc space-y-1 py-3 pr-4 pl-9 text-body text-ink-muted">
          <li>
            Attainment range {t.low}–{t.high}% is a provisional demo threshold, editable in Administration.
          </li>
          <li>Plan, actual, attainment and gap use only vendor-days that have both a daily plan and a valid report. Other actual is listed as “not in comparison” with its reason.</li>
          <li>Units are converted per SKU before summing; MT excludes SKUs without a kg/EA weight.</li>
          <li>Reports are due D+1 by 10:00; actuals are complete through {fmtDate(LATEST_DUE_DATE)}. Missing reports are never treated as zero.</li>
          <li>Run-rate projection is a demo calculation for daily-plan vendors, not a forecast.</li>
        </ul>
      </Details>
    </>
  )
}

function AttentionStrip({ highCount, openCount, gaps, origin }: { highCount: number; openCount: number; gaps: ReturnType<typeof coverageSummary>['rows']; origin: { from?: string; fromLabel?: string } }) {
  const [open, setOpen] = useState(false)
  const attention = highCount > 0 || gaps.length > 0
  return (
    <section aria-label="Needs attention" className="mb-6 rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-body">
        <span className="inline-flex items-center gap-2 text-ink">
          {attention ? <AlertTriangle size={16} aria-hidden className="shrink-0 text-bad" /> : <CheckCircle2 size={16} aria-hidden className="shrink-0 text-ok" />}
          <span>
            <span className="num font-semibold">{highCount}</span> high-priority issue{highCount === 1 ? '' : 's'}
            <span className="mx-2 text-ink-subtle" aria-hidden>
              ·
            </span>
            <span className="num font-semibold">{gaps.length}</span> stale or missing report{gaps.length === 1 ? '' : 's'}
          </span>
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link to="/exceptions" className="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">
            Review exceptions <span className="num font-normal text-ink-muted">({openCount} open)</span> <ArrowRight size={14} aria-hidden />
          </Link>
          <Link to="/data/reports" className="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">
            Reports & uploads <ArrowRight size={14} aria-hidden />
          </Link>
          {gaps.length > 0 && (
            <button type="button" aria-expanded={open} aria-controls="attention-reports" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded px-1 font-medium text-ink-muted hover:text-ink">
              {open ? 'Hide' : 'Show'} reports <ChevronDown size={14} aria-hidden className={cx('transition-transform', open && 'rotate-180')} />
            </button>
          )}
        </span>
      </div>
      {open && gaps.length > 0 && (
        <ul id="attention-reports" className="grid gap-x-6 border-t border-line px-4 py-2.5 text-body sm:grid-cols-2">
          {gaps.map((r) => (
            <li key={`${r.vendor.id}-${r.type}`} className="flex flex-wrap items-center gap-x-2 py-1">
              <FreshnessBadge value={r.freshness} />
              <Link to={filterLink('/data/reports', { vendor: r.vendor.id })} state={origin} className="font-medium text-ink hover:text-accent-ink hover:underline">
                {r.vendor.name} · {r.type}
              </Link>
              <span className="text-dense text-ink-muted">latest valid {r.latestValidDate ? fmtDate(r.latestValidDate) : 'none'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function IssueRow({ e, open, onToggle, vendorName, origin }: { e: ExceptionItem; open: boolean; onToggle: () => void; vendorName: string; origin: { from?: string; fromLabel?: string } }) {
  return (
    <Fragment>
      <tr className={cx('hover:bg-surface-muted', open && 'bg-surface-muted')}>
        <td className={td}>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} source records for ${e.title}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:bg-black/5"
          >
            {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
          </button>
        </td>
        <td className={td}>
          <SeverityBadge value={e.severity} />
        </td>
        <td className={td}>
          <Link to={`/exceptions/${e.id}`} state={origin} title={e.title} className="line-clamp-2 font-medium text-ink hover:text-accent-ink hover:underline">
            {titleWithoutVendor(e.title, vendorName)}
          </Link>
          <div className="truncate text-label text-ink-subtle">
            {e.kind} · detected {fmtDate(e.detectedOn)}
          </div>
        </td>
        <td className={cx(td, 'max-w-[200px]')}>
          <CellText text={vendorName} />
        </td>
        <td className={tdNum}>{e.impactEa != null ? fmtQty(e.impactEa, 'EA') : '—'}</td>
        <td className={cx(td, 'whitespace-nowrap text-ink-muted')}>{e.owner ?? <span className="text-ink-subtle">Unassigned</span>}</td>
        <td className={cx(td, 'num whitespace-nowrap text-ink-muted')}>{e.dueDate ? fmtDate(e.dueDate) : <span className="text-ink-subtle">—</span>}</td>
        <td className={cx(td, 'whitespace-nowrap')}>
          <ExStatusBadge value={e.status} />
        </td>
      </tr>
      {open && (
        <tr className="bg-surface-muted">
          <td className="border-b border-line" />
          <td colSpan={8} className="border-b border-line px-3 py-3">
            <p className="mb-1.5 text-dense text-ink">{e.impactText}</p>
            <div className="text-dense font-medium text-ink-muted">Source records & evidence</div>
            <dl className="mt-1 grid gap-x-6 gap-y-1 text-dense sm:grid-cols-2">
              {e.evidence.map((ev, i) => (
                <div key={i} className="flex min-w-0 gap-2">
                  <dt className="shrink-0 text-ink-muted">{ev.label}:</dt>
                  <dd className="num min-w-0 truncate text-ink" title={ev.value}>
                    {ev.link ? (
                      <Link to={ev.link} state={origin} className="text-accent-ink hover:underline">
                        {ev.value}
                      </Link>
                    ) : (
                      ev.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-dense">
              <span className="text-ink-muted">
                Rule: {e.rule} · first seen {fmtDate(e.firstSeen)}
              </span>
              <Link to={e.sourceLink} state={origin} className="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">
                Open filtered source view <ArrowRight size={13} aria-hidden />
              </Link>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}

interface ProdPoint {
  date: string
  label: string
  plan: number | null
  actual: number | null
  unreported: number | null
  future: boolean
}
function ProdTooltip({ active, payload, unit }: { active?: boolean; payload?: { payload: ProdPoint }[]; unit: 'EA' | 'CS' | 'MT' }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const att = p.plan && p.actual != null && !p.future ? (p.actual / p.plan) * 100 : null
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-dense shadow-[var(--shadow-pop)]">
      <div className="mb-1 font-semibold text-ink">{fmtDate(p.date, true)}</div>
      {p.future ? (
        <div className="text-ink-muted">
          Future – plan {fmtQty(p.plan, unit)} {unit}
        </div>
      ) : p.actual == null ? (
        <div className="text-ink-muted">No valid report (missing or non-operating)</div>
      ) : (
        <>
          <div className="num">
            Comparable actual: {fmtQty(p.actual, unit)} {unit}
          </div>
          <div className="num">
            Plan: {fmtQty(p.plan, unit)} {unit}
          </div>
          <div className="num">Attainment: {fmtPct(att, 1)}</div>
        </>
      )}
      {p.unreported != null && (
        <div className="num mt-1 text-bad">
          Plan on unreported vendor-days: {fmtQty(p.unreported, unit)} {unit}
        </div>
      )}
    </div>
  )
}
