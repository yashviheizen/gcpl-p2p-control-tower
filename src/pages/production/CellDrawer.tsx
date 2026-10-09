import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CELL_META, CellStatusBadge } from '@/components/status'
import { AssumptionNote, Drawer, KeyVal, TableWrap, td, tdNum, th, type OriginState } from '@/components/ui'
import type { Dataset } from '@/data/dataset'
import type { Unit } from '@/data/types'
import { operatingDayInfo } from '@/lib/calendar'
import { fmtDate, fmtDateTime, monthOf } from '@/lib/dates'
import { fmtNum, fmtPct, fmtQty, fmtSigned, shortSkuName } from '@/lib/format'
import { STATUS_ORDER, thresholds, type CellStatus, type ProdCell } from '@/lib/metrics'
import { convertFg } from '@/lib/units'
import type { GridCell } from './model'

const COMPARABLE = new Set<CellStatus>(['below', 'within', 'above', 'zero'])
const NOT_COMPARABLE: Record<CellStatus, string> = {
  below: '',
  within: '',
  above: '',
  zero: '',
  missing: 'Excluded – report missing',
  monthly: 'Monthly plan',
  noPlan: 'No daily plan',
  nonOp: 'Non-operating day',
  future: 'Not yet due',
}
const WHY_EXCLUDED: Partial<Record<CellStatus, string>> = {
  missing: 'No valid production report has been received for this date, so there is no comparable actual. The scheduled plan is kept out of the comparable total rather than being compared with zero.',
  monthly: 'This vendor plans by month and the plan is not split by day, so there is no daily target and daily attainment is N/A. Reported production is compared month-to-date in the Monthly-plan vendors table.',
  noPlan: 'There is no applicable daily plan for this SKU and date, so reported production has no target to be compared with.',
  nonOp: 'Non-operating day – no daily target applies. Any reported production is kept out of the comparison.',
  future: 'This date is not yet due, so its plan is shown for context only.',
}

export interface DrawerTarget {
  title: string
  subtitle: string
  cell: GridCell
}

function UnitLine({ ds, ea, skuCode, unit, label }: { ds: Dataset; ea: number | null; skuCode: string; unit: Unit; label: string }) {
  const sku = ds.idx.sku.get(skuCode)!
  if (ea == null) return <div className="text-dense text-ink-muted">{label}: —</div>
  let conv: string
  if (unit === 'EA') conv = `${fmtNum(ea)} EA (stored unit)`
  else if (unit === 'CS') conv = `${fmtNum(ea)} EA ÷ ${sku.casePack} EA/CS (case pack) = ${fmtNum(ea / sku.casePack, 1)} CS`
  else conv = sku.kgPerEa == null ? `${fmtNum(ea)} EA – no kg/EA weight in master data, excluded from MT` : `${fmtNum(ea)} EA × ${sku.kgPerEa} kg/EA ÷ 1000 = ${fmtNum(convertFg(ea, sku, 'MT'), 2)} MT`
  return (
    <div className="text-dense text-ink-muted">
      <span className="font-medium text-ink">{label}:</span> <span className="num">{conv}</span>
    </div>
  )
}

