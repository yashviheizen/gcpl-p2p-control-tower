import { ArrowDown, CheckCircle2, CopyX, Database, FileSpreadsheet, FileWarning, FlaskConical, Inbox, Layers, ShieldCheck, Upload, XCircle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { BackLink, Badge, Callout, Card, EmptyState, KeyVal, PageHeader, TableWrap, cx, td, th, type Tone } from '@/components/ui'
import type { BatchStatus } from '@/data/types'
import { fmtDate, fmtDateTime } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import { filterLink } from '@/lib/links'
import { useDataset } from '@/lib/store'

const BATCH_META: Record<BatchStatus, { tone: Tone; icon: LucideIcon }> = {
  Ingested: { tone: 'ok', icon: CheckCircle2 },
  'Ingested with exclusions': { tone: 'warn', icon: FileWarning },
  Rejected: { tone: 'bad', icon: XCircle },
  'Duplicate – skipped': { tone: 'none', icon: CopyX },
}

function Step({ icon: Icon, title, children, last, tone = 'none' }: { icon: LucideIcon; title: string; children: ReactNode; last?: boolean; tone?: Tone }) {
  return (
    <li className="relative flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cx(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
            tone === 'bad' ? 'border-bad-line bg-bad-soft text-bad' : tone === 'warn' ? 'border-warn-line bg-warn-soft text-warn' : tone === 'ok' ? 'border-ok-line bg-ok-soft text-ok' : 'border-line bg-surface-muted text-ink-muted',
          )}
        >
          <Icon size={15} aria-hidden />
        </span>
        {!last && (
          <span aria-hidden className="flex flex-1 flex-col items-center py-1 text-ink-subtle">
            <span className="w-px flex-1 bg-line-strong" />
            <ArrowDown size={12} />
          </span>
        )}
      </div>
      <div className={cx('min-w-0 flex-1', !last && 'pb-4')}>
        <div className="text-label font-semibold text-ink-muted">{title}</div>
        <div className="mt-0.5 text-body text-ink">{children}</div>
      </div>
    </li>
  )
}

