import { AlertTriangle, CheckCircle2, FileQuestion, PackageX, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AssumptionNote, Badge, Callout, Card, CellText, EmptyState, ExportButton, Kpi, LocalFilters, PageHeader, Select, TableWrap, cx, downloadCsv, td, tdNum, th, useOriginState } from '@/components/ui'
import { reportKey } from '@/data/dataset'
import type { ISODate } from '@/data/types'
import { addDays, DEMO_TODAY, diffDays, eachDay, fmtDate, fmtRange, LATEST_DUE_DATE, monthOf } from '@/lib/dates'
import { usePageFilters, useFilters } from '@/lib/filters'
import { fmtCompact, fmtPct, fmtQty } from '@/lib/format'
import { convertOrNull, dispatchedEa, latestFgSnapshot, producedEa, scopePairs } from '@/lib/metrics'
import { useDataset, usePermissions } from '@/lib/store'
import { HeadPeriod, legendText, MtExclusionNote, operatingDays, qtyText, SERIES, SkuLink, stickyTd, stickyTh, sumUnit } from './shared'

interface Row {
  key: string
  vendorId: string
  vendorName: string
  skuCode: string
  producedEa: number
  dispatchedEa: number
  mtdDispatchedEa: number
  opDays: number
  reportedDays: number
  missingDays: ISODate[]
  dispatchDays: number
  lastDispatch: ISODate | null
  snapDate: ISODate | null
  beyondLagEa: number | null
  oldestLotAge: number | null
}

type SortKey = 'beyondLag' | 'ratio' | 'frequency' | 'vendor'

