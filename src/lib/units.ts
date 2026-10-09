import type { Sku, Unit } from '@/data/types'

/**
 * FG unit conversion. Quantities are stored in EA.
 *  EA → CS: divide by the SKU's case pack (EA per case). Explicit, per SKU.
 *  EA → MT: EA × kg-per-EA ÷ 1000 — only where a weight conversion exists.
 * Never apply these to RM/PM materials (they carry their own UOM).
 */
export function convertFg(qtyEa: number, sku: Sku, unit: Unit): number | null {
  if (unit === 'EA') return qtyEa
  if (unit === 'CS') return qtyEa / sku.casePack
  if (sku.kgPerEa == null) return null
  return (qtyEa * sku.kgPerEa) / 1000
}

export const UNIT_LABEL: Record<Unit, string> = {
  EA: 'EA (each)',
  CS: 'CS (cases)',
  MT: 'MT (metric tonnes)',
}

export function unitDecimals(unit: Unit): number {
  return unit === 'MT' ? 2 : unit === 'CS' ? 0 : 0
}

export interface UnitExclusion {
  skuCode: string
  reason: string
}

/** Accumulates quantities across SKUs in a target unit, tracking SKUs that cannot be converted. */
export class UnitAccumulator {
  total = 0
  excluded = new Map<string, UnitExclusion>()
  private unit: Unit
  constructor(unit: Unit) {
    this.unit = unit
  }
  add(qtyEa: number, sku: Sku): number | null {
    const v = convertFg(qtyEa, sku, this.unit)
    if (v == null) {
      this.excluded.set(sku.code, {
        skuCode: sku.code,
        reason: 'No weight conversion (kg/EA) in master data – excluded from MT totals',
      })
      return null
    }
    this.total += v
    return v
  }
}
