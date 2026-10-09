import { Building2, CalendarRange, Check, ChevronDown, Layers, RotateCcw, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Unit } from '@/data/types'
import { DEMO_TODAY, fmtRange, LATEST_DUE_DATE } from '@/lib/dates'
import { DEFAULT_FILTERS, isDefaultFilters, useFilters, type FilterKey } from '@/lib/filters'
import type { HierarchyLevel, HierarchySel } from '@/lib/metrics'
import { useDataset } from '@/lib/store'
import { Segmented, cx } from './ui'

const PRESETS: { label: string; from: string; to: string }[] = [
  { label: 'Month to date (Oct)', from: '2026-10-01', to: DEMO_TODAY },
  { label: 'Last 7 days', from: '2026-10-02', to: LATEST_DUE_DATE },
  { label: 'October 2026 (full month)', from: '2026-10-01', to: '2026-10-31' },
  { label: 'September 2026', from: '2026-09-01', to: '2026-09-30' },
  { label: 'Since 1 Sep', from: '2026-09-01', to: DEMO_TODAY },
]

function Popover({ button, children, open, setOpen, width = 300, label }: { button: ReactNode; children: ReactNode; open: boolean; setOpen: (o: boolean) => void; width?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => {
      document.removeEventListener('mousedown', h)
      document.removeEventListener('keydown', k)
    }
  }, [open, setOpen])
  return (
    <div ref={ref} className="relative">
      {button}
      {open && (
        <div role="dialog" aria-label={label} className="absolute top-10 left-0 z-40 max-w-[calc(100vw-32px)] rounded-md border border-line bg-surface p-2 shadow-[var(--shadow-pop)]" style={{ width }}>
          {children}
        </div>
      )}
    </div>
  )
}

function FieldButton({
  icon: Icon,
  label,
  value,
  active,
  disabled,
  note,
  onClick,
  expanded,
  onClear,
}: {
  icon: typeof Search
  label: string
  value: string
  active: boolean
  disabled: boolean
  note?: string
  onClick: () => void
  expanded: boolean
  onClear?: () => void
}) {
  return (
    <span
      className={cx(
        'inline-flex h-[30px] max-w-[280px] items-center rounded-[var(--radius-control)] border text-body',
        disabled && 'opacity-45',
        active && !disabled ? 'border-accent/50 bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink',
      )}
      title={disabled ? (note ?? 'Not used on this page') : undefined}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-expanded={expanded}
        aria-haspopup="dialog"
        aria-label={`${label}: ${value}${disabled ? ` (${note ?? 'not used on this page'})` : ''}`}
        className="inline-flex h-full min-w-0 items-center gap-1.5 rounded-[var(--radius-control)] pr-2 pl-2.5 disabled:cursor-not-allowed"
      >
        <Icon size={15} aria-hidden className={cx('shrink-0', !active && 'text-ink-subtle')} />
        <span className="truncate font-medium">{value}</span>
        {!(active && onClear) && <ChevronDown size={14} aria-hidden className="shrink-0 text-ink-subtle" />}
      </button>
      {active && onClear && !disabled && (
        <button type="button" onClick={onClear} aria-label={`Clear ${label.toLowerCase()} filter`} className="mr-1 rounded p-1 hover:bg-accent/15">
          <X size={14} aria-hidden />
        </button>
      )}
    </span>
  )
}

