import { CalendarDays, CheckCircle2, Eye, GitCompare, History, Info, Table2, Upload } from 'lucide-react'
import { useMemo, useState, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Button, Callout, Card, Disclosure, EmptyState, ExportButton, LocalFilters, Modal, PageHeader, Segmented, Select, TableWrap, Tabs, cx, downloadCsv, td, tdNum, th } from '@/components/ui'
import type { Dataset } from '@/data/dataset'
import type { PlanLine, PlanVersion, Sku, Unit } from '@/data/types'
import { operatingDayInfo } from '@/lib/calendar'
import { DEMO_TODAY, addDays, dayOfWeek, eachDay, fmtDate, fmtDateDow, fmtDateTime, fmtDow, fmtMonth, monthEnd, monthOf, monthStart, parseISO } from '@/lib/dates'
import { usePageFilters, useFilters } from '@/lib/filters'
import { fmtQty, shortSkuName } from '@/lib/format'
import { skuMatchesScope } from '@/lib/metrics'
import { logActivity, store, useDataset, usePermissions } from '@/lib/store'
import { activeVersionId, linesByVersion, planKey, planMonths, qtyIn, totalIn, versionsFor } from './planUtils'

type Tab = 'current' | 'history'
type View = 'grid' | 'calendar'

function VersionStatus({ v, activeId }: { v: PlanVersion; activeId: string | null }) {
  if (v.id === activeId)
    return (
      <Badge tone="ok" icon={CheckCircle2}>
        Active
      </Badge>
    )
  return (
    <Badge tone="none" icon={History}>
      Not active
    </Badge>
  )
}

function KindBadge({ kind }: { kind: PlanVersion['kind'] }) {
  return <Badge tone={kind === 'Baseline' ? 'info' : 'accent'}>{kind}</Badge>
}

