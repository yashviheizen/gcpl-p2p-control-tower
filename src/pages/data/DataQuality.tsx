import { CalendarOff, CheckCircle2, Clock, FileQuestion, XCircle, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ExStatusBadge, SeverityBadge } from '@/components/status'
import { AssumptionNote, Badge, Card, EmptyState, Kpi, PageHeader, TableWrap, cx, td, tdNum, th, useOriginState, type Tone } from '@/components/ui'
import { operatingDayInfo } from '@/lib/calendar'
import { eachDay, fmtDate, fmtDow, LATEST_DUE_DATE } from '@/lib/dates'
import { usePageFilters, useFilters } from '@/lib/filters'
import { fmtNum } from '@/lib/format'
import { ALL_REPORT_TYPES, coverageSummary } from '@/lib/metrics'
import { reportKey } from '@/data/dataset'
import { useDataset, useExceptions } from '@/lib/store'

type Completeness = 'received' | 'warnings' | 'rejected' | 'missing' | 'nonOp' | 'notDue'
const COMP_META: Record<Completeness, { label: string; short: string; icon: LucideIcon; tone: Tone; cell: string }> = {
  received: {
    label: 'Received',
    short: 'OK',
    icon: CheckCircle2,
    tone: 'ok',
    cell: 'bg-ok-soft text-ok border-ok-line',
  },
  warnings: {
    label: 'Received with warnings',
    short: 'Warn',
    icon: Clock,
    tone: 'warn',
    cell: 'bg-warn-soft text-warn border-warn-line',
  },
  rejected: {
    label: 'Rejected',
    short: 'Rej',
    icon: XCircle,
    tone: 'bad',
    cell: 'bg-bad-soft text-bad border-bad-line',
  },
  missing: {
    label: 'Missing',
    short: 'Miss',
    icon: FileQuestion,
    tone: 'bad',
    cell: 'bg-surface text-bad border-bad-line border-dashed hatch',
  },
  nonOp: {
    label: 'Non-operating day',
    short: 'Off',
    icon: CalendarOff,
    tone: 'none',
    cell: 'bg-canvas text-ink-subtle border-transparent',
  },
  notDue: {
    label: 'Not yet due',
    short: '',
    icon: Clock,
    tone: 'none',
    cell: 'bg-surface text-ink-subtle border-dashed border-line',
  },
}

const OCT_FROM = '2026-10-01'

