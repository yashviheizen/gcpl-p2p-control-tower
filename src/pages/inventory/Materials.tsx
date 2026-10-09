import { Boxes, CheckCircle2, Clock, FileQuestion, Hourglass, Layers } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { FreshnessBadge } from '@/components/status'
import { AssumptionNote, Badge, Callout, Card, CellText, EmptyState, ExportButton, HelpTip, PageHeader, TableWrap, Tabs, cx, downloadCsv, td, tdNum, th } from '@/components/ui'
import type { ISODate, Material, MaterialKind, MaterialLot, MaterialUom } from '@/data/types'
import { DEMO_TODAY, diffDays, fmtDate, LATEST_DUE_DATE } from '@/lib/dates'
import { useFilters, usePageFilters } from '@/lib/filters'
import { fmtNum } from '@/lib/format'
import { reportFreshness, type Freshness } from '@/lib/metrics'
import { useDataset, usePermissions } from '@/lib/store'
import { ExpandToggle, HeadPeriod, stickyTd, stickyTh, subTh } from './shared'

const UOM_LABEL: Record<MaterialUom, string> = {
  KG: 'kg',
  L: 'litres',
  EA: 'each',
  ROLL: 'rolls',
  MTR: 'metres',
}
const uomDecimals = (u: MaterialUom) => (u === 'KG' || u === 'L' ? 1 : 0)

interface Row {
  key: string
  vendorId: string
  vendorName: string
  material: Material
  snapDate: ISODate | null
  freshness: Freshness
  ageDays: number | null
  qty: number | null
  uom: MaterialUom
  lots: MaterialLot[]
  oldestAge: number | null
  nearestExpiry: ISODate | null
  expiredQty: number
  nearExpiryQty: number
}