export default function PlanView() {
  usePageFilters(['vendor', 'product', 'unit'], {
    date: 'Plans are shown for the month selected in page filters',
  })
  const ds = useDataset()
  const { filters } = useFilters()
  const { can } = usePermissions()
  const [params, setParams] = useSearchParams()

  const tab: Tab = params.get('tab') === 'history' ? 'history' : 'current'
  const vendorOptions = filters.vendorIds.length ? ds.vendors.filter((v) => filters.vendorIds.includes(v.id)) : ds.vendors
  const vendorParam = params.get('vendor')
  const vendor = vendorOptions.find((v) => v.id === vendorParam) ?? vendorOptions[0] ?? ds.vendors[0]
  const months = planMonths(ds)
  const monthParam = params.get('month')
  const month = monthParam && months.includes(monthParam) ? monthParam : months.includes(monthOf(DEMO_TODAY)) ? monthOf(DEMO_TODAY) : months[months.length - 1]
  const versions = versionsFor(ds, vendor.id, month)
  const activeId = activeVersionId(ds, vendor.id, month)
  const versionParam = params.get('version')
  const selected = versions.find((v) => v.id === versionParam) ?? versions.find((v) => v.id === activeId) ?? versions[versions.length - 1] ?? null

  const update = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) p.delete(k)
      else p.set(k, v)
    }
    setParams(p, { replace: true })
  }

  return (
    <div>
      <PageHeader
        title="Production plan"
        subtitle="Current month's plan by vendor. Daily plans show by day; monthly plans stay monthly."
        actions={
          <>
            <Link
              to={`/planning/compare?vendor=${vendor.id}&month=${month}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-body font-medium hover:bg-surface-muted"
            >
              <GitCompare size={15} aria-hidden /> Compare versions
            </Link>
            {can('plan.upload') && (
              <Link to={`/planning/upload?vendor=${vendor.id}&month=${month}`} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] bg-accent px-3 text-body font-medium text-white hover:bg-accent-hover">
                <Upload size={15} aria-hidden /> Upload plan
              </Link>
            )}
          </>
        }
      />

      <LocalFilters className="mb-3">
        <Select label="Vendor" value={vendor.id} onChange={(e) => update({ vendor: e.target.value, version: null })}>
          {vendorOptions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.code})
            </option>
          ))}
        </Select>
        <Select label="Plan month" value={month} onChange={(e) => update({ month: e.target.value, version: null })}>
          {months.map((m) => (
            <option key={m} value={m}>
              {fmtMonth(m)}
              {m === monthOf(DEMO_TODAY) ? ' (current)' : ''}
            </option>
          ))}
        </Select>
        {tab === 'current' && versions.length > 1 && selected && (
          <Select label="Version" value={selected.id} onChange={(e) => update({ version: e.target.value })}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.versionNo} · {v.kind}
                {v.id === activeId ? ' (active)' : ''}
              </option>
            ))}
          </Select>
        )}
        {filters.vendorIds.length > 0 && <span className="text-label text-ink-subtle">Vendor list limited by the global vendor filter</span>}
      </LocalFilters>

      <Tabs
        label="Plan views"
        value={tab}
        onChange={(t) => update({ tab: t === 'current' ? null : t })}
        tabs={[
          { value: 'current', label: 'Current plan' },
          {
            value: 'history',
            label: 'Version history',
            count: ds.planVersions.filter((v) => (filters.vendorIds.length ? filters.vendorIds.includes(v.vendorId) : true)).length,
          },
        ]}
      />

      <div className="mt-4">
        {tab === 'current' ? (
          selected ? (
            <CurrentPlan ds={ds} version={selected} activeId={activeId} versionsCount={versions.length} unit={filters.unit} onShowActive={() => update({ version: null })} />
          ) : (
            <Card>
              <EmptyState
                icon={CalendarDays}
                title={`No plan uploaded for ${vendor.name} · ${fmtMonth(month)}`}
                action={
                  can('plan.upload') ? (
                    <Link className="text-body font-medium text-accent-ink underline" to={`/planning/upload?vendor=${vendor.id}&month=${month}`}>
                      Upload a baseline plan
                    </Link>
                  ) : undefined
                }
              >
                Analysis for this period shows “No plan” until a plan version is uploaded and activated.
              </EmptyState>
            </Card>
          )
        ) : (
          <VersionHistory
            ds={ds}
            vendorIds={filters.vendorIds}
            focusVendor={vendor.id}
            onView={(v) =>
              update({
                tab: null,
                vendor: v.vendorId,
                month: v.month,
                version: v.id,
              })
            }
          />
        )}
      </div>
    </div>
  )
}

// ── Current plan ───────────────────────────────────────────────────────────
function CurrentPlan({ ds, version, activeId, versionsCount, unit, onShowActive }: { ds: Dataset; version: PlanVersion; activeId: string | null; versionsCount: number; unit: Unit; onShowActive: () => void }) {
  const { filters } = useFilters()
  const [view, setView] = useState<View>('grid')
  const lines = useMemo(() => (linesByVersion(ds).get(version.id) ?? []).filter((l) => skuMatchesScope(ds, l.skuCode, filters)), [ds, version.id, filters])
  const vendor = ds.idx.vendor.get(version.vendorId)!
  const active = ds.planVersions.find((v) => v.id === activeId)
  const supersedes = version.supersedesId ? ds.planVersions.find((v) => v.id === version.supersedesId) : null
  const allLines = linesByVersion(ds).get(version.id) ?? []
  const { total, excluded } = totalIn(ds, lines, unit)
  const scoped = lines.length !== allLines.length

  return (
    <div className="space-y-4">
      <section aria-label="Selected plan version" className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-title font-semibold">{version.label}</h2>
          <VersionStatus v={version} activeId={activeId} />
          <KindBadge kind={version.kind} />
          <Badge tone="none">{version.granularity} plan</Badge>
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-dense md:grid-cols-4">
          {[
            ['Vendor', `${vendor.name} (${vendor.code})`],
            ['Effective period', `${fmtDate(monthStart(version.month))} – ${fmtDate(monthEnd(version.month), true)}`],
            ['Version', `v${version.versionNo}${supersedes ? ` · supersedes v${supersedes.versionNo}` : ''}`],
            ['Active version', active ? `v${active.versionNo} (${active.kind})` : 'None'],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-label text-ink-muted">{k}</dt>
              <dd className="num truncate font-medium text-ink" title={v}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
        <Disclosure summary="Version details" className="mt-2">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-line pt-2 text-dense md:grid-cols-4">
            <div className="min-w-0">
              <dt className="text-label text-ink-subtle">Uploaded</dt>
              <dd className="num text-ink-muted">{fmtDateTime(version.uploadedAt)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-label text-ink-subtle">Uploaded by</dt>
              <dd className="truncate text-ink-muted" title={version.uploadedBy}>
                {version.uploadedBy}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-label text-ink-subtle">Source batch</dt>
              <dd className="num">
                <Link className="text-accent-ink underline" to={`/data/uploads/${version.batchId}`}>
                  {version.batchId}
                </Link>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-label text-ink-subtle">File</dt>
              <dd className="truncate text-ink-muted" title={version.fileName}>
                {version.fileName}
              </dd>
            </div>
            {version.note && (
              <div className="col-span-full min-w-0">
                <dt className="text-label text-ink-subtle">Note</dt>
                <dd className="text-ink-muted">{version.note}</dd>
              </div>
            )}
          </dl>
        </Disclosure>
      </section>

      {version.id !== activeId && (
        <Callout
          tone="warn"
          title="You are viewing a version that is not active"
          action={
            <Button size="sm" onClick={onShowActive}>
              Show active version
            </Button>
          }
        >
          Analysis screens use the active version
          {active ? ` (v${active.versionNo})` : ''}. This version is kept for reference{versionsCount > 1 ? ' and comparison' : ''}.
        </Callout>
      )}

      {version.granularity === 'Monthly' ? (
        <MonthlyPlanTable ds={ds} lines={lines} unit={unit} total={total} excluded={excluded} version={version} />
      ) : (
        <Card
          title={`Daily plan · ${fmtMonth(version.month)}`}
          subtitle={
            <>
              {lines.length} plan lines
              {scoped ? ` (of ${allLines.length}, limited by product filter)` : ''} · total {fmtQty(total, unit, true)}
              {excluded.size > 0 && ` · ${excluded.size} SKU(s) without weight excluded from MT`}
            </>
          }
          actions={
            <Segmented
              size="sm"
              label="Plan layout"
              value={view}
              onChange={setView}
              options={[
                { value: 'grid', label: 'Grid', icon: Table2 },
                { value: 'calendar', label: 'Calendar', icon: CalendarDays },
              ]}
            />
          }
          bodyClass="p-0"
        >
          {lines.length === 0 ? (
            <EmptyState title="No plan lines in the current product scope">Adjust the product or SKU filter in the global filter bar.</EmptyState>
          ) : view === 'grid' ? (
            <PlanGrid ds={ds} version={version} lines={lines} unit={unit} />
          ) : (
            <PlanCalendar ds={ds} version={version} lines={lines} unit={unit} />
          )}
        </Card>
      )}
    </div>
  )
}

function MonthlyPlanTable({ ds, lines, unit, total, excluded, version }: { ds: Dataset; lines: PlanLine[]; unit: Unit; total: number; excluded: Set<string>; version: PlanVersion }) {
  const { can } = usePermissions()
  return (
    <div className="space-y-3">
      <Callout
        tone="info"
        title="Monthly plan — no daily split is invented"
        details="This vendor plans a monthly volume and schedules days itself. Daily analysis cells show “No plan” and attainment is evaluated month-to-date on the Production screen."
      >
        The plan is shown only as a monthly quantity.
      </Callout>
      <Card
        title={`Monthly plan · ${fmtMonth(version.month)}`}
        subtitle={`${lines.length} SKU lines · total ${fmtQty(total, unit, true)}`}
        actions={
          <ExportButton
            disabled={!can('export.data')}
            onClick={() =>
              downloadCsv(`${version.id}.csv`, [['SKU', 'Name', 'Month', `Plan (${unit})`], ...lines.map((l) => [l.skuCode, ds.idx.sku.get(l.skuCode)?.name ?? '', version.month, qtyIn(ds.idx.sku.get(l.skuCode), l.qtyEa, unit)])])
            }
          />
        }
        bodyClass="p-0"
      >
        <TableWrap>
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={th}>SKU</th>
                <th className={th}>DT</th>
                <th className={th}>Effective period</th>
                <th className={cx(th, 'text-right')}>Monthly plan ({unit})</th>
                <th className={th}>Daily split</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const s = ds.idx.sku.get(l.skuCode)
                const v = qtyIn(s, l.qtyEa, unit)
                return (
                  <tr key={l.skuCode}>
                    <td className={td}>
                      <Link to={`/sku/${l.skuCode}`} className="font-medium text-accent-ink hover:underline">
                        {l.skuCode}
                      </Link>
                      <div className="text-dense text-ink-muted">{s?.name}</div>
                    </td>
                    <td className={td}>{s?.dtCode}</td>
                    <td className={td}>{fmtMonth(version.month)}</td>
                    <td className={tdNum}>{v == null ? <span title="No weight conversion in master data">n/a</span> : fmtQty(v, unit)}</td>
                    <td className={cx(td, 'text-ink-muted')}>Not provided by plan</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className={cx(td, 'font-semibold')} colSpan={3}>
                  Total
                  {excluded.size > 0 && <span className="ml-1 text-dense font-normal text-ink-muted">({excluded.size} SKU excluded from MT – no weight)</span>}
                </td>
                <td className={cx(tdNum, 'font-semibold')}>{fmtQty(total, unit)}</td>
                <td className={td} />
              </tr>
            </tfoot>
          </table>
        </TableWrap>
      </Card>
    </div>
  )
}

// ── Excel-like grid ────────────────────────────────────────────────────────
function PlanGrid({ ds, version, lines, unit }: { ds: Dataset; version: PlanVersion; lines: PlanLine[]; unit: Unit }) {
  const { can } = usePermissions()
  const vendor = ds.idx.vendor.get(version.vendorId)!
  const days = eachDay(monthStart(version.month), monthEnd(version.month))
  const dayInfo = days.map((d) => operatingDayInfo(ds, vendor, d))
  const byCell = new Map(lines.map((l) => [`${l.skuCode}|${l.date}`, l.qtyEa]))
  const skus: Sku[] = [...new Set(lines.map((l) => l.skuCode))].map((c) => ds.idx.sku.get(c)!).filter(Boolean)
  const [pos, setPos] = useState<[number, number]>([0, 0])

  const val = (s: Sku, d: string) => {
    const ea = byCell.get(`${s.code}|${d}`)
    return ea == null ? null : qtyIn(s, ea, unit)
  }
  const rowTotal = (s: Sku) => days.reduce((a, d) => a + (val(s, d) ?? 0), 0)
  const colTotal = (d: string) => skus.reduce((a, s) => a + (val(s, d) ?? 0), 0)
  const mtExcluded = unit === 'MT' ? skus.filter((s) => s.kgPerEa == null) : []
  const grand = skus.reduce((a, s) => a + rowTotal(s), 0)

  const onKey = (e: KeyboardEvent<HTMLTableElement>) => {
    const [r, c] = pos
    let n: [number, number] | null = null
    if (e.key === 'ArrowRight') n = [r, Math.min(days.length - 1, c + 1)]
    if (e.key === 'ArrowLeft') n = [r, Math.max(0, c - 1)]
    if (e.key === 'ArrowDown') n = [Math.min(skus.length - 1, r + 1), c]
    if (e.key === 'ArrowUp') n = [Math.max(0, r - 1), c]
    if (e.key === 'Home') n = [r, 0]
    if (e.key === 'End') n = [r, days.length - 1]
    if (!n) return
    e.preventDefault()
    setPos(n)
    ;(e.currentTarget.querySelector(`[data-cell="${n[0]}-${n[1]}"]`) as HTMLElement | null)?.focus()
  }

  const fs = skus[pos[0]]
  const fd = days[pos[1]]
  const fdInfo = dayInfo[pos[1]]
  const fv = fs ? val(fs, fd) : null
  const rawEa = fs ? byCell.get(`${fs.code}|${fd}`) : undefined

  return (
    <div>
      {/* Scroll padding keeps a focused day cell clear of the pinned SKU and Month total columns. */}
      <TableWrap maxHeight={520} className="scroll-pl-[230px] scroll-pr-[112px]">
        <table role="grid" aria-label={`Daily plan grid, ${version.label}. Use arrow keys to move between cells.`} aria-readonly="true" onKeyDown={onKey} className="border-separate border-spacing-0 text-dense">
          <thead>
            <tr>
              <th className={cx(th, 'sticky left-0 z-30 min-w-[230px] border-r')} scope="col">
                SKU
              </th>
              {days.map((d, i) => (
                <th
                  key={d}
                  scope="col"
                  title={dayInfo[i].operating ? fmtDateDow(d) : `${fmtDateDow(d)} · ${dayInfo[i].reason}`}
                  className={cx(th, 'min-w-[58px] border-l border-line px-1.5 text-center normal-case', !dayInfo[i].operating && 'bg-none-soft text-ink-subtle', d === DEMO_TODAY && 'shadow-[inset_0_-2px_0_var(--color-accent)]')}
                >
                  <div className="num text-dense text-ink">{parseISO(d).getUTCDate()}</div>
                  <div className="text-label font-medium">{dayInfo[i].operating ? fmtDow(d) : 'Off'}</div>
                </th>
              ))}
              <th className={cx(th, 'sticky right-0 z-30 min-w-[112px] border-l-2 border-line-strong text-right shadow-[-6px_0_6px_-4px_rgba(0,0,0,0.18)]')} scope="col">
                Month total
              </th>
            </tr>
          </thead>
          <tbody>
            {skus.map((s, r) => {
              const noMt = unit === 'MT' && s.kgPerEa == null
              return (
                <tr key={s.code}>
                  <th scope="row" className="sticky left-0 z-20 border-r border-b border-line bg-surface px-3 py-1 text-left font-normal">
                    <Link to={`/sku/${s.code}`} className="num font-medium text-accent-ink hover:underline">
                      {s.code}
                    </Link>
                    <div className="max-w-[210px] truncate text-label text-ink-subtle" title={s.name}>
                      {shortSkuName(s.name)}
                    </div>
                  </th>
                  {days.map((d, c) => {
                    const v = val(s, d)
                    const has = byCell.has(`${s.code}|${d}`)
                    const isPos = pos[0] === r && pos[1] === c
                    return (
                      <td
                        key={d}
                        role="gridcell"
                        data-cell={`${r}-${c}`}
                        tabIndex={isPos ? 0 : -1}
                        onFocus={() => setPos([r, c])}
                        onClick={() => setPos([r, c])}
                        aria-label={`${s.code}, ${fmtDateDow(d)}: ${has ? (v == null ? 'not convertible to MT' : `${fmtQty(v, unit)} ${unit}`) : 'no plan'}${dayInfo[c].operating ? '' : `, ${dayInfo[c].reason}`}`}
                        className={cx(
                          'num border-b border-l border-line px-1.5 py-1 text-right whitespace-nowrap outline-none focus:relative focus:z-10 focus:ring-2 focus:ring-accent focus:ring-inset',
                          !dayInfo[c].operating && 'bg-canvas',
                          isPos && 'bg-accent-soft/60',
                          !has && 'text-ink-subtle',
                        )}
                      >
                        {has ? (noMt ? 'n/a' : fmtQty(v, unit)) : '·'}
                      </td>
                    )
                  })}
                  <td className="num sticky right-0 z-20 min-w-[112px] border-b border-l-2 border-line-strong bg-surface-muted px-2.5 py-1 text-right font-semibold whitespace-nowrap shadow-[-6px_0_6px_-4px_rgba(0,0,0,0.18)]">
                    {noMt ? 'n/a' : fmtQty(rowTotal(s), unit)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="sticky bottom-0 left-0 z-30 border-t border-r border-line-strong bg-surface-muted px-3 py-1.5 text-left text-dense font-semibold">
                Day total ({unit})
              </th>
              {days.map((d) => {
                const t = colTotal(d)
                return (
                  <td key={d} className="num sticky bottom-0 z-20 border-t border-l border-line-strong bg-surface-muted px-1.5 py-1.5 text-right font-semibold whitespace-nowrap">
                    {t ? fmtQty(t, unit) : '·'}
                  </td>
                )
              })}
              <td className="num sticky right-0 bottom-0 z-30 border-t border-l-2 border-line-strong bg-accent-soft px-2.5 py-1.5 text-right font-semibold whitespace-nowrap shadow-[-6px_0_6px_-4px_rgba(0,0,0,0.18)]">
                {fmtQty(grand, unit)}
              </td>
            </tr>
          </tfoot>
        </table>
      </TableWrap>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-3 py-2 text-dense text-ink-muted" aria-live="polite">
        <span className="inline-flex items-center gap-1">
          <Info size={13} aria-hidden /> Selected cell:
        </span>
        {fs && (
          <span className="num text-ink">
            <strong>{fs.code}</strong> · {fmtDateDow(fd)} · {rawEa != null ? `${fmtQty(rawEa, 'EA')} EA${unit !== 'EA' ? ` = ${fv == null ? 'n/a (no weight)' : `${fmtQty(fv, unit)} ${unit}`}` : ''}` : 'No plan line'} ·{' '}
            {fdInfo.operating ? 'Operating day' : fdInfo.reason}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-4 rounded-sm border border-line bg-canvas" aria-hidden /> Non-operating day
          </span>
          <span>· = no plan line</span>
          {unit === 'CS' && <span>CS = EA ÷ case pack per SKU</span>}
          {mtExcluded.length > 0 && <span>{mtExcluded.length} SKU(s) n/a in MT (no weight) – excluded from totals</span>}
          <ExportButton disabled={!can('export.data')} onClick={() => downloadCsv(`${version.id}_grid.csv`, [['SKU', ...days, 'Total'], ...skus.map((s) => [s.code, ...days.map((d) => val(s, d)), rowTotal(s)])])} />
        </span>
      </div>
    </div>
  )
}

// ── Calendar ───────────────────────────────────────────────────────────────
function PlanCalendar({ ds, version, lines, unit }: { ds: Dataset; version: PlanVersion; lines: PlanLine[]; unit: Unit }) {
  const vendor = ds.idx.vendor.get(version.vendorId)!
  const first = monthStart(version.month)
  const last = monthEnd(version.month)
  const lead = (dayOfWeek(first) + 6) % 7 // Monday-first
  const days = eachDay(first, last)
  const byDate = new Map<string, PlanLine[]>()
  for (const l of lines) {
    if (!byDate.has(l.date!)) byDate.set(l.date!, [])
    byDate.get(l.date!)!.push(l)
  }
  const initial = days.includes(DEMO_TODAY) ? DEMO_TODAY : (days.find((d) => byDate.has(d)) ?? first)
  const [sel, setSel] = useState(initial)
  const selLines = byDate.get(sel) ?? []
  const selInfo = operatingDayInfo(ds, vendor, sel)

  return (
    <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-label font-semibold text-ink-muted" aria-hidden>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" role="group" aria-label={`Plan calendar ${fmtMonth(version.month)}`}>
          {Array.from({ length: lead }).map((_, i) => (
            <div key={`pad-${i}`} aria-hidden />
          ))}
          {days.map((d) => {
            const info = operatingDayInfo(ds, vendor, d)
            const ls = byDate.get(d) ?? []
            const { total } = totalIn(ds, ls, unit)
            const active = d === sel
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSel(d)}
                aria-pressed={active}
                aria-label={`${fmtDateDow(d)}: ${ls.length ? `${fmtQty(total, unit)} ${unit}, ${ls.length} lines` : 'no plan'}${info.operating ? '' : `, ${info.reason}`}`}
                className={cx(
                  'flex min-h-[72px] flex-col rounded-md border p-1.5 text-left transition-colors',
                  info.operating ? 'border-line bg-surface hover:border-accent/50' : 'border-transparent bg-canvas',
                  active && 'border-accent ring-1 ring-accent',
                )}
              >
                <span className="flex items-center justify-between text-label">
                  <span className={cx('num font-semibold', d === DEMO_TODAY && 'rounded bg-accent px-1 text-white')}>{parseISO(d).getUTCDate()}</span>
                  {!info.operating && <span className="truncate text-label text-ink-subtle">Off</span>}
                </span>
                {ls.length > 0 ? (
                  <>
                    <span className="num mt-auto text-body font-semibold text-ink">{fmtQty(total, unit)}</span>
                    <span className="text-label text-ink-subtle">{ls.length} lines</span>
                  </>
                ) : (
                  <span className="mt-auto text-label text-ink-subtle">{info.operating ? 'No plan' : ''}</span>
                )}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-label text-ink-subtle">
          Daily totals in {unit}. Grey days are non-operating on the {vendor.name} calendar.
        </p>
      </div>
      <aside aria-label="Selected day" className="border-t border-line p-3 xl:border-t-0 xl:border-l">
        <h3 className="text-body font-semibold">{fmtDateDow(sel)}</h3>
        <p className="mb-2 text-dense text-ink-muted">{selInfo.operating ? 'Operating day' : selInfo.reason}</p>
        {selLines.length === 0 ? (
          <p className="text-dense text-ink-muted">No plan lines for this day.</p>
        ) : (
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={cx(th, 'static px-2')}>SKU</th>
                <th className={cx(th, 'static px-2 text-right')}>Plan ({unit})</th>
              </tr>
            </thead>
            <tbody>
              {selLines.map((l) => {
                const s = ds.idx.sku.get(l.skuCode)
                const v = qtyIn(s, l.qtyEa, unit)
                return (
                  <tr key={l.skuCode}>
                    <td className={cx(td, 'px-2 py-1.5')}>
                      <Link to={`/sku/${l.skuCode}`} className="num text-dense font-medium text-accent-ink hover:underline">
                        {l.skuCode}
                      </Link>
                      <div className="truncate text-label text-ink-subtle">{s ? shortSkuName(s.name) : ''}</div>
                    </td>
                    <td className={cx(tdNum, 'px-2 py-1.5')}>{v == null ? 'n/a' : fmtQty(v, unit)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setSel(addDays(sel, -1) < first ? sel : addDays(sel, -1))} disabled={sel === first}>
            Previous day
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(addDays(sel, 1) > last ? sel : addDays(sel, 1))} disabled={sel === last}>
            Next day
          </Button>
        </div>
      </aside>
    </div>
  )
}

// ── Version history ────────────────────────────────────────────────────────
function VersionHistory({ ds, vendorIds, focusVendor, onView }: { ds: Dataset; vendorIds: string[]; focusVendor: string; onView: (v: PlanVersion) => void }) {
  const { can } = usePermissions()
  const [confirm, setConfirm] = useState<PlanVersion | null>(null)
  const lines = linesByVersion(ds)
  const groups = useMemo(() => {
    const m = new Map<string, PlanVersion[]>()
    for (const v of ds.planVersions) {
      if (vendorIds.length && !vendorIds.includes(v.vendorId)) continue
      const k = planKey(v.vendorId, v.month)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(v)
    }
    return [...m.entries()]
      .map(([k, vs]) => ({
        key: k,
        versions: vs.sort((a, b) => b.versionNo - a.versionNo),
      }))
      .sort((a, b) => {
        const [va, ma] = a.key.split('|')
        const [vb, mb] = b.key.split('|')
        if (va === focusVendor && vb !== focusVendor) return -1
        if (vb === focusVendor && va !== focusVendor) return 1
        return mb.localeCompare(ma) || va.localeCompare(vb)
      })
  }, [ds.planVersions, vendorIds, focusVendor])

  const activate = (v: PlanVersion) => {
    const key = planKey(v.vendorId, v.month)
    const prev = ds.activePlan[key]
    store.set((s) => ({ ...s, activePlan: { ...s.activePlan, [key]: v.id } }))
    logActivity('Planning', 'Set active plan version', v.id, prev ? `Previously active: ${prev}` : undefined)
    setConfirm(null)
  }

  return (
    <Card title="Version history" subtitle="All uploaded versions are preserved. Baseline and correction uploads are kept distinct; exactly one version per vendor and month is active." bodyClass="p-0">
      <TableWrap maxHeight={600}>
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={th}>Vendor · period</th>
              <th className={th}>Version</th>
              <th className={th}>Kind</th>
              <th className={th}>Granularity</th>
              <th className={th}>Supersedes</th>
              <th className={th}>Uploaded</th>
              <th className={th}>File · batch</th>
              <th className={cx(th, 'text-right')}>Lines</th>
              <th className={th}>Status</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) =>
              g.versions.map((v, i) => {
                const vendor = ds.idx.vendor.get(v.vendorId)!
                const activeId = ds.activePlan[g.key] ?? null
                const prevV = g.versions[i + 1]
                return (
                  <tr key={v.id} className={cx(i === 0 && 'border-t-2')}>
                    <td className={cx(td, i > 0 && 'text-ink-subtle')}>
                      {i === 0 ? (
                        <>
                          <div className="font-medium text-ink">{vendor.name}</div>
                          <div className="text-dense text-ink-muted">{fmtMonth(v.month)}</div>
                        </>
                      ) : (
                        <span className="sr-only">
                          {vendor.name} {fmtMonth(v.month)}
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      <span className="num font-medium">v{v.versionNo}</span>
                      <div className="num text-label text-ink-subtle">{v.id}</div>
                    </td>
                    <td className={td}>
                      <KindBadge kind={v.kind} />
                    </td>
                    <td className={td}>{v.granularity}</td>
                    <td className={cx(td, 'num text-dense')}>{v.supersedesId ?? '—'}</td>
                    <td className={cx(td, 'text-dense')}>
                      <div className="num">{fmtDateTime(v.uploadedAt)}</div>
                      <div className="text-ink-muted">{v.uploadedBy}</div>
                    </td>
                    <td className={cx(td, 'max-w-[220px] text-dense')}>
                      <div className="truncate" title={v.fileName}>
                        {v.fileName}
                      </div>
                      <Link className="num text-accent-ink underline" to={`/data/uploads/${v.batchId}`}>
                        {v.batchId}
                      </Link>
                    </td>
                    <td className={tdNum}>{lines.get(v.id)?.length ?? 0}</td>
                    <td className={td}>
                      {v.id === activeId ? (
                        <Badge tone="ok" icon={CheckCircle2}>
                          Active
                        </Badge>
                      ) : (
                        <Badge tone="none" icon={History}>
                          Not active
                        </Badge>
                      )}
                    </td>
                    <td className={cx(td, 'whitespace-nowrap')}>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" icon={Eye} onClick={() => onView(v)} aria-label={`View ${v.label}`}>
                          View
                        </Button>
                        {prevV && (
                          <Link
                            to={`/planning/compare?vendor=${v.vendorId}&month=${v.month}&a=${prevV.id}&b=${v.id}`}
                            className="inline-flex h-7 items-center gap-1 rounded px-2 text-dense font-medium text-ink-muted hover:bg-black/5 hover:text-ink"
                            aria-label={`Compare ${v.label} with v${prevV.versionNo}`}
                          >
                            <GitCompare size={13} aria-hidden /> Compare
                          </Link>
                        )}
                        {v.id !== activeId && can('plan.upload') && (
                          <Button size="sm" onClick={() => setConfirm(v)}>
                            Set as active
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              }),
            )}
          </tbody>
        </table>
      </TableWrap>
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Set as active plan version?"
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => confirm && activate(confirm)}>
              Set as active
            </Button>
          </>
        }
      >
        {confirm && (
          <div className="space-y-2 text-body">
            <p>
              <strong>{confirm.label}</strong> ({confirm.kind}, {confirm.granularity}) becomes the plan used by production, overview and exception analysis for {ds.idx.vendor.get(confirm.vendorId)?.name} · {fmtMonth(confirm.month)}.
            </p>
            <p className="text-ink-muted">The previously active version is preserved and can be re-activated. Stored in this browser only (demo).</p>
          </div>
        )}
      </Modal>
    </Card>
  )
}