export default function BatchDetail() {
  const { id = '' } = useParams()
  const ds = useDataset()
  const loc = useLocation()
  const b = ds.idx.batch.get(id)
  const selfState = { from: loc.pathname, fromLabel: `Batch ${id}` }

  if (!b)
    return (
      <div>
        <BackLink fallback="/data/uploads" fallbackLabel="Upload history" />
        <EmptyState
          icon={Database}
          title="Batch not found"
          action={
            <Link to="/data/uploads" className="text-body font-medium text-accent-ink underline">
              Open upload history
            </Link>
          }
        >
          No upload batch “{id}” exists in this demo dataset or in this browser’s local uploads.
        </EmptyState>
      </div>
    )

  const vendor = b.vendorId ? ds.idx.vendor.get(b.vendorId) : undefined
  const meta = BATCH_META[b.status]
  const reports = ds.vendorReports.filter((r) => r.batchId === b.id)
  const plans = ds.planVersions.filter((p) => b.producedIds.includes(p.id) || p.batchId === b.id)
  const reportIds = new Set(reports.filter((r) => r.status !== 'Rejected').map((r) => r.id))
  const counts = {
    production: ds.productionRecords.filter((r) => reportIds.has(r.reportId)).length,
    dispatch: ds.dispatchRecords.filter((r) => reportIds.has(r.reportId)).length,
    fg: ds.fgSnapshots.filter((r) => reportIds.has(r.reportId)).length,
    materials: ds.materialSnapshots.filter((r) => reportIds.has(r.reportId)).length,
  }
  const planLines = plans.length ? ds.planLines.filter((l) => plans.some((p) => p.id === l.versionId)).length : 0
  const duplicateOf = b.status === 'Duplicate – skipped' ? b.issues[0]?.problem.match(/B-\d+/)?.[0] : undefined
  const rep = reports[0]
  const viewLink =
    rep && b.vendorId
      ? rep.type === 'Production'
        ? filterLink('/production', {
            vendor: b.vendorId,
            from: rep.reportDate,
            to: rep.reportDate,
          })
        : rep.type === 'Dispatch'
          ? filterLink('/dispatch', { vendor: b.vendorId })
          : rep.type === 'FG Inventory'
            ? filterLink('/fg-inventory', { vendor: b.vendorId })
            : filterLink('/materials', { vendor: b.vendorId })
      : null

  return (
    <div>
      <PageHeader
        back={<BackLink fallback="/data/uploads" fallbackLabel="Upload history" />}
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            Batch <span className="num">{b.id}</span>
          </span>
        }
        subtitle={<span className="num">{b.fileName}</span>}
        actions={
          <>
            {b.demo && (
              <Badge tone="accent" icon={FlaskConical}>
                Created in this browser
              </Badge>
            )}
            <Badge tone={meta.tone} icon={meta.icon}>
              {b.status}
            </Badge>
          </>
        }
      />
      {b.demo && (
        <Callout tone="info" title="Simulated upload" details="This batch was created by the demo upload wizard in this browser. Validation results are scripted demo scenarios.">
          No file was transmitted or validated by a real system.
        </Callout>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Batch details">
            <KeyVal
              cols={3}
              items={[
                { k: 'Purpose', v: b.purpose },
                {
                  k: 'Type',
                  v: b.reportType ?? (b.planKind ? `${b.planKind} plan` : '—'),
                },
                {
                  k: 'Vendor',
                  v: vendor ? `${vendor.name} (${vendor.code})` : '—',
                },
                { k: 'Channel', v: b.channel },
                { k: 'Uploaded', v: fmtDateTime(b.uploadedAt) },
                { k: 'Uploaded by', v: b.uploadedBy },
                { k: 'File size', v: `${fmtNum(b.fileSizeKb)} KB` },
                {
                  k: 'Checksum',
                  v: <span className="text-dense break-all">{b.checksum}</span>,
                },
                {
                  k: 'Report date',
                  v: rep ? fmtDate(rep.reportDate, true) : '—',
                },
              ]}
            />
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { k: 'Rows in file', v: b.rowsTotal, tone: 'text-ink' },
                { k: 'Rows accepted', v: b.rowsAccepted, tone: 'text-ok' },
                {
                  k: 'Rows excluded',
                  v: b.status === 'Rejected' ? b.rowsTotal : b.rowsExcluded,
                  tone: b.rowsExcluded || b.status === 'Rejected' ? 'text-bad' : 'text-ink-subtle',
                },
              ].map((x) => (
                <div key={x.k} className="rounded-md border border-line px-3 py-2">
                  <div className="text-label text-ink-subtle">{x.k}</div>
                  <div className={cx('num text-[20px] font-semibold', x.tone)}>{fmtNum(x.v)}</div>
                </div>
              ))}
            </div>
            {b.status === 'Rejected' && <p className="mt-2 text-dense text-bad">The whole file was rejected – none of its rows are used in analysis. Dates it covers show as “Report missing”.</p>}
          </Card>

          <Card title="Validation issues" subtitle={b.issues.length ? `${b.issues.length} issue(s)` : undefined} bodyClass="">
            {b.issues.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="No issues found">
                All rows passed the (simulated) checks for required columns, known codes, dates and quantities.
              </EmptyState>
            ) : (
              <TableWrap>
                <table className="w-full min-w-[720px] border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className={th}>Severity</th>
                      <th className={th}>Row</th>
                      <th className={th}>Column</th>
                      <th className={th}>Problem</th>
                      <th className={th}>How to fix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.issues.map((i, n) => (
                      <tr key={n}>
                        <td className={td}>
                          <Badge tone={i.severity === 'Error' ? 'bad' : 'warn'} icon={i.severity === 'Error' ? XCircle : FileWarning}>
                            {i.severity}
                          </Badge>
                        </td>
                        <td className={cx(td, 'num')}>{i.row ?? 'File'}</td>
                        <td className={cx(td, 'whitespace-nowrap')}>{i.column ?? '—'}</td>
                        <td className={cx(td, 'text-dense')}>{i.problem}</td>
                        <td className={cx(td, 'text-dense text-ink-muted')}>{i.guidance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>
        </div>

        <Card title="Source lineage" subtitle="Where this data came from and where it is used">
          <ol>
            <Step icon={b.channel === 'Shared inbox' ? Inbox : Upload} title={b.channel}>
              {b.channel === 'Shared inbox' ? (
                <>
                  From <span className="num">{rep?.sender ?? vendor?.reportEmail ?? '—'}</span> <span className="text-ink-muted">(demo address)</span>
                </>
              ) : (
                <>Uploaded manually by {b.uploadedBy}</>
              )}
              <div className="num text-label text-ink-subtle">{fmtDateTime(b.uploadedAt)}</div>
            </Step>
            <Step icon={FileSpreadsheet} title="File">
              <span className="num break-all">{b.fileName}</span>
              <div className="text-dense text-ink-muted">
                {fmtNum(b.fileSizeKb)} KB · {fmtNum(b.rowsTotal)} rows
              </div>
            </Step>
            <Step icon={ShieldCheck} title="Validation" tone={meta.tone}>
              {b.status}
              {b.issues.length > 0 && <span className="text-ink-muted"> · {b.issues.length} issue(s)</span>}
              {duplicateOf && (
                <div className="text-dense">
                  Same content as{' '}
                  <Link to={`/data/uploads/${duplicateOf}`} state={selfState} className="text-accent-ink hover:underline">
                    {duplicateOf}
                  </Link>
                </div>
              )}
            </Step>
            <Step icon={Layers} title="Produced" last={!counts.production && !counts.dispatch && !counts.fg && !counts.materials && !planLines}>
              {reports.length === 0 && plans.length === 0 && <span className="text-ink-muted">Nothing – batch not ingested</span>}
              {reports.map((r) => (
                <div key={r.id}>
                  Report <span className="num">{r.id}</span> · {r.type} for {fmtDate(r.reportDate, true)}
                  {r.status === 'Rejected' && <span className="text-bad"> (rejected – not used)</span>}
                </div>
              ))}
              {plans.map((p) => (
                <div key={p.id}>
                  Plan version{' '}
                  <Link to={`/planning?version=${p.id}`} state={selfState} className="num text-accent-ink hover:underline">
                    {p.label}
                  </Link>{' '}
                  · {p.granularity} · {p.kind}
                </div>
              ))}
            </Step>
            {(counts.production > 0 || counts.dispatch > 0 || counts.fg > 0 || counts.materials > 0 || planLines > 0) && (
              <Step icon={Database} title="Records used in analysis" last tone="ok">
                <ul className="num">
                  {counts.production > 0 && <li>{fmtNum(counts.production)} production records</li>}
                  {counts.dispatch > 0 && <li>{fmtNum(counts.dispatch)} dispatch records</li>}
                  {counts.fg > 0 && <li>{fmtNum(counts.fg)} FG stock snapshots</li>}
                  {counts.materials > 0 && <li>{fmtNum(counts.materials)} RM/PM stock snapshots</li>}
                  {planLines > 0 && <li>{fmtNum(planLines)} plan lines</li>}
                </ul>
                {viewLink && (
                  <Link to={viewLink} state={selfState} className="mt-1 inline-block text-dense font-medium text-accent-ink hover:underline">
                    Open in {rep!.type === 'Production' ? 'production analysis' : rep!.type === 'Dispatch' ? 'dispatch' : rep!.type === 'FG Inventory' ? 'FG inventory' : 'RM/PM inventory'} →
                  </Link>
                )}
              </Step>
            )}
          </ol>
        </Card>
      </div>
    </div>
  )
}
