import { CheckCircle2, Clock, FileQuestion, Hourglass, PauseCircle, TrendingUp, Warehouse } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { FreshnessBadge } from '@/components/status'
import { AssumptionNote, Badge, Callout, Card, CellText, EmptyState, ExportButton, HelpTip, Kpi, LocalFilters, PageHeader, Segmented, TableWrap, cx, downloadCsv, td, tdNum, th, useOriginState } from '@/components/ui'
import type { FgLot, ISODate } from '@/data/types'
import { addDays, DEMO_TODAY, diffDays, fmtDate, LATEST_DUE_DATE } from '@/lib/dates'
import { useFilters, usePageFilters } from '@/lib/filters'
import { fmtCompact, fmtPct, fmtQty, shortSkuName } from '@/lib/format'
import { convertOrNull, fgBaseline, latestFgSnapshot, reportFreshness, scopePairs, type Freshness } from '@/lib/metrics'
import { useDataset, usePermissions } from '@/lib/store'
import { ExpandToggle, subTh, HeadPeriod, MtExclusionNote, operatingDays, qtyText, SERIES, SkuLink, stickyTd, stickyTh, sumUnit } from './shared'

interface Row {
  key: string
  vendorId: string
  vendorName: string
  skuCode: string
  snapDate: ISODate | null
  freshness: Freshness
  stockEa: number | null
  baselineEa: number | null
  baselineDates: ISODate[]
  deviationPct: number | null
  avgDailyDispatchEa: number | null
  coverDays: number | null
  lastDispatch: ISODate | null
  excess: boolean
  idle: boolean
  nearExpiryEa: number
  lots: FgLot[]
}

type FlagFilter = 'all' | 'excess' | 'idle' | 'expiry' | 'stale'
const COVER_WINDOW = 28

