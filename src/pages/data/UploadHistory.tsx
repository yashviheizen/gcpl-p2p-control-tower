import { CheckCircle2, CopyX, FileWarning, History, XCircle, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Card, EmptyState, ExportButton, LocalFilters, PageHeader, Pager, Select, TableWrap, cx, downloadCsv, td, tdNum, th, useOriginState, type Tone } from '@/components/ui'
import type { BatchStatus, UploadBatch } from '@/data/types'
import { fmtDateTime } from '@/lib/dates'
import { usePageFilters, useFilters } from '@/lib/filters'
import { fmtNum } from '@/lib/format'
import { ALL_REPORT_TYPES } from '@/lib/metrics'
import { useDataset, usePermissions } from '@/lib/store'

const BATCH_META: Record<BatchStatus, { tone: Tone; icon: LucideIcon }> = {
  Ingested: { tone: 'ok', icon: CheckCircle2 },
  'Ingested with exclusions': { tone: 'warn', icon: FileWarning },
  Rejected: { tone: 'bad', icon: XCircle },
  'Duplicate – skipped': { tone: 'none', icon: CopyX },
}
function BatchStatusBadge({ value }: { value: BatchStatus }) {
  const m = BATCH_META[value]
  return (
    <Badge tone={m.tone} icon={m.icon}>
      {value}
    </Badge>
  )
}

const PAGE = 20
const STATUSES = Object.keys(BATCH_META) as BatchStatus[]

export default function UploadHistory() {
  usePageFilters(['vendor'], {
    date: 'All batches shown, newest first',
    product: 'Batches are per file, not per product',
    unit: 'Row counts',
  })
  const ds = useDataset()
  const { filters } = useFilters()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const origin = useOriginState('Upload history')
  const [params, setParams] = useSearchParams()
  const purpose = params.get('purpose') ?? ''
  const status = params.get('status') ?? ''
  const channel = params.get('channel') ?? ''
  const type = params.get('type') ?? ''
  const page = Number(params.get('page') ?? 0)
  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    if (k !== 'page') p.delete('page')
    setParams(p, { replace: true })
  }

  const rows = useMemo(
    () =>
      ds.uploadBatches
        .filter((b) => !filters.vendorIds.length || (b.vendorId && filters.vendorIds.includes(b.vendorId)))
        .filter((b) => !purpose || b.purpose === purpose)
        .filter((b) => !status || b.status === status)
        .filter((b) => !channel || b.channel === channel)
        .filter((b) => !type || b.reportType === type)
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || b.id.localeCompare(a.id)),
    [ds, filters.vendorIds, purpose, status, channel, type],
  )
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const pg = Math.min(page, pages - 1)
  const demoCount = rows.filter((b) => b.demo).length

  const what = (b: UploadBatch) => (b.purpose === 'Production plan' ? `Plan · ${b.planKind ?? ''}` : (b.reportType ?? 'Report'))

  return (
    <div>
      <PageHeader
        title="Upload history"
        subtitle="Every file received through the demo inbox or uploaded manually, with its validation outcome and lineage."
        actions={
          <>
            <ExportButton
              disabled={!can('export.data') || !rows.length}
              onClick={() =>
                downloadCsv('upload-history-demo.csv', [
                  ['Batch', 'Uploaded at', 'Purpose', 'Type', 'Vendor', 'File', 'Channel', 'Uploaded by', 'Status', 'Rows', 'Accepted', 'Excluded'],
                  ...rows.map((b) => [
                    b.id,
                    b.uploadedAt,
                    b.purpose,
                    b.reportType ?? b.planKind,
                    b.vendorId ? (ds.idx.vendor.get(b.vendorId)?.name ?? '') : '',
                    b.fileName,
                    b.channel,
                    b.uploadedBy,
                    b.status,
                    b.rowsTotal,
                    b.rowsAccepted,
                    b.rowsExcluded,
                  ]),
                ])
              }
            />
          </>
        }
      />
      <LocalFilters>
        <Select label="Purpose" value={purpose} onChange={(e) => setParam('purpose', e.target.value)}>
          <option value="">All</option>
          <option>Production plan</option>
          <option>Vendor report</option>
        </Select>
        <Select label="Report type" value={type} onChange={(e) => setParam('type', e.target.value)}>
          <option value="">All</option>
          {ALL_REPORT_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        <Select label="Status" value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select label="Channel" value={channel} onChange={(e) => setParam('channel', e.target.value)}>
          <option value="">All</option>
          <option>Shared inbox</option>
          <option>Manual upload</option>
        </Select>
        {demoCount > 0 && <span className="text-dense text-ink-muted">{demoCount} created in this browser</span>}
      </LocalFilters>

      <Card className="mt-4" bodyClass="">
        {rows.length === 0 ? (
          <EmptyState icon={History} title="No batches match these filters" />
        ) : (
          <TableWrap maxHeight="calc(100vh - 300px)">
            <table className="w-full min-w-[1080px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={th}>Batch</th>
                  <th className={th}>Uploaded</th>
                  <th className={th}>What</th>
                  <th className={th}>Vendor</th>
                  <th className={th}>File</th>
                  <th className={th}>Channel</th>
                  <th className={th}>By</th>
                  <th className={th}>Status</th>
                  <th className={cx(th, 'text-right')}>Rows</th>
                  <th className={cx(th, 'text-right')}>Excluded</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(pg * PAGE, pg * PAGE + PAGE).map((b) => (
                  <tr key={b.id} className="cursor-pointer hover:bg-surface-muted/60" onClick={() => navigate(`/data/uploads/${b.id}`, { state: origin })}>
                    <td className={cx(td, 'num whitespace-nowrap')}>
                      <Link to={`/data/uploads/${b.id}`} state={origin} onClick={(e) => e.stopPropagation()} className="font-medium text-accent-ink hover:underline">
                        {b.id}
                      </Link>
                      {b.demo && (
                        <Badge tone="accent" className="ml-1.5">
                          This browser
                        </Badge>
                      )}
                    </td>
                    <td className={cx(td, 'num whitespace-nowrap')}>{fmtDateTime(b.uploadedAt)}</td>
                    <td className={cx(td, 'whitespace-nowrap')}>{what(b)}</td>
                    <td className={cx(td, 'whitespace-nowrap')}>{b.vendorId ? ds.idx.vendor.get(b.vendorId)?.name : '—'}</td>
                    <td className={cx(td, 'num max-w-[240px] truncate text-dense')} title={b.fileName}>
                      {b.fileName}
                    </td>
                    <td className={cx(td, 'whitespace-nowrap text-dense')}>{b.channel}</td>
                    <td className={cx(td, 'whitespace-nowrap text-dense text-ink-muted')}>{b.uploadedBy}</td>
                    <td className={td}>
                      <BatchStatusBadge value={b.status} />
                    </td>
                    <td className={tdNum}>{fmtNum(b.rowsTotal)}</td>
                    <td className={cx(tdNum, b.rowsExcluded ? 'font-medium text-warn' : 'text-ink-subtle')}>{fmtNum(b.rowsExcluded)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <div className="border-t border-line">
          <Pager page={pg} pages={pages} onPage={(p) => setParam('page', String(p))} total={rows.length} label="batches" />
        </div>
      </Card>
    </div>
  )
}
