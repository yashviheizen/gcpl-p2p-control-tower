import { CheckCircle2, Clock, FileUp, Inbox, Mail, Upload, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FreshnessBadge } from '@/components/status'
import { Badge, Callout, Card, Kpi, LocalFilters, PageHeader, Pager, Select, TableWrap, cx, td, th, useOriginState, type Tone } from '@/components/ui'
import type { ReportStatus, ReportType, VendorReport } from '@/data/types'
import { fmtDate, fmtDateTime, LATEST_DUE_DATE } from '@/lib/dates'
import { usePageFilters, useFilters } from '@/lib/filters'
import { ALL_REPORT_TYPES, coverageSummary, type ReportFreshness } from '@/lib/metrics'
import { useDataset, usePermissions } from '@/lib/store'

const REPORT_STATUS_META: Record<ReportStatus, { tone: Tone; icon: typeof CheckCircle2 }> = {
  Processed: { tone: 'ok', icon: CheckCircle2 },
  'Processed with warnings': { tone: 'warn', icon: Clock },
  Rejected: { tone: 'bad', icon: XCircle },
  'Pending review': { tone: 'info', icon: Clock },
}
function ReportStatusBadge({ value }: { value: ReportStatus }) {
  const m = REPORT_STATUS_META[value]
  return (
    <Badge tone={m.tone} icon={m.icon}>
      {value}
    </Badge>
  )
}

const PAGE = 15

