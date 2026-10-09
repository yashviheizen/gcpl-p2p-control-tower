// P2P Assistant (demo) – deterministic answers computed from the demo dataset for the current filters.
// Not an AI model and not connected to live data. Never infers root causes and never changes filters.
import { AlertCircle, ArrowRight, Loader2, RotateCcw, Send, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NAV } from '@/app/nav'
import { Link, useLocation } from 'react-router-dom'
import type { Dataset } from '@/data/dataset'
import type { ExceptionItem } from '@/data/types'
import { DEMO_TODAY, LATEST_DUE_DATE, diffDays, fmtDate, fmtMonthToDate, fmtRange, monthOf } from '@/lib/dates'
import { useFilters } from '@/lib/filters'
import { fmtPct, fmtQty, fmtSigned, shortSkuName } from '@/lib/format'
import { filterLink } from '@/lib/links'
import { ALL_REPORT_TYPES, aggStatus, aggregateCells, cellsFor, convertOrNull, coverageSummary, fgBaseline, latestFgSnapshot, reportFreshness, runRate, scopePairs, skuMatchesScope, type AnalysisFilters } from '@/lib/metrics'
import { store, useAppState, useDataset, useExceptions, usePermissions } from '@/lib/store'
import { CELL_META } from './status'
import { DemoBadge, IconButton, cx } from './ui'

type Intent = 'below' | 'reports' | 'flagged' | 'attainment' | 'expiry' | 'excess' | 'runrate' | 'exceptions'

interface Answer {
  id: number
  question: string
  body: ReactNode
  scope: string
  unit: string
  period: string
  sources: { label: string; to: string }[]
}

const OPEN = new Set(['Open', 'Investigating', 'Waiting on vendor'])

const KEYWORDS: [Intent, RegExp][] = [
  ['excess', /unusual|excess|over.?stock|too much|high(er)? (fg |finished.?goods? )?stock|stock.*(high|above)/i],
  ['expiry', /expir|shelf|near.?expiry|old stock|lot/i],
  ['reports', /report|missing|stale|inbox|upload|received/i],
  ['flagged', /why|flag|cause|reason/i],
  ['runrate', /run.?rate|project|forecast|month.?end|required/i],
  ['below', /below|behind|short|under|vendors?.*plan|worst/i],
  ['attainment', /attain|mtd|achiev|plan vs|performance|actual/i],
  ['exceptions', /exception|issue|alert|open|attention|today/i],
]

