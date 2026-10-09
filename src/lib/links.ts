// Links that carry analysis-filter overrides. The FilterProvider applies `f_*` params on arrival,
// then strips them from the URL – so any drilldown lands on a correctly filtered screen.
export interface FilterPatch {
  vendor?: string
  sku?: string
  dt?: string
  from?: string
  to?: string
}

export function filterLink(path: string, patch: FilterPatch, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams()
  if (patch.vendor) p.set('f_vendor', patch.vendor)
  if (patch.sku) p.set('f_sku', patch.sku)
  if (patch.dt) p.set('f_dt', patch.dt)
  if (patch.from) p.set('f_from', patch.from)
  if (patch.to) p.set('f_to', patch.to)
  for (const [k, v] of Object.entries(extra)) p.set(k, v)
  const q = p.toString()
  return q ? `${path}?${q}` : path
}
