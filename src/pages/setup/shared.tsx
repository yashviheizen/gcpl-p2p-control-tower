// Small form + table helpers shared by the Master Data and Administration pages.
import { Search } from 'lucide-react'
import { cloneElement, isValidElement, useId, useState, type ReactElement, type ReactNode } from 'react'
import type { ActivityEntry } from '@/data/types'
import type { MasterTables } from '@/data/dataset'
import { cx, td } from '@/components/ui'
import { fmtDateTime } from '@/lib/dates'
import { logActivity, store } from '@/lib/store'

export const inputCls = 'h-8 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 text-body text-ink placeholder:text-ink-subtle disabled:bg-surface-muted aria-[invalid=true]:border-bad'

export type Errors = Record<string, string | undefined>

/** Labelled form field with inline validation message wired via aria-describedby. */
export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: ReactNode; children: ReactElement<Record<string, unknown>>; className?: string }) {
  const id = useId()
  const msgId = `${id}-msg`
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error || hint ? msgId : undefined,
      })
    : children
  return (
    <div className={cx('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-dense font-medium text-ink-muted">
        {label}
      </label>
      {control}
      {error ? (
        <p id={msgId} className="text-label font-medium text-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="text-label text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function Check({ label, checked, onChange, disabled, title }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; title?: string }) {
  return (
    <label title={title} className={cx('inline-flex items-center gap-2 text-body text-ink', disabled && 'opacity-50')}>
      <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function SearchBox({ value, onChange, label, placeholder, className }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; className?: string }) {
  return (
    <label className={cx('relative inline-flex items-center', className)}>
      <span className="sr-only">{label}</span>
      <Search size={14} className="pointer-events-none absolute left-2 text-ink-subtle" aria-hidden />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx(inputCls, 'pl-7')} />
    </label>
  )
}

/** Parse a numeric text input. Returns null for blank. */
export function num(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}
export function positiveInt(v: string, label: string): string | undefined {
  const n = num(v)
  if (n == null) return `${label} is required.`
  if (Number.isNaN(n) || !Number.isInteger(n) || n <= 0) return `${label} must be a whole number greater than 0.`
}
export function required(v: string, label: string): string | undefined {
  if (!v.trim()) return `${label} is required.`
}
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const hasErrors = (e: Errors) => Object.values(e).some(Boolean)

/** Persist a master-data change locally and record it in the change history. */
export function saveMaster(update: (m: MasterTables) => MasterTables, action: string, target: string, detail?: string) {
  store.set((s) => ({ ...s, master: update(s.master) }))
  logActivity('Master data', action, target, detail)
}

/** Simple "what changed" summary for the activity log. */
export function diffSummary<T extends object>(before: T, after: T, labels: Partial<Record<keyof T, string>>): string {
  const parts: string[] = []
  for (const k of Object.keys(labels) as (keyof T)[]) {
    if (before[k] !== after[k]) parts.push(`${labels[k]}: ${fmtVal(before[k])} → ${fmtVal(after[k])}`)
  }
  return parts.join('; ') || 'No field changes'
}
function fmtVal(v: unknown) {
  if (v == null || v === '') return '—'
  if (Array.isArray(v)) return v.join(', ') || '—'
  return String(v)
}

export function ActivityRows({ entries, showArea }: { entries: ActivityEntry[]; showArea?: boolean }) {
  return (
    <>
      {entries.map((a) => (
        <tr key={a.id} className="hover:bg-surface-muted/60">
          <td className={cx(td, 'num whitespace-nowrap text-ink-muted')}>{fmtDateTime(a.at)}</td>
          <td className={cx(td, 'whitespace-nowrap')}>{a.by}</td>
          {showArea && <td className={cx(td, 'whitespace-nowrap text-ink-muted')}>{a.area}</td>}
          <td className={td}>{a.action}</td>
          <td className={cx(td, 'font-mono text-dense break-all')}>{a.target}</td>
          <td className={cx(td, 'text-dense text-ink-muted')}>{a.detail ?? '—'}</td>
        </tr>
      ))}
    </>
  )
}

export function usePaged<T>(rows: T[], size = 25) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const p = Math.min(page, pages - 1)
  return {
    page: p,
    pages,
    setPage,
    slice: rows.slice(p * size, p * size + size),
  }
}

export function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[2px] bg-warn-soft px-0.5 text-ink">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}