function routeSku(path: string): string | null {
  const m = path.match(/^\/sku\/([^/]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

function productLabel(f: AnalysisFilters) {
  return f.hierarchy ? f.hierarchy.label : f.search ? `SKUs matching “${f.search}”` : 'All products'
}

function scopeLabel(ds: Dataset, f: AnalysisFilters) {
  const v = f.vendorIds.length ? f.vendorIds.map((id) => ds.idx.vendor.get(id)?.name ?? id).join(', ') : 'All vendors'
  return `${v} · ${productLabel(f)}`
}

function scopedExceptions(ds: Dataset, ex: ExceptionItem[], f: AnalysisFilters) {
  return ex
    .filter((e) => OPEN.has(e.status))
    .filter((e) => !e.vendorId || !f.vendorIds.length || f.vendorIds.includes(e.vendorId))
    .filter((e) => !e.skuCode || skuMatchesScope(ds, e.skuCode, f))
}

function suggestionsFor(path: string, ds: Dataset, ex: ExceptionItem[], f: AnalysisFilters): { intent: Intent; q: string }[] {
  const sku = routeSku(path)
  const top = sku
    ? ds.idx.sku.get(sku)
    : (() => {
        const e = scopedExceptions(ds, ex, f).find((x) => x.kind === 'Performance' && x.skuCode)
        return e?.skuCode ? ds.idx.sku.get(e.skuCode) : undefined
      })()
  const all: Record<Intent, string> = {
    below: 'Which vendors are below plan?',
    reports: 'Which reports need follow-up?',
    flagged: top ? `Why is ${shortSkuName(top.name)} flagged?` : 'Why is the top SKU flagged?',
    attainment: 'What is the attainment for the current filters?',
    expiry: 'Which FG stock is near expiry?',
    excess: 'Where is finished-goods stock unusually high?',
    runrate: 'Are we on track to hit the monthly plan?',
    exceptions: 'What needs my attention today?',
  }
  let order: Intent[] = ['below', 'excess', 'reports']
  if (path.startsWith('/production') || path.startsWith('/planning')) order = ['below', 'attainment', 'runrate']
  else if (path.startsWith('/fg-inventory') || path.startsWith('/dispatch')) order = ['excess', 'expiry', 'reports']
  else if (path.startsWith('/materials') || path.startsWith('/po-coverage')) order = ['reports', 'below', 'exceptions']
  else if (path.startsWith('/data')) order = ['reports', 'exceptions', 'below']
  else if (path.startsWith('/exceptions') || sku) order = ['flagged', 'exceptions', 'below']
  return order.map((i) => ({ intent: i, q: all[i] }))
}

let seq = 0

function answer(intent: Intent, question: string, ds: Dataset, ex: ExceptionItem[], f: AnalysisFilters, path: string): Answer {
  const scope = scopeLabel(ds, f)
  const pairs = scopePairs(ds, f)
  const base = { id: ++seq, question, scope, unit: f.unit }
  const u = f.unit
  if (!pairs.length)
    return {
      ...base,
      period: '—',
      body: 'No vendor–SKU combinations match the current global filters, so there is nothing to compute. Reset or widen the filters.',
      sources: [],
    }

  switch (intent) {
    case 'below': {
      const from = '2026-10-01'
      const to = LATEST_DUE_DATE
      const vendors = ds.vendors.filter((v) => pairs.some((p) => p.vendor.id === v.id))
      const rows = vendors.map((v) => {
        const a = aggregateCells(
          ds,
          cellsFor(
            ds,
            pairs.filter((p) => p.vendor.id === v.id),
            from,
            to,
          ),
          u,
        )
        return { v, a, s: aggStatus(ds, a) }
      })
      const below = rows.filter((r) => r.s === 'below' || r.s === 'zero').sort((x, y) => (x.a.attainment ?? 0) - (y.a.attainment ?? 0))
      const missingDays = rows.reduce((n, r) => n + r.a.counts.missing, 0)
      const zeroDays = rows.reduce((n, r) => n + r.a.counts.zero, 0)
      const other = rows.filter((r) => !(r.s === 'below' || r.s === 'zero'))
      return {
        ...base,
        period: `${fmtMonthToDate(monthOf(from))} · ${fmtRange(from, to)}`,
        body: (
          <>
            {below.length ? (
              <p>
                {below.length} of {rows.length} vendor
                {rows.length === 1 ? '' : 's'} {below.length === 1 ? 'is' : 'are'} below the provisional range on comparable days:
              </p>
            ) : (
              <p>No vendor in scope is below the provisional range on comparable days.</p>
            )}
            <ul className="mt-1 space-y-0.5">
              {below.map((r) => (
                <li key={r.v.id}>
                  <strong>{r.v.name}</strong>: <span className="num">{fmtPct(r.a.attainment, 1)}</span> ({fmtSigned(r.a.gap, u)} {u})
                </li>
              ))}
            </ul>
            {other.length > 0 && <p className="mt-1 text-ink-muted">Others: {other.map((r) => `${r.v.name} ${r.a.attainment == null ? `(${CELL_META[r.s].label})` : fmtPct(r.a.attainment, 0)}`).join(' · ')}</p>}
            <p className="mt-1 text-ink-muted">
              {missingDays} vendor-SKU-day(s) have no valid report – missing, excluded from attainment and never counted as zero. {zeroDays} were reported as zero.
            </p>
          </>
        ),
        sources: [
          { label: 'View in Production', to: filterLink('/production', { from, to }) },
          ...below.slice(0, 3).map((r) => ({
            label: r.v.name,
            to: filterLink('/production', { vendor: r.v.id, from, to }),
          })),
        ],
      }
    }
    case 'reports': {
      const vendors = ds.vendors.filter((v) => pairs.some((p) => p.vendor.id === v.id))
      const cov = coverageSummary(ds, vendors, ALL_REPORT_TYPES)
      const gaps = cov.rows.filter((r) => r.freshness !== 'Current')
      return {
        ...base,
        period: `As of ${fmtDate(LATEST_DUE_DATE)} (due D+1)`,
        body: (
          <>
            <p>
              {cov.current} of {cov.total} vendor reports are current; <strong>{cov.missing} missing</strong> and <strong>{cov.stale} stale</strong>.
            </p>
            <ul className="mt-1 space-y-0.5">
              {gaps.map((g) => (
                <li key={`${g.vendor.id}-${g.type}`}>
                  {g.freshness === 'Missing' ? 'Missing' : 'Stale'}: <strong>{g.vendor.name}</strong> {g.type} – latest valid {g.latestValidDate ? fmtDate(g.latestValidDate) : 'none'}
                  {g.missingDates.length > 0 && ` (${g.missingDates.length} day${g.missingDates.length === 1 ? '' : 's'} without a valid report in Oct)`}
                </li>
              ))}
            </ul>
            {gaps.length > 0 && <p className="mt-1 text-ink-muted">Suggested next step: check the shared inbox or request the file from the vendor; manual upload is available as a fallback.</p>}
          </>
        ),
        sources: [
          { label: 'View reports', to: '/data/reports' },
          ...[...new Map(gaps.map((g) => [g.vendor.id, g.vendor])).values()].slice(0, 3).map((v) => ({
            label: `${v.name} reports`,
            to: filterLink('/data/reports', { vendor: v.id }),
          })),
        ],
      }
    }
    case 'flagged': {
      const sku = routeSku(path)
      const list = scopedExceptions(ds, ex, f)
      const e = sku ? (list.find((x) => x.skuCode === sku) ?? ex.find((x) => x.skuCode === sku)) : list.find((x) => x.kind === 'Performance' && x.skuCode)
      if (!e)
        return {
          ...base,
          period: '—',
          body: sku ? `No exceptions are recorded for ${sku}.` : 'No SKU-level exceptions are open in the current scope.',
          sources: [],
        }
      return {
        ...base,
        period: e.reportDate ? `Report date ${fmtDate(e.reportDate)}` : `Detected ${fmtDate(e.detectedOn)}`,
        body: (
          <>
            <p>
              <strong>{e.title}</strong> was raised by the rule “{e.rule}” ({e.severity} severity, status {e.status}).
            </p>
            <p className="mt-1">{e.impactText}</p>
            <ul className="mt-1 space-y-0.5 text-ink-muted">
              {e.evidence.slice(0, 4).map((ev, i) => (
                <li key={i}>
                  {ev.label}: <span className="num text-ink">{ev.value}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-ink-muted">Calculation: {e.calculation}</p>
            {e.suggestions.length > 0 && (
              <>
                <p className="mt-1 font-medium">Suggested checks (the data shows the deviation, not its cause):</p>
                <ul className="list-disc pl-4">
                  {e.suggestions.slice(0, 3).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        ),
        sources: [{ label: `View ${e.id}`, to: `/exceptions/${e.id}` }, { label: 'View source data', to: e.sourceLink }, ...(e.skuCode ? [{ label: `SKU ${e.skuCode}`, to: `/sku/${e.skuCode}` }] : [])],
      }
    }
    case 'attainment': {
      const a = aggregateCells(ds, cellsFor(ds, pairs, f.dateFrom, f.dateTo), u)
      const s = aggStatus(ds, a)
      return {
        ...base,
        period: fmtRange(f.dateFrom, f.dateTo),
        body: (
          <>
            <p>
              Attainment is <strong className="num">{fmtPct(a.attainment, 1)}</strong> ({CELL_META[s].label}): actual {fmtQty(a.actualComparable, u)} vs plan {fmtQty(a.planComparable, u)} {u} on comparable days, gap {fmtSigned(a.gap, u)}{' '}
              {u}.
            </p>
            <p className="mt-1 text-ink-muted">
              Excluded from the denominator: {fmtQty(a.planUnreported, u)} {u} of plan on days without a valid report and {fmtQty(a.planFuture, u)} {u} on future dates. {a.counts.missing} vendor-SKU-days are missing (not counted as zero);{' '}
              {a.counts.zero} were reported as zero.
            </p>
            {a.excluded.length > 0 && <p className="mt-1 text-ink-muted">MT excludes {a.excluded.map((x) => x.skuCode).join(', ')} (no weight conversion).</p>}
          </>
        ),
        sources: [{ label: 'View in Production', to: '/production' }],
      }
    }
    case 'runrate': {
      const r = runRate(ds, pairs, u)
      return {
        ...base,
        period: `Oct 2026 (as of ${fmtDate(LATEST_DUE_DATE)})`,
        body: (
          <>
            <p>
              At the current average of {fmtQty(r.avgDaily, u)} {u}/reported day, the projected month total is <strong className="num">{fmtQty(r.projected, u)}</strong> of {fmtQty(r.monthPlan, u)} {u} ({fmtPct(r.projectedAttainment, 0)}).
            </p>
            <p className="mt-1">
              To close the plan, {fmtQty(r.requiredDaily, u)} {u} per remaining operating day is required ({r.remainingDays} days left).
            </p>
            <p className="mt-1 text-ink-muted">Demo calculation for daily-plan vendors only; monthly plans are not split by day. Not a forecast.</p>
          </>
        ),
        sources: [
          { label: 'View in Production', to: '/production' },
          { label: 'View plan', to: '/planning' },
        ],
      }
    }
    case 'expiry': {
      const warn = ds.idx.param.expiryWarnDays ?? 60
      const lots: {
        vendor: string
        vendorId: string
        sku: string
        lot: string
        expiry: string
        days: number
        qty: number | null
      }[] = []
      for (const p of pairs) {
        const snap = latestFgSnapshot(ds, p.vendor.id, p.sku.code)
        if (!snap) continue
        for (const l of snap.lots) {
          const days = diffDays(l.expiryDate, DEMO_TODAY)
          if (days <= warn)
            lots.push({
              vendor: p.vendor.name,
              vendorId: p.vendor.id,
              sku: p.sku.code,
              lot: `${shortSkuName(p.sku.name)} · ${l.lotNo}`,
              expiry: l.expiryDate,
              days,
              qty: convertOrNull(ds, p.sku.code, l.qtyEa, u),
            })
        }
      }
      lots.sort((a, b) => a.days - b.days)
      return {
        ...base,
        period: `Latest FG snapshot · expiry within ${warn} days of ${fmtDate(DEMO_TODAY)}`,
        body: lots.length ? (
          <>
            <p>
              {lots.length} FG lot{lots.length === 1 ? '' : 's'} expire within {warn} days:
            </p>
            <ul className="mt-1 space-y-0.5">
              {lots.slice(0, 6).map((l, i) => (
                <li key={i}>
                  <strong>{l.vendor}</strong> {l.lot}: <span className="num">{l.qty == null ? 'n/a in MT' : `${fmtQty(l.qty, u)} ${u}`}</span>, expires {fmtDate(l.expiry)} ({l.days < 0 ? 'expired' : `${l.days} days`})
                </li>
              ))}
            </ul>
            <p className="mt-1 text-ink-muted">Expiry window is a demo assumption (Master data → Parameters).</p>
          </>
        ) : (
          `No FG lots in the latest snapshots expire within ${warn} days.`
        ),
        sources: [{ label: 'View FG inventory', to: '/fg-inventory' }, ...[...new Set(lots.map((l) => l.sku))].slice(0, 3).map((s) => ({ label: `SKU ${s}`, to: `/sku/${s}` }))],
      }
    }
    case 'exceptions': {
      const list = scopedExceptions(ds, ex, f)
      const high = list.filter((e) => e.severity === 'High')
      return {
        ...base,
        period: `Now (${fmtDate(DEMO_TODAY)})`,
        body: (
          <>
            <p>
              {list.length} open exception{list.length === 1 ? '' : 's'} in scope, {high.length} high severity. Top items:
            </p>
            <ul className="mt-1 space-y-0.5">
              {list.slice(0, 5).map((e) => (
                <li key={e.id}>
                  [{e.severity}]{' '}
                  <Link to={`/exceptions/${e.id}`} className="font-medium text-accent-ink hover:underline">
                    {e.title}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ),
        sources: [
          { label: 'View exceptions', to: '/exceptions' },
          { label: 'View Overview', to: '/' },
        ],
      }
    }
    case 'excess': {
      // Same rule as the FG Inventory screen: latest snapshot vs baseline (avg of prior snapshots), Excess when above by > excessPct.
      const excessPct = ds.idx.param.excessPct ?? 30
      const fresh = new Map<string, string>()
      const high: { vendor: string; sku: string; name: string; stock: number | null; base: number | null; dev: number; snap: string; stale: boolean }[] = []
      const noSnap: string[] = []
      for (const p of pairs) {
        if (!fresh.has(p.vendor.id)) fresh.set(p.vendor.id, reportFreshness(ds, p.vendor, 'FG Inventory').freshness)
        const snap = latestFgSnapshot(ds, p.vendor.id, p.sku.code)
        if (!snap) {
          noSnap.push(`${p.vendor.name} ${p.sku.code}`)
          continue
        }
        const b = fgBaseline(ds, p.vendor.id, p.sku.code, snap.snapshotDate)
        if (!b.value) continue
        const dev = ((snap.qtyEa - b.value) / b.value) * 100
        if (dev > excessPct)
          high.push({
            vendor: p.vendor.name,
            sku: p.sku.code,
            name: shortSkuName(p.sku.name),
            stock: convertOrNull(ds, p.sku.code, snap.qtyEa, u),
            base: convertOrNull(ds, p.sku.code, b.value, u),
            dev,
            snap: snap.snapshotDate,
            stale: fresh.get(p.vendor.id) !== 'Current',
          })
      }
      high.sort((a, b) => b.dev - a.dev)
      const q = (v: number | null) => (v == null ? 'n/a in MT' : `${fmtQty(v, u)} ${u}`)
      return {
        ...base,
        period: `Latest FG snapshot per vendor–SKU (as of ${fmtDate(LATEST_DUE_DATE)})`,
        body: (
          <>
            {high.length ? (
              <>
                <p>
                  {high.length} vendor–SKU line{high.length === 1 ? ' is' : 's are'} more than {excessPct}% above their stock baseline:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {high.slice(0, 6).map((h) => (
                    <li key={h.vendor + h.sku}>
                      <strong>{h.vendor}</strong> {h.name}: <span className="num">{q(h.stock)}</span> vs baseline <span className="num">{q(h.base)}</span> (<span className="num">+{h.dev.toFixed(0)}%</span>)
                      {h.stale && <span className="text-warn"> · stale snapshot {fmtDate(h.snap)}</span>}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>No vendor–SKU line in scope is more than {excessPct}% above its stock baseline.</p>
            )}
            {noSnap.length > 0 && <p className="mt-1 text-ink-muted">No FG snapshot for {noSnap.length} line(s) – stock is unknown (missing, not zero).</p>}
            <p className="mt-1 text-ink-muted">
              Baseline = average of Monday snapshots over the prior {ds.idx.param.baselineWeeks ?? 4} weeks; the {excessPct}% threshold is a demo assumption. The data shows the deviation, not its cause.
            </p>
          </>
        ),
        sources: [{ label: 'View FG inventory', to: '/fg-inventory' }, ...high.slice(0, 2).map((h) => ({ label: `SKU ${h.sku}`, to: `/sku/${h.sku}` }))],
      }
    }
  }
}

function classify(text: string): Intent | null {
  for (const [i, re] of KEYWORDS) if (re.test(text)) return i
  return null
}

type Turn = ({ kind: 'answer' } & Answer) | { kind: 'fallback'; id: number; question: string } | { kind: 'error'; id: number; question: string; intent: Intent }

export const ASSISTANT_WIDTH = 440
export const ASK_BUTTON_ID = 'ask-p2p'
const DRAWER_ID = 'p2p-assistant'
const CAPABILITIES = 'vendors below plan, attainment, run-rate, reports needing follow-up, unusually high or near-expiry FG stock, why a SKU is flagged, and open exceptions'

function pageLabel(path: string) {
  let best = { len: -1, label: 'This page' }
  for (const g of NAV)
    for (const i of g.items) {
      const hit = i.to === '/' ? path === '/' : path === i.to || path.startsWith(i.to + '/')
      if (hit && i.to.length > best.len) best = { len: i.to.length, label: i.label }
    }
  if (best.len < 0 && path.startsWith('/sku/')) return `SKU ${decodeURIComponent(path.split('/')[2] ?? '')}`
  if (best.len < 0 && path.startsWith('/exceptions/')) return 'Exception detail'
  return best.label
}

/** Header entry point – the only way to open the assistant. */
export function AskP2PButton() {
  const open = useAppState((s) => s.assistantOpen)
  const { can } = usePermissions()
  if (!can('assistant.use')) return null
  return (
    <button
      id={ASK_BUTTON_ID}
      type="button"
      aria-expanded={open}
      aria-controls={DRAWER_ID}
      onClick={() => store.set((s) => ({ ...s, assistantOpen: !s.assistantOpen }))}
      className={cx(
        'inline-flex h-[28px] items-center gap-1.5 rounded-[var(--radius-control)] border px-2.5 text-dense font-medium whitespace-nowrap text-accent-ink transition-colors',
        open ? 'border-accent/60 bg-accent-soft shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)]' : 'border-accent/30 bg-accent-soft/50 hover:border-accent/50 hover:bg-accent-soft',
        'active:border-accent/70 active:bg-[#cfe8e3]',
      )}
    >
      <Sparkles size={14} aria-hidden /> Ask P2P
    </button>
  )
}

function ContextRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="w-[60px] shrink-0 text-ink-subtle">{label}</dt>
      <dd className="min-w-0 truncate text-ink" title={typeof children === 'string' ? children : undefined}>
        {children}
      </dd>
    </div>
  )
}

/**
 * Right-side assistant drawer. Mounted on first open and then kept mounted (hidden when closed) so the
 * conversation survives close/reopen for the session. `docked` reserves layout space; otherwise it overlays.
 */
export function AssistantDrawer({ docked }: { docked: boolean }) {
  const open = useAppState((s) => s.assistantOpen)
  const { can } = usePermissions()
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)
  if (!can('assistant.use') || !mounted) return null
  return <DrawerBody open={open} docked={docked} />
}

function DrawerBody({ open, docked }: { open: boolean; docked: boolean }) {
  const ds = useDataset()
  const ex = useExceptions()
  const { filters, applicable, notes } = useFilters()
  const loc = useLocation()
  const [turns, setTurns] = useState<Turn[]>([])
  const [pending, setPending] = useState<string | null>(null)
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const wasOpen = useRef(false)
  const suggestions = suggestionsFor(loc.pathname, ds, ex, filters)

  // Focus the input when the user opens the drawer (not on a page load that restores it open).
  useEffect(() => {
    if (open && !wasOpen.current) inputRef.current?.focus({ preventScroll: true })
    wasOpen.current = open
  }, [open])
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns, pending])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const close = (returnFocus = true) => {
    store.set((s) => ({ ...s, assistantOpen: false }))
    if (returnFocus) requestAnimationFrame(() => document.getElementById(ASK_BUTTON_ID)?.focus())
  }

  const run = (q: string, intent: Intent | null) => {
    const question = q.trim()
    if (!question || pending) return
    // Capture the filters at ask time; the assistant reads filters, it never changes them.
    const f = filters
    const path = loc.pathname
    setPending(question)
    timer.current = window.setTimeout(() => {
      let turn: Turn
      if (!intent) turn = { kind: 'fallback', id: ++seq, question }
      else
        try {
          turn = { kind: 'answer', ...answer(intent, question, ds, ex, f, path) }
        } catch {
          turn = { kind: 'error', id: ++seq, question, intent }
        }
      setTurns((t) => [...t, turn])
      setPending(null)
    }, 280)
  }
  const retry = (t: Extract<Turn, { kind: 'error' }>) => {
    setTurns((all) => all.filter((x) => x.id !== t.id))
    run(t.question, t.intent)
  }

  const dateApplies = applicable.includes('date')
  const unitApplies = applicable.includes('unit')
  const vendors = filters.vendorIds.length ? filters.vendorIds.map((id) => ds.idx.vendor.get(id)?.name ?? id).join(', ') : `All vendors (${ds.vendors.length})`
  const linkClick = () => {
    if (!docked) close(false)
  }

  return (
    <aside
      id={DRAWER_ID}
      aria-labelledby="p2p-assistant-title"
      hidden={!open}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) {
          e.stopPropagation()
          close()
        }
      }}
      className={cx(
        'flex h-full flex-col bg-surface',
        docked ? 'relative w-[440px] shrink-0 border-l border-line' : 'absolute inset-y-0 right-0 z-30 w-[440px] border-l border-line shadow-[-8px_0_24px_rgba(0,0,0,0.08)]',
        // Phones: span the whole viewport below the header (the sidebar leaves too little room).
        'max-sm:fixed max-sm:inset-x-0 max-sm:top-12 max-sm:bottom-0 max-sm:z-40 max-sm:h-auto max-sm:w-full',
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-accent" aria-hidden />
            <h2 id="p2p-assistant-title" className="text-title font-semibold">
              P2P Assistant
            </h2>
            <DemoBadge title="Simulated demo assistant – deterministic answers from the demo dataset, not an AI model and not live GCPL data.">Demo</DemoBadge>
          </div>
          <p className="mt-0.5 text-label text-ink-subtle">Quick answers about plan, stock and reports, computed from the demo dataset. Not an AI model, not live data.</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {turns.length > 0 && <IconButton icon={RotateCcw} label="Clear conversation" onClick={() => setTurns([])} disabled={!!pending} />}
          <IconButton icon={X} label="Close P2P Assistant" onClick={() => close()} />
        </div>
      </div>

      <section aria-label="Current filters" className="border-b border-line bg-surface-muted px-4 py-2.5">
        <dl className="space-y-0.5 text-label">
          <ContextRow label="Page">{pageLabel(loc.pathname)}</ContextRow>
          <ContextRow label="Period">{dateApplies ? fmtRange(filters.dateFrom, filters.dateTo) : `${fmtRange(filters.dateFrom, filters.dateTo)} · ${notes.date ?? 'not used on this page'}`}</ContextRow>
          <ContextRow label="Vendors">{vendors}</ContextRow>
          <ContextRow label="Products">{productLabel(filters)}</ContextRow>
          <ContextRow label="Unit">{unitApplies ? filters.unit : `${filters.unit} · ${notes.unit ?? 'not used on this page'}`}</ContextRow>
        </dl>
        <p className="mt-1.5 text-label text-ink-subtle">Questions use these filters; each answer states its own period. The assistant never changes your filters – use the filter bar.</p>
      </section>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3" role="log" aria-live="polite" aria-label="Conversation">
        {turns.length === 0 && !pending && (
          <div className="pt-2">
            <p className="text-dense text-ink-muted">Ask a question about the current filters, or start with one of these:</p>
            <ul className="mt-2 space-y-1.5" aria-label="Suggested questions">
              {suggestions.map((sg) => (
                <li key={sg.intent}>
                  <button
                    type="button"
                    onClick={() => run(sg.q, sg.intent)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-left text-dense text-ink transition-colors hover:border-accent/50 hover:bg-accent-soft/50"
                  >
                    {sg.q}
                    <ArrowRight size={13} className="shrink-0 text-ink-subtle" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-label text-ink-subtle">Can answer: {CAPABILITIES}.</p>
          </div>
        )}
        <div className="space-y-4">
          {turns.map((t) => (
            <div key={t.id} className="space-y-1.5">
              <div className="ml-10 rounded-lg rounded-tr-sm bg-accent-soft px-3 py-2 text-dense text-ink">
                <span className="sr-only">You asked: </span>
                {t.question}
              </div>
              {t.kind === 'answer' && (
                <div className="rounded-lg rounded-tl-sm border border-line bg-surface px-3 py-2 text-dense leading-[1.5] text-ink">
                  <div>{t.body}</div>
                  <dl className="mt-2 space-y-0.5 border-t border-line pt-1.5 text-label">
                    <div>
                      <dt className="inline text-ink-subtle">Period: </dt>
                      <dd className="inline text-ink-muted">{t.period}</dd>
                    </div>
                    <div>
                      <dt className="inline text-ink-subtle">Scope: </dt>
                      <dd className="inline text-ink-muted">
                        {t.scope} · units {t.unit}
                      </dd>
                    </div>
                  </dl>
                  {t.sources.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-dense">
                      {t.sources.map((src, i) => (
                        <Link key={i} to={src.to} onClick={linkClick} className="inline-flex items-center gap-0.5 font-medium text-accent-ink hover:underline">
                          {src.label}
                          <ArrowRight size={12} aria-hidden />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {t.kind === 'fallback' && (
                <div className="rounded-lg rounded-tl-sm border border-line bg-surface px-3 py-2 text-dense leading-[1.5] text-ink">
                  <p>This demo assistant can’t answer that question. It only answers fixed questions about {CAPABILITIES}.</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {suggestions.map((sg) => (
                      <button
                        key={sg.intent}
                        type="button"
                        disabled={!!pending}
                        onClick={() => run(sg.q, sg.intent)}
                        className="rounded-full border border-line-strong bg-surface px-2.5 py-0.5 text-left text-label text-ink hover:border-accent/50 hover:bg-accent-soft/50"
                      >
                        {sg.q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {t.kind === 'error' && (
                <div role="alert" className="flex items-start gap-2 rounded-lg rounded-tl-sm border border-bad-line bg-bad-soft px-3 py-2 text-dense text-ink">
                  <AlertCircle size={15} className="mt-0.5 shrink-0 text-bad" aria-hidden />
                  <div>
                    Couldn’t compute this answer from the demo dataset.{' '}
                    <button type="button" onClick={() => retry(t)} className="font-medium text-accent-ink underline">
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {pending && (
            <div className="space-y-1.5">
              <div className="ml-10 rounded-lg rounded-tr-sm bg-accent-soft px-3 py-2 text-dense text-ink">{pending}</div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-dense text-ink-muted" role="status">
                <Loader2 size={14} className="animate-spin" aria-hidden /> Computing from the demo dataset…
              </div>
            </div>
          )}
        </div>
        <div ref={endRef} />
      </div>

      <form
        className="flex gap-1.5 border-t border-line bg-surface px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim() || pending) return
          run(text, classify(text))
          setText('')
        }}
      >
        <label htmlFor="assistant-q" className="sr-only">
          Ask P2P a question
        </label>
        <input
          ref={inputRef}
          id="assistant-q"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask about the current filters…"
          autoComplete="off"
          className="h-9 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2.5 text-body placeholder:text-ink-subtle"
        />
        <button
          type="submit"
          disabled={!text.trim() || !!pending}
          aria-label="Send question"
          className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] bg-accent text-white hover:bg-accent-hover disabled:opacity-40"
        >
          <Send size={15} aria-hidden />
        </button>
      </form>
    </aside>
  )
}