export default function DataQuality() {
  usePageFilters(['vendor'], {
    date: 'Completeness grid covers 1–8 Oct (latest due date)',
    product: 'Report quality is per vendor file',
    unit: 'Not applicable',
  })
  const ds = useDataset()
  const { filters } = useFilters()
  const exceptions = useExceptions()
  const origin = useOriginState('Data quality')

  const vendors = useMemo(() => ds.vendors.filter((v) => !filters.vendorIds.length || filters.vendorIds.includes(v.id)), [ds, filters.vendorIds])
  const vset = new Set(vendors.map((v) => v.id))
  const cov = useMemo(() => coverageSummary(ds, vendors, ALL_REPORT_TYPES), [ds, vendors])
  const batches = ds.uploadBatches.filter((b) => !b.vendorId || vset.has(b.vendorId))
  const rejectedBatches = batches.filter((b) => b.status === 'Rejected')
  const rowsExcluded = batches.reduce((a, b) => a + b.rowsExcluded + (b.status === 'Rejected' ? b.rowsTotal : 0), 0)
  const unmapped = batches.flatMap((b) => b.issues).filter((i) => /unknown|unmapped|not mapped/i.test(i.problem)).length
  const dq = exceptions.filter((e) => e.kind === 'Data quality' && (!e.vendorId || vset.has(e.vendorId)))
  const issues = batches.flatMap((b) => b.issues.map((i, n) => ({ b, i, n }))).sort((a, z) => z.b.uploadedAt.localeCompare(a.b.uploadedAt))

  const days = eachDay(OCT_FROM, '2026-10-09')
  const gridTypes = ['Production', 'Dispatch', 'FG Inventory'] as const

  const cellState = (vendorId: string, type: (typeof gridTypes)[number], d: string): Completeness => {
    const v = ds.idx.vendor.get(vendorId)!
    if (d > LATEST_DUE_DATE) return 'notDue'
    if (!operatingDayInfo(ds, v, d).operating) return 'nonOp'
    const r = ds.idx.report.get(reportKey(vendorId, type, d))
    if (!r) return 'missing'
    if (r.status === 'Rejected') return 'rejected'
    if (r.status === 'Processed with warnings') return 'warnings'
    return 'received'
  }

  return (
    <div>
      <PageHeader title="Data quality" subtitle="Completeness and validation results of vendor reports and uploads. Missing data is shown as missing – never as zero." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi
          label="Reports current"
          value={cov.current}
          sub={`of ${cov.total}`}
          status={
            <Badge tone="ok" icon={CheckCircle2}>
              Current
            </Badge>
          }
          to="/data/reports"
        />
        <Kpi
          label="Reports stale"
          value={cov.stale}
          status={
            <Badge tone="warn" icon={Clock}>
              Stale
            </Badge>
          }
          to="/data/reports"
        />
        <Kpi
          label="Reports missing"
          value={cov.missing}
          status={
            <Badge tone="bad" icon={XCircle}>
              Missing
            </Badge>
          }
          to="/data/reports"
        />
        <Kpi label="Rejected batches" value={rejectedBatches.length} sub="all time" to="/data/uploads?status=Rejected" />
        <Kpi label="Rows not ingested" value={fmtNum(rowsExcluded)} sub="excluded + rejected rows" help="Sum of rows excluded from partially ingested batches plus all rows of rejected batches." />
        <Kpi label="Unmapped codes" value={unmapped} sub="issues with unknown item codes" to="/master-data" />
      </div>

      <Card className="mt-6" title="Report completeness – October" subtitle="One cell per vendor, report type and date · daily report types only" bodyClass="">
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 border-b border-line px-4 py-2 text-dense text-ink-muted" aria-label="Completeness legend">
          {(Object.keys(COMP_META) as Completeness[]).map((k) => {
            const m = COMP_META[k]
            return (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={cx('inline-flex h-4 w-6 items-center justify-center rounded-[3px] border', m.cell)}>
                  <m.icon size={10} aria-hidden strokeWidth={2.6} />
                </span>
                {m.label}
              </span>
            )
          })}
        </div>
        <TableWrap>
          <table className="w-full min-w-[900px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={cx(th, 'sticky left-0 z-20')}>Vendor · report</th>
                {days.map((d) => (
                  <th key={d} className={cx(th, 'px-1 text-center')}>
                    <div className="text-label font-normal">{fmtDow(d)}</div>
                    {fmtDate(d)}
                  </th>
                ))}
                <th className={cx(th, 'text-right')}>Missing</th>
              </tr>
            </thead>
            <tbody>
              {vendors.flatMap((v) =>
                gridTypes.map((t, ti) => {
                  const states = days.map((d) => cellState(v.id, t, d))
                  const miss = states.filter((s) => s === 'missing' || s === 'rejected').length
                  return (
                    <tr key={`${v.id}|${t}`}>
                      <td className={cx(td, 'sticky left-0 z-[1] bg-surface whitespace-nowrap', ti === 0 && 'border-t-2 border-t-line-strong')}>
                        <span className={cx(ti === 0 ? 'font-medium' : 'text-transparent select-none')}>{v.name}</span>
                        <span className="ml-1.5 text-ink-muted">{t}</span>
                      </td>
                      {states.map((s, i) => {
                        const m = COMP_META[s]
                        const d = days[i]
                        return (
                          <td key={d} className={cx('border-b border-line px-1 py-1', ti === 0 && 'border-t-2 border-t-line-strong')}>
                            <span title={`${v.name} · ${t} · ${fmtDate(d, true)}: ${m.label}`} className={cx('flex h-7 min-w-[40px] items-center justify-center gap-0.5 rounded-[3px] border text-label font-medium', m.cell)}>
                              <m.icon size={11} aria-hidden strokeWidth={2.4} />
                              <span className="sr-only">{m.label}</span>
                            </span>
                          </td>
                        )
                      })}
                      <td className={cx(tdNum, miss ? 'font-semibold text-bad' : 'text-ink-subtle', ti === 0 && 'border-t-2 border-t-line-strong')}>{miss}</td>
                    </tr>
                  )
                }),
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card className="mt-6" title="Data-quality exceptions" subtitle="Click a title for evidence, owner and history" bodyClass="">
        {dq.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No data-quality exceptions for this scope" />
        ) : (
          <TableWrap maxHeight={420}>
            <table className="w-full min-w-[820px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={th}>Severity</th>
                  <th className={th}>Exception</th>
                  <th className={th}>Vendor</th>
                  <th className={th}>Detected</th>
                  <th className={th}>Owner</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {dq.map((e) => (
                  <tr key={e.id} className="hover:bg-surface-muted/60">
                    <td className={td}>
                      <SeverityBadge value={e.severity} />
                    </td>
                    <td className={td}>
                      <Link to={`/exceptions/${encodeURIComponent(e.id)}`} state={origin} className="font-medium text-accent-ink hover:underline">
                        {e.title}
                      </Link>
                      <div className="text-label text-ink-subtle">{e.impactText}</div>
                    </td>
                    <td className={cx(td, 'whitespace-nowrap')}>{e.vendorId ? ds.idx.vendor.get(e.vendorId)?.name : '—'}</td>
                    <td className={cx(td, 'num whitespace-nowrap')}>{fmtDate(e.detectedOn)}</td>
                    <td className={cx(td, 'whitespace-nowrap')}>{e.owner ?? <span className="text-ink-subtle">Unassigned</span>}</td>
                    <td className={td}>
                      <ExStatusBadge value={e.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Card className="mt-6" title="Validation issues in upload batches" subtitle="Row-level problems found when files were checked (simulated validation)" bodyClass="">
        {issues.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No validation issues recorded" />
        ) : (
          <TableWrap maxHeight={420}>
            <table className="w-full min-w-[960px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={th}>Batch</th>
                  <th className={th}>Vendor</th>
                  <th className={th}>File</th>
                  <th className={th}>Severity</th>
                  <th className={th}>Row / column</th>
                  <th className={th}>Problem</th>
                  <th className={th}>How to fix</th>
                </tr>
              </thead>
              <tbody>
                {issues.map(({ b, i, n }) => (
                  <tr key={`${b.id}-${n}`}>
                    <td className={cx(td, 'num whitespace-nowrap')}>
                      <Link to={`/data/uploads/${b.id}`} state={origin} className="text-accent-ink hover:underline">
                        {b.id}
                      </Link>
                    </td>
                    <td className={cx(td, 'whitespace-nowrap')}>{b.vendorId ? ds.idx.vendor.get(b.vendorId)?.name : '—'}</td>
                    <td className={cx(td, 'num max-w-[200px] truncate text-dense')} title={b.fileName}>
                      {b.fileName}
                    </td>
                    <td className={td}>
                      <Badge tone={i.severity === 'Error' ? 'bad' : 'warn'} icon={i.severity === 'Error' ? XCircle : Clock}>
                        {i.severity}
                      </Badge>
                    </td>
                    <td className={cx(td, 'num whitespace-nowrap text-dense')}>
                      {i.row != null ? `Row ${i.row}` : 'File'}
                      {i.column ? ` · ${i.column}` : ''}
                    </td>
                    <td className={cx(td, 'text-dense')}>{i.problem}</td>
                    <td className={cx(td, 'text-dense text-ink-muted')}>{i.guidance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      <AssumptionNote className="mt-3">Stale and missing rules (daily reports due 10:00 next day; weekly RM/PM reports stale after {ds.idx.param.staleDaysWeekly ?? 4} days) are provisional.</AssumptionNote>
    </div>
  )
}