export default function FgInventory() {
  usePageFilters(['vendor', 'product', 'unit'], {
    date: 'Inventory uses the latest snapshot',
  })
  const ds = useDataset()
  const { filters: f } = useFilters()
  const { can } = usePermissions()
  const origin = useOriginState('FG Inventory')
  const unit = f.unit
  const p = ds.idx.param
  const excessPct = p.excessPct ?? 30
  const idleDays = p.idleDays ?? 10
  const expiryWarn = p.expiryWarnDays ?? 60
  const baselineWeeks = p.baselineWeeks ?? 4
  const [flag, setFlag] = useState<FlagFilter>('all')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)

  const rows = useMemo<Row[]>(() => {
    const fresh = new Map<string, Freshness>()
    return scopePairs(ds, f).map(({ vendor, sku }) => {
      if (!fresh.has(vendor.id)) fresh.set(vendor.id, reportFreshness(ds, vendor, 'FG Inventory').freshness)
      const snap = latestFgSnapshot(ds, vendor.id, sku.code)
      const key = `${vendor.id}|${sku.code}`
      const recs = (ds.idx.dispatch.get(key) ?? []).filter((r) => r.qtyEa > 0 && r.date <= LATEST_DUE_DATE)
      const lastDispatch = recs.reduce<ISODate | null>((a, r) => (!a || r.date > a ? r.date : a), null)
      if (!snap)
        return {
          key,
          vendorId: vendor.id,
          vendorName: vendor.name,
          skuCode: sku.code,
          snapDate: null,
          freshness: 'Missing',
          stockEa: null,
          baselineEa: null,
          baselineDates: [],
          deviationPct: null,
          avgDailyDispatchEa: null,
          coverDays: null,
          lastDispatch,
          excess: false,
          idle: false,
          nearExpiryEa: 0,
          lots: [],
        }
      const base = fgBaseline(ds, vendor.id, sku.code, snap.snapshotDate)
      const dev = base.value ? ((snap.qtyEa - base.value) / base.value) * 100 : null
      const winFrom = addDays(snap.snapshotDate, -(COVER_WINDOW - 1))
      const opDays = operatingDays(ds, vendor, winFrom, snap.snapshotDate).length
      const disp = recs.filter((r) => r.date >= winFrom && r.date <= snap.snapshotDate).reduce((a, r) => a + r.qtyEa, 0)
      const avg = opDays ? disp / opDays : null
      const cover = avg ? snap.qtyEa / avg : null
      const idle = snap.qtyEa > 0 && (!lastDispatch || diffDays(snap.snapshotDate, lastDispatch) >= idleDays)
      const nearExpiryEa = snap.lots.filter((l) => diffDays(l.expiryDate, DEMO_TODAY) <= expiryWarn).reduce((a, l) => a + l.qtyEa, 0)
      return {
        key,
        vendorId: vendor.id,
        vendorName: vendor.name,
        skuCode: sku.code,
        snapDate: snap.snapshotDate,
        freshness: fresh.get(vendor.id)!,
        stockEa: snap.qtyEa,
        baselineEa: base.value,
        baselineDates: base.dates,
        deviationPct: dev,
        avgDailyDispatchEa: avg,
        coverDays: cover,
        lastDispatch,
        excess: dev != null && dev > excessPct,
        idle,
        nearExpiryEa,
        lots: [...snap.lots].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)),
      }
    })
  }, [ds, f, excessPct, idleDays, expiryWarn])

  const shown = useMemo(() => {
    const list = rows.filter((r) => flag === 'all' || (flag === 'excess' && r.excess) || (flag === 'idle' && r.idle) || (flag === 'expiry' && r.nearExpiryEa > 0) || (flag === 'stale' && r.freshness !== 'Current'))
    const score = (r: Row) => (r.nearExpiryEa > 0 ? 4 : 0) + (r.excess ? 2 : 0) + (r.idle ? 2 : 0) + (r.freshness !== 'Current' ? 1 : 0)
    return [...list].sort((a, b) => score(b) - score(a) || (b.deviationPct ?? -999) - (a.deviationPct ?? -999))
  }, [rows, flag])

  const totals = useMemo(() => {
    const stock = sumUnit(
      ds,
      rows.map((r) => ({ skuCode: r.skuCode, ea: r.stockEa })),
      unit,
    )
    const base = sumUnit(
      ds,
      rows.map((r) => ({ skuCode: r.skuCode, ea: r.baselineEa })),
      unit,
    )
    const near = sumUnit(
      ds,
      rows.map((r) => ({ skuCode: r.skuCode, ea: r.nearExpiryEa })),
      unit,
    )
    const staleVendors = [...new Set(rows.filter((r) => r.freshness !== 'Current').map((r) => r.vendorName))]
    return {
      stock: stock.total,
      base: base.total,
      near: near.total,
      excluded: [...new Set([...stock.excluded, ...base.excluded])],
      staleVendors,
    }
  }, [rows, ds, unit])

  const sel = rows.find((r) => r.key === (selected ?? shown[0]?.key)) ?? null
  const trend = useMemo(() => {
    if (!sel) return []
    return ds.fgSnapshots
      .filter((s) => `${s.vendorId}|${s.skuCode}` === sel.key)
      .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate))
      .map((s) => ({
        date: s.snapshotDate,
        label: fmtDate(s.snapshotDate),
        stock: convertOrNull(ds, s.skuCode, s.qtyEa, unit),
      }))
  }, [ds, sel, unit])
  const selBaseline = sel ? convertOrNull(ds, sel.skuCode, sel.baselineEa, unit) : null

  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const exportCsv = () =>
    downloadCsv(`fg_inventory_${LATEST_DUE_DATE}_${unit}.csv`, [
      ['Demo data – not connected to GCPL systems'],
      ['Vendor', 'SKU', 'Snapshot date', 'Freshness', `Stock (${unit})`, `Baseline (${unit})`, 'Deviation %', 'Days of cover', 'Last dispatch', 'Excess', 'Idle', `Near-expiry (${unit})`],
      ...shown.map((r) => [
        r.vendorName,
        r.skuCode,
        r.snapDate,
        r.freshness,
        convertOrNull(ds, r.skuCode, r.stockEa, unit),
        convertOrNull(ds, r.skuCode, r.baselineEa, unit),
        r.deviationPct == null ? null : Math.round(r.deviationPct * 10) / 10,
        r.coverDays == null ? null : Math.round(r.coverDays),
        r.lastDispatch,
        r.excess ? 'Yes' : 'No',
        r.idle ? 'Yes' : 'No',
        convertOrNull(ds, r.skuCode, r.nearExpiryEa, unit),
      ]),
    ])

  const counts = {
    excess: rows.filter((r) => r.excess).length,
    idle: rows.filter((r) => r.idle).length,
    expiry: rows.filter((r) => r.nearExpiryEa > 0).length,
    stale: rows.filter((r) => r.freshness !== 'Current').length,
  }

  return (
    <>
      <PageHeader
        title="FG inventory"
        subtitle={<span className="inline-flex flex-wrap items-center gap-2">Latest finished-goods stock at vendors vs baseline, clearance, excess/idle stock and lot expiry · as of each vendor's latest snapshot · {unit}</span>}
        actions={<ExportButton onClick={exportCsv} disabled={!can('export.data') || !shown.length} />}
      />
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          <Kpi
            label="Latest FG stock"
            value={fmtQty(totals.stock, unit)}
            unit={unit}
            period="As of snapshot"
            help="Sum of each vendor–SKU line's latest valid FG inventory snapshot (up to 8 Oct). Stale lines use their last known snapshot – see the snapshot date column."
          />
          <Kpi
            label="Baseline"
            value={fmtQty(totals.base, unit)}
            unit={unit}
            period={`${baselineWeeks}-wk avg`}
            help={`Mean of Monday snapshots in the ${baselineWeeks} weeks before each line's latest snapshot. Demo assumption pending GCPL confirmation.`}
            sub={totals.base ? `Deviation ${fmtPct(((totals.stock - totals.base) / totals.base) * 100)}` : undefined}
          />
          <Kpi
            label="Excess vs baseline"
            value={counts.excess}
            unit="lines"
            status={
              counts.excess ? (
                <Badge tone="warn" icon={TrendingUp}>
                  Above +{excessPct}%
                </Badge>
              ) : (
                <Badge tone="ok" icon={CheckCircle2}>
                  None
                </Badge>
              )
            }
            help={`Latest stock more than ${excessPct}% above baseline (provisional threshold).`}
          />
          <Kpi
            label="Idle stock"
            value={counts.idle}
            unit="lines"
            status={
              counts.idle ? (
                <Badge tone="warn" icon={PauseCircle}>
                  No dispatch ≥ {idleDays}d
                </Badge>
              ) : (
                <Badge tone="ok" icon={CheckCircle2}>
                  None
                </Badge>
              )
            }
            help={`Stock > 0 with no dispatch in the ${idleDays} days up to the snapshot date (provisional).`}
          />
          <Kpi
            label="Near expiry"
            value={fmtQty(totals.near, unit)}
            unit={unit}
            period={`≤ ${expiryWarn} days`}
            status={
              counts.expiry ? (
                <Badge tone="bad" icon={Hourglass}>
                  {counts.expiry} line(s)
                </Badge>
              ) : (
                <Badge tone="ok" icon={CheckCircle2}>
                  None
                </Badge>
              )
            }
            help={`Lots whose expiry date is within ${expiryWarn} days of the demo date (${fmtDate(DEMO_TODAY, true)}).`}
          />
        </div>

        {totals.staleVendors.length > 0 && (
          <Callout
            tone="warn"
            icon={Clock}
            title={`Stale or missing FG inventory snapshots (${totals.staleVendors.length})`}
            details="The latest FG inventory report for these vendors is older than expected. Stock, days of cover and expiry flags for them are calculated from the last received snapshot."
          >
            {totals.staleVendors.join(', ')} – stock shown from last received snapshot; may not reflect current stock.
          </Callout>
        )}

        <Card
          title="Vendor × SKU stock"
          subtitle="Select a row to see its trend; expand for lot and expiry detail"
          bodyClass="p-0"
          actions={
            <LocalFilters className="py-1">
              <Segmented
                size="sm"
                label="Flag filter"
                value={flag}
                onChange={setFlag}
                options={[
                  { value: 'all', label: `All (${rows.length})` },
                  { value: 'excess', label: `Excess (${counts.excess})` },
                  { value: 'idle', label: `Idle (${counts.idle})` },
                  { value: 'expiry', label: `Near expiry (${counts.expiry})` },
                  { value: 'stale', label: `Stale (${counts.stale})` },
                ]}
              />
            </LocalFilters>
          }
        >
          {shown.length ? (
            <TableWrap maxHeight={520}>
              <table className="w-full min-w-[1120px] border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className={cx(th, stickyTh)}>SKU</th>
                    <th className={th}>Vendor</th>
                    <th className={th}>
                      <HeadPeriod title="Snapshot">Date · freshness</HeadPeriod>
                    </th>
                    <th className={cx(th, 'text-right')}>
                      <HeadPeriod title={`Stock (${unit})`}>As of snapshot</HeadPeriod>
                    </th>
                    <th className={cx(th, 'text-right')}>
                      <span className="inline-flex items-center gap-0.5">
                        <HeadPeriod title={`Baseline (${unit})`}>{baselineWeeks}-week Monday avg</HeadPeriod>
                        <HelpTip label="How the baseline is calculated">
                          Baseline = mean of the Monday FG snapshots in the {baselineWeeks} weeks before the latest snapshot. <strong>Demo assumption</strong> – the GCPL baseline definition is pending confirmation.
                        </HelpTip>
                      </span>
                    </th>
                    <th className={cx(th, 'text-right')}>
                      <HeadPeriod title="Deviation">vs baseline</HeadPeriod>
                    </th>
                    <th className={cx(th, 'text-right')}>
                      <span className="inline-flex items-center gap-0.5">
                        <HeadPeriod title="Days of cover">Clearance</HeadPeriod>
                        <HelpTip label="How days of cover is calculated" align="right">
                          Days of cover = latest stock ÷ average daily dispatch over the {COVER_WINDOW} days up to the snapshot (operating days only). Demo calculation.
                        </HelpTip>
                      </span>
                    </th>
                    <th className={th}>
                      <HeadPeriod title="Last dispatch">Historical</HeadPeriod>
                    </th>
                    <th className={cx(th, 'min-w-[120px]')}>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const isOpen = open.has(r.key)
                    const isSel = sel?.key === r.key
                    return (
                      <Fragment key={r.key}>
                        <tr className={cx('group cursor-pointer', isSel ? 'bg-accent-soft/50' : 'hover:bg-surface-muted')} onClick={() => setSelected(r.key)} aria-selected={isSel}>
                          <td className={cx(td, stickyTd, 'max-w-[260px]', isSel ? 'bg-accent-soft' : 'group-hover:bg-surface-muted')}>
                            <div className="flex items-center gap-1">
                              <ExpandToggle open={isOpen} onClick={() => toggle(r.key)} label={`lots for ${r.skuCode} at ${r.vendorName}`} />
                              <SkuLink ds={ds} code={r.skuCode} origin={origin} />
                            </div>
                          </td>
                          <td className={cx(td, 'max-w-[180px]')}>
                            <CellText text={r.vendorName} />
                          </td>
                          <td className={cx(td, 'whitespace-nowrap')}>
                            <span className="inline-flex items-center gap-2">
                              <span className="num">{r.snapDate ? fmtDate(r.snapDate) : '—'}</span>
                              <FreshnessBadge value={r.freshness} />
                            </span>
                          </td>
                          <td className={tdNum}>
                            {r.stockEa == null ? (
                              <Badge tone="none" icon={FileQuestion}>
                                No snapshot
                              </Badge>
                            ) : (
                              qtyText(ds, r.skuCode, r.stockEa, unit)
                            )}
                          </td>
                          <td className={tdNum}>
                            {r.baselineEa == null ? (
                              <span className="text-ink-subtle" title="Not enough history">
                                —
                              </span>
                            ) : (
                              qtyText(ds, r.skuCode, r.baselineEa, unit)
                            )}
                          </td>
                          <td className={cx(tdNum, r.excess && 'font-semibold text-warn')}>{r.deviationPct == null ? '—' : `${r.deviationPct > 0 ? '+' : ''}${fmtPct(r.deviationPct)}`}</td>
                          <td className={tdNum}>
                            {r.coverDays == null ? (
                              <span className="text-ink-subtle" title="No dispatch in window">
                                No dispatch
                              </span>
                            ) : (
                              `${Math.round(r.coverDays)} d`
                            )}
                          </td>
                          <td className={cx(td, 'whitespace-nowrap num')}>{r.lastDispatch ? fmtDate(r.lastDispatch) : <span className="text-ink-subtle">None on record</span>}</td>
                          <td className={td}>
                            <span className="flex gap-1">
                              {r.excess && (
                                <Badge tone="warn" icon={TrendingUp}>
                                  Excess
                                </Badge>
                              )}
                              {r.idle && (
                                <Badge tone="warn" icon={PauseCircle}>
                                  Idle
                                </Badge>
                              )}
                              {r.nearExpiryEa > 0 && (
                                <Badge tone="bad" icon={Hourglass}>
                                  Near expiry
                                </Badge>
                              )}
                              {!r.excess && !r.idle && r.nearExpiryEa === 0 && (
                                <Badge tone="ok" icon={CheckCircle2}>
                                  No flags
                                </Badge>
                              )}
                            </span>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={9} className="border-b border-line bg-surface-muted px-4 py-3">
                              <LotTable lots={r.lots} snapDate={r.snapDate} skuCode={r.skuCode} expiryWarn={expiryWarn} />
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
                    <td className={cx(tdNum, 'bg-surface-muted')}>{fmtQty(totals.stock, unit)}</td>
                    <td className={cx(tdNum, 'bg-surface-muted')}>{fmtQty(totals.base, unit)}</td>
                    <td className={cx(tdNum, 'bg-surface-muted')}>{totals.base ? fmtPct(((totals.stock - totals.base) / totals.base) * 100) : '—'}</td>
                    <td className={cx(td, 'bg-surface-muted')} colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
          ) : (
            <EmptyState icon={Warehouse} title={rows.length ? 'No lines with this flag' : 'No vendor–SKU lines match the filters'}>
              {rows.length ? 'Choose “All” in the page filter.' : 'Adjust the vendor or product filters, or reset them.'}
            </EmptyState>
          )}
        </Card>

        {sel && (
          <Card
            title={`Stock trend · ${shortSkuName(ds.idx.sku.get(sel.skuCode)?.name ?? sel.skuCode)} at ${sel.vendorName}`}
            subtitle={`All snapshots received (history from Monday snapshots, daily from 1 Sep) · ${unit} · dashed line = baseline`}
            bodyClass="px-2 pt-3 pb-2"
          >
            {trend.some((t) => t.stock != null) ? (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                    <CartesianGrid stroke={SERIES.grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: SERIES.axis }} tickLine={false} axisLine={{ stroke: SERIES.grid }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: SERIES.axis }} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtCompact(v)} width={48} />
                    <Tooltip
                      formatter={(v) => [`${fmtQty(Number(v), unit)} ${unit}`, 'Stock']}
                      labelFormatter={(_, p) => (p?.[0] ? fmtDate((p[0].payload as { date: string }).date, true) : '')}
                      contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    />
                    {selBaseline != null && (
                      <ReferenceLine
                        y={selBaseline}
                        stroke={SERIES.plan}
                        strokeDasharray="5 4"
                        label={{
                          value: 'Baseline',
                          position: 'insideTopRight',
                          fontSize: 11,
                          fill: SERIES.axis,
                        }}
                      />
                    )}
                    <Line type="monotone" dataKey="stock" name="Stock" stroke={SERIES.inventory} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState title={unit === 'MT' ? 'No weight conversion for this SKU' : 'No snapshots'}>{unit === 'MT' ? 'Switch the display unit to EA or CS to see this trend.' : undefined}</EmptyState>
            )}
            {sel.freshness !== 'Current' && (
              <p className="px-2 text-label text-warn">
                Trend ends at {fmtDate(sel.snapDate)} – later FG inventory reports from {sel.vendorName} are missing.
              </p>
            )}
          </Card>
        )}

        <div className="space-y-1">
          <MtExclusionNote ds={ds} codes={totals.excluded} />
          <AssumptionNote>
            Thresholds are provisional parameters (Master Data → Parameters): excess &gt; {excessPct}% above baseline, idle = no dispatch for ≥ {idleDays} days, near expiry ≤ {expiryWarn} days. Freshness: a daily FG report is expected for
            the latest operating day up to {fmtDate(LATEST_DUE_DATE)}.
          </AssumptionNote>
        </div>
      </div>
    </>
  )
}

