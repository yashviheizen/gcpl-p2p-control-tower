import { ArrowDown, ArrowUp, GitCompare, Minus, MinusCircle, PlusCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Card, EmptyState, ExportButton, Kpi, LocalFilters, PageHeader, Select, TableWrap, type Tone, cx, downloadCsv, td, tdNum, th } from '@/components/ui'
import type { PlanVersion } from '@/data/types'
import { fmtDate, fmtDateDow, fmtDateTime, fmtMonth } from '@/lib/dates'
import { usePageFilters, useFilters } from '@/lib/filters'
import { fmtPct, fmtQty, fmtSigned, shortSkuName } from '@/lib/format'
import { skuMatchesScope } from '@/lib/metrics'
import { useDataset, usePermissions } from '@/lib/store'
import { linesByVersion, planMonths, qtyIn, versionsFor } from './planUtils'

type Change = 'Added' | 'Removed' | 'Increased' | 'Decreased' | 'Unchanged'
const CHANGE_META: Record<Change, { tone: Tone; icon: typeof ArrowUp }> = {
  Added: { tone: 'info', icon: PlusCircle },
  Removed: { tone: 'bad', icon: MinusCircle },
  Increased: { tone: 'ok', icon: ArrowUp },
  Decreased: { tone: 'warn', icon: ArrowDown },
  Unchanged: { tone: 'none', icon: Minus },
}

interface DiffRow {
  skuCode: string
  date: string | null
  a: number | null
  b: number | null
  change: Change
}

