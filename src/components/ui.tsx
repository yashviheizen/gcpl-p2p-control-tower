// Reusable UI primitives. All colours come from tokens in src/index.css.
import { clsx } from 'clsx'
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FlaskConical, Info, Loader2, X, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Link, useLocation } from 'react-router-dom'

export const cx = clsx

// ── Buttons ────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant
  size?: 'sm' | 'md'
  icon?: LucideIcon
}) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-[28px] px-2.5 text-dense' : 'h-[30px] px-3 text-body',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-hover',
        variant === 'secondary' && 'border border-line bg-surface text-ink shadow-[var(--shadow-card)] hover:bg-surface-muted',
        variant === 'ghost' && 'text-ink-muted hover:bg-black/5 hover:text-ink',
        variant === 'danger' && 'border border-bad-line bg-surface text-bad hover:bg-bad-soft',
        className,
      )}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 16} aria-hidden />}
      {children}
    </button>
  )
}

export function IconButton({
  icon: Icon,
  label,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon
  label: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx('inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] text-ink-muted hover:bg-black/5 hover:text-ink disabled:opacity-40', className)}
    >
      <Icon size={16} aria-hidden />
    </button>
  )
}

// ── Layout ─────────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, actions, back, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-4">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-heading font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <div className="mt-0.5 text-dense text-ink-subtle">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  )
}

export function Card({ title, subtitle, actions, children, className, bodyClass, id }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; id?: string }) {
  return (
    <section id={id} className={cx('min-w-0 rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="text-title font-semibold text-ink">{title}</h2>}
            {subtitle && <div className="mt-0.5 text-label text-ink-subtle">{subtitle}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cx(bodyClass ?? 'p-4')}>{children}</div>
    </section>
  )
}

// ── Badges ─────────────────────────────────────────────────────────────────
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'none' | 'accent'
const toneCls: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok border-ok-line',
  warn: 'bg-warn-soft text-warn border-warn-line',
  bad: 'bg-bad-soft text-bad border-bad-line',
  info: 'bg-info-soft text-info border-info-line',
  none: 'bg-none-soft text-none border-line',
  accent: 'bg-accent-soft text-accent-ink border-accent/30',
}
export function Badge({ tone = 'none', icon: Icon, children, className, title }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex h-[22px] items-center gap-1 rounded-[4px] px-1.5 text-label font-medium whitespace-nowrap', toneCls[tone], 'border-transparent', className)}>
      {Icon && <Icon size={12} aria-hidden strokeWidth={2.4} />}
      {children}
    </span>
  )
}

/** Quiet status indicator: tone-coloured icon (or dot) + plain text. Use in dense tables instead of pills. */
const toneText: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  bad: 'text-bad',
  info: 'text-info',
  none: 'text-ink-subtle',
  accent: 'text-accent',
}
export function StatusText({ tone = 'none', icon: Icon, children, className, title }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1.5 whitespace-nowrap text-ink', className)}>
      {Icon ? <Icon size={14} aria-hidden strokeWidth={2.2} className={cx('shrink-0', toneText[tone])} /> : <span aria-hidden className={cx('h-2 w-2 shrink-0 rounded-full bg-current', toneText[tone])} />}
      {children}
    </span>
  )
}

export function DemoBadge({ children = 'Demo', className, title }: { children?: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-[4px] border border-warn-line bg-warn-soft px-1.5 py-0.5 text-label font-semibold text-warn', className)}>
      <FlaskConical size={12} aria-hidden /> {children}
    </span>
  )
}

/** Inline note flagging a provisional business rule. */
export function AssumptionNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx('flex items-start gap-1.5 text-dense text-ink-muted', className)}>
      <FlaskConical size={14} className="mt-[2px] shrink-0 text-ink-subtle" aria-hidden />
      <span>
        <span className="font-medium text-ink">Assumption:</span> {children}
      </span>
    </p>
  )
}

