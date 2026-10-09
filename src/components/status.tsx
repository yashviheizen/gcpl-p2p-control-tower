// Status vocabularies. Every status pairs colour with an icon and a text label (never colour alone).
import { AlertOctagon, AlertTriangle, ArrowDown, ArrowUp, CalendarOff, CalendarRange, Check, CheckCircle2, CircleDashed, CircleSlash, Clock, FileQuestion, Hourglass, MinusCircle, PauseCircle, XCircle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ExceptionStatus, Severity } from '@/data/types'
import type { Unit } from '@/data/types'
import { fmtQty } from '@/lib/format'
import type { CellStatus, Freshness, ProdAgg } from '@/lib/metrics'
import { Badge, StatusText, cx, type Tone } from './ui'

export interface StatusMeta {
  label: string
  short: string
  tone: Tone
  icon: LucideIcon
  description: string
  /** Heatmap cell classes: subtle background + readable text (no borders/icons) */
  cell: string
  /** Text glyph paired with the % in heatmap cells so status is never colour-only */
  glyph: string
  /** Legend wording when it needs more than the label */
  legend?: string
}

/** Explanation for heatmap cells of monthly-plan vendors (tooltip, accessible label and cell details). */
export const MONTHLY_PLAN_TIP = 'Daily attainment unavailable: this vendor plans monthly.'

export const CELL_META: Record<CellStatus, StatusMeta> = {
  below: {
    label: 'Below plan',
    short: 'Below',
    glyph: '↓',
    tone: 'bad',
    icon: ArrowDown,
    description: 'Attainment below the configured lower bound (risk of shortfall).',
    cell: 'bg-bad-soft text-bad',
  },
  within: {
    label: 'Within range',
    short: 'Within',
    glyph: '',
    tone: 'ok',
    icon: CheckCircle2,
    description: 'Attainment inside the configured range.',
    cell: 'bg-ok-soft text-ok',
  },
  above: {
    label: 'Above plan',
    short: 'Above',
    glyph: '↑',
    tone: 'warn',
    icon: ArrowUp,
    description: 'Attainment above the upper bound – review for excess build. Not automatically “good”.',
    cell: 'bg-warn-soft text-warn',
  },
  zero: {
    label: 'Reported zero',
    short: 'Zero',
    glyph: '',
    tone: 'bad',
    icon: CircleSlash,
    description: 'Vendor explicitly reported 0 against a plan. Distinct from a missing report.',
    cell: 'bg-bad-soft text-bad hatch-bad font-semibold',
  },
  monthly: {
    label: 'Monthly plan',
    legend: 'Monthly plan (no daily attainment)',
    short: 'Monthly',
    glyph: '',
    tone: 'info',
    icon: CalendarRange,
    description: 'Vendor plans monthly – there is no daily plan, so daily attainment is not applicable. Compare against the monthly plan instead.',
    cell: 'bg-info-soft/70 text-info',
  },
  noPlan: {
    label: 'No plan',
    short: 'No plan',
    glyph: '',
    tone: 'none',
    icon: MinusCircle,
    description: 'No applicable plan exists for this SKU and date. Attainment not computed.',
    cell: 'bg-surface-muted text-ink-muted',
  },
  missing: {
    label: 'Report missing',
    short: 'Missing',
    glyph: '',
    tone: 'none',
    icon: FileQuestion,
    description: 'No valid report for this date. Missing data is never treated as zero.',
    cell: 'bg-surface text-ink-muted hatch',
  },
  nonOp: {
    label: 'Non-operating day',
    short: 'Off',
    glyph: '',
    tone: 'none',
    icon: CalendarOff,
    description: 'Weekly off / holiday on the vendor operating calendar.',
    cell: 'bg-canvas text-ink-subtle dots',
  },
  future: {
    label: 'Not yet due',
    short: '—',
    glyph: '',
    tone: 'none',
    icon: Hourglass,
    description: 'Date after the latest report due date (8 Oct). Plan shown for reference.',
    cell: 'bg-surface text-ink-subtle border border-dashed border-line-strong',
  },
}

export function CellStatusBadge({ status, className }: { status: CellStatus; className?: string }) {
  const m = CELL_META[status]
  return (
    <StatusText tone={m.tone} icon={m.icon} className={className} title={m.description}>
      {m.label}
    </StatusText>
  )
}

export const FRESH_META: Record<Freshness, { tone: Tone; icon: LucideIcon; label: string }> = {
  Current: { tone: 'ok', icon: CheckCircle2, label: 'Current' },
  Stale: { tone: 'warn', icon: Clock, label: 'Stale' },
  Missing: { tone: 'bad', icon: XCircle, label: 'Missing' },
}
export function FreshnessBadge({ value }: { value: Freshness }) {
  const m = FRESH_META[value]
  return (
    <StatusText tone={m.tone} icon={m.icon}>
      {m.label}
    </StatusText>
  )
}

export const SEV_META: Record<Severity, { tone: Tone; icon: LucideIcon }> = {
  High: { tone: 'bad', icon: AlertOctagon },
  Medium: { tone: 'warn', icon: AlertTriangle },
  Low: { tone: 'info', icon: CircleDashed },
}
export function SeverityBadge({ value }: { value: Severity }) {
  const m = SEV_META[value]
  // Only High gets a filled badge; Medium/Low stay as quiet icon + text.
  if (value === 'High')
    return (
      <Badge tone={m.tone} icon={m.icon}>
        {value}
      </Badge>
    )
  return (
    <StatusText tone={m.tone} icon={m.icon}>
      {value}
    </StatusText>
  )
}