export default function PlanCompare() {
  usePageFilters(['product', 'unit'], {
    vendor: 'Pick the vendor in page filters – versions are compared within one vendor',
    date: 'Versions are compared over their effective month',
  })
  const ds = useDataset()
  const { filters } = useFilters()
  const { can } = usePermissions()
  const [params, setParams] = useSearchParams()
  const [showUnchanged, setShowUnchanged] = useState(false)
  const unit = filters.unit

  const vendorId = ds.idx.vendor.has(params.get('vendor') ?? '') ? params.get('vendor')! : 'V-SAI'
  const vendor = ds.idx.vendor.get(vendorId)!
  const allV = versionsFor(ds, vendorId)
  const months = planMonths(ds).filter((m) => allV.some((v) => v.month === m))
  const monthParam = params.get('month')
  const defaultMonth = [...months].reverse().find((m) => allV.filter((v) => v.month === m).length > 1) ?? months[months.length - 1]
  const month = monthParam && months.includes(monthParam) ? monthParam : defaultMonth
  const inMonth = allV.filter((v) => v.month === month)
  const a = inMonth.find((v) => v.id === params.get('a')) ?? inMonth[inMonth.length - 2] ?? inMonth[0]
  const bCandidate = allV.find((v) => v.id === params.get('b'))
  const compatible = (v: PlanVersion) => !!a && v.month === a.month && v.granularity === a.granularity && v.id !== a.id
  const b = bCandidate && compatible(bCandidate) ? bCandidate : inMonth.filter(compatible)[inMonth.filter(compatible).length - 1]

  const update = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) p.delete(k)
      else p.set(k, v)
    }
    setParams(p, { replace: true })
  }

  const reason = (v: PlanVersion): string | null => {
    if (!a) return null
    if (v.id === a.id) return 'same as version A'
    if (v.month !== a.month) return `different period (${fmtMonth(v.month)})`
    if (v.granularity !== a.granularity) return `${v.granularity.toLowerCase()} vs ${a.granularity.toLowerCase()} plan`
    return null
  }

  const rows = useMemo<DiffRow[]>(() => {
    if (!a || !b) return []
    const lv = linesByVersion(ds)
    const key = (s: string, d: string | null) => `${s}|${d ?? 'M'}`
    const m = new Map<string, DiffRow>()
    for (const l of lv.get(a.id) ?? [])
      m.set(key(l.skuCode, l.date), {
        skuCode: l.skuCode,
        date: l.date,
        a: l.qtyEa,
        b: null,
        change: 'Removed',
      })
    for (const l of lv.get(b.id) ?? []) {
      const r = m.get(key(l.skuCode, l.date))
      if (r) {
        r.b = l.qtyEa
        r.change = l.qtyEa > r.a! ? 'Increased' : l.qtyEa < r.a! ? 'Decreased' : 'Unchanged'
      } else
        m.set(key(l.skuCode, l.date), {
          skuCode: l.skuCode,
          date: l.date,
          a: null,
          b: l.qtyEa,
          change: 'Added',
        })
    }
    return [...m.values()].filter((r) => skuMatchesScope(ds, r.skuCode, filters)).sort((x, y) => x.skuCode.localeCompare(y.skuCode) || (x.date ?? '').localeCompare(y.date ?? ''))
  }, [ds, a, b, filters])

  const conv = (code: string, ea: number | null) => (ea == null ? null : qtyIn(ds.idx.sku.get(code), ea, unit))
  let totA = 0
  let totB = 0
  const excluded = new Set<string>()
  const counts: Record<Change, number> = {
    Added: 0,
    Removed: 0,
    Increased: 0,
    Decreased: 0,
    Unchanged: 0,
  }
  const bySku = new Map<string, { a: number; b: number; changed: number }>()
  for (const r of rows) {
    counts[r.change]++
    const ca = conv(r.skuCode, r.a ?? 0)
    const cb = conv(r.skuCode, r.b ?? 0)
    if (ca == null || cb == null) {
      excluded.add(r.skuCode)
      continue
    }
    totA += ca
    totB += cb
    const s = bySku.get(r.skuCode) ?? { a: 0, b: 0, changed: 0 }
    s.a += ca
    s.b += cb
    if (r.change !== 'Unchanged') s.changed++
    bySku.set(r.skuCode, s)
  }
  const changed = rows.length - counts.Unchanged
  const shown = showUnchanged ? rows : rows.filter((r) => r.change !== 'Unchanged')

  return (
    <div>
      <PageHeader title="Compare plan versions" subtitle="Line-level differences between two versions of the same vendor, period and granularity." />
      <LocalFilters className="mb-3">
        <Select label="Vendor" value={vendorId} onChange={(e) => update({ vendor: e.target.value, month: null, a: null, b: null })}>
          {ds.vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
        <Select label="Period" value={month} onChange={(e) => update({ month: e.target.value, a: null, b: null })}>
          {months.map((m) => (
            <option key={m} value={m}>
              {fmtMonth(m)} ({allV.filter((v) => v.month === m).length} versions)
            </option>
          ))}
        </Select>
      </LocalFilters>
      {a && (
        <div role="group" aria-label="Versions to compare" className="mb-3 rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2.5">
          <div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-dense">
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <span className="rounded bg-ink px-1.5 text-label font-bold text-white">A</span> Baseline version
              </span>
              <select value={a.id} onChange={(e) => update({ a: e.target.value, b: null })} className="h-[30px] w-full min-w-0 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 text-body text-ink">
                {inMonth.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNo} · {v.kind}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-dense">
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <span className="rounded bg-ink px-1.5 text-label font-bold text-white">B</span> Comparison version
              </span>
              <select value={b?.id ?? ''} onChange={(e) => update({ b: e.target.value })} className="h-[30px] w-full min-w-0 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 text-body text-ink">
                {!b && <option value="">No compatible version</option>}
                {allV.map((v) => {
                  const r = reason(v)
                  return (
                    <option key={v.id} value={v.id} disabled={!!r}>
                      v{v.versionNo} · {v.kind} · {fmtMonth(v.month)}
                      {r ? ` — not comparable: ${r}` : ''}
                    </option>
                  )
                })}
              </select>
            </label>
          </div>
          <p className="mt-1.5 text-label text-ink-subtle">
            Delta = <span className="font-medium text-ink">Comparison (B) − Baseline (A)</span>. Positive means the comparison version plans more.
          </p>
        </div>
      )}

      {!a || !b ? (
        <Card>
          <EmptyState
            icon={GitCompare}
            title={`Only one plan version exists for ${vendor.name} · ${fmtMonth(month)}`}
            action={
              can('plan.upload') ? (
                <Link className="text-body font-medium text-accent-ink underline" to={`/planning/upload?vendor=${vendorId}&month=${month}&kind=Correction`}>
                  Upload a correction plan
                </Link>
              ) : undefined
            }
          >
            Versions can only be compared within the same vendor, effective period and granularity. Sai · Oct 2026 has a baseline and a correction to compare.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ['A', a],
              ['B', b],
            ].map(([tag, v]) => {
              const ver = v as PlanVersion
              const active = ds.activePlan[`${ver.vendorId}|${ver.month}`] === ver.id
              return (
                <section key={tag as string} className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 text-dense" aria-label={tag === 'A' ? 'Baseline version A' : 'Comparison version B'}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-ink px-1.5 text-label font-bold text-white">{tag as string}</span>
                    <span className="text-label font-medium text-ink-muted">{tag === 'A' ? 'Baseline' : 'Comparison'}</span>
                    <span className="font-semibold">{ver.label}</span>
                    <Badge tone={ver.kind === 'Baseline' ? 'info' : 'accent'}>{ver.kind}</Badge>
                    {active && <Badge tone="ok">Active</Badge>}
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-ink-muted">
                    <span>
                      Version id: <span className="num text-ink">{ver.id}</span>
                    </span>
                    <span>
                      Batch:{' '}
                      <Link className="num text-accent-ink underline" to={`/data/uploads/${ver.batchId}`}>
                        {ver.batchId}
                      </Link>
                    </span>
                    <span>Uploaded: {fmtDateTime(ver.uploadedAt)}</span>
                    <span className="truncate" title={ver.fileName}>
                      File: {ver.fileName}
                    </span>
                  </div>
                </section>
              )
            })}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Total delta (B − A)" value={fmtSigned(totB - totA, unit)} unit={unit} sub={`${fmtQty(totA, unit)} → ${fmtQty(totB, unit)}${totA ? ` (${fmtPct(((totB - totA) / totA) * 100, 1)})` : ''}`} />
            <Kpi label="Changed lines" value={changed} sub={`of ${rows.length} lines compared`} />
            <Kpi
              label="Increases"
              value={counts.Increased}
              status={
                <Badge tone="ok" icon={ArrowUp}>
                  Up
                </Badge>
              }
            />
            <Kpi
              label="Decreases"
              value={counts.Decreased}
              status={
                <Badge tone="warn" icon={ArrowDown}>
                  Down
                </Badge>
              }
            />
            <Kpi
              label="Added lines"
              value={counts.Added}
              status={
                <Badge tone="info" icon={PlusCircle}>
                  New in B
                </Badge>
              }
            />
            <Kpi
              label="Removed lines"
              value={counts.Removed}
              status={
                <Badge tone="bad" icon={MinusCircle}>
                  Only in A
                </Badge>
              }
            />
          </div>
          {excluded.size > 0 && (
            <p className="text-dense text-ink-muted">
              {excluded.size} SKU(s) have no weight conversion and are excluded from MT totals: {[...excluded].join(', ')}.
            </p>
          )}

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card
              title="Changed lines"
              subtitle={`${shown.length} rows · quantities in ${unit} · ${a.granularity === 'Monthly' ? 'monthly lines (no daily split)' : 'SKU × date lines'}`}
              actions={
                <>
                  <label className="inline-flex items-center gap-1.5 text-dense text-ink-muted">
                    <input type="checkbox" checked={showUnchanged} onChange={(e) => setShowUnchanged(e.target.checked)} className="accent-[var(--color-accent)]" /> Show unchanged
                  </label>
                  <ExportButton
                    disabled={!can('export.data')}
                    onClick={() =>
                      downloadCsv(`Compare_${a.id}_vs_${b.id}.csv`, [
                        ['SKU', 'Date', `Baseline A ${a.id} (${unit})`, `Comparison B ${b.id} (${unit})`, 'Delta (Comparison - Baseline)', 'Change', 'A batch', 'B batch'],
                        ...shown.map((r) => [
                          r.skuCode,
                          r.date ?? a.month,
                          conv(r.skuCode, r.a),
                          conv(r.skuCode, r.b),
                          r.change === 'Unchanged' ? 0 : (conv(r.skuCode, r.b ?? 0) ?? 0) - (conv(r.skuCode, r.a ?? 0) ?? 0),
                          r.change,
                          r.a != null ? a.batchId : '',
                          r.b != null ? b.batchId : '',
                        ]),
                      ])
                    }
                  />
                </>
              }
              bodyClass="p-0"
            >
              {shown.length === 0 ? (
                <EmptyState title="No differences in the current scope">The two versions have identical lines for the selected products.</EmptyState>
              ) : (
                <TableWrap maxHeight={520}>
                  <table className="w-full border-separate border-spacing-0">
                    <thead>
                      <tr>
                        <th className={th}>SKU</th>
                        <th className={th}>{a.granularity === 'Monthly' ? 'Period' : 'Date'}</th>
                        <th className={cx(th, 'text-right')}>Baseline A ({unit})</th>
                        <th className={cx(th, 'text-right')}>Comparison B ({unit})</th>
                        <th className={cx(th, 'text-right')} title="Comparison minus Baseline">
                          Delta (B − A)
                        </th>
                        <th className={th}>Change</th>
                        <th className={th}>Line evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r) => {
                        const s = ds.idx.sku.get(r.skuCode)
                        const ca = conv(r.skuCode, r.a)
                        const cb = conv(r.skuCode, r.b)
                        const da = conv(r.skuCode, r.a ?? 0)
                        const db = conv(r.skuCode, r.b ?? 0)
                        const meta = CHANGE_META[r.change]
                        return (
                          <tr key={`${r.skuCode}|${r.date}`}>
                            <td className={td}>
                              <Link to={`/sku/${r.skuCode}`} className="num font-medium text-accent-ink hover:underline">
                                {r.skuCode}
                              </Link>
                              <div className="max-w-[200px] truncate text-label text-ink-subtle">{s ? shortSkuName(s.name) : ''}</div>
                            </td>
                            <td className={cx(td, 'num whitespace-nowrap')}>{r.date ? fmtDateDow(r.date) : fmtMonth(a.month)}</td>
                            <td className={tdNum}>{r.a == null ? <span className="text-ink-subtle">no line</span> : ca == null ? 'n/a' : fmtQty(ca, unit)}</td>
                            <td className={tdNum}>{r.b == null ? <span className="text-ink-subtle">no line</span> : cb == null ? 'n/a' : fmtQty(cb, unit)}</td>
                            <td className={cx(tdNum, 'font-semibold')}>{da == null || db == null ? 'n/a' : fmtSigned(db - da, unit)}</td>
                            <td className={td}>
                              <Badge tone={meta.tone} icon={meta.icon}>
                                {r.change}
                              </Badge>
                            </td>
                            <td className={cx(td, 'num text-label text-ink-subtle')}>
                              {r.a != null && <div>A: {a.batchId}</div>}
                              {r.b != null && <div>B: {b.batchId}</div>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </Card>
            <Card title="Delta by SKU" subtitle={`${fmtMonth(a.month)} · ${unit}`} bodyClass="p-0">
              <TableWrap maxHeight={520}>
                <table className="w-full border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className={cx(th, 'px-2')}>SKU</th>
                      <th className={cx(th, 'px-2 text-right')} title="Comparison minus Baseline">
                        Delta (B − A)
                      </th>
                      <th className={cx(th, 'px-2 text-right')}>Lines</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...bySku.entries()]
                      .filter(([, v]) => v.changed > 0)
                      .map(([code, v]) => (
                        <tr key={code}>
                          <td className={cx(td, 'num px-2')}>{code}</td>
                          <td className={cx(tdNum, 'px-2 font-semibold')}>{fmtSigned(v.b - v.a, unit)}</td>
                          <td className={cx(tdNum, 'px-2')}>{v.changed}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </TableWrap>
              <p className="border-t border-line px-3 py-2 text-label text-ink-subtle">
                Effective period {fmtDate(`${a.month}-01`)} onwards. Comparison is line-by-line on SKU
                {a.granularity === 'Daily' ? ' and date' : ''}; no root cause is inferred.
              </p>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