function LotTable({ lots, snapDate, skuCode, expiryWarn }: { lots: FgLot[]; snapDate: ISODate | null; skuCode: string; expiryWarn: number }) {
  const ds = useDataset()
  const { filters } = useFilters()
  const unit = filters.unit
  if (!lots.length)
    return (
      <p className="text-dense text-ink-muted">
        No lots in the latest snapshot
        {snapDate ? ` (${fmtDate(snapDate)})` : ''}.
      </p>
    )
  return (
    <div className="max-w-[860px]">
      <div className="mb-1.5 text-dense font-semibold text-ink-muted">
        Lots in snapshot of {fmtDate(snapDate, true)} · days to expiry from {fmtDate(DEMO_TODAY)}
      </div>
      <table className="w-full border-separate border-spacing-0 rounded border border-line bg-surface">
        <thead>
          <tr>
            <th className={subTh}>Lot</th>
            <th className={subTh}>Mfg date</th>
            <th className={subTh}>Expiry</th>
            <th className={cx(subTh, 'text-right')}>Days to expiry</th>
            <th className={cx(subTh, 'text-right')}>Qty ({unit})</th>
            <th className={subTh}>Status</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((l) => {
            const dte = diffDays(l.expiryDate, DEMO_TODAY)
            return (
              <tr key={l.lotNo}>
                <td className={cx(td, 'num')}>{l.lotNo}</td>
                <td className={cx(td, 'num')}>{fmtDate(l.mfgDate, true)}</td>
                <td className={cx(td, 'num')}>{fmtDate(l.expiryDate, true)}</td>
                <td className={cx(tdNum, dte <= expiryWarn && 'font-semibold text-bad')}>{dte}</td>
                <td className={tdNum}>{qtyText(ds, skuCode, l.qtyEa, unit)}</td>
                <td className={td}>
                  {dte < 0 ? (
                    <Badge tone="bad" icon={Hourglass}>
                      Expired
                    </Badge>
                  ) : dte <= expiryWarn ? (
                    <Badge tone="bad" icon={Hourglass}>
                      Near expiry
                    </Badge>
                  ) : (
                    <Badge tone="ok" icon={CheckCircle2}>
                      OK
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