function SingleCell({ ds, c, unit, origin }: { ds: Dataset; c: ProdCell; unit: Unit; origin: OriginState }) {
  const vendor = ds.idx.vendor.get(c.vendorId)!
  const sku = ds.idx.sku.get(c.skuCode)!
  const meta = CELL_META[c.status]
  const day = operatingDayInfo(ds, vendor, c.date)
  const rec = ds.idx.production.get(`${c.vendorId}|${c.skuCode}|${c.date}`)
  const versionId = ds.activePlan[`${c.vendorId}|${monthOf(c.date)}`]
  const version = ds.planVersions.find((v) => v.id === versionId)
  const t = thresholds(ds)
  const plan = c.planEa == null ? null : convertFg(c.planEa, sku, unit)
  const actual = c.actualEa == null ? null : convertFg(c.actualEa, sku, unit)
  const comparable = COMPARABLE.has(c.status)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <CellStatusBadge status={c.status} />
        <span className="text-body text-ink-muted">{c.reason || meta.description}</span>
      </div>
      <KeyVal
        cols={2}
        items={[
          { k: `Comparable plan (${unit})`, v: comparable ? fmtQty(plan, unit) : <span className="text-ink-muted">{NOT_COMPARABLE[c.status]}</span> },
          {
            k: `Comparable actual (${unit})`,
            v: comparable ? fmtQty(actual, unit) : <span className="text-ink-muted">{c.status === 'missing' ? 'Report missing' : 'Not compared'}</span>,
          },
          { k: 'Attainment', v: comparable ? fmtPct(c.attainment, 1) : <span className="text-ink-muted">{c.status === 'monthly' ? 'Daily attainment N/A' : 'N/A'}</span> },
          { k: `Gap (${unit})`, v: comparable && plan != null && actual != null ? fmtSigned(actual - plan, unit) : '—' },
        ]}
      />
      {!comparable && WHY_EXCLUDED[c.status] && <p className="rounded-md border border-line bg-surface-muted p-2.5 text-dense text-ink-muted">{WHY_EXCLUDED[c.status]}</p>}
      <section>
        <h3 className="mb-1.5 text-body font-semibold">Additional quantities</h3>
        <KeyVal
          cols={2}
          items={[
            {
              k: c.status === 'future' ? `Future plan (${unit})` : c.status === 'missing' ? `Scheduled plan, awaiting report (${unit})` : `Scheduled plan (${unit})`,
              v: c.status === 'monthly' ? <span className="text-ink-muted">Monthly plan – not split by day</span> : fmtQty(plan, unit),
            },
            { k: `Reported actual (${unit})`, v: c.actualEa == null ? <span className="text-ink-muted">Not reported</span> : fmtQty(actual, unit) },
            { k: 'Operating day', v: day.operating ? `Yes${day.reason ? ` (${day.reason})` : ''}` : `No – ${day.reason}` },
            { k: 'Case pack', v: `${sku.casePack} EA/CS` },
          ]}
        />
      </section>
      <div className="space-y-1 rounded-md border border-line bg-surface-muted p-2.5">
        <div className="text-body font-medium text-ink-muted">Unit conversion</div>
        <UnitLine ds={ds} ea={c.planEa} skuCode={sku.code} unit={unit} label="Plan" />
        <UnitLine ds={ds} ea={c.actualEa} skuCode={sku.code} unit={unit} label="Actual" />
      </div>
      <details className="rounded-md border border-line px-2.5 py-2 text-body text-ink-muted">
        <summary className="cursor-pointer font-medium text-ink">Status rule</summary>
        <p className="mt-1">
          Attainment = actual ÷ plan × 100. Below {t.low}% → Below plan; {t.low}–{t.high}% → Within range; above {t.high}% → Above plan (review, not automatically good). Monthly-plan vendor → Monthly plan (daily attainment N/A). No
          applicable plan → No plan. A missing report is never treated as zero.
        </p>
      </details>
      <section>
        <h3 className="mb-1.5 text-body font-semibold">Source evidence</h3>
        <KeyVal
          items={[
            {
              k: 'Production report',
              v: c.report ? c.report.id : 'None received',
            },
            { k: 'Report status', v: c.report?.status ?? '—' },
            { k: 'File', v: c.report?.fileName ?? '—' },
            {
              k: 'Received',
              v: c.report ? `${fmtDateTime(c.report.receivedAt)} · ${c.report.channel}` : '—',
            },
            {
              k: 'Upload batch',
              v: c.report ? (
                <Link to={`/data/uploads/${c.report.batchId}`} state={origin} className="inline-flex items-center gap-1 text-accent-ink underline">
                  {c.report.batchId} <ExternalLink size={12} aria-hidden />
                </Link>
              ) : (
                '—'
              ),
            },
            {
              k: 'Record id',
              v: rec?.id ?? (c.report ? 'SKU line absent' : '—'),
            },
            {
              k: 'Plan version',
              v: version ? `${version.id} (${version.granularity}, ${version.kind})` : 'No active plan',
            },
            {
              k: 'Plan uploaded',
              v: version ? `${fmtDateTime(version.uploadedAt)} by ${version.uploadedBy}` : '—',
            },
          ]}
        />
      </section>
      <Link to={`/sku/${sku.code}`} state={origin} className="inline-flex items-center gap-1 text-body font-medium text-accent-ink underline">
        Investigate {sku.code} across vendors <ExternalLink size={13} aria-hidden />
      </Link>
      <AssumptionNote>
        Thresholds {t.low}%/{t.high}% and the D+1 report due rule are provisional and need business confirmation.
      </AssumptionNote>
    </div>
  )
}