// ── Formula / help popover ─────────────────────────────────────────────────
export function HelpTip({ label = 'How is this calculated?', children, align = 'left' }: { label?: string; children: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-subtle hover:bg-black/5 hover:text-ink"
      >
        <Info size={14} aria-hidden />
      </button>
      {open && (
        <span
          id={id}
          role="dialog"
          aria-label={label}
          className={cx(
            'absolute top-7 z-40 w-[320px] max-w-[80vw] rounded-md border border-line bg-surface p-3 text-left text-dense leading-[1.5] font-normal tracking-normal text-ink normal-case shadow-[var(--shadow-pop)]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children}
        </span>
      )}
    </span>
  )
}

// ── KPI tile ───────────────────────────────────────────────────────────────
export function Kpi({ label, value, unit, sub, period, help, status, to }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; period?: string; help?: ReactNode; status?: ReactNode; to?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-1">
        <span className="flex items-center gap-0.5 text-dense font-medium text-ink-muted">
          {label}
          {help && <HelpTip label={`How ${label} is calculated`}>{help}</HelpTip>}
        </span>
        {period && <span className="text-label text-ink-subtle">{period}</span>}
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1">
        <span className="num text-kpi font-semibold text-ink">{value}</span>
        {unit && <span className="text-dense text-ink-subtle">{unit}</span>}
      </div>
      <div className="mt-1 flex min-h-[18px] flex-wrap items-center gap-1.5 text-label text-ink-subtle">
        {status}
        {sub}
      </div>
    </>
  )
  const cls = 'block min-w-0 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)]'
  if (to)
    return (
      <Link to={to} className={cx(cls, 'transition-colors hover:border-accent/50')}>
        {body}
      </Link>
    )
  return <div className={cls}>{body}</div>
}

// ── Controls ───────────────────────────────────────────────────────────────
export function Select({
  label,
  hideLabel,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  hideLabel?: boolean
}) {
  const id = useId()
  return (
    <label htmlFor={id} className={cx('inline-flex max-w-full min-w-0 items-center gap-1.5 text-dense text-ink-muted', className)}>
      <span className={hideLabel ? 'sr-only' : 'shrink-0'}>{label}</span>
      <select id={id} {...rest} className="h-[30px] min-w-0 max-w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 text-body text-ink disabled:opacity-50">
        {children}
      </select>
    </label>
  )
}

export function TextInput({
  label,
  hideLabel,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hideLabel?: boolean
}) {
  const id = useId()
  return (
    <label htmlFor={id} className={cx('inline-flex flex-col gap-1 text-dense text-ink-muted', className)}>
      <span className={hideLabel ? 'sr-only' : 'font-medium'}>{label}</span>
      <input id={id} {...rest} className="h-[30px] rounded-[var(--radius-control)] border border-line-strong bg-surface px-2.5 text-body text-ink placeholder:text-ink-subtle disabled:bg-surface-muted" />
    </label>
  )
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
}: {
  label: string
  value: T
  options: { value: T; label: string; icon?: LucideIcon; disabled?: boolean }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[var(--radius-control)] border border-line bg-surface-muted p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
              const i = options.findIndex((x) => x.value === value)
              const n = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length]
              onChange(n.value)
            }}
            className={cx(
              'inline-flex items-center gap-1 rounded-[4px] font-medium transition-colors disabled:opacity-40',
              size === 'sm' ? 'h-6 px-2 text-dense' : 'h-[26px] px-2.5 text-body',
              active ? 'bg-surface text-accent-ink shadow-[0_1px_2px_rgba(24,24,27,0.12)] ring-1 ring-accent/40' : 'text-ink-muted hover:text-ink',
            )}
          >
            {o.icon && <o.icon size={14} aria-hidden />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Visually distinct wrapper for page-local filters (vs the global analysis filter bar). */
export function LocalFilters({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label="Page filters" className={cx('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface-muted/60 px-3 py-2', className)}>
      <span className="text-dense font-medium text-ink-muted">Page filters</span>
      {children}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={cx('-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-body font-medium', t.value === value ? 'border-accent text-accent-ink' : 'border-transparent text-ink-muted hover:text-ink')}
        >
          {t.label}
          {t.count != null && <span className="num rounded-full bg-none-soft px-1.5 text-label text-ink-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ── Drawer & Modal ─────────────────────────────────────────────────────────
function useEscape(onClose: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])
}
export function Drawer({ open, onClose, title, subtitle, children, width = 520, footer }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; width?: number; footer?: ReactNode }) {
  useEscape(onClose)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) ref.current?.focus()
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/25" onClick={onClose} aria-hidden />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Details'} className="relative flex h-full max-w-full flex-col bg-surface shadow-2xl outline-none" style={{ width }}>
        <div className="flex items-start justify-between gap-2 border-b border-line px-3.5 py-2">
          <div className="min-w-0">
            <h2 className="text-title font-semibold">{title}</h2>
            {subtitle && <div className="text-label text-ink-subtle">{subtitle}</div>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}
export function Modal({ open, onClose, title, children, footer, width = 480 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEscape(onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Dialog'} className="relative max-h-[90vh] w-full overflow-y-auto rounded-lg bg-surface shadow-2xl" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-title font-semibold">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

// ── States ─────────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon = Info, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <Icon size={22} className="text-ink-subtle" aria-hidden />
      <div className="text-title font-semibold text-ink">{title}</div>
      {children && <div className="max-w-md text-body text-ink-muted">{children}</div>}
      {action}
    </div>
  )
}
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-body text-ink-muted">
      <Loader2 size={16} className="animate-spin" aria-hidden /> {label}
    </div>
  )
}
/** Banner: a short summary stays visible; longer explanation goes in `details` (an accessible “Details” disclosure). */
export function Callout({
  tone = 'info',
  icon: Icon = Info,
  title,
  children,
  action,
  details,
  detailsLabel = 'Details',
}: {
  tone?: Tone
  icon?: LucideIcon
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  details?: ReactNode
  detailsLabel?: string
}) {
  return (
    <div role={tone === 'bad' ? 'alert' : undefined} className={cx('flex items-start gap-2.5 rounded-[var(--radius-card)] border px-3.5 py-2.5 text-body', toneCls[tone])}>
      <Icon size={16} className="mt-[1px] shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-ink">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className="text-ink-muted">{children}</div>}
        {details && (
          <details className="group mt-1">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-dense font-medium text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
              <ChevronRight size={14} aria-hidden className="transition-transform group-open:rotate-90" />
              {detailsLabel}
            </summary>
            <div className="mt-1 max-w-[880px] text-dense text-ink-muted">{details}</div>
          </details>
        )}
      </div>
      {action}
    </div>
  )
}