export const EXSTATUS_META: Record<ExceptionStatus, { tone: Tone; icon: LucideIcon }> = {
  Open: { tone: 'bad', icon: AlertTriangle },
  Investigating: { tone: 'info', icon: Clock },
  'Waiting on vendor': { tone: 'warn', icon: PauseCircle },
  Resolved: { tone: 'ok', icon: CheckCircle2 },
  Dismissed: { tone: 'none', icon: MinusCircle },
}
export function ExStatusBadge({ value }: { value: ExceptionStatus }) {
  const m = EXSTATUS_META[value]
  return (
    <StatusText tone={m.tone} icon={m.icon}>
      {value}
    </StatusText>
  )
}

/** Sample attainment text for legend chips when values are shown. */
const LEGEND_VALUE: Partial<Record<CellStatus, string>> = { below: '72% ↓', within: '98%', above: '124% ↑', zero: '0%' }

/**
 * Non-colour cue for a heatmap cell: a symbol for attainment states, a visible 0 for reported zero and a warning for a
 * missing report. Non-operating (dotted pattern), not yet due (dashed outline) and monthly (grouped band) use shape only.
 */
export function CellCue({ status }: { status: CellStatus }) {
  switch (status) {
    case 'below':
      return <ArrowDown size={12} strokeWidth={2.5} aria-hidden />
    case 'within':
      return <Check size={12} strokeWidth={2.5} aria-hidden className="opacity-60" />
    case 'above':
      return <ArrowUp size={12} strokeWidth={2.5} aria-hidden />
    case 'zero':
      return <span className="num font-semibold">0</span>
    case 'missing':
      return <AlertTriangle size={12} strokeWidth={2.25} aria-hidden className="text-warn" />
    case 'noPlan':
      return <span aria-hidden>–</span>
    default:
      return null
  }
}

/** Heatmap-style sample chip for one status (same look as the grid cells; `values` matches the “Show values” mode). */
export function LegendSwatch({ status, values = false }: { status: CellStatus; values?: boolean }) {
  const text = values ? LEGEND_VALUE[status] : undefined
  return (
    <span aria-hidden className={cx('num inline-flex h-5 min-w-[40px] items-center justify-center rounded-[4px] px-1.5 text-label font-medium ring-1 ring-black/5 ring-inset', CELL_META[status].cell)}>
      {text ?? <CellCue status={status} />}
    </span>
  )
}

export function StatusLegend({ statuses, className, values }: { statuses: CellStatus[]; className?: string; values?: boolean }) {
  return (
    <ul aria-label="Status legend" className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-ink-muted', className)}>
      {statuses.map((s) => {
        const m = CELL_META[s]
        return (
          <li key={s} className="inline-flex items-center gap-1" title={m.description}>
            <LegendSwatch status={s} values={values} />
            {m.legend ?? m.label}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Compact disclosure for quantities kept out of the comparable basis:
 * “Some data excluded · N reasons · View breakdown”. `extra` sits on the same line
 * (e.g. missing/stale report warnings, which must stay visible).
 */
export function NotComparedLine({ agg, unit, className, extra }: { agg: ProdAgg; unit: Unit; className?: string; extra?: ReactNode }) {
  const parts = [
    { v: agg.actualMonthly, label: 'from monthly-plan vendors' },
    { v: agg.actualNoPlan, label: 'with no applicable daily plan' },
    { v: agg.actualNonOp, label: 'on non-operating days' },
  ].filter((p) => p.v > 0)
  const has = parts.length > 0 || agg.planUnreported > 0
  if (!has && !extra) return null
  // Compact summary (number of exclusion reasons); quantities and reasons stay in the breakdown.
  const kinds = parts.length + (agg.planUnreported > 0 ? 1 : 0)
  return (
    <div className={cx('flex flex-wrap items-start gap-x-4 gap-y-1 text-dense text-ink-muted', className)}>
      {has && (
        <details className="group min-w-0">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-1.5 rounded py-0.5 [&::-webkit-details-marker]:hidden">
            <span className="font-medium text-ink">Some data excluded</span>
            <span aria-hidden>·</span>
            <span className="num">
              {kinds} {kinds === 1 ? 'reason' : 'reasons'}
            </span>
            <span aria-hidden>·</span>
            <span className="font-medium text-accent-ink group-open:hidden">View breakdown</span>
            <span className="hidden font-medium text-accent-ink group-open:inline">Hide breakdown</span>
          </summary>
          <div className="mt-1 mb-1 max-w-[760px] rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2">
            <ul className="space-y-0.5">
              {parts.map((p) => (
                <li key={p.label}>
                  <span className="num font-medium text-ink">{fmtQty(p.v, unit)}</span> {unit} actual {p.label}
                </li>
              ))}
              {agg.planUnreported > 0 && (
                <li>
                  <span className="num font-medium text-ink">{fmtQty(agg.planUnreported, unit)}</span> {unit} plan on days with no valid report
                </li>
              )}
            </ul>
            <p className="mt-1 text-label text-ink-subtle">
              Attainment and gap compare only days that have both a daily plan and a valid report, so plan, actual, attainment and gap share one scope. Total reported actual = comparable {fmtQty(agg.actualComparable, unit)} + not compared{' '}
              {fmtQty(agg.actualUnplanned, unit)} = {fmtQty(agg.actual, unit)} {unit}. Missing reports are never counted as zero.
            </p>
          </div>
        </details>
      )}
      {extra}
    </div>
  )
}