function AggCell({ ds, g, unit, origin }: { ds: Dataset; g: GridCell; unit: Unit; origin: OriginState }) {
  const a = g.agg
  const comparable = a.planComparable > 0
  const skus = [...new Set(g.cells.map((c) => c.skuCode))]
  const rows = [...g.cells].sort((x, y) => STATUS_ORDER.indexOf(x.status) - STATUS_ORDER.indexOf(y.status) || x.date.localeCompare(y.date)).slice(0, 80)
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CellStatusBadge status={g.status} />
        <span className="text-dense text-ink-muted">{g.cells.length} vendor × SKU × day records</span>
      </div>
      <KeyVal
        cols={2}
        items={[
          { k: `Comparable plan (${unit})`, v: comparable ? fmtQty(a.planComparable, unit) : '—' },
          { k: `Comparable actual (${unit})`, v: comparable ? fmtQty(a.actualComparable, unit) : '—' },
          { k: 'Attainment', v: a.attainment == null ? <span className="text-ink-muted">{g.status === 'monthly' ? 'Daily attainment N/A' : 'N/A'}</span> : fmtPct(a.attainment, 1) },
          { k: `Gap (${unit})`, v: comparable ? fmtSigned(a.gap, unit) : '—' },
        ]}
      />
      <p className="text-dense text-ink-muted">Comparison basis: only plan and actual on days with both a daily plan and a valid report. Everything else is listed under Additional quantities and is not compared.</p>
      <section>
        <h3 className="mb-1.5 text-body font-semibold">Additional quantities</h3>
        <KeyVal
          cols={2}
          items={[
            { k: `Plan awaiting reports (${unit})`, v: fmtQty(a.planUnreported, unit) },
            { k: `Future plan (${unit})`, v: fmtQty(a.planFuture, unit) },
            { k: `Actual vs monthly plan (${unit})`, v: fmtQty(a.actualMonthly, unit) },
            { k: `Actual with no daily plan (${unit})`, v: fmtQty(a.actualNoPlan, unit) },
            { k: `Actual on non-operating days (${unit})`, v: fmtQty(a.actualNonOp, unit) },
            { k: `Total reported actual (${unit})`, v: fmtQty(a.actual, unit) },
          ]}
        />
      </section>
      <section>
        <h3 className="mb-1.5 text-body font-semibold">Contributing records by status</h3>
        <ul className="grid grid-cols-2 gap-1.5">
          {STATUS_ORDER.filter((s) => a.counts[s]).map((s) => {
            const m = CELL_META[s]
            return (
              <li key={s} className="flex items-center justify-between rounded border border-line px-2 py-1 text-body">
                <span className="inline-flex items-center gap-1.5">
                  <m.icon size={13} aria-hidden className={m.cell.split(' ').find((x) => x.startsWith('text-'))} /> {m.label}
                </span>
                <span className="num font-semibold">{a.counts[s]}</span>
              </li>
            )
          })}
        </ul>
      </section>
      {a.excluded.length > 0 && (
        <p className="text-dense text-warn">
          Excluded from MT: {a.excluded.map((e) => e.skuCode).join(', ')} – {a.excluded[0].reason}
        </p>
      )}
      <section>
        <h3 className="mb-1.5 text-body font-semibold">Contributing SKUs ({skus.length})</h3>
        <ul className="flex flex-wrap gap-1.5">
          {skus.map((code) => (
            <li key={code}>
              <Link to={`/sku/${code}`} state={origin} className="inline-flex items-center gap-1 rounded border border-line px-2 py-0.5 text-dense hover:bg-surface-muted">
                {shortSkuName(ds.idx.sku.get(code)!.name)} <span className="text-label text-ink-subtle">{code}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-1.5 text-body font-semibold">Source records{g.cells.length > 80 ? ' (first 80)' : ''}</h3>
        <TableWrap maxHeight={360} className="rounded border border-line">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Vendor · SKU</th>
                <th className={th + ' text-right'}>Scheduled plan</th>
                <th className={th + ' text-right'}>Reported actual</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const sku = ds.idx.sku.get(c.skuCode)!
                return (
                  <tr key={`${c.vendorId}${c.skuCode}${c.date}`}>
                    <td className={td + ' whitespace-nowrap'}>{fmtDate(c.date)}</td>
                    <td className={td}>
                      <div className="text-dense">{ds.idx.vendor.get(c.vendorId)!.name}</div>
                      <Link to={`/sku/${sku.code}`} state={origin} className="text-dense text-accent-ink hover:underline">
                        {shortSkuName(sku.name)}
                      </Link>{' '}
                      <span className="text-label text-ink-subtle">{sku.code}</span>
                    </td>
                    <td className={tdNum}>{fmtQty(c.planEa == null ? null : convertFg(c.planEa, sku, unit), unit)}</td>
                    <td className={tdNum}>{fmtQty(c.actualEa == null ? null : convertFg(c.actualEa, sku, unit), unit)}</td>
                    <td className={td}>
                      <span className="text-dense">{CELL_META[c.status].label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
      </section>
    </div>
  )
}

export function CellDrawer({ ds, target, unit, origin, onClose }: { ds: Dataset; target: DrawerTarget | null; unit: Unit; origin: OriginState; onClose: () => void }) {
  return (
    <Drawer open={!!target} onClose={onClose} title={target?.title ?? ''} subtitle={target?.subtitle} width={560}>
      {target && (target.cell.single ? <SingleCell ds={ds} c={target.cell.single} unit={unit} origin={origin} /> : <AggCell ds={ds} g={target.cell} unit={unit} origin={origin} />)}
    </Drawer>
  )
}