// ── Table helpers ──────────────────────────────────────────────────────────
/** Contained horizontal scroll – the page itself never overflows. */
export function TableWrap({ children, className, maxHeight }: { children: ReactNode; className?: string; maxHeight?: number | string }) {
  return (
    <div className={cx('scroll-thin relative max-w-full overflow-auto', className)} style={maxHeight ? { maxHeight } : undefined}>
      {children}
    </div>
  )
}
/**
 * One-line table text (names): truncates with an ellipsis and exposes the full text on hover (title)
 * and on keyboard focus (focusable only when truncated; a fixed tooltip so scroll containers don't clip it).
 */
export function CellText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [cut, setCut] = useState(false)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setCut(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text])
  return (
    <>
      <span
        ref={ref}
        className={cx('block min-w-0 truncate', cut && 'rounded-sm focus-visible:outline-2 focus-visible:outline-accent', className)}
        title={cut ? text : undefined}
        tabIndex={cut ? 0 : undefined}
        onFocus={(e) => {
          if (!cut) return
          const r = e.currentTarget.getBoundingClientRect()
          setTip({ x: r.left, y: r.bottom + 4 })
        }}
        onBlur={() => setTip(null)}
      >
        {text}
      </span>
      {tip && (
        <span role="tooltip" className="pointer-events-none fixed z-50 max-w-[320px] rounded bg-ink px-2 py-1 text-label text-white shadow-md" style={{ left: tip.x, top: tip.y }}>
          {text}
        </span>
      )}
    </>
  )
}
// Shared table cells read the density vars (index.css) – Compact by default, Comfortable via DensityControl
export const th = 'sticky top-0 z-10 border-b border-line bg-surface-muted px-[var(--cell-px)] py-[var(--th-py)] text-left text-label font-medium whitespace-nowrap text-ink-muted'
export const td = 'border-b border-line px-[var(--cell-px)] py-[var(--cell-py)] text-dense align-middle'
export const tdNum = 'border-b border-line px-[var(--cell-px)] py-[var(--cell-py)] text-dense text-right num whitespace-nowrap align-middle'