export default function Materials() {
  usePageFilters(['vendor'], {
    date: 'Latest snapshot',
    product: 'Materials are not mapped to FG hierarchy',
    unit: 'Materials keep their own units',
  })
  const ds = useDataset()
  const { filters: f } = useFilters()
  const { can } = usePermissions()
  const [kind, setKind] = useState<MaterialKind>('RM')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const expiryWarn = ds.idx.param.expiryWarnDays ?? 60
  const staleWeekly = ds.idx.param.staleDaysWeekly ?? 4

  const vendors = useMemo(() => ds.vendors.filter((v) => !f.vendorIds.length || f.vendorIds.includes(v.id)), [ds, f.vendorIds])

  const allRows = useMemo<Row[]>(() => {
    const out: Row[] = []
    for (const v of vendors) {
      const fresh = {
        RM: reportFreshness(ds, v, 'RM Inventory'),
        PM: reportFreshness(ds, v, 'PM Inventory'),
      }
      for (const code of ds.vendorMaterials[v.id] ?? []) {
        const material = ds.materials.find((m) => m.code === code)
        if (!material) continue
        let snap = null as (typeof ds.materialSnapshots)[number] | null
        for (const s of ds.materialSnapshots) {
          if (s.vendorId !== v.id || s.materialCode !== code || s.snapshotDate > LATEST_DUE_DATE) continue
          if (!snap || s.snapshotDate > snap.snapshotDate) snap = s
        }
        const fr = fresh[material.kind]
        const lots = snap ? [...snap.lots].sort((a, b) => a.receivedDate.localeCompare(b.receivedDate)) : []
        const expiring = lots.filter((l) => l.expiryDate)
        out.push({
          key: `${v.id}|${code}`,
          vendorId: v.id,
          vendorName: v.name,
          material,
          snapDate: snap?.snapshotDate ?? null,
          freshness: snap ? fr.freshness : 'Missing',
          ageDays: snap ? diffDays(DEMO_TODAY, snap.snapshotDate) : null,
          qty: snap?.qty ?? null,
          uom: snap?.uom ?? material.uom,
          lots,
          oldestAge: lots.length ? diffDays(DEMO_TODAY, lots[0].receivedDate) : null,
          nearestExpiry: expiring.reduce<ISODate | null>((a, l) => (!a || l.expiryDate! < a ? l.expiryDate : a), null),
          expiredQty: expiring.filter((l) => l.expiryDate! < DEMO_TODAY).reduce((a, l) => a + l.qty, 0),
          nearExpiryQty: expiring.filter((l) => l.expiryDate! >= DEMO_TODAY && diffDays(l.expiryDate!, DEMO_TODAY) <= expiryWarn).reduce((a, l) => a + l.qty, 0),
        })
      }
    }
    return out
  }, [ds, vendors, expiryWarn])

  const rows = useMemo(() => allRows.filter((r) => r.material.kind === kind).sort((a, b) => a.vendorName.localeCompare(b.vendorName) || a.material.code.localeCompare(b.material.code)), [allRows, kind])

  // Totals only within the same unit of measure – never across units.
  const uomTotals = useMemo(() => {
    const m = new Map<MaterialUom, { qty: number; lines: number; materials: Set<string> }>()
    for (const r of rows) {
      if (r.qty == null) continue
      const t = m.get(r.uom) ?? {
        qty: 0,
        lines: 0,
        materials: new Set<string>(),
      }
      t.qty += r.qty
      t.lines++
      t.materials.add(r.material.code)
      m.set(r.uom, t)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])

  const stale = useMemo(() => {
    const m = new Map<string, ISODate | null>()
    for (const r of rows) if (r.freshness !== 'Current') m.set(r.vendorName, r.snapDate)
    return [...m.entries()]
  }, [rows])

  const label = kind === 'RM' ? 'RM inventory' : 'PM inventory'
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const exportCsv = () =>
    downloadCsv(`${kind.toLowerCase()}_inventory_${LATEST_DUE_DATE}.csv`, [
      ['Demo data – not connected to GCPL systems. Quantities are in each material’s own unit of measure.'],
      ['Vendor', 'Material code', 'Material', 'Snapshot date', 'Freshness', 'Reported qty', 'UOM', 'Lots', 'Oldest lot age (days)', 'Nearest expiry', 'Expired qty', 'Near-expiry qty'],
      ...rows.map((r) => [r.vendorName, r.material.code, r.material.name, r.snapDate, r.freshness, r.qty, r.uom, r.lots.length, r.oldestAge, r.nearestExpiry, r.expiredQty, r.nearExpiryQty]),
    ])

  const counts = {
    RM: allRows.filter((r) => r.material.kind === 'RM').length,
    PM: allRows.filter((r) => r.material.kind === 'PM').length,
  }

  return (
    <>
      <PageHeader
        title="RM/PM inventory"
        subtitle={<span className="inline-flex flex-wrap items-center gap-2">Vendor-reported material stock, lots, ageing and expiry · latest twice-weekly snapshot (Mon/Thu) · each material in its own unit</span>}
        actions={<ExportButton onClick={exportCsv} disabled={!can('export.data') || !rows.length} />}
      />
      <div className="space-y-6">
        <Tabs
          label="Material type"
          value={kind}
          onChange={setKind}
          tabs={[
            { value: 'RM', label: 'RM inventory', count: counts.RM },
            { value: 'PM', label: 'PM inventory', count: counts.PM },
          ]}
        />

        {stale.length > 0 && (
          <Callout
            tone="warn"
            icon={Clock}
            title={`Stale ${label} snapshots (${stale.length})`}
            details={`Snapshots are expected every Monday and Thursday; a snapshot older than ${staleWeekly} days is treated as stale (demo assumption). Quantities for these vendors are the last known values, not current stock.`}
          >
            {stale.map(([v, d]) => `${v} – last snapshot ${d ? fmtDate(d, true) : 'never received'}`).join(' · ')}. Quantities are last known values.
          </Callout>
        )}

        <section aria-label={`${label} totals by unit of measure`} className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-dense font-medium text-ink-muted">
            <Layers size={14} aria-hidden /> Totals by unit of measure · as of latest snapshots
            <HelpTip label="Why totals are split by unit">
              Materials are reported in different units (kg, litres, each, rolls, metres). Quantities in different units are never added together, and FG case-pack conversions are never applied to materials.
            </HelpTip>
          </div>
          {uomTotals.length ? (
            <div className="flex flex-wrap gap-2">
              {uomTotals.map(([u, t]) => (
                <div key={u} className="min-w-[150px] rounded-md border border-line bg-surface-muted px-3 py-2">
                  <div className="text-label font-medium text-ink-subtle">
                    {u} · {UOM_LABEL[u]}
                  </div>
                  <div className="num text-[18px] font-semibold text-ink">{fmtNum(t.qty, uomDecimals(u))}</div>
                  <div className="text-label text-ink-subtle">
                    {t.materials.size} material(s) · {t.lines} vendor line(s)
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-dense text-ink-muted">No quantities in scope.</p>
          )}
        </section>

        <Card title={`${label} by vendor`} subtitle="Expand a line for lot-level ageing and expiry" bodyClass="p-0">
          {rows.length ? (
            <TableWrap maxHeight={560}>
              <table className="w-full min-w-[1040px] border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className={cx(th, stickyTh)}>Material</th>
                    <th className={th}>Vendor</th>
                    <th className={th}>
                      <HeadPeriod title="Snapshot">Date · freshness</HeadPeriod>
                    </th>
                    <th className={cx(th, 'text-right')}>
                      <HeadPeriod title="Reported qty">As of snapshot</HeadPeriod>
                    </th>
                    <th className={th}>UOM</th>
                    <th className={cx(th, 'text-right')}>Lots</th>
                    <th className={cx(th, 'text-right')}>
                      <HeadPeriod title="Oldest lot age">Days since receipt</HeadPeriod>
                    </th>
                    <th className={th}>
                      <HeadPeriod title="Nearest expiry">{kind === 'RM' ? `Warn ≤ ${expiryWarn} days` : 'If tracked'}</HeadPeriod>
                    </th>
                    <th className={cx(th, 'min-w-[120px]')}>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isOpen = open.has(r.key)
                    const dte = r.nearestExpiry ? diffDays(r.nearestExpiry, DEMO_TODAY) : null
                    return (
                      <Fragment key={r.key}>
                        <tr className="group hover:bg-surface-muted">
                          <td className={cx(td, stickyTd, 'max-w-[280px] group-hover:bg-surface-muted')}>
                            <div className="flex items-center gap-1">
                              <ExpandToggle open={isOpen} onClick={() => toggle(r.key)} label={`lots for ${r.material.code} at ${r.vendorName}`} />
                              <div className="min-w-0">
                                <div className="truncate font-medium" title={r.material.name}>
                                  {r.material.name}
                                </div>
                                <div className="num text-label text-ink-subtle">{r.material.code}</div>
                              </div>
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
                            {r.qty == null ? (
                              <Badge tone="none" icon={FileQuestion}>
                                No snapshot
                              </Badge>
                            ) : (
                              fmtNum(r.qty, uomDecimals(r.uom))
                            )}
                          </td>
                          <td className={cx(td, 'whitespace-nowrap text-ink-muted')} title={UOM_LABEL[r.uom]}>
                            {r.uom}
                          </td>
                          <td className={tdNum}>{r.lots.length}</td>
                          <td className={cx(tdNum, (r.oldestAge ?? 0) > 180 && 'font-semibold text-warn')}>{r.oldestAge ?? '—'}</td>
                          <td className={cx(td, 'whitespace-nowrap num')}>
                            {r.nearestExpiry ? (
                              <span className={cx(dte != null && dte <= expiryWarn && 'font-semibold text-bad')}>
                                {fmtDate(r.nearestExpiry, true)} <span className="text-label font-normal text-ink-subtle">({dte}d)</span>
                              </span>
                            ) : (
                              <span className="text-ink-subtle">Not tracked</span>
                            )}
                          </td>
                          <td className={td}>
                            <span className="flex gap-1">
                              {r.expiredQty > 0 && (
                                <Badge tone="bad" icon={Hourglass}>
                                  Expired lot
                                </Badge>
                              )}
                              {r.nearExpiryQty > 0 && (
                                <Badge tone="warn" icon={Hourglass}>
                                  Near expiry
                                </Badge>
                              )}
                              {(r.oldestAge ?? 0) > 180 && (
                                <Badge tone="warn" icon={Clock}>
                                  Aged &gt; 180d
                                </Badge>
                              )}
                              {r.expiredQty === 0 && r.nearExpiryQty === 0 && (r.oldestAge ?? 0) <= 180 && r.qty != null && (
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
                              <LotDetail row={r} expiryWarn={expiryWarn} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <EmptyState icon={Boxes} title={`No ${label} for the selected vendors`}>
              Adjust the vendor filter or reset filters.
            </EmptyState>
          )}
        </Card>
        <AssumptionNote>
          Ageing = days from lot receipt to the demo date ({fmtDate(DEMO_TODAY, true)}); “Aged &gt; 180d” and the {expiryWarn}
          -day expiry window are provisional. RM lots carry a 365-day shelf life in this demo; PM lots have no expiry tracked.
        </AssumptionNote>
      </div>
    </>
  )
}

function LotDetail({ row, expiryWarn }: { row: Row; expiryWarn: number }) {
  if (!row.lots.length) return <p className="text-dense text-ink-muted">No lots in the latest snapshot.</p>
  return (
    <div className="max-w-[820px]">
      <div className="mb-1.5 text-dense font-semibold text-ink-muted">
        Lots in snapshot of {fmtDate(row.snapDate, true)} · quantities in {row.uom} ({UOM_LABEL[row.uom]})
      </div>
      <table className="w-full border-separate border-spacing-0 rounded border border-line bg-surface">
        <thead>
          <tr>
            <th className={subTh}>Lot</th>
            <th className={subTh}>Received</th>
            <th className={cx(subTh, 'text-right')}>Age (days)</th>
            <th className={subTh}>Expiry</th>
            <th className={cx(subTh, 'text-right')}>Days to expiry</th>
            <th className={cx(subTh, 'text-right')}>Qty ({row.uom})</th>
            <th className={subTh}>Status</th>
          </tr>
        </thead>
        <tbody>
          {row.lots.map((l) => {
            const dte = l.expiryDate ? diffDays(l.expiryDate, DEMO_TODAY) : null
            return (
              <tr key={l.lotNo}>
                <td className={cx(td, 'num')}>{l.lotNo}</td>
                <td className={cx(td, 'num')}>{fmtDate(l.receivedDate, true)}</td>
                <td className={tdNum}>{diffDays(DEMO_TODAY, l.receivedDate)}</td>
                <td className={cx(td, 'num')}>{l.expiryDate ? fmtDate(l.expiryDate, true) : <span className="text-ink-subtle">Not tracked</span>}</td>
                <td className={tdNum}>{dte ?? '—'}</td>
                <td className={tdNum}>{fmtNum(l.qty, uomDecimals(row.uom))}</td>
                <td className={td}>
                  {dte != null && dte < 0 ? (
                    <Badge tone="bad" icon={Hourglass}>
                      Expired
                    </Badge>
                  ) : dte != null && dte <= expiryWarn ? (
                    <Badge tone="warn" icon={Hourglass}>
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
