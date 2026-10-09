import { ArrowLeft, ChevronRight, ExternalLink, PackageSearch } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { legendText } from '@/pages/inventory/shared'
import { CellStatusBadge, ExStatusBadge, SeverityBadge, StatusLegend } from '@/components/status'
import { AssumptionNote, Badge, Card, EmptyState, Kpi, LocalFilters, PageHeader, Select, TableWrap, cx, td, tdNum, th, type OriginState } from '@/components/ui'
import { diffDays, eachDay, fmtDate, fmtDateDow, fmtDateTime, fmtRange, LATEST_DUE_DATE, monthOf } from '@/lib/dates'
import { usePageFilters, useFilters } from '@/lib/filters'
import { fmtCompact, fmtNum, fmtPct, fmtQty, fmtSigned } from '@/lib/format'
import { aggregateCells, cellsFor, dispatchedEa, fgBaseline, latestFgSnapshot, monthlyPlanRows, STATUS_ORDER, thresholds, type ScopePair } from '@/lib/metrics'
import { useDataset, useExceptions } from '@/lib/store'
import { convertFg } from '@/lib/units'
import { reportKey } from '@/data/dataset'
import type { Dataset } from '@/data/dataset'

/** Dispatch qty for a vendor-day, or null when no valid Dispatch report exists (missing is never zero). */
function dispatchOrNull(ds: Dataset, vendorId: string, code: string, d: string): number | null {
  const r = ds.idx.report.get(reportKey(vendorId, 'Dispatch', d))
  if (!r || r.status === 'Rejected' || d > LATEST_DUE_DATE) return null
  return dispatchedEa(ds, vendorId, code, d, d)
}

/** Origin from router state, falling back to URL params (so the chain survives SKU → exception → back). */
function useChainedOrigin(): OriginState {
  const loc = useLocation()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const st = (loc.state ?? {}) as OriginState
  useEffect(() => {
    if (st.from && sp.get('o') !== st.from) {
      const next = new URLSearchParams(sp)
      next.set('o', st.from)
      next.set('ol', st.fromLabel ?? 'previous page')
      navigate({ pathname: loc.pathname, search: `?${next}` }, { replace: true, state: loc.state })
    }
  }, [st.from, st.fromLabel, sp, navigate, loc.pathname, loc.state])
  return {
    from: st.from ?? sp.get('o') ?? undefined,
    fromLabel: st.fromLabel ?? sp.get('ol') ?? undefined,
  }
}

