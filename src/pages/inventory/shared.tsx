// Helpers shared by the inventory / dispatch / PO pages.
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx, type OriginState } from '@/components/ui'
import type { Dataset } from '@/data/dataset'
import type { ISODate, Unit, Vendor } from '@/data/types'
import { operatingDayInfo } from '@/lib/calendar'
import { eachDay } from '@/lib/dates'
import { fmtQty, shortSkuName } from '@/lib/format'
import { convertOrNull } from '@/lib/metrics'

/** Chart colours mirror the series tokens in index.css (SVG attributes cannot read CSS vars reliably). */
export const SERIES = {
  plan: '#9aa8a6',
  actual: '#0d7c74',
  dispatch: '#3b6fc4',
  inventory: '#8a5cc2',
  warn: '#955700',
  bad: '#b42318',
  grid: '#e2e7e6',
  axis: '#7b8987',
}

/** Recharts legend label in muted ink (series colour stays on the swatch) – keeps legend text AA-readable. */
export const legendText = (v: string) => <span className="text-ink-muted">{v}</span>

/** Sticky first-column classes (header and body) for horizontally scrolling tables. */
export const stickyTh = 'left-0 z-20 shadow-[1px_0_0_var(--color-line)]'
export const stickyTd = 'sticky left-0 z-[1] bg-surface shadow-[1px_0_0_var(--color-line)]'

/** Header cell for tables nested inside an expanded row (no sticky positioning). */
export const subTh = 'border-b border-line bg-surface-muted px-3 py-1.5 text-left text-dense font-medium whitespace-nowrap text-ink-muted'

/** Small period qualifier under a column header, e.g. "Selected period" / "As of snapshot". */
export function HeadPeriod({ children, title }: { children: ReactNode; title: ReactNode }) {
  return (
    <span className="flex flex-col leading-tight">
      <span>{title}</span>
      <span className="text-label font-normal tracking-normal text-ink-subtle normal-case">{children}</span>
    </span>
  )
}

export function SkuLink({ ds, code, origin }: { ds: Dataset; code: string; origin: OriginState }) {
  const sku = ds.idx.sku.get(code)
  return (
    <Link to={`/sku/${code}`} state={origin} className="group block min-w-0 hover:underline" onClick={(e) => e.stopPropagation()}>
      <span className="block truncate font-medium text-ink group-hover:text-accent-ink" title={sku?.name}>
        {sku ? shortSkuName(sku.name) : code}
      </span>
      <span className="num block text-label text-ink-subtle">{code}</span>
    </Link>
  )
}

export function ExpandToggle({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${open ? 'Hide' : 'Show'} ${label}`}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-muted hover:bg-black/5 hover:text-ink"
    >
      <ChevronRight size={14} aria-hidden className={cx('transition-transform', open && 'rotate-90')} />
    </button>
  )
}

/** Quantity cell text in the display unit; MT without weight shows "n/a". */
export function qtyText(ds: Dataset, skuCode: string, ea: number | null, unit: Unit): string {
  if (ea == null) return '—'
  const v = convertOrNull(ds, skuCode, ea, unit)
  return v == null ? 'n/a' : fmtQty(v, unit)
}

/** Sum EA quantities in a target unit, tracking SKUs excluded for lack of a weight conversion. */
export function sumUnit(ds: Dataset, items: { skuCode: string; ea: number | null }[], unit: Unit) {
  let total = 0
  const excluded = new Set<string>()
  for (const it of items) {
    if (it.ea == null) continue
    const v = convertOrNull(ds, it.skuCode, it.ea, unit)
    if (v == null) excluded.add(it.skuCode)
    else total += v
  }
  return { total, excluded: [...excluded] }
}

export function operatingDays(ds: Dataset, vendor: Vendor, from: ISODate, to: ISODate): ISODate[] {
  if (to < from) return []
  return eachDay(from, to).filter((d) => operatingDayInfo(ds, vendor, d).operating)
}

export function MtExclusionNote({ ds, codes }: { ds: Dataset; codes: string[] }) {
  if (!codes.length) return null
  return (
    <p className="text-dense text-ink-muted">
      <span className="font-semibold text-warn">Excluded from MT totals:</span> {codes.map((c) => `${shortSkuName(ds.idx.sku.get(c)?.name ?? c)} (${c})`).join(', ')} – no kg/EA weight conversion in master data.
    </p>
  )
}