export function Pager({ page, pages, onPage, total, label = 'rows' }: { page: number; pages: number; onPage: (p: number) => void; total: number; label?: string }) {
  if (pages <= 1)
    return (
      <div className="px-3 py-2 text-dense text-ink-muted">
        {total} {label}
      </div>
    )
  return (
    <div className="flex items-center justify-between px-3 py-2 text-dense text-ink-muted">
      <span>
        {total} {label} · page {page + 1} of {pages}
      </span>
      <div className="flex gap-1">
        <IconButton icon={ChevronLeft} label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)} />
        <IconButton icon={ChevronRight} label="Next page" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} />
      </div>
    </div>
  )
}

// ── CSV export ─────────────────────────────────────────────────────────────
export function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const csv = rows.map((r) => r.map((c) => (c == null ? '' : /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
export function ExportButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button size="sm" icon={Download} onClick={onClick} disabled={disabled} title={disabled ? 'Export not permitted for this persona' : 'Export the rows shown (demo data)'}>
      Export CSV
    </Button>
  )
}

// ── Origin context (back navigation) ───────────────────────────────────────
export interface OriginState {
  from?: string
  fromLabel?: string
}
/** State to attach to links so the destination can offer “Back to …”. */
export function useOriginState(label: string): OriginState {
  const loc = useLocation()
  return { from: loc.pathname + loc.search, fromLabel: label }
}
export function BackLink({ fallback, fallbackLabel }: { fallback: string; fallbackLabel: string }) {
  const loc = useLocation()
  const st = (loc.state ?? {}) as OriginState
  const to = st.from ?? fallback
  const label = st.fromLabel ?? fallbackLabel
  return (
    <Link to={to} className="mb-2 inline-flex items-center gap-1 text-dense font-medium text-accent-ink hover:underline">
      <ArrowLeft size={14} aria-hidden /> Back to {label}
    </Link>
  )
}

export function KeyVal({ items, cols = 2 }: { items: { k: ReactNode; v: ReactNode }[]; cols?: number }) {
  return (
    <dl className="grid gap-x-4 gap-y-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-label text-ink-muted">{it.k}</dt>
          <dd className="num text-body font-medium text-ink">{it.v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Inline, borderless disclosure for secondary metadata / explanations (“Version details”, “Legend & definitions”). */
export function Disclosure({ summary, children, className, bodyClass }: { summary: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <details className={cx('group min-w-0', className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded py-0.5 text-dense font-medium text-ink-muted select-none hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} aria-hidden className="shrink-0 transition-transform group-open:rotate-90" />
        {summary}
      </summary>
      <div className={cx('mt-1.5', bodyClass)}>{children}</div>
    </details>
  )
}

/** Expandable supporting content (assumptions, formulas, secondary records). */
export function Details({ summary, children, className, defaultOpen }: { summary: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean }) {
  return (
    <details className={cx('group rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]', className)} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-body font-medium text-ink select-none hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} aria-hidden className="shrink-0 text-ink-subtle transition-transform group-open:rotate-90" />
        {summary}
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
  )
}

/** Anchored menu/popover that closes on outside click and Escape. */
export function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

// ── Table density (spacing only) ───────────────────────────────────────────
export type Density = 'compact' | 'comfortable'
const DENSITY_KEY = 'gcpl-p2p-density-v1'
const readDensity = (): Density => {
  try {
    return localStorage.getItem(DENSITY_KEY) === 'comfortable' ? 'comfortable' : 'compact'
  } catch {
    return 'compact'
  }
}
const densityListeners = new Set<() => void>()
let densityValue: Density = readDensity()
if (typeof document !== 'undefined') document.documentElement.dataset.density = densityValue
export function setDensity(d: Density) {
  densityValue = d
  document.documentElement.dataset.density = d
  try {
    localStorage.setItem(DENSITY_KEY, d)
  } catch {
    /* storage unavailable */
  }
  densityListeners.forEach((l) => l())
}
/** Persisted locally, applied to every platform table through CSS vars. */
export function useDensity(): Density {
  return useSyncExternalStore(
    (l) => {
      densityListeners.add(l)
      return () => densityListeners.delete(l)
    },
    () => densityValue,
  )
}
export function DensityControl() {
  const d = useDensity()
  return (
    <Segmented
      label="Row density"
      size="sm"
      value={d}
      onChange={setDensity}
      options={[
        { value: 'compact', label: 'Compact' },
        { value: 'comfortable', label: 'Comfortable' },
      ]}
    />
  )
}
