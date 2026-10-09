// Validated maintenance forms for master data. All saves are local to this browser (demo).
import { useState, type FormEvent, type ReactNode } from 'react'
import type { CalendarException, CodeMapping, DT, OperatingCalendar, Parameter, Sku, Vendor } from '@/data/types'
import type { Dataset } from '@/data/dataset'
import { Button, Modal } from '@/components/ui'
import { Check, EMAIL_RE, Field, diffSummary, hasErrors, inputCls, num, positiveInt, required, saveMaster, type Errors } from './shared'

function FormModal({ title, onClose, onSubmit, children, submitLabel = 'Save', width }: { title: string; onClose: () => void; onSubmit: () => void; children: ReactNode; submitLabel?: string; width?: number }) {
  const formId = `form-${title.replace(/\W+/g, '-')}`
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      width={width}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          onSubmit()
        }}
        className="grid grid-cols-2 gap-3"
      >
        {children}
        <p className="col-span-2 text-label text-ink-subtle">Saved only in this browser for the demo – no GCPL system is updated.</p>
      </form>
    </Modal>
  )
}

// ── FG SKU ─────────────────────────────────────────────────────────────────
export function SkuModal({ ds, sku, onClose, uomOnly }: { ds: Dataset; sku: Sku | null; onClose: () => void; uomOnly?: boolean }) {
  const [f, setF] = useState({
    code: sku?.code ?? '',
    name: sku?.name ?? '',
    dtCode: sku?.dtCode ?? ds.dts[0]?.code ?? '',
    casePack: sku ? String(sku.casePack) : '',
    kgPerEa: sku?.kgPerEa != null ? String(sku.kgPerEa) : '',
    shelfLifeDays: sku ? String(sku.shelfLifeDays) : '',
    active: sku?.active ?? true,
  })
  const [err, setErr] = useState<Errors>({})
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((s) => ({ ...s, [k]: v }))
  const submit = () => {
    const code = f.code.trim().toUpperCase()
    const kg = num(f.kgPerEa)
    const e: Errors = {
      code: required(code, 'FG code') ?? (!sku && ds.skus.some((s) => s.code === code) ? `FG code ${code} already exists.` : !/^[A-Z0-9-]{4,20}$/.test(code) ? 'Use 4–20 letters, digits or hyphens.' : undefined),
      name: required(f.name, 'Name'),
      dtCode: ds.dts.some((d) => d.code === f.dtCode) ? undefined : 'Choose an existing DT.',
      casePack: positiveInt(f.casePack, 'Case pack'),
      kgPerEa: kg != null && (Number.isNaN(kg) || kg <= 0) ? 'Weight must be a number greater than 0, or blank if no weight conversion exists.' : undefined,
      shelfLifeDays: positiveInt(f.shelfLifeDays, 'Shelf life'),
    }
    setErr(e)
    if (hasErrors(e)) return
    const next: Sku = {
      code,
      name: f.name.trim(),
      dtCode: f.dtCode,
      casePack: Number(f.casePack),
      kgPerEa: kg,
      shelfLifeDays: Number(f.shelfLifeDays),
      active: f.active,
    }
    if (sku) {
      saveMaster(
        (m) => ({
          ...m,
          skus: m.skus.map((s) => (s.code === sku.code ? next : s)),
        }),
        uomOnly ? 'Updated UOM conversion' : 'Edited FG SKU',
        code,
        diffSummary(sku, next, {
          name: 'Name',
          dtCode: 'DT',
          casePack: 'EA/CS',
          kgPerEa: 'kg/EA',
          shelfLifeDays: 'Shelf life',
          active: 'Active',
        }),
      )
    } else {
      saveMaster((m) => ({ ...m, skus: [...m.skus, next] }), 'Added FG SKU', code, `${next.name} · DT ${next.dtCode} · ${next.casePack} EA/CS`)
    }
    onClose()
  }
  return (
    <FormModal title={sku ? (uomOnly ? `UOM conversion – ${sku.code}` : `Edit FG SKU ${sku.code}`) : 'Add FG SKU'} onClose={onClose} onSubmit={submit} width={560}>
      {!uomOnly && (
        <>
          <Field label="FG code" error={err.code}>
            <input className={inputCls} value={f.code} disabled={!!sku} onChange={(e) => set('code')(e.target.value)} placeholder="e.g. FG1004013" />
          </Field>
          <Field label="DT" error={err.dtCode}>
            <select className={inputCls} value={f.dtCode} onChange={(e) => set('dtCode')(e.target.value)}>
              {ds.dts.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} · {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="SKU name" error={err.name} className="col-span-2">
            <input className={inputCls} value={f.name} onChange={(e) => set('name')(e.target.value)} />
          </Field>
        </>
      )}
      <Field label="Case pack (EA per CS)" error={err.casePack} hint="Used for every EA ↔ CS conversion.">
        <input className={inputCls} inputMode="numeric" value={f.casePack} onChange={(e) => set('casePack')(e.target.value)} />
      </Field>
      <Field label="Weight (kg per EA)" error={err.kgPerEa} hint="Leave blank if unknown – SKU is then excluded from MT views.">
        <input className={inputCls} inputMode="decimal" value={f.kgPerEa} onChange={(e) => set('kgPerEa')(e.target.value)} />
      </Field>
      {!uomOnly && (
        <>
          <Field label="Shelf life (days)" error={err.shelfLifeDays}>
            <input className={inputCls} inputMode="numeric" value={f.shelfLifeDays} onChange={(e) => set('shelfLifeDays')(e.target.value)} />
          </Field>
          <div className="flex items-end pb-1.5">
            <Check label="Active" checked={f.active} onChange={set('active')} />
          </div>
        </>
      )}
    </FormModal>
  )
}

// ── DT ─────────────────────────────────────────────────────────────────────
export function DtModal({ ds, dt, onClose }: { ds: Dataset; dt: DT | null; onClose: () => void }) {
  const [f, setF] = useState({
    code: dt?.code ?? 'DT-',
    name: dt?.name ?? '',
    productLineId: dt?.productLineId ?? ds.productLines[0]?.id ?? '',
  })
  const [err, setErr] = useState<Errors>({})
  const submit = () => {
    const code = f.code.trim().toUpperCase()
    const e: Errors = {
      code: required(code.replace(/^DT-$/, ''), 'DT code') ?? (!dt && ds.dts.some((d) => d.code === code) ? `DT code ${code} already exists.` : undefined),
      name: required(f.name, 'DT name'),
      productLineId: ds.productLines.some((p) => p.id === f.productLineId) ? undefined : 'Choose a product line.',
    }
    setErr(e)
    if (hasErrors(e)) return
    const next: DT = {
      code,
      name: f.name.trim(),
      productLineId: f.productLineId,
    }
    if (dt)
      saveMaster(
        (m) => ({
          ...m,
          dts: m.dts.map((d) => (d.code === dt.code ? next : d)),
        }),
        'Edited DT',
        code,
        diffSummary(dt, next, { name: 'Name', productLineId: 'Product line' }),
      )
    else saveMaster((m) => ({ ...m, dts: [...m.dts, next] }), 'Added DT', code, next.name)
    onClose()
  }
  return (
    <FormModal title={dt ? `Edit DT ${dt.code}` : 'Add DT'} onClose={onClose} onSubmit={submit}>
      <Field label="DT code" error={err.code}>
        <input className={inputCls} value={f.code} disabled={!!dt} onChange={(e) => setF({ ...f, code: e.target.value })} />
      </Field>
      <Field label="Product line" error={err.productLineId}>
        <select className={inputCls} value={f.productLineId} onChange={(e) => setF({ ...f, productLineId: e.target.value })}>
          {ds.productLines.map((p) => (
            <option key={p.id} value={p.id}>
              {ds.brands.find((b) => b.id === p.brandId)?.name} · {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="DT name" error={err.name} className="col-span-2">
        <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
    </FormModal>
  )
}

// ── Vendor ─────────────────────────────────────────────────────────────────
export function VendorModal({ ds, vendor, onClose }: { ds: Dataset; vendor: Vendor | null; onClose: () => void }) {
  const [f, setF] = useState({
    name: vendor?.name ?? '',
    code: vendor?.code ?? '',
    location: vendor?.location ?? '',
    calendarId: vendor?.calendarId ?? ds.calendars[0]?.id ?? '',
    reportEmail: vendor?.reportEmail ?? '',
  })
  const [err, setErr] = useState<Errors>({})
  const submit = () => {
    const code = f.code.trim().toUpperCase()
    const e: Errors = {
      name: required(f.name, 'Vendor name') ?? (ds.vendors.some((v) => v.id !== vendor?.id && v.name.toLowerCase() === f.name.trim().toLowerCase()) ? 'A vendor with this name already exists.' : undefined),
      code: required(code, 'Vendor code') ?? (ds.vendors.some((v) => v.id !== vendor?.id && v.code === code) ? `Vendor code ${code} is already used.` : undefined),
      location: required(f.location, 'Location'),
      reportEmail: required(f.reportEmail, 'Report sender email') ?? (EMAIL_RE.test(f.reportEmail.trim()) ? undefined : 'Enter a valid email address.'),
    }
    setErr(e)
    if (hasErrors(e)) return
    const next: Vendor = {
      id: vendor?.id ?? `V-${code}`,
      name: f.name.trim(),
      code,
      location: f.location.trim(),
      calendarId: f.calendarId,
      reportEmail: f.reportEmail.trim(),
    }
    if (vendor)
      saveMaster(
        (m) => ({
          ...m,
          vendors: m.vendors.map((v) => (v.id === vendor.id ? next : v)),
        }),
        'Edited vendor',
        `${next.name} (${code})`,
        diffSummary(vendor, next, {
          name: 'Name',
          code: 'Code',
          location: 'Location',
          calendarId: 'Calendar',
          reportEmail: 'Report email',
        }),
      )
    else saveMaster((m) => ({ ...m, vendors: [...m.vendors, next] }), 'Added vendor', `${next.name} (${code})`, `${next.location} · ${next.calendarId}`)
    onClose()
  }
  return (
    <FormModal title={vendor ? `Edit vendor ${vendor.name}` : 'Add vendor'} onClose={onClose} onSubmit={submit} width={560}>
      <Field label="Vendor name" error={err.name}>
        <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field label="Vendor code" error={err.code}>
        <input className={inputCls} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
      </Field>
      <Field label="Location" error={err.location}>
        <input className={inputCls} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
      </Field>
      <Field label="Operating calendar">
        <select className={inputCls} value={f.calendarId} onChange={(e) => setF({ ...f, calendarId: e.target.value })}>
          {ds.calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Report sender email (demo inbox matching)" error={err.reportEmail} className="col-span-2" hint="Used only to match demo inbox receipts. No email is sent.">
        <input className={inputCls} type="email" value={f.reportEmail} onChange={(e) => setF({ ...f, reportEmail: e.target.value })} />
      </Field>
    </FormModal>
  )
}

// ── Vendor ↔ SKU relationship ──────────────────────────────────────────────
export function RelationModal({ ds, onClose }: { ds: Dataset; onClose: () => void }) {
  const [f, setF] = useState({
    vendorId: ds.vendors[0]?.id ?? '',
    skuCode: '',
    since: '2026-10-09',
    primary: false,
  })
  const [err, setErr] = useState<Errors>({})
  const submit = () => {
    const e: Errors = {
      skuCode: !ds.idx.sku.has(f.skuCode) ? 'Choose an existing FG SKU.' : ds.vendorSkuMaps.some((m) => m.vendorId === f.vendorId && m.skuCode === f.skuCode) ? 'This vendor is already mapped to that SKU.' : undefined,
      since: /^\d{4}-\d{2}-\d{2}$/.test(f.since) ? undefined : 'Enter a valid date.',
    }
    setErr(e)
    if (hasErrors(e)) return
    const v = ds.idx.vendor.get(f.vendorId)!
    saveMaster((m) => ({ ...m, vendorSkuMaps: [...m.vendorSkuMaps, { ...f }] }), 'Added vendor–SKU relationship', `${v.name} → ${f.skuCode}`, f.primary ? 'Primary' : 'Secondary')
    onClose()
  }
  return (
    <FormModal title="Add vendor–SKU relationship" onClose={onClose} onSubmit={submit} width={560}>
      <Field label="Vendor">
        <select className={inputCls} value={f.vendorId} onChange={(e) => setF({ ...f, vendorId: e.target.value })}>
          {ds.vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.code})
            </option>
          ))}
        </select>
      </Field>
      <Field label="FG SKU" error={err.skuCode}>
        <select className={inputCls} value={f.skuCode} onChange={(e) => setF({ ...f, skuCode: e.target.value })}>
          <option value="">Select SKU…</option>
          {ds.skus.map((s) => (
            <option key={s.code} value={s.code}>
              {s.code} · {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Since" error={err.since}>
        <input className={inputCls} type="date" value={f.since} onChange={(e) => setF({ ...f, since: e.target.value })} />
      </Field>
      <div className="flex items-end pb-1.5">
        <Check label="Primary source" checked={f.primary} onChange={(v) => setF({ ...f, primary: v })} />
      </div>
    </FormModal>
  )
}

// ── Operating calendar ─────────────────────────────────────────────────────
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export function CalendarModal({ ds, cal, onClose }: { ds: Dataset; cal: OperatingCalendar | null; onClose: () => void }) {
  const [f, setF] = useState({
    id: cal?.id ?? 'CAL-',
    name: cal?.name ?? '',
    weeklyOff: cal?.weeklyOff ?? [0],
    offSecondSaturday: cal?.offSecondSaturday ?? false,
  })
  const [err, setErr] = useState<Errors>({})
  const submit = () => {
    const id = f.id.trim().toUpperCase()
    const e: Errors = {
      id: required(id.replace(/^CAL-$/, ''), 'Calendar id') ?? (!cal && ds.calendars.some((c) => c.id === id) ? `Calendar ${id} already exists.` : undefined),
      name: required(f.name, 'Name'),
      weeklyOff: f.weeklyOff.length >= 7 ? 'At least one operating day per week is required.' : undefined,
    }
    setErr(e)
    if (hasErrors(e)) return
    const next: OperatingCalendar = {
      id,
      name: f.name.trim(),
      weeklyOff: [...f.weeklyOff].sort(),
      offSecondSaturday: f.offSecondSaturday,
    }
    const fmt = (c: OperatingCalendar) => `${c.weeklyOff.map((d) => DOW[d]).join('+') || 'none'}${c.offSecondSaturday ? ' + 2nd Sat' : ''}`
    if (cal)
      saveMaster(
        (m) => ({
          ...m,
          calendars: m.calendars.map((c) => (c.id === cal.id ? next : c)),
        }),
        'Edited operating calendar',
        id,
        `Weekly off: ${fmt(cal)} → ${fmt(next)}`,
      )
    else saveMaster((m) => ({ ...m, calendars: [...m.calendars, next] }), 'Added operating calendar', id, `Weekly off: ${fmt(next)}`)
    onClose()
  }
  return (
    <FormModal title={cal ? `Edit calendar ${cal.id}` : 'Add operating calendar'} onClose={onClose} onSubmit={submit} width={560}>
      <Field label="Calendar id" error={err.id}>
        <input className={inputCls} value={f.id} disabled={!!cal} onChange={(e) => setF({ ...f, id: e.target.value })} />
      </Field>
      <Field label="Name" error={err.name}>
        <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <fieldset className="col-span-2">
        <legend className="mb-1 text-dense font-medium text-ink-muted">Weekly off days</legend>
        <div className="flex flex-wrap gap-3">
          {DOW.map((d, i) => (
            <Check
              key={d}
              label={d}
              checked={f.weeklyOff.includes(i)}
              onChange={(on) =>
                setF({
                  ...f,
                  weeklyOff: on ? [...f.weeklyOff, i] : f.weeklyOff.filter((x) => x !== i),
                })
              }
            />
          ))}
        </div>
        {err.weeklyOff && <p className="mt-1 text-label font-medium text-bad">{err.weeklyOff}</p>}
      </fieldset>
      <div className="col-span-2">
        <Check label="2nd Saturday of each month is off" checked={f.offSecondSaturday} onChange={(v) => setF({ ...f, offSecondSaturday: v })} />
      </div>
    </FormModal>
  )
}

// ── Calendar exception ─────────────────────────────────────────────────────
export function CalExceptionModal({ ds, onClose }: { ds: Dataset; onClose: () => void }) {
  const [f, setF] = useState<Omit<CalendarException, 'id'>>({
    calendarId: 'ALL',
    date: '',
    type: 'Holiday',
    reason: '',
  })
  const [err, setErr] = useState<Errors>({})
  const submit = () => {
    const e: Errors = {
      date: !/^\d{4}-\d{2}-\d{2}$/.test(f.date)
        ? 'Date is required.'
        : ds.calendarExceptions.some((x) => x.date === f.date && (x.calendarId === f.calendarId || x.calendarId === 'ALL' || f.calendarId === 'ALL'))
          ? 'An exception already exists for this date on an overlapping calendar.'
          : undefined,
      reason: required(f.reason, 'Reason'),
    }
    setErr(e)
    if (hasErrors(e)) return
    const id = `CE-${Date.now().toString(36).toUpperCase()}`
    saveMaster(
      (m) => ({
        ...m,
        calendarExceptions: [...m.calendarExceptions, { id, ...f, reason: f.reason.trim() }],
      }),
      'Added calendar exception',
      `${id} · ${f.date} · ${f.reason.trim()}`,
      `${f.type} · ${f.calendarId === 'ALL' ? 'All calendars' : f.calendarId}`,
    )
    onClose()
  }
  return (
    <FormModal title="Add calendar exception" onClose={onClose} onSubmit={submit} width={560}>
      <Field label="Applies to">
        <select className={inputCls} value={f.calendarId} onChange={(e) => setF({ ...f, calendarId: e.target.value })}>
          <option value="ALL">All calendars</option>
          {ds.calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Date" error={err.date}>
        <input className={inputCls} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      </Field>
      <Field label="Type">
        <select className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as CalendarException['type'] })}>
          <option>Holiday</option>
          <option>Shutdown</option>
          <option>Extra working day</option>
        </select>
      </Field>
      <Field label="Reason" error={err.reason}>
        <input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      </Field>
    </FormModal>
  )
}

// ── Code mapping ───────────────────────────────────────────────────────────
export function CodeMappingModal({ ds, mapping, onClose }: { ds: Dataset; mapping: CodeMapping | null; onClose: () => void }) {
  const [f, setF] = useState({
    vendorId: mapping?.vendorId ?? ds.vendors[0]?.id ?? '',
    vendorCode: mapping?.vendorCode ?? '',
    skuCode: mapping?.skuCode ?? '',
    note: mapping?.note ?? '',
  })
  const [err, setErr] = useState<Errors>({})
  const mappedHere = (ds.idx.vendorSkus.get(f.vendorId) ?? []).includes(f.skuCode)
  const submit = () => {
    const code = f.vendorCode.trim().toUpperCase()
    const e: Errors = {
      vendorCode:
        required(code, 'Vendor item code') ?? (ds.codeMappings.some((c) => c.id !== mapping?.id && c.vendorId === f.vendorId && c.vendorCode.toUpperCase() === code) ? 'This vendor code is already mapped for this vendor.' : undefined),
      skuCode: !f.skuCode.trim() ? 'Target FG code is required.' : !ds.idx.sku.has(f.skuCode.trim().toUpperCase()) ? `FG code ${f.skuCode.trim()} does not exist in SKU master.` : undefined,
    }
    setErr(e)
    if (hasErrors(e)) return
    const next: CodeMapping = {
      id: mapping?.id ?? `CM-${Date.now().toString(36).toUpperCase()}`,
      vendorId: f.vendorId,
      vendorCode: code,
      skuCode: f.skuCode.trim().toUpperCase(),
      note: f.note.trim(),
    }
    const v = ds.idx.vendor.get(next.vendorId)!
    if (mapping)
      saveMaster(
        (m) => ({
          ...m,
          codeMappings: m.codeMappings.map((c) => (c.id === mapping.id ? next : c)),
        }),
        'Edited code mapping',
        `${v.name}: ${code} → ${next.skuCode}`,
        diffSummary(mapping, next, {
          vendorCode: 'Vendor code',
          skuCode: 'FG code',
          note: 'Note',
        }),
      )
    else saveMaster((m) => ({ ...m, codeMappings: [...m.codeMappings, next] }), 'Added code mapping', `${v.name}: ${code} → ${next.skuCode}`)
    onClose()
  }
  return (
    <FormModal title={mapping ? 'Edit code mapping' : 'Add code mapping'} onClose={onClose} onSubmit={submit} width={560}>
      <Field label="Vendor">
        <select className={inputCls} value={f.vendorId} onChange={(e) => setF({ ...f, vendorId: e.target.value })}>
          {ds.vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.code})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Vendor item code" error={err.vendorCode}>
        <input className={inputCls} value={f.vendorCode} onChange={(e) => setF({ ...f, vendorCode: e.target.value })} placeholder="As it appears in vendor reports" />
      </Field>
      <Field
        label="Maps to FG code"
        error={err.skuCode}
        className="col-span-2"
        hint={f.skuCode && ds.idx.sku.has(f.skuCode.toUpperCase()) && !mappedHere ? 'Warning: this vendor has no relationship to that SKU yet – add one under Vendors.' : ds.idx.sku.get(f.skuCode.toUpperCase())?.name}
      >
        <input className={inputCls} list="sku-codes" value={f.skuCode} onChange={(e) => setF({ ...f, skuCode: e.target.value })} placeholder="e.g. FG1004011" />
      </Field>
      <datalist id="sku-codes">
        {ds.skus.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </datalist>
      <Field label="Note" className="col-span-2">
        <input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </Field>
    </FormModal>
  )
}

// ── Parameter ──────────────────────────────────────────────────────────────
export function ParamModal({ ds, param, onClose }: { ds: Dataset; param: Parameter; onClose: () => void }) {
  const [value, setValue] = useState(String(param.value))
  const [err, setErr] = useState<Errors>({})
  const submit = () => {
    const n = num(value)
    let e: string | undefined = n == null ? 'Value is required.' : Number.isNaN(n) || n < 0 ? 'Value must be a number ≥ 0.' : undefined
    if (!e && param.unit !== '%' && !Number.isInteger(n)) e = `Value must be a whole number of ${param.unit}.`
    if (!e && param.key === 'attainLow' && n! >= (ds.idx.param.attainHigh ?? Infinity)) e = `Must be below the upper bound (${ds.idx.param.attainHigh}%).`
    if (!e && param.key === 'attainHigh' && n! <= (ds.idx.param.attainLow ?? -Infinity)) e = `Must be above the lower bound (${ds.idx.param.attainLow}%).`
    if (!e && param.unit !== '%' && n === 0) e = 'Value must be greater than 0.'
    setErr({ value: e })
    if (e) return
    saveMaster(
      (m) => ({
        ...m,
        parameters: m.parameters.map((p) => (p.key === param.key ? { ...p, value: n! } : p)),
      }),
      'Changed parameter',
      param.label,
      `${param.value} → ${n} ${param.unit} (still a demo assumption)`,
    )
    onClose()
  }
  return (
    <FormModal title={`Edit parameter – ${param.label}`} onClose={onClose} onSubmit={submit}>
      <Field label={`Value (${param.unit})`} error={err.value} className="col-span-2" hint={param.description}>
        <input className={inputCls} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <p className="col-span-2 text-dense text-warn">Remains flagged as a demo assumption until confirmed by the business. Changing it recalculates statuses and exceptions across the app.</p>
    </FormModal>
  )
}