export default function Reports() {
  usePageFilters(['vendor'], {
    date: 'Status is evaluated against the latest due date (8 Oct)',
    product: 'Reports are per vendor, not per product',
    unit: 'Not applicable',
  })
  const ds = useDataset()
  const { filters } = useFilters()
  const { can } = usePermissions()
  const origin = useOriginState('Reports & Uploads')
  const [typeF, setTypeF] = useState<'' | ReportType>('')
  const [channelF, setChannelF] = useState('')
  const [page, setPage] = useState(0)

  const vendors = useMemo(() => ds.vendors.filter((v) => !filters.vendorIds.length || filters.vendorIds.includes(v.id)), [ds, filters.vendorIds])
  const cov = useMemo(() => coverageSummary(ds, vendors, ALL_REPORT_TYPES), [ds, vendors])
  const byKey = new Map(cov.rows.map((r) => [`${r.vendor.id}|${r.type}`, r]))
  const problems = cov.rows.filter((r) => r.freshness !== 'Current')

  const inbox = useMemo(() => {
    const vset = new Set(vendors.map((v) => v.id))
    return ds.vendorReports.filter((r) => vset.has(r.vendorId) && (!typeF || r.type === typeF) && (!channelF || r.channel === channelF)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  }, [ds, vendors, typeF, channelF])
  const pages = Math.max(1, Math.ceil(inbox.length / PAGE))
  const pg = Math.min(page, pages - 1)
  const rejected = inbox.filter((r) => r.status === 'Rejected').length

  const uploadLink = (vendorId: string, type: ReportType) => `/data/upload/new?vendor=${vendorId}&type=${encodeURIComponent(type)}`

  return (
    <div>
      <PageHeader
        title="Reports & uploads"
        subtitle={`Latest vendor report per type, received via the demo shared inbox or manual upload. Due date for daily reports: ${fmtDate(LATEST_DUE_DATE, true)} data, by 10:00 next day.`}
        actions={
          <>
            {can('reports.upload') && (
              <Link to="/data/upload/new" state={origin} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] bg-accent px-3 text-body font-medium text-white hover:bg-accent-hover">
                <Upload size={15} aria-hidden /> Manual upload
              </Link>
            )}
          </>
        }
      />
      <Callout tone="warn" icon={Mail} title="Demo inbox — no real email is read or sent" details="Sender addresses are fictional (example domains). Manual upload is the fallback when a report is missing or rejected.">
        Receipts below are generated fixtures that imitate files arriving in a shared mailbox.
      </Callout>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Current"
          value={cov.current}
          sub={`of ${cov.total} vendor × report types`}
          status={
            <Badge tone="ok" icon={CheckCircle2}>
              Current
            </Badge>
          }
        />
        <Kpi
          label="Stale"
          value={cov.stale}
          sub="latest data beyond allowed age"
          status={
            <Badge tone="warn" icon={Clock}>
              Stale
            </Badge>
          }
        />
        <Kpi
          label="Missing"
          value={cov.missing}
          sub="expected report not received"
          status={
            <Badge tone="bad" icon={XCircle}>
              Missing
            </Badge>
          }
        />
        <Kpi
          label="Rejected files"
          value={rejected}
          sub="in inbox list below"
          status={
            <Badge tone="bad" icon={XCircle}>
              Rejected
            </Badge>
          }
        />
      </div>

      {problems.length > 0 && (
        <Card className="mt-6" title="Needs follow-up" subtitle="Missing or stale reports – data for these dates is treated as unavailable, never as zero">
          <ul className="divide-y divide-line">
            {problems.map((p) => (
              <ProblemRow key={`${p.vendor.id}|${p.type}`} p={p} canUpload={can('reports.upload')} link={uploadLink(p.vendor.id, p.type)} origin={origin} />
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-6" title="Latest report by vendor and type" subtitle="Daily: Production, Dispatch, FG Inventory · Twice weekly: RM / PM Inventory" bodyClass="">
        <TableWrap>
          <table className="w-full min-w-[980px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={cx(th, 'sticky left-0 z-20')}>Vendor</th>
                {ALL_REPORT_TYPES.map((t) => (
                  <th key={t} className={th}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td className={cx(td, 'sticky left-0 z-[1] bg-surface font-medium whitespace-nowrap')}>
                    {v.name}
                    <div className="text-label font-normal text-ink-subtle">{v.code}</div>
                  </td>
                  {ALL_REPORT_TYPES.map((t) => {
                    const r = byKey.get(`${v.id}|${t}`)!
                    return (
                      <td key={t} className={cx(td, 'align-top')}>
                        <div className="flex flex-col items-start gap-1">
                          <FreshnessBadge value={r.freshness} />
                          <span className="num text-dense text-ink">
                            Data: {r.latestValidDate ? fmtDate(r.latestValidDate) : '—'}
                            {r.expectedDate && r.latestValidDate !== r.expectedDate && <span className="text-ink-muted"> (expected {fmtDate(r.expectedDate)})</span>}
                          </span>
                          {r.latest && (
                            <span className="text-label text-ink-subtle">
                              {r.latest.channel} · rcvd {fmtDateTime(r.latest.receivedAt)}
                              {r.latest.status === 'Rejected' && <span className="ml-1 font-medium text-bad">· latest file rejected</span>}
                            </span>
                          )}
                          {r.freshness !== 'Current' && can('reports.upload') && (
                            <Link to={uploadLink(v.id, t)} state={origin} className="inline-flex items-center gap-1 text-dense font-medium text-accent-ink hover:underline">
                              <FileUp size={12} aria-hidden /> Manual upload
                            </Link>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card
        className="mt-4"
        title={
          <span className="inline-flex items-center gap-1.5">
            <Inbox size={15} aria-hidden /> Demo inbox receipts
          </span>
        }
        subtitle="Newest first · each receipt creates one upload batch"
        bodyClass=""
      >
        <div className="px-3 pt-3">
          <LocalFilters>
            <Select label="Report type" value={typeF} onChange={(e) => (setTypeF(e.target.value as ReportType | ''), setPage(0))}>
              <option value="">All</option>
              {ALL_REPORT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
            <Select label="Channel" value={channelF} onChange={(e) => (setChannelF(e.target.value), setPage(0))}>
              <option value="">All</option>
              <option>Shared inbox</option>
              <option>Manual upload</option>
            </Select>
          </LocalFilters>
        </div>
        <TableWrap className="mt-2">
          <table className="w-full min-w-[960px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={th}>Received</th>
                <th className={th}>Vendor</th>
                <th className={th}>Type</th>
                <th className={th}>Report date</th>
                <th className={th}>File</th>
                <th className={th}>Sender (demo)</th>
                <th className={th}>Channel</th>
                <th className={th}>Status</th>
                <th className={th}>Batch</th>
              </tr>
            </thead>
            <tbody>
              {inbox.slice(pg * PAGE, pg * PAGE + PAGE).map((r: VendorReport) => (
                <tr key={r.id + r.batchId} className="hover:bg-surface-muted/60">
                  <td className={cx(td, 'num whitespace-nowrap')}>{fmtDateTime(r.receivedAt)}</td>
                  <td className={cx(td, 'whitespace-nowrap')}>{ds.idx.vendor.get(r.vendorId)?.name}</td>
                  <td className={cx(td, 'whitespace-nowrap')}>{r.type}</td>
                  <td className={cx(td, 'num whitespace-nowrap')}>{fmtDate(r.reportDate)}</td>
                  <td className={cx(td, 'num max-w-[240px] truncate text-dense')} title={r.fileName}>
                    {r.fileName}
                  </td>
                  <td className={cx(td, 'max-w-[200px] truncate text-dense text-ink-muted')} title={r.sender}>
                    {r.sender}
                  </td>
                  <td className={cx(td, 'whitespace-nowrap text-dense')}>{r.channel}</td>
                  <td className={td}>
                    <ReportStatusBadge value={r.status} />
                  </td>
                  <td className={cx(td, 'num whitespace-nowrap')}>
                    <Link to={`/data/uploads/${r.batchId}`} state={origin} className="text-accent-ink hover:underline">
                      {r.batchId}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <div className="border-t border-line">
          <Pager page={pg} pages={pages} onPage={setPage} total={inbox.length} label="receipts" />
        </div>
      </Card>
    </div>
  )
}

function ProblemRow({ p, canUpload, link, origin }: { p: ReportFreshness; canUpload: boolean; link: string; origin: { from?: string; fromLabel?: string } }) {
  const recent = p.missingDates.slice(-4)
  return (
    <li className="flex flex-wrap items-center gap-3 py-2 text-body">
      <FreshnessBadge value={p.freshness} />
      <span className="min-w-[180px] font-medium">
        {p.vendor.name} · {p.type}
      </span>
      <span className="flex-1 text-ink-muted">
        Latest valid data {p.latestValidDate ? fmtDate(p.latestValidDate) : 'none'}
        {p.expectedDate && <> · expected {fmtDate(p.expectedDate)}</>}
        {recent.length > 0 && (
          <>
            {' '}
            · no valid report for {recent.map((d) => fmtDate(d)).join(', ')}
            {p.missingDates.length > recent.length ? ` (+${p.missingDates.length - recent.length} earlier)` : ''}
          </>
        )}
        {p.latest?.status === 'Rejected' && <> · latest file rejected at validation</>}
      </span>
      {canUpload && (
        <Link to={link} state={origin} className="inline-flex items-center gap-1 text-dense font-medium text-accent-ink hover:underline">
          <FileUp size={13} aria-hidden /> Manual upload
        </Link>
      )}
    </li>
  )
}