export default function Dispatch() {
  usePageFilters(['date', 'vendor', 'product', 'unit'])
  const ds = useDataset()
  const { filters: f } = useFilters()
  const { can } = usePermissions()
  const origin = useOriginState('Dispatch')
  const navigate = useNavigate()
  const [sort, setSort] = useState<SortKey>('beyondLag')
  const [onlyIssues, setOnlyIssues] = useState(false)
  const lag = ds.idx.param.dispatchLagDays ?? 10
  const unit = f.unit
  const from = f.dateFrom
  const toDue = f.dateTo < LATEST_DUE_DATE ? f.dateTo : LATEST_DUE_DATE
  const mtdFrom = `${monthOf(DEMO_TODAY)}-01`
  // Same calculation over the same window → one "Dispatched" card instead of two identical ones.
  const periodIsMtd = from === mtdFrom && toDue === LATEST_DUE_DATE

  const rows = useMemo<Row[]>(() => {
    return scopePairs(ds, f).map(({ vendor, sku }) => {
      const days = operatingDays(ds, vendor, from, toDue)
      const missingDays = days.filter((d) => {
        const r = ds.idx.report.get(reportKey(vendor.id, 'Dispatch', d))
        return !r || r.status === 'Rejected'
      })
      const recs = (ds.idx.dispatch.get(`${vendor.id}|${sku.code}`) ?? []).filter((r) => r.date <= LATEST_DUE_DATE)
      const inRange = recs.filter((r) => r.date >= from && r.date <= toDue && r.qtyEa > 0)
      const lastDispatch = recs.reduce<ISODate | null>((a, r) => (r.qtyEa > 0 && (!a || r.date > a) ? r.date : a), null)
      const snap = latestFgSnapshot(ds, vendor.id, sku.code)
      let beyondLagEa: number | null = null
      let oldestLotAge: number | null = null
      if (snap) {
        const cutoff = addDays(snap.snapshotDate, -lag)
        beyondLagEa = snap.lots.filter((l) => l.mfgDate < cutoff).reduce((a, l) => a + l.qtyEa, 0)
        oldestLotAge = snap.lots.reduce<number | null>((a, l) => Math.max(a ?? 0, diffDays(snap.snapshotDate, l.mfgDate)), null)
      }
      return {
        key: `${vendor.id}|${sku.code}`,
        vendorId: vendor.id,
        vendorName: vendor.name,
        skuCode: sku.code,
        producedEa: producedEa(ds, vendor.id, sku.code, from, toDue),
        dispatchedEa: dispatchedEa(ds, vendor.id, sku.code, from, toDue),
        mtdDispatchedEa: dispatchedEa(ds, vendor.id, sku.code, mtdFrom, LATEST_DUE_DATE),
        opDays: days.length,
        reportedDays: days.length - missingDays.length,
        missingDays,
        dispatchDays: new Set(inRange.map((r) => r.date)).size,
        lastDispatch,
        snapDate: snap?.snapshotDate ?? null,
        beyondLagEa,
        oldestLotAge,
      }
    })
  }, [ds, f, from, toDue, mtdFrom, lag])

  const shown = useMemo(() => {
    const list = onlyIssues ? rows.filter((r) => (r.beyondLagEa ?? 0) > 0 || r.missingDays.length > 0) : rows
    const ratio = (r: Row) => (r.producedEa ? r.dispatchedEa / r.producedEa : Infinity)
    const freq = (r: Row) => (r.reportedDays ? r.dispatchDays / r.reportedDays : Infinity)
    return [...list].sort((a, b) => {
      if (sort === 'vendor') return a.vendorName.localeCompare(b.vendorName) || a.skuCode.localeCompare(b.skuCode)
      if (sort === 'ratio') return ratio(a) - ratio(b)
      if (sort === 'frequency') return freq(a) - freq(b)
      return (b.beyondLagEa ?? 0) - (a.beyondLagEa ?? 0)
    })
  }, [rows, onlyIssues, sort])

  const totals = useMemo(() => {
    const prod = sumUnit(
      ds,
      rows.map((r) => ({ skuCode: r.skuCode, ea: r.producedEa })),
      unit,
    )
    const disp = sumUnit(
      ds,
      rows.map((r) => ({ skuCode: r.skuCode, ea: r.dispatchedEa })),
      unit,
    )
    const mtd = sumUnit(
      ds,
      rows.map((r) => ({ skuCode: r.skuCode, ea: r.mtdDispatchedEa })),
      unit,
    )
    const lagT = sumUnit(
      ds,
      rows.map((r) => ({ skuCode: r.skuCode, ea: r.beyondLagEa })),
      unit,
    )
    const excluded = [...new Set([...prod.excluded, ...disp.excluded, ...lagT.excluded])]
    const vendorsMissing = new Map<string, number>()
    for (const r of rows) if (r.missingDays.length) vendorsMissing.set(r.vendorName, r.missingDays.length)
    return {
      prod: prod.total,
      disp: disp.total,
      mtd: mtd.total,
      lag: lagT.total,
      excluded,
      vendorsMissing,
      lagRows: rows.filter((r) => (r.beyondLagEa ?? 0) > 0).length,
    }
  }, [rows, ds, unit])

  const chart = useMemo(() => {
    const pairs = scopePairs(ds, f)
    if (toDue < from) return []
    return eachDay(from, toDue).map((d) => {
      let produced = 0
      let dispatched = 0
      let reporting = 0
      const vendors = new Set(pairs.map((p) => p.vendor.id))
      for (const vId of vendors) {
        const r = ds.idx.report.get(reportKey(vId, 'Dispatch', d))
        if (r && r.status !== 'Rejected') reporting++
      }
      for (const { vendor, sku } of pairs) {
        const p = ds.idx.production.get(`${vendor.id}|${sku.code}|${d}`)?.qtyEa
        if (p) produced += convertOrNull(ds, sku.code, p, unit) ?? 0
        const dq = (ds.idx.dispatch.get(`${vendor.id}|${sku.code}`) ?? []).filter((x) => x.date === d).reduce((a, x) => a + x.qtyEa, 0)
        if (dq) dispatched += convertOrNull(ds, sku.code, dq, unit) ?? 0
      }
      return {
        date: d,
        label: fmtDate(d),
        produced,
        dispatched,
        missingVendors: vendors.size - reporting,
      }
    })
  }, [ds, f, from, toDue, unit])

  const exportCsv = () =>
    downloadCsv(`dispatch_${from}_${toDue}_${unit}.csv`, [
      ['Demo data – not connected to GCPL systems'],
      [
        'Vendor',
        'SKU',
        `Produced (${unit}, selected period)`,
        `Dispatched (${unit}, selected period)`,
        `Dispatched (${unit}, MTD)`,
        'Dispatch days',
        'Reported operating days',
        'Missing dispatch reports',
        'Last dispatch',
        `Stock beyond ${lag}d lag (${unit}, as of snapshot)`,
        'Snapshot date',
      ],
      ...shown.map((r) => [
        r.vendorName,
        r.skuCode,
        convertOrNull(ds, r.skuCode, r.producedEa, unit),
        r.reportedDays ? convertOrNull(ds, r.skuCode, r.dispatchedEa, unit) : null,
        convertOrNull(ds, r.skuCode, r.mtdDispatchedEa, unit),
        r.dispatchDays,
        r.reportedDays,
        r.missingDays.join(' '),
        r.lastDispatch,
        convertOrNull(ds, r.skuCode, r.beyondLagEa, unit),
        r.snapDate,
      ]),
    ])

  const futureOnly = toDue < from
  const overallRatio = totals.prod ? (totals.disp / totals.prod) * 100 : null

  return (
    <>
      <PageHeader
        title="Dispatch"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            Produced vs dispatched, dispatch frequency and stock held beyond the allowed lag · {fmtRange(from, toDue < from ? from : toDue)} · {unit}
          </span>
        }
        actions={<ExportButton onClick={exportCsv} disabled={!can('export.data') || !shown.length} />}
      />

      {futureOnly ? (
        <Card>
          <EmptyState icon={Truck} title="No dispatch data for this period yet">
            The selected period starts after the latest report due date ({fmtDate(LATEST_DUE_DATE, true)}). Choose an earlier period in the global filters.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className={cx('grid grid-cols-2 gap-3', periodIsMtd ? 'xl:grid-cols-4' : 'xl:grid-cols-5')}>
            <Kpi
              label="Produced"
              value={fmtQty(totals.prod, unit)}
              unit={unit}
              period="Selected period"
              help="Sum of reported production records in the period (up to the latest due date). Missing reports are not counted as zero – they simply contribute nothing."
            />
            <Kpi
              label="Dispatched"
              value={fmtQty(totals.disp, unit)}
              unit={unit}
              period={periodIsMtd ? 'Period = MTD' : 'Selected period'}
              help={
                periodIsMtd
                  ? `Sum of dispatch records (invoices) on dates with a valid dispatch report. The selected period (${fmtRange(from, toDue)}) equals month to date, so one figure covers both.`
                  : 'Sum of dispatch records (invoices) on dates with a valid dispatch report.'
              }
              sub={totals.vendorsMissing.size ? <span className="text-warn">{totals.vendorsMissing.size} vendor(s) with missing dispatch reports</span> : 'All dispatch reports received'}
            />
            <Kpi
              label="Dispatch ÷ production"
              value={fmtPct(overallRatio)}
              period="Selected period"
              help="Dispatched ÷ produced × 100 for the scope. Below 100% means stock is building at the vendor; above 100% means older stock is being cleared. Demo calculation."
            />
            {!periodIsMtd && <Kpi label="Dispatched" value={fmtQty(totals.mtd, unit)} unit={unit} period="MTD" help={`Month to date (${fmtRange(mtdFrom, LATEST_DUE_DATE)}), independent of the selected period.`} />}
            <Kpi
              label={`Stock beyond ${lag}-day lag`}
              value={fmtQty(totals.lag, unit)}
              unit={unit}
              period="As of snapshot"
              status={
                totals.lagRows ? (
                  <Badge tone="warn" icon={AlertTriangle}>
                    {totals.lagRows} SKU line(s)
                  </Badge>
                ) : (
                  <Badge tone="ok" icon={CheckCircle2}>
                    None
                  </Badge>
                )
              }
              help={`FG lots in each vendor's latest stock snapshot whose manufacturing date is more than ${lag} days before the snapshot date (lag is a provisional parameter).`}
            />
          </div>

          {totals.vendorsMissing.size > 0 && (
            <Callout
              tone="warn"
              icon={FileQuestion}
              title={`Dispatch reports missing for ${totals.vendorsMissing.size} vendor(s)`}
              details="Dispatch on those days is unknown. It is shown as missing, never as zero, so period totals and the produced-vs-dispatched gap exclude those days for the affected vendors."
            >
              {[...totals.vendorsMissing.entries()].map(([v, n]) => `${v}: ${n} operating day(s)`).join(' · ')} – dispatch unknown on those days.
            </Callout>
          )}

          <Card title="Produced vs dispatched by day" subtitle={`Selected period · ${unit} · all vendor–SKU lines in scope`} bodyClass="px-2 pt-3 pb-2">
            {chart.length ? (
              <div className="h-[230px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid stroke={SERIES.grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: SERIES.axis }} tickLine={false} axisLine={{ stroke: SERIES.grid }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: SERIES.axis }} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtCompact(v)} width={48} />
                    <Tooltip
                      formatter={(v, name) => [`${fmtQty(Number(v), unit)} ${unit}`, name]}
                      labelFormatter={(_, p) => {
                        const row = p?.[0]?.payload as (typeof chart)[number] | undefined
                        return row ? `${fmtDate(row.date, true)}${row.missingVendors ? ` · ${row.missingVendors} vendor(s) missing dispatch report` : ''}` : ''
                      }}
                      contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
                    <Bar dataKey="produced" name="Produced" fill={SERIES.actual} radius={[2, 2, 0, 0]} maxBarSize={14} />
                    <Bar dataKey="dispatched" name="Dispatched" fill={SERIES.dispatch} radius={[2, 2, 0, 0]} maxBarSize={14} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState title="No days in range" />
            )}
            <p className="px-2 text-label text-ink-subtle">Hover a day to see whether any vendor's dispatch report is missing. Missing days are not plotted as zero dispatch.</p>
          </Card>

          <Card
            title="Vendor × SKU dispatch"
            subtitle="Click a row to open the SKU investigation"
            bodyClass="p-0"
            actions={
              <LocalFilters className="py-1">
                <Select label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  <option value="beyondLag">Stock beyond lag (high first)</option>
                  <option value="ratio">Dispatch ÷ production (low first)</option>
                  <option value="frequency">Dispatch frequency (low first)</option>
                  <option value="vendor">Vendor, SKU</option>
                </Select>
                <label className="inline-flex items-center gap-1.5 text-dense text-ink-muted">
                  <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} className="accent-[var(--color-accent)]" />
                  Only lines needing attention
                </label>
              </LocalFilters>
            }
          >
            {shown.length ? (
              <TableWrap maxHeight={520}>
                <table className="w-full min-w-[1080px] border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className={cx(th, stickyTh)}>SKU</th>
                      <th className={th}>Vendor</th>
                      <th className={cx(th, 'text-right')}>
                        <HeadPeriod title={`Produced (${unit})`}>Selected period</HeadPeriod>
                      </th>
                      <th className={cx(th, 'text-right')}>
                        <HeadPeriod title={`Dispatched (${unit})`}>Selected period</HeadPeriod>
                      </th>
                      <th className={cx(th, 'text-right')}>
                        <HeadPeriod title="Disp ÷ prod">Selected period</HeadPeriod>
                      </th>
                      <th className={th}>
                        <HeadPeriod title="Dispatch frequency">Selected period · dispatch days ÷ reported days</HeadPeriod>
                      </th>
                      {!periodIsMtd && (
                        <th className={cx(th, 'text-right')}>
                          <HeadPeriod title={`Dispatched (${unit})`}>MTD</HeadPeriod>
                        </th>
                      )}
                      <th className={th}>
                        <HeadPeriod title="Last dispatch">Historical</HeadPeriod>
                      </th>
                      <th className={cx(th, 'text-right')}>
                        <HeadPeriod title={`Beyond ${lag}d lag (${unit})`}>As of latest snapshot</HeadPeriod>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => {
                      const allMissing = r.opDays > 0 && r.reportedDays === 0
                      const ratio = r.producedEa && !allMissing ? (r.dispatchedEa / r.producedEa) * 100 : null
                      const freq = r.reportedDays ? (r.dispatchDays / r.reportedDays) * 100 : null
                      const lagQty = r.beyondLagEa ?? 0
                      return (
                        <tr key={r.key} className="group cursor-pointer hover:bg-accent-soft/40" onClick={() => navigate(`/sku/${r.skuCode}`, { state: origin })}>
                          <td className={cx(td, stickyTd, 'max-w-[240px] group-hover:bg-accent-soft/40')}>
                            <SkuLink ds={ds} code={r.skuCode} origin={origin} />
                          </td>
                          <td className={cx(td, 'max-w-[180px]')}>
                            <CellText text={r.vendorName} />
                          </td>
                          <td className={tdNum}>{qtyText(ds, r.skuCode, r.producedEa, unit)}</td>
                          <td className={tdNum}>
                            {allMissing ? (
                              <Badge tone="none" icon={FileQuestion}>
                                Report missing
                              </Badge>
                            ) : (
                              <span className="inline-flex flex-col items-end">
                                {qtyText(ds, r.skuCode, r.dispatchedEa, unit)}
                                {r.missingDays.length > 0 && (
                                  <span className="text-label text-warn" title={`Missing: ${r.missingDays.map((d) => fmtDate(d)).join(', ')}`}>
                                    {r.missingDays.length} day(s) missing
                                  </span>
                                )}
                              </span>
                            )}
                          </td>
                          <td className={tdNum}>{fmtPct(ratio)}</td>
                          <td className={cx(td, 'whitespace-nowrap')}>
                            {freq == null ? (
                              <span className="text-ink-subtle">—</span>
                            ) : (
                              <span className="inline-flex items-center gap-2">
                                <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-none-soft" aria-hidden>
                                  <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-series-dispatch)]" style={{ width: `${Math.min(100, freq)}%` }} />
                                </span>
                                <span className="num text-dense">
                                  {r.dispatchDays} of {r.reportedDays} days
                                </span>
                              </span>
                            )}
                          </td>
                          {!periodIsMtd && <td className={tdNum}>{qtyText(ds, r.skuCode, r.mtdDispatchedEa, unit)}</td>}
                          <td className={cx(td, 'whitespace-nowrap')}>
                            {r.lastDispatch ? (
                              <span className={cx('num', diffDays(LATEST_DUE_DATE, r.lastDispatch) > (ds.idx.param.idleDays ?? 10) && 'font-medium text-warn')}>
                                {fmtDate(r.lastDispatch)} <span className="text-label text-ink-subtle">({diffDays(DEMO_TODAY, r.lastDispatch)}d ago)</span>
                              </span>
                            ) : (
                              <span className="text-ink-subtle">No dispatch on record</span>
                            )}
                          </td>
                          <td className={tdNum}>
                            {r.beyondLagEa == null ? (
                              <Badge tone="none" icon={FileQuestion}>
                                No snapshot
                              </Badge>
                            ) : lagQty > 0 ? (
                              <span className="inline-flex flex-col items-end">
                                <span className="inline-flex items-center gap-1 font-medium text-warn">
                                  <PackageX size={13} aria-hidden /> {qtyText(ds, r.skuCode, lagQty, unit)}
                                </span>
                                <span className="text-label text-ink-subtle">
                                  oldest {r.oldestLotAge}d · snap {fmtDate(r.snapDate)}
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-ok">
                                <CheckCircle2 size={13} aria-hidden /> None
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td className={cx(td, stickyTd, 'bg-surface-muted')}>Total · {rows.length} lines in scope</td>
                      <td className={cx(td, 'bg-surface-muted')} />
                      <td className={cx(tdNum, 'bg-surface-muted')}>{fmtQty(totals.prod, unit)}</td>
                      <td className={cx(tdNum, 'bg-surface-muted')}>{fmtQty(totals.disp, unit)}</td>
                      <td className={cx(tdNum, 'bg-surface-muted')}>{fmtPct(overallRatio)}</td>
                      <td className={cx(td, 'bg-surface-muted')} />
                      {!periodIsMtd && <td className={cx(tdNum, 'bg-surface-muted')}>{fmtQty(totals.mtd, unit)}</td>}
                      <td className={cx(td, 'bg-surface-muted')} />
                      <td className={cx(tdNum, 'bg-surface-muted')}>{fmtQty(totals.lag, unit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </TableWrap>
            ) : (
              <EmptyState icon={Truck} title={rows.length ? 'No lines need attention' : 'No vendor–SKU lines match the filters'}>
                {rows.length ? 'Clear “Only lines needing attention” to see all lines.' : 'Adjust the vendor or product filters, or reset them.'}
              </EmptyState>
            )}
          </Card>
          <div className="space-y-1">
            <MtExclusionNote ds={ds} codes={totals.excluded} />
            <AssumptionNote>Allowed dispatch lag is {lag} days (Master Data → Parameters). Totals row covers all lines in scope. Dispatch frequency counts days with any invoice ÷ operating days with a valid dispatch report.</AssumptionNote>
          </div>
        </div>
      )}
    </>
  )
}
