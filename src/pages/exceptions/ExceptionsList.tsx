import { AlertTriangle, Search } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ExStatusBadge, SeverityBadge } from '@/components/status'
import { AssumptionNote, Card, CellText, EmptyState, ExportButton, LocalFilters, PageHeader, Select, TableWrap, Tabs, cx, downloadCsv, td, th, useOriginState } from '@/components/ui'
import type { ExceptionItem, ExceptionKind, ExceptionStatus, Severity } from '@/data/types'
import { fmtDate } from '@/lib/dates'
import { usePageFilters, useFilters } from '@/lib/filters'
import { fmtNum } from '@/lib/format'
import { impactDetail, titleWithoutVendor } from '@/lib/exceptions'
import { skuMatchesScope } from '@/lib/metrics'
import { OWNERS, useDataset, useExceptions, usePermissions } from '@/lib/store'

const SEV_RANK: Record<Severity, number> = { High: 0, Medium: 1, Low: 2 }
const ACTIVE: ExceptionStatus[] = ['Open', 'Investigating', 'Waiting on vendor']
const STATUSES: ExceptionStatus[] = ['Open', 'Investigating', 'Waiting on vendor', 'Resolved', 'Dismissed']

export default function ExceptionsList() {
  usePageFilters(['vendor', 'product'], {
    date: 'Exceptions use their detection date',
    unit: 'Impact shown in EA',
  })
  const ds = useDataset()
  const all = useExceptions()
  const { filters } = useFilters()
  const { can } = usePermissions()
  const origin = useOriginState('Exceptions')
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') === 'dq' ? 'Data quality' : 'Performance') as ExceptionKind
  const sev = params.get('sev') ?? ''
  const status = params.get('status') ?? 'active'
  const owner = params.get('owner') ?? ''
  const q = params.get('q') ?? ''

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
  }

  // Global scope: vendor + product hierarchy / SKU search
  const productActive = !!filters.hierarchy || !!filters.search.trim()
  const scoped = useMemo(
    () =>
      all.filter((e) => {
        if (filters.vendorIds.length && (!e.vendorId || !filters.vendorIds.includes(e.vendorId))) return false
        if (productActive) return !!e.skuCode && skuMatchesScope(ds, e.skuCode, filters)
        return true
      }),
    [all, filters, ds, productActive],
  )
  const hiddenVendorLevel = productActive ? all.filter((e) => !e.skuCode && (!filters.vendorIds.length || (e.vendorId && filters.vendorIds.includes(e.vendorId)))).length : 0

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return scoped
      .filter((e) => e.kind === tab)
      .filter((e) => !sev || e.severity === sev)
      .filter((e) => (status === 'active' ? ACTIVE.includes(e.status) : status === 'all' ? true : e.status === status))
      .filter((e) => (!owner ? true : owner === '__none' ? !e.owner : e.owner === owner))
      .filter((e) => {
        if (!needle) return true
        const v = e.vendorId ? (ds.idx.vendor.get(e.vendorId)?.name ?? '') : ''
        const s = e.skuCode ? (ds.idx.sku.get(e.skuCode)?.name ?? '') : ''
        return `${e.id} ${e.title} ${e.rule} ${v} ${e.skuCode ?? ''} ${s}`.toLowerCase().includes(needle)
      })
      .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || Math.abs(b.impactEa ?? 0) - Math.abs(a.impactEa ?? 0) || b.detectedOn.localeCompare(a.detectedOn))
  }, [scoped, tab, sev, status, owner, q, ds])

  const countActive = (k: ExceptionKind) => scoped.filter((e) => e.kind === k && ACTIVE.includes(e.status)).length
  const vendorName = (e: ExceptionItem) => (e.vendorId ? (ds.idx.vendor.get(e.vendorId)?.name ?? e.vendorId) : '—')

  const exportRows = () =>
    downloadCsv(`exceptions-${tab === 'Performance' ? 'performance' : 'data-quality'}-demo.csv`, [
      ['ID', 'Severity', 'Title', 'Rule', 'Vendor', 'SKU', 'Impact', 'Detected', 'Owner', 'Due', 'Status'],
      ...rows.map((e) => [e.id, e.severity, e.title, e.rule, vendorName(e), e.skuCode, e.impactText, e.detectedOn, e.owner, e.dueDate, e.status]),
    ])

  return (
    <div>
      <PageHeader
        title="Exceptions"
        subtitle="Deviations and data problems detected from the demo dataset. Exceptions describe what was observed – they do not state a root cause."
        actions={
          <>
            <ExportButton onClick={exportRows} disabled={!can('export.data') || !rows.length} />
          </>
        }
      />
      <Tabs
        label="Exception type"
        value={tab}
        onChange={(v) => setParam('tab', v === 'Data quality' ? 'dq' : '')}
        tabs={[
          {
            value: 'Performance',
            label: 'Performance',
            count: countActive('Performance'),
          },
          {
            value: 'Data quality',
            label: 'Data quality',
            count: countActive('Data quality'),
          },
        ]}
      />
      <LocalFilters className="mt-3">
        <Select label="Severity" value={sev} onChange={(e) => setParam('sev', e.target.value)}>
          <option value="">All</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </Select>
        <Select label="Status" value={status} onChange={(e) => setParam('status', e.target.value === 'active' ? '' : e.target.value)}>
          <option value="active">Active (open, investigating, waiting)</option>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select label="Owner" value={owner} onChange={(e) => setParam('owner', e.target.value)}>
          <option value="">Anyone</option>
          <option value="__none">Unassigned</option>
          {OWNERS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
        <label className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 text-body">
          <Search size={14} className="text-ink-subtle" aria-hidden />
          <span className="sr-only">Search exceptions</span>
          <input value={q} onChange={(e) => setParam('q', e.target.value)} placeholder="Search title, vendor, SKU…" className="w-52 bg-transparent outline-none placeholder:text-ink-subtle" />
        </label>
        {(sev || owner || q || status !== 'active') && (
          <button
            type="button"
            className="text-dense font-medium text-accent-ink hover:underline"
            onClick={() =>
              setParams(tab === 'Data quality' ? { tab: 'dq' } : {}, {
                replace: true,
              })
            }
          >
            Clear page filters
          </button>
        )}
      </LocalFilters>
      {hiddenVendorLevel > 0 && <p className="mt-2 text-dense text-ink-muted">{hiddenVendorLevel} vendor-level exception(s) (e.g. missing reports) are hidden because a product filter is active.</p>}

      <Card className="mt-4" bodyClass="">
        {rows.length === 0 ? (
          <EmptyState icon={AlertTriangle} title="No exceptions match these filters">
            Try widening the status filter to “All statuses” or clearing global vendor/product filters.
          </EmptyState>
        ) : (
          <TableWrap maxHeight="calc(100vh - 330px)">
            <table className="w-full min-w-[940px] table-fixed border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={cx(th, 'w-[84px]')}>Severity</th>
                  <th className={th}>Exception</th>
                  <th className={cx(th, 'w-[140px]')}>Vendor</th>
                  <th className={cx(th, 'w-[160px]')}>Impact</th>
                  <th className={cx(th, 'w-[108px]')}>Owner</th>
                  <th className={cx(th, 'w-[84px]')}>Due</th>
                  <th className={cx(th, 'w-[148px]')}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const overdue = e.dueDate && e.dueDate < '2026-10-09' && ACTIVE.includes(e.status)
                  const vName = vendorName(e)
                  const detail = impactDetail(e.impactText, e.impactEa)
                  return (
                    <tr key={e.id} className="hover:bg-surface-muted/60">
                      <td className={td}>
                        <SeverityBadge value={e.severity} />
                      </td>
                      <td className={td}>
                        <Link to={`/exceptions/${encodeURIComponent(e.id)}`} state={origin} title={e.title} className="line-clamp-2 font-medium text-accent-ink hover:underline">
                          {titleWithoutVendor(e.title, e.vendorId ? vName : undefined)}
                        </Link>
                        <div className="truncate text-label text-ink-subtle" title={`${e.rule}${e.skuCode ? ` · SKU ${e.skuCode}` : ''} · detected ${fmtDate(e.detectedOn)}`}>
                          {e.skuCode && <span className="num">{e.skuCode} · </span>}detected {fmtDate(e.detectedOn)}
                        </div>
                      </td>
                      <td className={td}>
                        <CellText text={vName} />
                      </td>
                      <td className={cx(td, 'text-dense')}>
                        {e.impactEa != null && <div className="num font-medium whitespace-nowrap text-ink">{fmtNum(e.impactEa)} EA</div>}
                        <div className={cx('text-label text-ink-subtle', 'line-clamp-2')} title={detail}>
                          {detail}
                        </div>
                      </td>
                      <td className={cx(td, 'whitespace-nowrap')}>
                        <CellText text={e.owner ?? 'Unassigned'} className={e.owner ? undefined : 'text-ink-subtle'} />
                      </td>
                      <td className={cx(td, 'num whitespace-nowrap', overdue && 'font-medium text-bad')}>
                        {e.dueDate ? fmtDate(e.dueDate) : '—'}
                        {overdue && <div className="text-label">Overdue</div>}
                      </td>
                      <td className={cx(td, 'whitespace-nowrap')}>
                        <ExStatusBadge value={e.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
        <div className="border-t border-line px-3 py-2 text-dense text-ink-muted">
          {rows.length} of {scoped.filter((e) => e.kind === tab).length} {tab.toLowerCase()} exceptions shown · sorted by severity, then impact
        </div>
      </Card>
      <AssumptionNote className="mt-3">Detection rules and severity cut-offs (e.g. High when MTD attainment &lt; 80%) are provisional and need business confirmation.</AssumptionNote>
    </div>
  )
}