export function FilterBar() {
  const { filters, setFilters, reset, applicable, notes } = useFilters()
  const ds = useDataset()
  const [open, setOpen] = useState<null | 'date' | 'vendor' | 'product'>(null)
  const [q, setQ] = useState('')
  const can = (k: FilterKey) => applicable.includes(k)

  const hierarchyNodes = useMemo(() => {
    const nodes: (HierarchySel & { path: string; depth: number })[] = []
    for (const c of ds.categories) {
      nodes.push({
        level: 'category',
        id: c.id,
        label: c.name,
        path: 'Category',
        depth: 0,
      })
      for (const b of ds.brands.filter((x) => x.categoryId === c.id)) {
        nodes.push({
          level: 'brand',
          id: b.id,
          label: b.name,
          path: c.name,
          depth: 1,
        })
        for (const p of ds.productLines.filter((x) => x.brandId === b.id)) {
          nodes.push({
            level: 'productLine',
            id: p.id,
            label: p.name,
            path: `${c.name} › ${b.name}`,
            depth: 2,
          })
          for (const d of ds.dts.filter((x) => x.productLineId === p.id)) {
            nodes.push({
              level: 'dt',
              id: d.code,
              label: `${d.code} · ${d.name}`,
              path: `${b.name} › ${p.name}`,
              depth: 3,
            })
            for (const s of ds.skus.filter((x) => x.dtCode === d.code))
              nodes.push({
                level: 'sku',
                id: s.code,
                label: `${s.name} (${s.code})`,
                path: `${b.name} › ${p.name} › ${d.code}`,
                depth: 4,
              })
          }
        }
      }
    }
    return nodes
  }, [ds])
  const shownNodes = q.trim() ? hierarchyNodes.filter((n) => `${n.label} ${n.id}`.toLowerCase().includes(q.trim().toLowerCase())) : hierarchyNodes

  const vendorLabel = !filters.vendorIds.length ? 'All vendors' : filters.vendorIds.length <= 2 ? filters.vendorIds.map((v) => ds.idx.vendor.get(v)?.name ?? v).join(', ') : `${filters.vendorIds.length} vendors`
  const levelName: Record<HierarchyLevel, string> = {
    category: 'Category',
    brand: 'Brand',
    productLine: 'Product line',
    dt: 'DT',
    sku: 'SKU',
  }

  const dateActive = filters.dateFrom !== DEFAULT_FILTERS.dateFrom || filters.dateTo !== DEFAULT_FILTERS.dateTo
  const isDefault = isDefaultFilters(filters)

  return (
    <div className="border-b border-line bg-canvas px-5 py-1.5" role="region" aria-label="Global filters (apply across pages)">
      <div className="flex flex-wrap items-center gap-2">
        <Popover
          label="Date range"
          open={open === 'date'}
          setOpen={(o) => setOpen(o ? 'date' : null)}
          width={280}
          button={
            <FieldButton
              icon={CalendarRange}
              label="Period"
              value={fmtRange(filters.dateFrom, filters.dateTo)}
              active={dateActive}
              disabled={!can('date')}
              note={notes.date}
              onClick={() => setOpen(open === 'date' ? null : 'date')}
              expanded={open === 'date'}
              onClear={() =>
                setFilters({
                  dateFrom: DEFAULT_FILTERS.dateFrom,
                  dateTo: DEFAULT_FILTERS.dateTo,
                })
              }
            />
          }
        >
          <div className="flex flex-col gap-1">
            {PRESETS.map((p) => {
              const on = p.from === filters.dateFrom && p.to === filters.dateTo
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setFilters({ dateFrom: p.from, dateTo: p.to })
                    setOpen(null)
                  }}
                  className={cx('flex items-center justify-between rounded px-2 py-1.5 text-left text-dense hover:bg-surface-muted', on && 'font-semibold text-accent-ink')}
                >
                  {p.label} {on && <Check size={14} aria-hidden />}
                </button>
              )
            })}
            <div className="mt-1 grid grid-cols-2 gap-2 border-t border-line pt-2">
              <label className="text-label text-ink-muted">
                From
                <input
                  type="date"
                  value={filters.dateFrom}
                  min="2026-09-01"
                  max="2026-10-31"
                  onChange={(e) =>
                    e.target.value &&
                    setFilters({
                      dateFrom: e.target.value,
                      dateTo: e.target.value > filters.dateTo ? e.target.value : filters.dateTo,
                    })
                  }
                  className="mt-0.5 h-8 w-full rounded border border-line-strong px-1.5 text-dense text-ink"
                />
              </label>
              <label className="text-label text-ink-muted">
                To
                <input
                  type="date"
                  value={filters.dateTo}
                  min={filters.dateFrom}
                  max="2026-10-31"
                  onChange={(e) => e.target.value && setFilters({ dateTo: e.target.value })}
                  className="mt-0.5 h-8 w-full rounded border border-line-strong px-1.5 text-dense text-ink"
                />
              </label>
            </div>
            <p className="px-1 pt-1 text-label text-ink-subtle">Demo data covers 1 Sep – 8 Oct 2026 actuals; plans run to 31 Oct.</p>
          </div>
        </Popover>

        <Popover
          label="Vendors"
          open={open === 'vendor'}
          setOpen={(o) => setOpen(o ? 'vendor' : null)}
          width={240}
          button={
            <FieldButton
              icon={Building2}
              label="Vendor"
              value={vendorLabel}
              active={filters.vendorIds.length > 0}
              disabled={!can('vendor')}
              note={notes.vendor}
              onClick={() => setOpen(open === 'vendor' ? null : 'vendor')}
              expanded={open === 'vendor'}
              onClear={() => setFilters({ vendorIds: [] })}
            />
          }
        >
          <fieldset>
            <legend className="sr-only">Select vendors</legend>
            {ds.vendors.map((v) => {
              const on = filters.vendorIds.includes(v.id)
              return (
                <label key={v.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-dense hover:bg-surface-muted">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setFilters({
                        vendorIds: on ? filters.vendorIds.filter((x) => x !== v.id) : [...filters.vendorIds, v.id],
                      })
                    }
                    className="accent-[var(--color-accent)]"
                  />
                  <span className="flex-1">{v.name}</span>
                  <span className="text-label text-ink-subtle">{v.location.split(',')[0]}</span>
                </label>
              )
            })}
            <button type="button" className="mt-1 w-full rounded px-2 py-1 text-left text-label text-accent-ink hover:bg-surface-muted" onClick={() => setFilters({ vendorIds: [] })}>
              All vendors
            </button>
          </fieldset>
        </Popover>

        <Popover
          label="Product hierarchy"
          open={open === 'product'}
          setOpen={(o) => setOpen(o ? 'product' : null)}
          width={380}
          button={
            <FieldButton
              icon={Layers}
              label="Product"
              value={filters.hierarchy ? filters.hierarchy.label : 'All products'}
              active={!!filters.hierarchy}
              disabled={!can('product')}
              note={notes.product}
              onClick={() => setOpen(open === 'product' ? null : 'product')}
              expanded={open === 'product'}
              onClear={() => setFilters({ hierarchy: null })}
            />
          }
        >
          <div className="relative mb-1.5">
            <Search size={14} className="absolute top-2 left-2 text-ink-subtle" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search category, brand, line, DT or SKU"
              aria-label="Search product hierarchy"
              className="h-8 w-full rounded border border-line-strong pl-7 text-dense"
            />
          </div>
          <ul className="max-h-[320px] overflow-y-auto" role="listbox" aria-label="Product hierarchy">
            <li>
              <button
                type="button"
                className="w-full rounded px-2 py-1 text-left text-dense text-accent-ink hover:bg-surface-muted"
                onClick={() => {
                  setFilters({ hierarchy: null })
                  setOpen(null)
                }}
              >
                All products
              </button>
            </li>
            {shownNodes.map((n) => (
              <li key={`${n.level}-${n.id}`} role="option" aria-selected={filters.hierarchy?.id === n.id}>
                <button
                  type="button"
                  onClick={() => {
                    setFilters({
                      hierarchy: { level: n.level, id: n.id, label: n.label },
                    })
                    setOpen(null)
                    setQ('')
                  }}
                  className={cx('flex w-full flex-col rounded px-2 py-1 text-left hover:bg-surface-muted', filters.hierarchy?.id === n.id && 'bg-accent-soft')}
                  style={{ paddingLeft: q ? 8 : 8 + n.depth * 12 }}
                >
                  <span className="text-dense">
                    <span className="mr-1 text-label font-medium text-ink-subtle">{levelName[n.level]}</span>
                    {n.label}
                  </span>
                  {q && <span className="text-label text-ink-subtle">{n.path}</span>}
                </button>
              </li>
            ))}
            {!shownNodes.length && <li className="px-2 py-3 text-dense text-ink-muted">No matches for “{q}”.</li>}
          </ul>
        </Popover>

        <label className={cx('relative inline-flex items-center', !can('product') && 'opacity-45')} title={!can('product') ? (notes.product ?? 'Not used on this page') : undefined}>
          <span className="sr-only">Search SKU or DT code / name</span>
          <Search size={15} className="absolute left-2.5 text-ink-subtle" aria-hidden />
          <input
            type="search"
            value={filters.search}
            disabled={!can('product')}
            onChange={(e) => setFilters({ search: e.target.value })}
            placeholder="Search SKU / DT"
            className={cx(
              'h-[30px] w-[200px] rounded-[var(--radius-control)] border pr-7 pl-8 text-body placeholder:text-ink-subtle disabled:cursor-not-allowed [&::-webkit-search-cancel-button]:hidden',
              filters.search ? 'border-accent/50 bg-accent-soft' : 'border-line bg-surface',
            )}
          />
          {filters.search && can('product') && (
            <button type="button" onClick={() => setFilters({ search: '' })} aria-label="Clear search" className="absolute right-1 rounded p-1 text-ink-muted hover:bg-black/5">
              <X size={14} aria-hidden />
            </button>
          )}
        </label>

        <div className={cx('inline-flex items-center gap-1.5', !can('unit') && 'opacity-45')} title={!can('unit') ? (notes.unit ?? 'Not used on this page') : undefined}>
          <span className="text-dense text-ink-muted">Unit</span>
          <Segmented<Unit>
            label="Display unit"
            size="sm"
            value={filters.unit}
            onChange={(u) => can('unit') && setFilters({ unit: u })}
            options={[
              { value: 'EA', label: 'EA', disabled: !can('unit') },
              { value: 'CS', label: 'CS', disabled: !can('unit') },
              { value: 'MT', label: 'MT', disabled: !can('unit') },
            ]}
          />
        </div>

        {!isDefault && (
          <button type="button" onClick={reset} className="inline-flex h-[30px] items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-body font-medium text-accent-ink hover:bg-accent-soft">
            <RotateCcw size={14} aria-hidden /> Reset
          </button>
        )}
      </div>
    </div>
  )
}
