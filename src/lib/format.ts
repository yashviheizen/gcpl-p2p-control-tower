import type { Unit } from '@/data/types'

const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
})
const nf2 = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})

/** Indian digit grouping (e.g. 12,34,567) – familiar to GCPL planners. */
export function fmtNum(n: number | null | undefined, decimals = 0): string {
  if (n == null || Number.isNaN(n)) return '—'
  if (decimals === 2) return nf2.format(n)
  if (decimals === 1) return nf1.format(n)
  return nf0.format(n)
}

export function fmtQty(n: number | null | undefined, unit: Unit, withUnit = false): string {
  if (n == null) return '—'
  const s = fmtNum(n, unit === 'MT' ? 2 : 0)
  return withUnit ? `${s} ${unit}` : s
}

/** Compact: 12.3L (lakh) / 1.2Cr. Used only in tight chart axes. */
export function fmtCompact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`
  if (a >= 1e5) return `${(n / 1e5).toFixed(1)}L`
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return a < 10 && a % 1 ? n.toFixed(2) : String(Math.round(n))
}

export function fmtPct(n: number | null | undefined, decimals = 0): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(decimals)}%`
}

export function fmtSigned(n: number | null | undefined, unit: Unit): string {
  if (n == null) return '—'
  const s = fmtQty(Math.abs(n), unit)
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s
}

/** Short readable SKU name for titles and tight columns (full name stays in detail views). */
export function shortSkuName(name: string): string {
  return name
    .replace('Good Knight', 'GK')
    .replace('Godrej FAB Liquid Detergent', 'FAB Liquid')
    .replace('Godrej FAB', 'FAB')
    .replace(/ \(10 pc\)$/, '')
}
