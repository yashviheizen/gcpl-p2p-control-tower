// Product hierarchy: searchable, keyboard-accessible tree (Category → Brand → Product line → DT → SKU) + flat table.
import { ChevronRight, ExternalLink, ListTree, Pencil, Plus, Table2 } from 'lucide-react'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import type { DT, Sku } from '@/data/types'
import type { Dataset } from '@/data/dataset'
import { Badge, Button, Card, EmptyState, KeyVal, Segmented, TableWrap, cx, td, tdNum, th, useOriginState } from '@/components/ui'
import { fmtDate } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import { DtModal, SkuModal } from './MasterForms'
import { Highlight, SearchBox } from './shared'

type Level = 'category' | 'brand' | 'productLine' | 'dt' | 'sku'
const LEVEL_LABEL: Record<Level, string> = {
  category: 'Category',
  brand: 'Brand',
  productLine: 'Product line',
  dt: 'DT',
  sku: 'SKU',
}

interface TNode {
  id: string // `${level}:${key}`
  level: Level
  key: string
  label: string
  code?: string
  children: TNode[]
  skuCount: number
  parentId: string | null
}

function buildTree(ds: Dataset): TNode[] {
  const mk = (level: Level, key: string, label: string, parentId: string | null, code?: string): TNode => ({
    id: `${level}:${key}`,
    level,
    key,
    label,
    code,
    children: [],
    skuCount: 0,
    parentId,
  })
  const roots = ds.categories.map((c) => {
    const cn = mk('category', c.id, c.name, null)
    cn.children = ds.brands
      .filter((b) => b.categoryId === c.id)
      .map((b) => {
        const bn = mk('brand', b.id, b.name, cn.id)
        bn.children = ds.productLines
          .filter((p) => p.brandId === b.id)
          .map((p) => {
            const pn = mk('productLine', p.id, p.name, bn.id)
            pn.children = ds.dts
              .filter((d) => d.productLineId === p.id)
              .map((d) => {
                const dn = mk('dt', d.code, d.name, pn.id, d.code)
                dn.children = ds.skus
                  .filter((s) => s.dtCode === d.code)
                  .map((s) => ({
                    ...mk('sku', s.code, s.name, dn.id, s.code),
                    skuCount: 1,
                  }))
                return dn
              })
            return pn
          })
        return bn
      })
    return cn
  })
  const count = (n: TNode): number => (n.level === 'sku' ? 1 : (n.skuCount = n.children.reduce((a, c) => a + count(c), 0)))
  roots.forEach(count)
  return roots
}

function index(roots: TNode[]) {
  const m = new Map<string, TNode>()
  const walk = (n: TNode) => {
    m.set(n.id, n)
    n.children.forEach(walk)
  }
  roots.forEach(walk)
  return m
}

const matches = (n: TNode, q: string) => n.label.toLowerCase().includes(q) || (n.code ?? '').toLowerCase().includes(q)

