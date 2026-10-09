import { ExternalLink, FileSearch, Lightbulb, Lock, MessageSquare, Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ExStatusBadge, SeverityBadge } from '@/components/status'
import { AssumptionNote, BackLink, Badge, Button, Card, EmptyState, KeyVal, PageHeader, Select, TextInput, cx } from '@/components/ui'
import type { ExceptionStatus, Severity } from '@/data/types'
import { fmtDate, fmtDateTime } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import { currentUserName, demoNow, logActivity, OWNERS, store, useAppState, useDataset, useExceptions, usePermissions, type ExceptionOverride } from '@/lib/store'

const STATUSES: ExceptionStatus[] = ['Open', 'Investigating', 'Waiting on vendor', 'Resolved', 'Dismissed']
const SEVERITIES: Severity[] = ['High', 'Medium', 'Low']

export default function ExceptionDetail() {
  const { id = '' } = useParams()
  const exId = decodeURIComponent(id)
  const ds = useDataset()
  const ex = useExceptions().find((e) => e.id === exId)
  const comments = useAppState((s) => s.comments)
  const activity = useAppState((s) => s.activity)
  const { can } = usePermissions()
  const loc = useLocation()
  const [draft, setDraft] = useState('')
  const editable = can('exceptions.edit')

  if (!ex)
    return (
      <div>
        <BackLink fallback="/exceptions" fallbackLabel="Exceptions" />
        <EmptyState
          icon={FileSearch}
          title="Exception not found"
          action={
            <Link to="/exceptions" className="text-body font-medium text-accent-ink underline">
              Open exceptions list
            </Link>
          }
        >
          “{exId}” is not among the exceptions detected from the current demo data. It may have been resolved by a data change (e.g. a manual upload) or the link is outdated.
        </EmptyState>
      </div>
    )

  const vendor = ex.vendorId ? ds.idx.vendor.get(ex.vendorId) : undefined
  const sku = ex.skuCode ? ds.idx.sku.get(ex.skuCode) : undefined
  const h = ex.skuCode ? ds.idx.hierarchy.get(ex.skuCode) : undefined
  const myComments = comments.filter((c) => c.exceptionId === ex.id).sort((a, b) => a.at.localeCompare(b.at))
  const myActivity = activity.filter((a) => a.target === ex.id).sort((a, b) => b.at.localeCompare(a.at))
  const selfState = {
    from: loc.pathname + loc.search,
    fromLabel: `Exception ${ex.id}`,
  }

  const update = (patch: ExceptionOverride, action: string) => {
    store.set((s) => ({
      ...s,
      exceptionOverrides: {
        ...s.exceptionOverrides,
        [ex.id]: { ...s.exceptionOverrides[ex.id], ...patch },
      },
    }))
    logActivity('Exceptions', action, ex.id)
  }
  const addComment = () => {
    const text = draft.trim()
    if (!text) return
    store.set((s) => ({
      ...s,
      comments: [
        ...s.comments,
        {
          id: `C-${Date.now()}`,
          exceptionId: ex.id,
          at: demoNow(),
          by: currentUserName(s),
          text,
        },
      ],
    }))
    logActivity('Exceptions', 'Added comment', ex.id, text.length > 80 ? `${text.slice(0, 80)}…` : text)
    setDraft('')
  }

  return (
    <div>
      <PageHeader
        back={<BackLink fallback="/exceptions" fallbackLabel="Exceptions" />}
        title={ex.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="num">{ex.id}</span>·<span>{ex.kind}</span>·<span>Rule: {ex.rule}</span>
          </span>
        }
        actions={
          <>
            <SeverityBadge value={ex.severity} />
            <ExStatusBadge value={ex.status} />
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Impact">
            <div className="text-title font-medium text-ink">
              {ex.impactEa != null && <span className="num mr-2">{fmtNum(ex.impactEa)} EA</span>}
              <span className="text-ink-muted">{ex.impactText}</span>
            </div>
            <div className="mt-3">
              <KeyVal
                cols={4}
                items={[
                  {
                    k: 'Vendor',
                    v: vendor ? `${vendor.name} (${vendor.code})` : '—',
                  },
                  { k: 'SKU', v: sku ? `${sku.code}` : '—' },
                  { k: 'First seen', v: fmtDate(ex.firstSeen, true) },
                  { k: 'Detected on', v: fmtDate(ex.detectedOn, true) },
                  {
                    k: 'Latest report date',
                    v: ex.reportDate ? fmtDate(ex.reportDate, true) : '—',
                  },
                  { k: 'Owner', v: ex.owner ?? 'Unassigned' },
                  {
                    k: 'Due date',
                    v: ex.dueDate ? fmtDate(ex.dueDate, true) : '—',
                  },
                  { k: 'Status', v: ex.status },
                ]}
              />
            </div>
            {h && (
              <p className="mt-3 text-dense text-ink-muted">
                {h.category.name} › {h.brand.name} › {h.productLine.name} › {h.dt.code} › <span className="font-medium text-ink">{h.sku.name}</span>
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to={ex.sourceLink} state={selfState} className="inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2.5 text-dense font-medium hover:bg-surface-muted">
                <ExternalLink size={13} aria-hidden /> Open source view
              </Link>
              {ex.skuCode && (
                <Link
                  to={`/sku/${ex.skuCode}${ex.vendorId ? `?vendor=${ex.vendorId}` : ''}`}
                  state={selfState}
                  className="inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2.5 text-dense font-medium hover:bg-surface-muted"
                >
                  <Search size={13} aria-hidden /> Investigate SKU
                </Link>
              )}
            </div>
          </Card>

          <Card title="Evidence" subtitle="Values taken from the demo records that triggered the rule">
            <dl className="divide-y divide-line">
              {ex.evidence.map((ev, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,220px)_minmax(0,1fr)] gap-3 py-2 text-body">
                  <dt className="text-ink-muted">{ev.label}</dt>
                  <dd className="num min-w-0 break-words text-ink">
                    {ev.link ? (
                      <Link to={ev.link} state={selfState} className="text-accent-ink hover:underline">
                        {ev.value}
                      </Link>
                    ) : (
                      ev.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 rounded-md bg-surface-muted p-3 text-dense text-ink">
              <div className="mb-1 text-label font-semibold text-ink-muted">How this was calculated</div>
              {ex.calculation}
            </div>
            <AssumptionNote className="mt-2">Detection rule, thresholds and severity are provisional and need business confirmation.</AssumptionNote>
          </Card>

          <Card
            title={
              <span className="inline-flex items-center gap-1.5">
                <Lightbulb size={15} aria-hidden className="text-warn" /> Investigation suggestions
              </span>
            }
            subtitle="Starting points to check – not root-cause conclusions"
          >
            <ul className="list-disc space-y-1 pl-5 text-body text-ink">
              {ex.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </Card>

          <Card
            title={
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare size={15} aria-hidden /> Comments
              </span>
            }
            subtitle="Stored in this browser only"
          >
            {myComments.length === 0 && <p className="text-body text-ink-muted">No comments yet.</p>}
            <ul className="space-y-3">
              {myComments.map((c) => (
                <li key={c.id} className="rounded-md border border-line p-2.5">
                  <div className="flex items-center justify-between text-dense text-ink-muted">
                    <span className="font-medium text-ink">{c.by}</span>
                    <span className="num">{fmtDateTime(c.at)}</span>
                  </div>
                  <p className="mt-1 text-body whitespace-pre-wrap text-ink">{c.text}</p>
                </li>
              ))}
            </ul>
            {editable ? (
              <div className="mt-3">
                <label className="text-dense font-medium text-ink-muted" htmlFor="ex-comment">
                  Add comment
                </label>
                <textarea
                  id="ex-comment"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment()
                  }}
                  rows={3}
                  placeholder="What did you check? What are you waiting on?"
                  className="mt-1 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface p-2 text-body placeholder:text-ink-subtle"
                />
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-label text-ink-subtle">Ctrl/⌘ + Enter to post</span>
                  <Button size="sm" variant="primary" onClick={addComment} disabled={!draft.trim()}>
                    Post comment
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-3 inline-flex items-center gap-1 text-dense text-ink-muted">
                <Lock size={12} aria-hidden /> Your demo persona cannot comment on exceptions.
              </p>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Workflow" subtitle={editable ? 'Changes are saved locally and logged' : 'Read-only for this persona'}>
            <div className="flex flex-col gap-3">
              <Select label="Status" className="w-full justify-between" value={ex.status} disabled={!editable} onChange={(e) => update({ status: e.target.value as ExceptionStatus }, `Status changed to ${e.target.value}`)}>
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
              <Select
                label="Owner"
                className="w-full justify-between"
                value={ex.owner ?? ''}
                disabled={!editable}
                onChange={(e) => update({ owner: e.target.value || null }, e.target.value ? `Owner set to ${e.target.value}` : 'Owner cleared')}
              >
                <option value="">Unassigned</option>
                {OWNERS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
              <Select label="Severity" className="w-full justify-between" value={ex.severity} disabled={!editable} onChange={(e) => update({ severity: e.target.value as Severity }, `Severity changed to ${e.target.value}`)}>
                {SEVERITIES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
              <TextInput
                label="Due date"
                type="date"
                value={ex.dueDate ?? ''}
                disabled={!editable}
                onChange={(e) => update({ dueDate: e.target.value || null }, e.target.value ? `Due date set to ${fmtDate(e.target.value, true)}` : 'Due date cleared')}
              />
            </div>
          </Card>

          <Card title="Activity history">
            {myActivity.length === 0 ? (
              <p className="text-body text-ink-muted">No activity recorded yet.</p>
            ) : (
              <ol className="relative space-y-3 border-l border-line pl-4">
                {myActivity.map((a) => (
                  <li key={a.id} className="relative">
                    <span aria-hidden className="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-accent" />
                    <div className="text-body text-ink">{a.action}</div>
                    {a.detail && <div className="text-dense text-ink-muted">{a.detail}</div>}
                    <div className="num text-label text-ink-subtle">
                      {a.by} · {fmtDateTime(a.at)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <div className={cx('mt-3 flex items-center gap-1.5 text-label text-ink-subtle')}>
              <Badge tone="none">Detected</Badge> by rule on {fmtDate(ex.detectedOn, true)} (system)
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