export default function SkuInvestigation() {
  const { code = '' } = useParams()
  usePageFilters(['date', 'unit'], {
    vendor: 'Vendor is chosen on this page (all mapped vendors)',
    product: 'Fixed to this SKU',
  })
  const ds = useDataset()
  const { filters } = useFilters()
  const unit = filters.unit
  const loc = useLocation()
  const [sp, setSp] = useSearchParams()
  const origin = useChainedOrigin()
  const exceptions = useExceptions()
  const h = ds.idx.hierarchy.get(code)
  const sku = h?.sku
  const mapped = useMemo(() => ds.idx.skuVendors.get(code) ?? [], [ds, code])
  const vParam = sp.get('v')
  const vendorSel = vParam && mapped.includes(vParam) ? vParam : filters.vendorIds.length === 1 && mapped.includes(filters.vendorIds[0]) && !vParam ? filters.vendorIds[0] : 'all'
  const vendorIds = vendorSel === 'all' ? mapped : [vendorSel]
  const pairs: ScopePair[] = useMemo(() => (sku ? vendorIds.map((v) => ({ vendor: ds.idx.vendor.get(v)!, sku })) : []), [ds, sku, vendorIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const from = filters.dateFrom
  const to = filters.dateTo
  const cells = useMemo(() => cellsFor(ds, pairs, from, to), [ds, pairs, from, to])
  const agg = useMemo(() => aggregateCells(ds, cells, unit), [ds, cells, unit])
  const selfOrigin: OriginState = {
    from: loc.pathname + loc.search,
    fromLabel: `SKU ${code}`,
  }

  if (!h || !sku)
    return (
      <div>
        <BackTo origin={origin} />
        <Card>
          <EmptyState icon={PackageSearch} title={`SKU “${code}” not found in master data`}>
            Check the code or search the product hierarchy in Master Data.
          </EmptyState>
        </Card>
      </div>
    )

  const cv = (ea: number | null) => (ea == null ? null : convertFg(ea, sku, unit))
  const noMt = unit === 'MT' && sku.kgPerEa == null
  const dispatchEa = vendorIds.reduce((a, v) => a + dispatchedEa(ds, v, code, from, to), 0)
  const t = thresholds(ds)

  // Chart: daily totals across selected vendors
  const chart = eachDay(from, to).map((d) => {
    const dc = cells.filter((c) => c.date === d)
    const plan = dc.reduce((a, c) => a + (c.planEa ?? 0), 0)
    const reported = dc.some((c) => c.status !== 'missing' && c.status !== 'future' && c.actualEa != null)
    const actual = reported ? dc.reduce((a, c) => a + (c.actualEa ?? 0), 0) : null
    const dv = vendorIds.map((v) => dispatchOrNull(ds, v, code, d)).filter((x): x is number => x != null)
    return {
      d: fmtDate(d),
      plan: cv(plan) ?? 0,
      actual: actual == null ? null : cv(actual),
      dispatch: dv.length ? cv(dv.reduce((a, b) => a + b, 0)) : null,
    }
  })

  const months = [...new Set(eachDay(from, to).map(monthOf))]
  const monthly = months.flatMap((m) => monthlyPlanRows(ds, pairs, m))
  const related = exceptions.filter((e) => e.skuCode === code && (vendorSel === 'all' || e.vendorId === vendorSel))
  const reports = ds.vendorReports
    .filter((r) => vendorIds.includes(r.vendorId) && r.reportDate >= from && r.reportDate <= to && (r.type === 'Production' || r.type === 'Dispatch' || r.type === 'FG Inventory'))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  const dailyRows = [...cells].sort((a, b) => b.date.localeCompare(a.date) || a.vendorId.localeCompare(b.vendorId))

  return (
    <div>
      <PageHeader
        back={<BackTo origin={origin} />}
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {sku.name} <span className="text-body font-medium text-ink-muted">{sku.code}</span>
            {!sku.active && <Badge tone="none">Inactive</Badge>}
          </span>
        }
        subtitle={
          <span className="flex flex-col gap-1">
            <nav aria-label="Product hierarchy" className="inline-flex flex-wrap items-center gap-1">
              {[h.category.name, h.brand.name, h.productLine.name, `${h.dt.code} · ${h.dt.name}`, sku.code].map((x, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  {i > 0 && <ChevronRight size={12} aria-hidden className="text-ink-subtle" />}
                  <span className={i === 4 ? 'font-medium text-ink' : ''}>{x}</span>
                </span>
              ))}
            </nav>
            <span className="inline-flex flex-wrap items-center gap-2">
              Case pack {sku.casePack} EA/CS · {sku.kgPerEa == null ? 'no weight conversion (MT unavailable)' : `${sku.kgPerEa} kg/EA`} · shelf life {sku.shelfLifeDays} days · {fmtRange(from, to)} · {unit}
            </span>
          </span>
        }
      />

      <LocalFilters className="mb-4">
        <Select
          label="Vendor"
          value={vendorSel}
          onChange={(e) => {
            const n = new URLSearchParams(sp)
            n.set('v', e.target.value)
            setSp(n, { replace: true, state: loc.state })
          }}
        >
          <option value="all">All mapped vendors ({mapped.length})</option>
          {mapped.map((v) => (
            <option key={v} value={v}>
              {ds.idx.vendor.get(v)!.name}
            </option>
          ))}
        </Select>
        <span className="text-dense text-ink-muted">Mapped to {mapped.map((v) => ds.idx.vendor.get(v)!.name).join(', ') || 'no vendors'}</span>
      </LocalFilters>

      {noMt && <div className="mb-4 rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-dense text-ink">This SKU has no kg/EA weight in master data, so MT quantities are not available. Switch the display unit to EA or CS.</div>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Plan (reported days)" period="Selected period" value={noMt ? '—' : fmtQty(agg.planComparable, unit)} unit={unit} sub={<span>+{fmtQty(agg.planUnreported, unit)} unreported</span>} />
        <Kpi label="Actual" period="Selected period" value={noMt ? '—' : fmtQty(agg.actual, unit)} unit={unit} sub={<span>Gap {fmtSigned(agg.gap, unit)}</span>} />
        <Kpi
          label="Attainment"
          period="Selected period"
          value={fmtPct(agg.attainment, 1)}
          status={agg.attainment != null ? <CellStatusBadge status={agg.attainment < t.low ? 'below' : agg.attainment > t.high ? 'above' : 'within'} /> : undefined}
          help={
            <>
              Actual ÷ plan on days with a valid production report × 100. Bands {t.low}%/{t.high}% are provisional.
            </>
          }
        />
        <Kpi label="Dispatched" period="Selected period" value={noMt ? '—' : fmtQty(cv(dispatchEa), unit)} unit={unit} sub={<span>{fmtPct(agg.actual ? ((cv(dispatchEa) ?? 0) / agg.actual) * 100 : null)} of produced</span>} />
        <Kpi
          label="FG stock"
          period="Latest snapshot"
          value={noMt ? '—' : fmtQty(cv(vendorIds.reduce((a, v) => a + (latestFgSnapshot(ds, v, code)?.qtyEa ?? 0), 0)), unit)}
          unit={unit}
          sub={<span>{vendorIds.map((v) => `${ds.idx.vendor.get(v)!.name}: ${fmtDate(latestFgSnapshot(ds, v, code)?.snapshotDate)}`).join(' · ')}</span>}
        />
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title="Plan, actual and dispatch by day" subtitle={`${vendorSel === 'all' ? 'All mapped vendors' : ds.idx.vendor.get(vendorSel)!.name} · ${unit} · gaps = no valid report`}>
          <div className="h-[230px]" role="img" aria-label="Chart of daily plan, actual and dispatch">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }} tickFormatter={fmtCompact} width={44} />
                <Tooltip formatter={(v) => (v == null ? '—' : fmtQty(Number(v), unit, true))} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
                <Bar dataKey="plan" name="Plan" fill="var(--color-series-plan)" radius={[2, 2, 0, 0]} />
                <Line dataKey="actual" name="Actual" stroke="var(--color-series-actual)" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
                <Line dataKey="dispatch" name="Dispatch" stroke="var(--color-series-dispatch)" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Related exceptions" subtitle={`${related.length} detected for this SKU`} bodyClass="p-0">
          {related.length ? (
            <ul className="divide-y divide-line">
              {related.map((e) => (
                <li key={e.id} className="px-4 py-2">
                  <Link to={`/exceptions/${e.id}`} state={selfOrigin} className="text-body font-medium text-accent-ink hover:underline">
                    {e.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-dense text-ink-muted">
                    <SeverityBadge value={e.severity} />
                    <ExStatusBadge value={e.status} />
                    <span>{e.impactText}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No exceptions for this SKU">No performance or data-quality exceptions are currently detected for the selected vendor(s).</EmptyState>
          )}
        </Card>
      </div>

      {monthly.length > 0 && (
        <Card className="mb-6" title="Monthly plan" subtitle="Monthly plans are compared month-to-date. They are not split by day.">
          <ul className="space-y-1 text-body">
            {monthly.map((m) => (
              <li key={m.vendorId + m.month}>
                {ds.idx.vendor.get(m.vendorId)!.name} · {m.month}: plan <span className="num font-medium">{fmtQty(cv(m.monthPlanEa), unit)}</span> {unit}, actual MTD <span className="num font-medium">{fmtQty(cv(m.mtdActualEa), unit)}</span>{' '}
                ({fmtPct((m.mtdActualEa / m.monthPlanEa) * 100, 1)})
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-6" title="FG inventory" subtitle="Latest snapshot per vendor, lots and expiry" bodyClass="p-0">
        <div className="divide-y divide-line">
          {vendorIds.map((v) => {
            const snap = latestFgSnapshot(ds, v, code)
            const vendor = ds.idx.vendor.get(v)!
            if (!snap)
              return (
                <div key={v} className="px-4 py-3 text-body text-ink-muted">
                  {vendor.name}: no FG inventory snapshot received.
                </div>
              )
            const base = fgBaseline(ds, v, code, snap.snapshotDate)
            const stale = diffDays(LATEST_DUE_DATE, snap.snapshotDate) > (ds.idx.param.staleDaysDaily ?? 1)
            const warn = ds.idx.param.expiryWarnDays ?? 60
            return (
              <div key={v} className="px-4 py-3">
                <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body">
                  <span className="font-semibold">{vendor.name}</span>
                  <span>
                    Snapshot {fmtDateDow(snap.snapshotDate)} {stale ? <Badge tone="warn">Stale</Badge> : <Badge tone="ok">Current</Badge>}
                  </span>
                  <span>
                    Stock <span className="num font-medium">{fmtQty(cv(snap.qtyEa), unit)}</span> {unit}
                  </span>
                  <span>
                    Baseline <span className="num font-medium">{fmtQty(cv(base.value), unit)}</span> {base.value != null && <>({fmtSigned(base.value ? ((snap.qtyEa - base.value) / base.value) * 100 : null, 'EA')}% vs baseline)</>}
                  </span>
                  <Link to={`/data/uploads/${ds.vendorReports.find((r) => r.id === snap.reportId)?.batchId ?? ''}`} state={selfOrigin} className="text-dense text-accent-ink hover:underline">
                    {snap.reportId}
                  </Link>
                </div>
                <TableWrap className="rounded border border-line">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={th}>Lot</th>
                        <th className={th}>Mfg date</th>
                        <th className={th}>Expiry</th>
                        <th className={cx(th, 'text-right')}>Days to expiry</th>
                        <th className={cx(th, 'text-right')}>Qty ({unit})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snap.lots.map((l) => {
                        const days = diffDays(l.expiryDate, LATEST_DUE_DATE)
                        return (
                          <tr key={l.lotNo}>
                            <td className={td}>{l.lotNo}</td>
                            <td className={td}>{fmtDate(l.mfgDate, true)}</td>
                            <td className={td}>{fmtDate(l.expiryDate, true)}</td>
                            <td className={tdNum}>{days <= warn ? <Badge tone={days <= 0 ? 'bad' : 'warn'}>{days <= 0 ? 'Expired' : `${days} d · near expiry`}</Badge> : fmtNum(days)}</td>
                            <td className={tdNum}>{fmtQty(cv(l.qtyEa), unit)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </TableWrap>
              </div>
            )
          })}
        </div>
        <div className="border-t border-line px-4 py-2">
          <AssumptionNote>
            Baseline = mean of Monday snapshots over the previous {ds.idx.param.baselineWeeks ?? 4} weeks; near-expiry window {ds.idx.param.expiryWarnDays ?? 60} days.
          </AssumptionNote>
        </div>
      </Card>

      <Card className="mb-6" title="Daily records" subtitle="Each vendor × day with status and source report" bodyClass="p-0">
        <TableWrap maxHeight={420}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Vendor</th>
                <th className={cx(th, 'text-right')}>Plan ({unit})</th>
                <th className={cx(th, 'text-right')}>Actual ({unit})</th>
                <th className={cx(th, 'text-right')}>Attainment</th>
                <th className={th}>Status</th>
                <th className={cx(th, 'text-right')}>Dispatched ({unit})</th>
                <th className={th}>Source</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.map((c) => {
                const disp = dispatchOrNull(ds, c.vendorId, code, c.date)
                return (
                  <tr key={c.vendorId + c.date}>
                    <td className={cx(td, 'whitespace-nowrap')}>{fmtDateDow(c.date)}</td>
                    <td className={td}>{ds.idx.vendor.get(c.vendorId)!.name}</td>
                    <td className={tdNum}>{fmtQty(cv(c.planEa), unit)}</td>
                    <td className={tdNum}>{c.actualEa == null ? <span className="text-ink-subtle">—</span> : fmtQty(cv(c.actualEa), unit)}</td>
                    <td className={tdNum}>{fmtPct(c.attainment)}</td>
                    <td className={td}>
                      <CellStatusBadge status={c.status} />
                      {c.reason && <div className="mt-0.5 text-label text-ink-subtle">{c.reason}</div>}
                    </td>
                    <td className={tdNum}>{disp == null ? '—' : fmtQty(cv(disp), unit)}</td>
                    <td className={td}>
                      {c.report ? (
                        <Link to={`/data/uploads/${c.report.batchId}`} state={selfOrigin} className="text-dense text-accent-ink hover:underline">
                          {c.report.id}
                        </Link>
                      ) : (
                        <span className="text-dense text-ink-subtle">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
        <div className="border-t border-line px-4 py-2">
          <StatusLegend statuses={STATUS_ORDER.filter((s) => agg.counts[s] > 0)} />
        </div>
      </Card>

      <Card title="Source records" subtitle={`${reports.length} vendor reports received for the selected vendor(s) and period`} bodyClass="p-0">
        <TableWrap maxHeight={320}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Report</th>
                <th className={th}>Type</th>
                <th className={th}>Business date</th>
                <th className={th}>Received</th>
                <th className={th}>Channel</th>
                <th className={th}>Status</th>
                <th className={th}>Batch</th>
              </tr>
            </thead>
            <tbody>
              {reports.slice(0, 120).map((r) => (
                <tr key={r.id + r.receivedAt}>
                  <td className={cx(td, 'text-dense')}>{r.fileName}</td>
                  <td className={td}>{r.type}</td>
                  <td className={td}>{fmtDate(r.reportDate)}</td>
                  <td className={cx(td, 'whitespace-nowrap')}>{fmtDateTime(r.receivedAt)}</td>
                  <td className={td}>{r.channel}</td>
                  <td className={td}>
                    <Badge tone={r.status === 'Processed' ? 'ok' : r.status === 'Rejected' ? 'bad' : 'warn'}>{r.status}</Badge>
                  </td>
                  <td className={td}>
                    <Link to={`/data/uploads/${r.batchId}`} state={selfOrigin} className="inline-flex items-center gap-1 text-dense text-accent-ink hover:underline">
                      {r.batchId} <ExternalLink size={11} aria-hidden />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  )
}

function BackTo({ origin }: { origin: OriginState }) {
  return (
    <Link to={origin.from ?? '/production'} className="mb-2 inline-flex items-center gap-1 text-dense font-medium text-accent-ink hover:underline">
      <ArrowLeft size={14} aria-hidden /> Back to {origin.fromLabel ?? 'Production analysis'}
    </Link>
  )
}