export function HierarchyTab({ ds, canEdit }: { ds: Dataset; canEdit: boolean }) {
  const [view, setView] = useState<'tree' | 'table'>('tree')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(ds.categories.map((c) => `category:${c.id}`)))
  const [selected, setSelected] = useState<string | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const [editSku, setEditSku] = useState<Sku | 'new' | null>(null)
  const [editDt, setEditDt] = useState<DT | 'new' | null>(null)
  const treeRef = useRef<HTMLUListElement>(null)

  const roots = useMemo(() => buildTree(ds), [ds])
  const byId = useMemo(() => index(roots), [roots])
  const q = query.trim().toLowerCase()

  // When searching: keep matching nodes + their ancestors (path), auto-expanded; descendants of a match stay visible.
  const { keep, onPath, matchCount } = useMemo(() => {
    const keep = new Set<string>()
    const onPath = new Set<string>()
    let matchCount = 0
    if (!q) return { keep, onPath, matchCount }
    const walk = (n: TNode, ancestorMatched: boolean): boolean => {
      const self = matches(n, q)
      if (self) matchCount++
      let childAny = false
      for (const c of n.children) if (walk(c, ancestorMatched || self)) childAny = true
      const any = self || childAny
      if (any || ancestorMatched) keep.add(n.id)
      // Expand every node with a matching descendant – including nodes that match themselves – so all hits are revealed.
      if (childAny) onPath.add(n.id)
      return any
    }
    roots.forEach((r) => walk(r, false))
    return { keep, onPath, matchCount }
  }, [q, roots])

  const isOpen = (id: string) => (q ? onPath.has(id) || expanded.has(id) : expanded.has(id))
  const visible = useMemo(() => {
    const out: { node: TNode; depth: number; pos: number; size: number }[] = []
    const walk = (list: TNode[], depth: number) => {
      const shown = q ? list.filter((n) => keep.has(n.id)) : list
      shown.forEach((n, i) => {
        out.push({ node: n, depth, pos: i + 1, size: shown.length })
        if (n.children.length && isOpen(n.id)) walk(n.children, depth + 1)
      })
    }
    walk(roots, 0)
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roots, q, keep, onPath, expanded])

  const toggle = (id: string, open?: boolean) =>
    setExpanded((s) => {
      const n = new Set(s)
      const want = open ?? !isOpen(id)
      if (want) n.add(id)
      else n.delete(id)
      return n
    })

  const focusNode = (id: string) => {
    setFocused(id)
    requestAnimationFrame(() => treeRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus())
  }

  const onKey = (e: KeyboardEvent, node: TNode) => {
    const i = visible.findIndex((v) => v.node.id === node.id)
    const open = node.children.length > 0 && isOpen(node.id)
    switch (e.key) {
      case 'ArrowDown':
        if (i < visible.length - 1) focusNode(visible[i + 1].node.id)
        break
      case 'ArrowUp':
        if (i > 0) focusNode(visible[i - 1].node.id)
        break
      case 'ArrowRight':
        if (node.children.length && !open) toggle(node.id, true)
        else if (open) focusNode(node.children.find((c) => !q || keep.has(c.id))!.id)
        break
      case 'ArrowLeft':
        if (open) toggle(node.id, false)
        else if (node.parentId) focusNode(node.parentId)
        break
      case 'Home':
        focusNode(visible[0].node.id)
        break
      case 'End':
        focusNode(visible[visible.length - 1].node.id)
        break
      case 'Enter':
      case ' ':
        setSelected(node.id)
        break
      default:
        return
    }
    e.preventDefault()
  }

  const sel = selected ? (byId.get(selected) ?? null) : null
  const tabStop = focused && visible.some((v) => v.node.id === focused) ? focused : visible[0]?.node.id

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Hierarchy view"
          value={view}
          onChange={setView}
          options={[
            { value: 'tree', label: 'Tree', icon: ListTree },
            { value: 'table', label: 'Table', icon: Table2 },
          ]}
        />
        <SearchBox className="w-[320px] max-w-full" value={query} onChange={setQuery} label="Search hierarchy by name or code" placeholder="Search name or code (e.g. Musk, FG2002, DT-FAB)…" />
        {q && (
          <span className="text-dense text-ink-muted" role="status">
            {matchCount} match{matchCount === 1 ? '' : 'es'}
          </span>
        )}
        {canEdit && (
          <div className="ml-auto flex gap-2">
            <Button size="sm" icon={Plus} onClick={() => setEditDt('new')}>
              Add DT
            </Button>
            <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditSku('new')}>
              Add FG SKU
            </Button>
          </div>
        )}
      </div>

      {view === 'tree' ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card bodyClass="p-2" title="Product hierarchy" subtitle="Category → Brand → Product line → DT → SKU · counts are SKUs">
            {visible.length === 0 ? (
              <EmptyState title="No matches">Nothing in the hierarchy matches “{query}”. Try a SKU code, DT code or part of a product name.</EmptyState>
            ) : (
              <ul ref={treeRef} role="tree" aria-label="Product hierarchy" className="scroll-thin max-h-[560px] overflow-auto">
                {visible.map(({ node, depth, pos, size }) => {
                  const open = isOpen(node.id)
                  const hit = q && matches(node, q)
                  const path = q && onPath.has(node.id)
                  return (
                    <li
                      key={node.id}
                      role="treeitem"
                      data-id={node.id}
                      aria-level={depth + 1}
                      aria-posinset={pos}
                      aria-setsize={size}
                      aria-expanded={node.children.length ? open : undefined}
                      aria-selected={selected === node.id}
                      tabIndex={tabStop === node.id ? 0 : -1}
                      onFocus={() => setFocused(node.id)}
                      onKeyDown={(e) => onKey(e, node)}
                      onClick={() => {
                        setSelected(node.id)
                        setFocused(node.id)
                      }}
                      className={cx(
                        'flex h-8 cursor-pointer items-center gap-1.5 rounded-md pr-2 text-body outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        selected === node.id ? 'bg-accent-soft text-accent-ink' : 'hover:bg-surface-muted',
                        path && 'font-medium text-accent-ink',
                      )}
                      style={{ paddingLeft: 6 + depth * 18 }}
                    >
                      {node.children.length ? (
                        <span
                          aria-hidden
                          onClick={(e) => {
                            e.stopPropagation()
                            toggle(node.id)
                          }}
                          className="inline-flex h-5 w-5 items-center justify-center rounded text-ink-subtle hover:bg-black/5"
                        >
                          <ChevronRight size={14} className={cx('transition-transform', open && 'rotate-90')} />
                        </span>
                      ) : (
                        <span className="w-5" aria-hidden />
                      )}
                      <span className="w-[88px] shrink-0 text-label font-medium whitespace-nowrap text-ink-subtle">{LEVEL_LABEL[node.level]}</span>
                      <span className={cx('min-w-0 flex-1 truncate', hit && 'font-semibold text-ink')}>
                        <Highlight text={node.label} q={q} />
                        {node.code && node.level === 'sku' && (
                          <span className="ml-1.5 font-mono text-label text-ink-subtle">
                            <Highlight text={node.code} q={q} />
                          </span>
                        )}
                        {node.code && node.level === 'dt' && (
                          <span className="ml-1.5 font-mono text-label text-ink-subtle">
                            <Highlight text={node.code} q={q} />
                          </span>
                        )}
                      </span>
                      {node.level !== 'sku' && (
                        <span className="num shrink-0 rounded-full bg-none-soft px-1.5 text-label text-ink-muted" aria-label={`${node.skuCount} SKUs`}>
                          {node.skuCount}
                        </span>
                      )}
                      {node.level === 'sku' && (ds.idx.skuVendors.get(node.key)?.length ?? 0) > 1 && <Badge tone="info">{ds.idx.skuVendors.get(node.key)!.length} vendors</Badge>}
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="px-2 pt-2 text-label text-ink-subtle">Keyboard: ↑/↓ move · → expand · ← collapse / parent · Enter select. Vendors are shown as relationships in the detail panel, not as tree branches.</p>
          </Card>
          <NodeDetail ds={ds} node={sel} byId={byId} canEdit={canEdit} onEditSku={setEditSku} onEditDt={setEditDt} onSelect={(id) => setSelected(id)} />
        </div>
      ) : (
        <SkuTable ds={ds} q={q} canEdit={canEdit} onEdit={setEditSku} />
      )}

      {editSku && <SkuModal ds={ds} sku={editSku === 'new' ? null : editSku} onClose={() => setEditSku(null)} />}
      {editDt && <DtModal ds={ds} dt={editDt === 'new' ? null : editDt} onClose={() => setEditDt(null)} />}
    </div>
  )
}

function NodeDetail({
  ds,
  node,
  byId,
  canEdit,
  onEditSku,
  onEditDt,
  onSelect,
}: {
  ds: Dataset
  node: TNode | null
  byId: Map<string, TNode>
  canEdit: boolean
  onEditSku: (s: Sku) => void
  onEditDt: (d: DT) => void
  onSelect: (id: string) => void
}) {
  const origin = useOriginState('Master data')
  if (!node)
    return (
      <Card title="Details">
        <EmptyState icon={ListTree} title="Select a node">
          Choose any category, brand, product line, DT or SKU to see its attributes and vendor relationships.
        </EmptyState>
      </Card>
    )
  const path: TNode[] = []
  for (let n: TNode | undefined = node; n; n = n.parentId ? byId.get(n.parentId) : undefined) path.unshift(n)

  const skuCodes: string[] = []
  const collect = (n: TNode) => (n.level === 'sku' ? skuCodes.push(n.key) : n.children.forEach(collect))
  collect(node)
  const vendorIds = [...new Set(skuCodes.flatMap((c) => ds.idx.skuVendors.get(c) ?? []))]

  const sku = node.level === 'sku' ? ds.idx.sku.get(node.key)! : null
  const dt = node.level === 'dt' ? ds.dts.find((d) => d.code === node.key)! : null

  return (
    <Card
      title={node.label}
      subtitle={LEVEL_LABEL[node.level]}
      actions={
        canEdit && sku ? (
          <Button size="sm" icon={Pencil} onClick={() => onEditSku(sku)}>
            Edit SKU
          </Button>
        ) : canEdit && dt ? (
          <Button size="sm" icon={Pencil} onClick={() => onEditDt(dt)}>
            Edit DT
          </Button>
        ) : undefined
      }
    >
      <nav aria-label="Hierarchy path" className="mb-3 flex flex-wrap items-center gap-1 text-dense text-ink-muted">
        {path.map((p, i) => (
          <span key={p.id} className="inline-flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} aria-hidden />}
            {p.id === node.id ? (
              <span className="font-medium text-ink">{p.label}</span>
            ) : (
              <button type="button" className="hover:text-accent-ink hover:underline" onClick={() => onSelect(p.id)}>
                {p.label}
              </button>
            )}
          </span>
        ))}
      </nav>

      {sku ? (
        <div className="space-y-4">
          <KeyVal
            items={[
              {
                k: 'FG code',
                v: <span className="font-mono">{sku.code}</span>,
              },
              { k: 'DT', v: <span className="font-mono">{sku.dtCode}</span> },
              { k: 'Case pack (EA per CS)', v: fmtNum(sku.casePack) },
              {
                k: 'Weight (kg per EA)',
                v: sku.kgPerEa != null ? fmtNum(sku.kgPerEa, 3) : <Badge tone="warn">No weight conversion – excluded from MT</Badge>,
              },
              { k: 'Shelf life', v: `${fmtNum(sku.shelfLifeDays)} days` },
              {
                k: 'Status',
                v: sku.active ? <Badge tone="ok">Active</Badge> : <Badge tone="none">Inactive</Badge>,
              },
            ]}
          />
          <VendorRelations ds={ds} skuCode={sku.code} />
          <Link to={`/sku/${sku.code}`} state={origin} className="inline-flex items-center gap-1 text-body font-medium text-accent-ink hover:underline">
            Open SKU investigation <ExternalLink size={13} aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <KeyVal
            items={[
              { k: 'SKUs', v: fmtNum(skuCodes.length) },
              {
                k: 'Children',
                v: `${node.children.length} ${node.children[0] ? LEVEL_LABEL[node.children[0].level] + (node.children.length === 1 ? '' : 's') : ''}`,
              },
              {
                k: 'Vendors producing',
                v: vendorIds.length ? vendorIds.map((v) => ds.idx.vendor.get(v)?.name).join(', ') : '—',
              },
              ...(node.code
                ? [
                    {
                      k: 'Code',
                      v: <span className="font-mono">{node.code}</span>,
                    },
                  ]
                : []),
            ]}
          />
          {node.children.length > 0 && (
            <div>
              <h3 className="mb-1 text-dense font-semibold text-ink-muted">Contains</h3>
              <ul className="space-y-0.5">
                {node.children.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => onSelect(c.id)} className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-body hover:bg-surface-muted">
                      <span className="truncate">{c.label}</span>
                      <span className="num text-label text-ink-subtle">{c.level === 'sku' ? <span className="font-mono">{c.code}</span> : `${c.skuCount} SKU`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function VendorRelations({ ds, skuCode }: { ds: Dataset; skuCode: string }) {
  const maps = ds.vendorSkuMaps.filter((m) => m.skuCode === skuCode)
  return (
    <div>
      <h3 className="mb-1 text-dense font-semibold text-ink-muted">Vendor relationships ({maps.length})</h3>
      {maps.length === 0 ? (
        <p className="text-dense text-ink-muted">Not mapped to any vendor.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {maps.map((m) => {
            const v = ds.idx.vendor.get(m.vendorId)
            const codes = ds.codeMappings.filter((c) => c.vendorId === m.vendorId && c.skuCode === skuCode)
            return (
              <li key={m.vendorId} className="flex items-start justify-between gap-2 px-2.5 py-1.5 text-dense">
                <div className="min-w-0">
                  <div className="font-medium text-ink">
                    {v?.name ?? m.vendorId} <span className="font-mono text-label text-ink-subtle">{v?.code}</span>
                  </div>
                  <div className="text-label text-ink-subtle">
                    Since {fmtDate(m.since, true)}
                    {codes.length > 0 && <> · vendor code {codes.map((c) => c.vendorCode).join(', ')}</>}
                  </div>
                </div>
                <Badge tone={m.primary ? 'accent' : 'none'}>{m.primary ? 'Primary' : 'Secondary'}</Badge>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function SkuTable({ ds, q, canEdit, onEdit }: { ds: Dataset; q: string; canEdit: boolean; onEdit: (s: Sku) => void }) {
  const origin = useOriginState('Master data')
  const rows = ds.skus.map((s) => ({ s, h: ds.idx.hierarchy.get(s.code) })).filter(({ s, h }) => !q || [s.code, s.name, s.dtCode, h?.dt.name, h?.productLine.name, h?.brand.name, h?.category.name].some((x) => x?.toLowerCase().includes(q)))
  return (
    <Card bodyClass="p-0" title="FG SKUs" subtitle={`${rows.length} of ${ds.skus.length} SKUs`}>
      {rows.length === 0 ? (
        <EmptyState title="No SKUs match">Clear the search to see all SKUs.</EmptyState>
      ) : (
        <TableWrap maxHeight={560}>
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={cx(th, 'sticky left-0 z-20')}>SKU</th>
                <th className={th}>Category</th>
                <th className={th}>Brand</th>
                <th className={th}>Product line</th>
                <th className={th}>DT</th>
                <th className={cx(th, 'text-right')}>EA/CS</th>
                <th className={cx(th, 'text-right')}>kg/EA</th>
                <th className={cx(th, 'text-right')}>Shelf life (d)</th>
                <th className={th}>Vendors</th>
                {canEdit && (
                  <th className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, h }) => (
                <tr key={s.code} className="hover:bg-surface-muted/60">
                  <td className={cx(td, 'sticky left-0 bg-surface')}>
                    <Link to={`/sku/${s.code}`} state={origin} className="font-medium text-accent-ink hover:underline">
                      <Highlight text={s.name} q={q} />
                    </Link>
                    <div className="font-mono text-label text-ink-subtle">
                      <Highlight text={s.code} q={q} />
                    </div>
                  </td>
                  <td className={cx(td, 'whitespace-nowrap')}>{h?.category.name}</td>
                  <td className={cx(td, 'whitespace-nowrap')}>{h?.brand.name}</td>
                  <td className={cx(td, 'whitespace-nowrap')}>{h?.productLine.name}</td>
                  <td className={cx(td, 'whitespace-nowrap')}>
                    {h?.dt.name} <span className="font-mono text-label text-ink-subtle">{s.dtCode}</span>
                  </td>
                  <td className={tdNum}>{fmtNum(s.casePack)}</td>
                  <td className={tdNum}>{s.kgPerEa != null ? fmtNum(s.kgPerEa, 3) : <Badge tone="warn">No MT</Badge>}</td>
                  <td className={tdNum}>{fmtNum(s.shelfLifeDays)}</td>
                  <td className={cx(td, 'whitespace-nowrap')}>{(ds.idx.skuVendors.get(s.code) ?? []).map((v) => ds.idx.vendor.get(v)?.name).join(', ') || '—'}</td>
                  {canEdit && (
                    <td className={td}>
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEdit(s)} aria-label={`Edit ${s.code}`}>
                        Edit
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  )
}
