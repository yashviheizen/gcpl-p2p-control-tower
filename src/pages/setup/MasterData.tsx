import { FlaskConical, Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { CodeMapping, OperatingCalendar, Parameter, Sku, Vendor } from '@/data/types'
import type { Dataset } from '@/data/dataset'
import { AssumptionNote, Badge, Button, Callout, Card, EmptyState, IconButton, LocalFilters, PageHeader, Pager, Select, TableWrap, Tabs, cx, td, tdNum, th } from '@/components/ui'
import { fmtDate, fmtDow } from '@/lib/dates'
import { usePageFilters } from '@/lib/filters'
import { fmtNum } from '@/lib/format'
import { useAppState, useDataset, usePermissions } from '@/lib/store'
import { HierarchyTab } from './HierarchyTab'
import { CalExceptionModal, CalendarModal, CodeMappingModal, ParamModal, RelationModal, SkuModal, VendorModal } from './MasterForms'
import { ActivityRows, SearchBox, saveMaster, usePaged } from './shared'

type Tab = 'hierarchy' | 'vendors' | 'uom' | 'calendars' | 'calex' | 'codes' | 'params' | 'history'
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function MasterData() {
  usePageFilters([])
  const ds = useDataset()
  const { can } = usePermissions()
  const canEdit = can('masterData.edit')
  const history = useAppState((s) => s.activity).filter((a) => a.area === 'Master data')
  const [tab, setTab] = useState<Tab>('hierarchy')

  return (
    <div>
      <PageHeader
        title="Master data"
        subtitle="Product hierarchy, vendors and their SKU relationships, conversions, calendars, code mappings and parameters"
        actions={
          <>
            {!canEdit && (
              <Badge tone="none" icon={Lock}>
                Read-only for this persona
              </Badge>
            )}
          </>
        }
      />
      <div className="mb-3">
        <Callout tone="info" icon={FlaskConical}>
          Edits are stored only in this browser for the demo and immediately recalculate the demo dataset. Nothing is written to any GCPL system. Use “Reset demo” in the top bar to restore fixtures.
        </Callout>
      </div>
      <div className="scroll-thin mb-3 overflow-x-auto">
        <Tabs
          label="Master data sections"
          value={tab}
          onChange={setTab}
          tabs={[
            {
              value: 'hierarchy',
              label: 'Product hierarchy',
              count: ds.skus.length,
            },
            { value: 'vendors', label: 'Vendors', count: ds.vendors.length },
            { value: 'uom', label: 'UOM conversions' },
            {
              value: 'calendars',
              label: 'Operating calendars',
              count: ds.calendars.length,
            },
            {
              value: 'calex',
              label: 'Calendar exceptions',
              count: ds.calendarExceptions.length,
            },
            {
              value: 'codes',
              label: 'Code mappings',
              count: ds.codeMappings.length,
            },
            {
              value: 'params',
              label: 'Parameters',
              count: ds.parameters.length,
            },
            {
              value: 'history',
              label: 'Change history',
              count: history.length,
            },
          ]}
        />
      </div>
      {tab === 'hierarchy' && <HierarchyTab ds={ds} canEdit={canEdit} />}
      {tab === 'vendors' && <VendorsTab ds={ds} canEdit={canEdit} />}
      {tab === 'uom' && <UomTab ds={ds} canEdit={canEdit} />}
      {tab === 'calendars' && <CalendarsTab ds={ds} canEdit={canEdit} />}
      {tab === 'calex' && <CalExTab ds={ds} canEdit={canEdit} />}
      {tab === 'codes' && <CodesTab ds={ds} canEdit={canEdit} />}
      {tab === 'params' && <ParamsTab ds={ds} canEdit={canEdit} />}
      {tab === 'history' && <HistoryTab />}
    </div>
  )
}

function VendorsTab({ ds, canEdit }: { ds: Dataset; canEdit: boolean }) {
  const [edit, setEdit] = useState<Vendor | 'new' | null>(null)
  const [addRel, setAddRel] = useState(false)
  return (
    <div className="space-y-3">
      <Card
        bodyClass="p-0"
        title="Vendors"
        subtitle="Contract manufacturers in the demo dataset"
        actions={
          canEdit && (
            <Button size="sm" variant="primary" icon={Plus} onClick={() => setEdit('new')}>
              Add vendor
            </Button>
          )
        }
      >
        <TableWrap>
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={th}>Vendor</th>
                <th className={th}>Code</th>
                <th className={th}>Location</th>
                <th className={th}>Calendar</th>
                <th className={th}>Report sender (demo)</th>
                <th className={cx(th, 'text-right')}>SKUs</th>
                {canEdit && (
                  <th className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {ds.vendors.map((v) => (
                <tr key={v.id} className="hover:bg-surface-muted/60">
                  <td className={cx(td, 'font-medium')}>{v.name}</td>
                  <td className={cx(td, 'font-mono text-dense')}>{v.code}</td>
                  <td className={td}>{v.location}</td>
                  <td className={td}>{ds.calendars.find((c) => c.id === v.calendarId)?.name ?? v.calendarId}</td>
                  <td className={cx(td, 'text-dense text-ink-muted')}>{v.reportEmail}</td>
                  <td className={tdNum}>{ds.idx.vendorSkus.get(v.id)?.length ?? 0}</td>
                  {canEdit && (
                    <td className={td}>
                      <IconButton icon={Pencil} label={`Edit ${v.name}`} onClick={() => setEdit(v)} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card
        bodyClass="p-0"
        title="Vendor–SKU relationships"
        subtitle="A SKU can be produced by several vendors. Relationships drive which vendor/SKU pairs appear in analysis."
        actions={
          canEdit && (
            <Button size="sm" icon={Plus} onClick={() => setAddRel(true)}>
              Add relationship
            </Button>
          )
        }
      >
        <TableWrap maxHeight={420}>
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={th}>Vendor</th>
                <th className={th}>SKU</th>
                <th className={th}>Since</th>
                <th className={th}>Role</th>
                <th className={th}>Other vendors for SKU</th>
                {canEdit && (
                  <th className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {ds.vendorSkuMaps.map((m) => {
                const v = ds.idx.vendor.get(m.vendorId)
                const s = ds.idx.sku.get(m.skuCode)
                const others = (ds.idx.skuVendors.get(m.skuCode) ?? []).filter((x) => x !== m.vendorId)
                return (
                  <tr key={`${m.vendorId}|${m.skuCode}`} className="hover:bg-surface-muted/60">
                    <td className={cx(td, 'whitespace-nowrap')}>{v?.name ?? m.vendorId}</td>
                    <td className={td}>
                      {s?.name ?? <span className="text-bad">Unknown SKU</span>} <span className="font-mono text-label text-ink-subtle">{m.skuCode}</span>
                    </td>
                    <td className={cx(td, 'num whitespace-nowrap')}>{fmtDate(m.since, true)}</td>
                    <td className={td}>
                      <Badge tone={m.primary ? 'accent' : 'none'}>{m.primary ? 'Primary' : 'Secondary'}</Badge>
                    </td>
                    <td className={cx(td, 'text-ink-muted')}>{others.map((o) => ds.idx.vendor.get(o)?.name).join(', ') || '—'}</td>
                    {canEdit && (
                      <td className={td}>
                        <IconButton
                          icon={Trash2}
                          label={`Remove relationship ${v?.name} → ${m.skuCode}`}
                          onClick={() =>
                            saveMaster(
                              (mt) => ({
                                ...mt,
                                vendorSkuMaps: mt.vendorSkuMaps.filter((x) => !(x.vendorId === m.vendorId && x.skuCode === m.skuCode)),
                              }),
                              'Removed vendor–SKU relationship',
                              `${v?.name} → ${m.skuCode}`,
                            )
                          }
                        />
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
      </Card>
      {edit && <VendorModal ds={ds} vendor={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {addRel && <RelationModal ds={ds} onClose={() => setAddRel(false)} />}
    </div>
  )
}

function UomTab({ ds, canEdit }: { ds: Dataset; canEdit: boolean }) {
  const [edit, setEdit] = useState<Sku | null>(null)
  const noWeight = ds.skus.filter((s) => s.kgPerEa == null)
  return (
    <div className="space-y-3">
      <AssumptionNote>EA ↔ CS always goes through the SKU case pack. MT is computed only where a kg/EA weight exists; SKUs without one are excluded from MT totals and listed as exclusions.</AssumptionNote>
      {noWeight.length > 0 && (
        <Callout tone="warn" title={`${noWeight.length} SKU(s) have no weight conversion`}>
          {noWeight.map((s) => `${s.code} ${s.name}`).join(' · ')} – excluded from MT views.
        </Callout>
      )}
      <Card bodyClass="p-0" title="FG conversions" subtitle="Per-SKU conversion factors">
        <TableWrap maxHeight={480}>
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={th}>SKU</th>
                <th className={cx(th, 'text-right')}>EA per CS</th>
                <th className={cx(th, 'text-right')}>kg per EA</th>
                <th className={cx(th, 'text-right')}>EA per MT</th>
                <th className={th}>MT available</th>
                {canEdit && (
                  <th className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {ds.skus.map((s) => (
                <tr key={s.code} className="hover:bg-surface-muted/60">
                  <td className={td}>
                    {s.name} <span className="font-mono text-label text-ink-subtle">{s.code}</span>
                  </td>
                  <td className={tdNum}>{fmtNum(s.casePack)}</td>
                  <td className={tdNum}>{s.kgPerEa != null ? fmtNum(s.kgPerEa, 3) : '—'}</td>
                  <td className={tdNum}>{s.kgPerEa ? fmtNum(1000 / s.kgPerEa) : '—'}</td>
                  <td className={td}>{s.kgPerEa != null ? <Badge tone="ok">Yes</Badge> : <Badge tone="warn">No – excluded from MT</Badge>}</td>
                  {canEdit && (
                    <td className={td}>
                      <IconButton icon={Pencil} label={`Edit conversion for ${s.code}`} onClick={() => setEdit(s)} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
      <Card bodyClass="p-0" title="RM / PM materials" subtitle="Materials keep their own reporting UOM. FG case packs and weights are never applied to materials, and different UOMs are never summed.">
        <TableWrap maxHeight={360}>
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={th}>Material</th>
                <th className={th}>Type</th>
                <th className={th}>UOM</th>
                <th className={th}>Used in SKUs</th>
              </tr>
            </thead>
            <tbody>
              {ds.materials.map((m) => (
                <tr key={m.code}>
                  <td className={td}>
                    {m.name} <span className="font-mono text-label text-ink-subtle">{m.code}</span>
                  </td>
                  <td className={td}>{m.kind === 'RM' ? 'RM' : 'PM'}</td>
                  <td className={cx(td, 'font-mono text-dense')}>{m.uom}</td>
                  <td className={cx(td, 'font-mono text-label text-ink-subtle')}>{m.usedInSkus.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
      {edit && <SkuModal ds={ds} sku={edit} uomOnly onClose={() => setEdit(null)} />}
    </div>
  )
}

function CalendarsTab({ ds, canEdit }: { ds: Dataset; canEdit: boolean }) {
  const [edit, setEdit] = useState<OperatingCalendar | 'new' | null>(null)
  return (
    <Card
      bodyClass="p-0"
      title="Operating calendars"
      subtitle="Non-operating days are shown as “Non-operating day”, never as missing or zero"
      actions={
        canEdit && (
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setEdit('new')}>
            Add calendar
          </Button>
        )
      }
    >
      <TableWrap>
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={th}>Calendar</th>
              <th className={th}>Weekly off</th>
              <th className={th}>2nd Saturday</th>
              <th className={th}>Vendors</th>
              <th className={cx(th, 'text-right')}>Exceptions</th>
              {canEdit && (
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {ds.calendars.map((c) => (
              <tr key={c.id} className="hover:bg-surface-muted/60">
                <td className={td}>
                  <div className="font-medium">{c.name}</div>
                  <div className="font-mono text-label text-ink-subtle">{c.id}</div>
                </td>
                <td className={td}>{c.weeklyOff.map((d) => DOW[d]).join(', ') || 'None'}</td>
                <td className={td}>{c.offSecondSaturday ? <Badge tone="info">Off</Badge> : 'Working'}</td>
                <td className={td}>
                  {ds.vendors
                    .filter((v) => v.calendarId === c.id)
                    .map((v) => v.name)
                    .join(', ') || '—'}
                </td>
                <td className={tdNum}>{ds.calendarExceptions.filter((x) => x.calendarId === c.id || x.calendarId === 'ALL').length}</td>
                {canEdit && (
                  <td className={td}>
                    <IconButton icon={Pencil} label={`Edit ${c.name}`} onClick={() => setEdit(c)} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {edit && <CalendarModal ds={ds} cal={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </Card>
  )
}

function CalExTab({ ds, canEdit }: { ds: Dataset; canEdit: boolean }) {
  const [add, setAdd] = useState(false)
  const rows = [...ds.calendarExceptions].sort((a, b) => a.date.localeCompare(b.date))
  return (
    <Card
      bodyClass="p-0"
      title="Calendar exceptions"
      subtitle="Holidays, shutdowns and extra working days that override the weekly pattern"
      actions={
        canEdit && (
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setAdd(true)}>
            Add exception
          </Button>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyState title="No calendar exceptions" />
      ) : (
        <TableWrap>
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Applies to</th>
                <th className={th}>Type</th>
                <th className={th}>Reason</th>
                {canEdit && (
                  <th className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className="hover:bg-surface-muted/60">
                  <td className={cx(td, 'num whitespace-nowrap')}>
                    {fmtDow(x.date)} {fmtDate(x.date, true)}
                  </td>
                  <td className={td}>{x.calendarId === 'ALL' ? 'All calendars' : (ds.calendars.find((c) => c.id === x.calendarId)?.name ?? x.calendarId)}</td>
                  <td className={td}>
                    <Badge tone={x.type === 'Extra working day' ? 'ok' : 'none'}>{x.type}</Badge>
                  </td>
                  <td className={td}>{x.reason}</td>
                  {canEdit && (
                    <td className={td}>
                      <IconButton
                        icon={Trash2}
                        label={`Remove ${x.reason}`}
                        onClick={() =>
                          saveMaster(
                            (m) => ({
                              ...m,
                              calendarExceptions: m.calendarExceptions.filter((c) => c.id !== x.id),
                            }),
                            'Removed calendar exception',
                            `${x.id} · ${x.date} · ${x.reason}`,
                          )
                        }
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {add && <CalExceptionModal ds={ds} onClose={() => setAdd(false)} />}
    </Card>
  )
}

function CodesTab({ ds, canEdit }: { ds: Dataset; canEdit: boolean }) {
  const [edit, setEdit] = useState<CodeMapping | 'new' | null>(null)
  const [vendor, setVendor] = useState('')
  const rows = ds.codeMappings.filter((c) => !vendor || c.vendorId === vendor)
  return (
    <div className="space-y-3">
      <LocalFilters>
        <Select label="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)}>
          <option value="">All vendors</option>
          {ds.vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </LocalFilters>
      <Card
        bodyClass="p-0"
        title="Vendor code mappings"
        subtitle="Translate vendor item codes in incoming reports to FG codes. Unmapped codes are excluded at upload with a warning."
        actions={
          canEdit && (
            <Button size="sm" variant="primary" icon={Plus} onClick={() => setEdit('new')}>
              Add mapping
            </Button>
          )
        }
      >
        {rows.length === 0 ? (
          <EmptyState title="No mappings for this vendor" />
        ) : (
          <TableWrap>
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={th}>Vendor</th>
                  <th className={th}>Vendor item code</th>
                  <th className={th}>FG code</th>
                  <th className={th}>Note</th>
                  {canEdit && (
                    <th className={th}>
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const s = ds.idx.sku.get(c.skuCode)
                  const related = (ds.idx.vendorSkus.get(c.vendorId) ?? []).includes(c.skuCode)
                  return (
                    <tr key={c.id} className="hover:bg-surface-muted/60">
                      <td className={td}>{ds.idx.vendor.get(c.vendorId)?.name ?? c.vendorId}</td>
                      <td className={cx(td, 'font-mono text-dense')}>{c.vendorCode}</td>
                      <td className={td}>
                        <span className="font-mono text-dense">{c.skuCode}</span> <span className="text-ink-muted">{s?.name ?? 'Unknown SKU'}</span>
                        {!related && (
                          <Badge tone="warn" className="ml-1.5">
                            No vendor relationship
                          </Badge>
                        )}
                      </td>
                      <td className={cx(td, 'text-ink-muted')}>{c.note || '—'}</td>
                      {canEdit && (
                        <td className={cx(td, 'whitespace-nowrap')}>
                          <IconButton icon={Pencil} label={`Edit mapping ${c.vendorCode}`} onClick={() => setEdit(c)} />
                          <IconButton
                            icon={Trash2}
                            label={`Remove mapping ${c.vendorCode}`}
                            onClick={() =>
                              saveMaster(
                                (m) => ({
                                  ...m,
                                  codeMappings: m.codeMappings.filter((x) => x.id !== c.id),
                                }),
                                'Removed code mapping',
                                `${ds.idx.vendor.get(c.vendorId)?.name}: ${c.vendorCode} → ${c.skuCode}`,
                              )
                            }
                          />
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      {edit && <CodeMappingModal ds={ds} mapping={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function ParamsTab({ ds, canEdit }: { ds: Dataset; canEdit: boolean }) {
  const [edit, setEdit] = useState<Parameter | null>(null)
  return (
    <Card bodyClass="p-0" title="Parameters" subtitle="Thresholds used by statuses and exception rules. All are provisional pending business confirmation.">
      <TableWrap>
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={th}>Parameter</th>
              <th className={cx(th, 'text-right')}>Value</th>
              <th className={th}>Used for</th>
              <th className={th}>Status</th>
              {canEdit && (
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {ds.parameters.map((p) => (
              <tr key={p.key} className="hover:bg-surface-muted/60">
                <td className={td}>
                  <div className="font-medium">{p.label}</div>
                  <div className="font-mono text-label text-ink-subtle">{p.key}</div>
                </td>
                <td className={tdNum}>
                  {fmtNum(p.value)} <span className="text-ink-muted">{p.unit}</span>
                </td>
                <td className={cx(td, 'text-ink-muted')}>{p.description}</td>
                <td className={td}>
                  {p.assumption ? (
                    <Badge tone="warn" icon={FlaskConical}>
                      Demo assumption
                    </Badge>
                  ) : (
                    <Badge tone="ok">Confirmed</Badge>
                  )}
                </td>
                {canEdit && (
                  <td className={td}>
                    <IconButton icon={Pencil} label={`Edit ${p.label}`} onClick={() => setEdit(p)} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {edit && <ParamModal ds={ds} param={edit} onClose={() => setEdit(null)} />}
    </Card>
  )
}

function HistoryTab() {
  const all = useAppState((s) => s.activity)
  const [q, setQ] = useState('')
  const rows = all.filter((a) => a.area === 'Master data' && (!q || `${a.by} ${a.action} ${a.target} ${a.detail ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  const pg = usePaged(rows)
  return (
    <div className="space-y-3">
      <LocalFilters>
        <SearchBox className="w-[280px]" value={q} onChange={setQ} label="Search change history" placeholder="Search change history…" />
      </LocalFilters>
      <Card bodyClass="p-0" title="Master data change history" subtitle="Local demo log of every maintenance change in this browser">
        {rows.length === 0 ? (
          <EmptyState title="No changes recorded">Changes made in the other tabs appear here with who, when and what changed.</EmptyState>
        ) : (
          <>
            <TableWrap>
              <table className="w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className={th}>When</th>
                    <th className={th}>By</th>
                    <th className={th}>Change</th>
                    <th className={th}>Record</th>
                    <th className={th}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  <ActivityRows entries={pg.slice} />
                </tbody>
              </table>
            </TableWrap>
            <Pager page={pg.page} pages={pg.pages} onPage={pg.setPage} total={rows.length} label="changes" />
          </>
        )}
      </Card>
    </div>
  )
}
