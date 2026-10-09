// Deterministic demo transaction data. One coherent dataset feeds every view.
// Seeded PRNG → identical numbers on every load. Nothing here is live GCPL data.
import { addDays, diffDays, eachDay, LATEST_DUE_DATE, monthEnd, monthOf } from '@/lib/dates'
import { isOperating } from '@/lib/calendar'
import * as M from './master'
import type { DispatchRecord, FgLot, FgSnapshot, MaterialLot, MaterialSnapshot, PlanLine, PlanVersion, PoLine, ProductionRecord, ReportType, UploadBatch, Vendor, VendorReport } from './types'

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20261009)
const between = (lo: number, hi: number) => lo + (hi - lo) * rnd()
const roundTo = (n: number, step: number) => Math.max(0, Math.round(n / step) * step)

const calCtx = { calendars: M.calendars, calendarExceptions: M.calendarExceptions }
const vendorById = (id: string) => M.vendors.find((v) => v.id === id) as Vendor
const skuByCode = (code: string) => M.skus.find((s) => s.code === code)!

export const DATA_START = '2026-09-01'
export const HISTORY_START = '2026-08-17' // FG history for baselines
const PLAN_MONTHS = ['2026-09', '2026-10']

/** Daily planned rate (EA) per vendor-SKU on an operating day */
const baseRate: Record<string, number> = {
  'V-SAI|FG1004011': 28800,
  'V-SAI|FG1004012': 19200,
  'V-SAI|FG1004021': 4800,
  'V-SAI|FG1004201': 36000,
  'V-VAN|FG2001011': 43200,
  'V-VAN|FG2001012': 28800,
  'V-VAN|FG2001013': 14400,
  'V-VAN|FG2002011': 7200,
  'V-VAN|FG2002012': 9600,
  'V-RKPL|FG1004101': 54000,
  'V-RKPL|FG1004102': 36000,
  'V-RKPL|FG1004011': 9600,
  'V-AAV|FG3001011': 6000,
  'V-AAV|FG3001012': 4800,
  'V-AAV|FG3001021': 2400,
  'V-PAY|FG2003011': 3600,
  'V-PAY|FG2001011': 14400,
  'V-PAY|FG3002011': 9600,
}

/** Attainment behaviour (story) per vendor-SKU for Oct */
const performance: Record<string, [number, number]> = {
  'V-SAI|FG1004011': [0.7, 0.86], // persistent shortfall
  'V-VAN|FG2001013': [1.18, 1.32], // over-production
  'V-RKPL|FG1004102': [0.82, 0.95],
  'V-PAY|FG2003011': [0.92, 1.12],
}

// Vendors whose plans are monthly totals (no daily distribution)
const MONTHLY_PLAN_VENDORS = new Set(['V-AAV'])

// ── Plan versions ───────────────────────────────────────────────────────────
export const planVersions: PlanVersion[] = []
export const planLines: PlanLine[] = []

let batchSeq = 4100
const nextBatchId = () => `B-${++batchSeq}`
export const uploadBatches: UploadBatch[] = []

function addPlanVersion(v: Omit<PlanVersion, 'id' | 'batchId'>, lines: Omit<PlanLine, 'versionId'>[]) {
  const id = `PV-${v.vendorId.slice(2)}-${v.month.replace('-', '')}-v${v.versionNo}`
  const batchId = nextBatchId()
  planVersions.push({ ...v, id, batchId })
  for (const l of lines) planLines.push({ ...l, versionId: id })
  uploadBatches.push({
    id: batchId,
    purpose: 'Production plan',
    reportType: null,
    planKind: v.kind,
    vendorId: v.vendorId,
    fileName: v.fileName,
    fileSizeKb: Math.round(between(18, 64)),
    checksum: `sha1:${Math.floor(rnd() * 1e12).toString(16)}`,
    channel: 'Manual upload',
    uploadedAt: v.uploadedAt,
    uploadedBy: v.uploadedBy,
    status: 'Ingested',
    rowsTotal: lines.length,
    rowsAccepted: lines.length,
    rowsExcluded: 0,
    issues: [],
    producedIds: [id],
    demo: true,
  })
  return id
}

for (const month of PLAN_MONTHS) {
  for (const vendor of M.vendors) {
    const maps = M.vendorSkuMaps.filter((m) => m.vendorId === vendor.id)
    const days = eachDay(`${month}-01`, monthEnd(month)).filter((d) => isOperating(calCtx, vendor, d))
    const uploadedAt = month === '2026-09' ? '2026-08-27T16:10:00+05:30' : '2026-09-28T15:40:00+05:30'
    const monthly = MONTHLY_PLAN_VENDORS.has(vendor.id)
    const lines: Omit<PlanLine, 'versionId'>[] = []
    for (const m of maps) {
      const rate = baseRate[`${vendor.id}|${m.skuCode}`]
      if (monthly) {
        lines.push({ skuCode: m.skuCode, date: null, qtyEa: roundTo(rate * days.length * between(0.95, 1.05), 1200) })
        continue
      }
      for (const d of days) {
        // Vanessa's Petal Crush Pink is planned only on Mon/Wed/Fri — other days have no plan
        if (vendor.id === 'V-VAN' && m.skuCode === 'FG2002011' && ![1, 3, 5].includes(new Date(d).getUTCDay())) continue
        const step = skuByCode(m.skuCode).casePack
        lines.push({ skuCode: m.skuCode, date: d, qtyEa: roundTo(rate * between(0.9, 1.1), step) })
      }
    }
    const tag = `${vendor.code}_${month === '2026-09' ? 'SEP26' : 'OCT26'}`
    addPlanVersion(
      {
        label: `${month === '2026-09' ? 'Sep' : 'Oct'}-26 ${vendor.name} v1`,
        vendorId: vendor.id,
        month,
        granularity: monthly ? 'Monthly' : 'Daily',
        kind: 'Baseline',
        versionNo: 1,
        uploadedAt,
        uploadedBy: 'Ananya Rao',
        fileName: `Plan_${tag}_baseline.xlsx`,
        supersedesId: null,
        note: monthly ? 'Monthly volume plan – vendor schedules daily' : 'Monthly baseline plan',
      },
      lines,
    )
  }
}

// Sai Oct correction (v2): raises Gold Flash from 12 Oct, removes Fast Card on 31 Oct, adds Machine combo on 10 Oct
{
  const base = planLines.filter((l) => l.versionId === 'PV-SAI-202610-v1')
  const lines: Omit<PlanLine, 'versionId'>[] = []
  for (const l of base) {
    if (l.skuCode === 'FG1004201' && l.date === '2026-10-31') continue // removed line
    let qty = l.qtyEa
    if (l.skuCode === 'FG1004011' && l.date! >= '2026-10-12') qty = roundTo(qty * 1.15, 96)
    if (l.skuCode === 'FG1004012' && l.date! >= '2026-10-19' && l.date! <= '2026-10-24') qty = roundTo(qty * 0.8, 96)
    lines.push({ skuCode: l.skuCode, date: l.date, qtyEa: qty })
  }
  if (!base.some((l) => l.skuCode === 'FG1004021' && l.date === '2026-10-10')) lines.push({ skuCode: 'FG1004021', date: '2026-10-10', qtyEa: 4800 })
  addPlanVersion(
    {
      label: 'Oct-26 Sai v2',
      vendorId: 'V-SAI',
      month: '2026-10',
      granularity: 'Daily',
      kind: 'Correction',
      versionNo: 2,
      uploadedAt: '2026-10-05T11:20:00+05:30',
      uploadedBy: 'Ananya Rao',
      fileName: 'Plan_SAI01_OCT26_correction1.xlsx',
      supersedesId: 'PV-SAI-202610-v1',
      note: 'Catch-up volume on Gold Flash after early-Oct shortfall; Activ+ eased in festive week',
    },
    lines,
  )
}

/** Active version per vendor-month (latest version by default) */
export const defaultActivePlan: Record<string, string> = {}
for (const v of planVersions) {
  const key = `${v.vendorId}|${v.month}`
  const cur = planVersions.find((p) => p.id === defaultActivePlan[key])
  if (!cur || v.versionNo > cur.versionNo) defaultActivePlan[key] = v.id
}

function planFor(vendorId: string, sku: string, date: string): number | null {
  const vid = defaultActivePlan[`${vendorId}|${monthOf(date)}`]
  const l = planLines.find((p) => p.versionId === vid && p.skuCode === sku && p.date === date)
  return l ? l.qtyEa : null
}

// ── Reports & production / dispatch ─────────────────────────────────────────
export const vendorReports: VendorReport[] = []
export const productionRecords: ProductionRecord[] = []
export const dispatchRecords: DispatchRecord[] = []

/** Report dates intentionally missing (no file received) */
const missing: Record<string, string[]> = {
  'V-RKPL|Production': ['2026-10-07', '2026-10-08'],
  'V-RKPL|Dispatch': ['2026-10-07', '2026-10-08'],
  'V-RKPL|FG Inventory': ['2026-10-07', '2026-10-08'],
  'V-PAY|FG Inventory': ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'],
  'V-PAY|Dispatch': ['2026-10-08'],
  'V-VAN|Dispatch': ['2026-09-22'],
}
/** Reports received but rejected at validation → data unavailable for that date */
const rejected: Record<string, string[]> = {
  'V-PAY|Production': ['2026-10-08'],
}
const manualDates: Record<string, string[]> = {
  'V-VAN|Production': ['2026-10-05'],
  'V-AAV|Production': ['2026-09-29', '2026-09-30'],
}

let reportSeq = 0
function addReport(vendor: Vendor, type: ReportType, date: string, rows: number, opts: Partial<VendorReport> = {}) {
  const id = `R-${vendor.code}-${type.split(' ')[0].slice(0, 3).toUpperCase()}${type.includes('PM') ? 'P' : ''}-${date.replace(/-/g, '')}`
  reportSeq++
  const manual = manualDates[`${vendor.id}|${type}`]?.includes(date)
  const hh = 7 + Math.floor(rnd() * 4)
  const mm = Math.floor(rnd() * 60)
  const rcv = `${addDays(date, 1)}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`
  const batchId = nextBatchId()
  const r: VendorReport = {
    id,
    vendorId: vendor.id,
    type,
    reportDate: date,
    receivedAt: rcv,
    channel: manual ? 'Manual upload' : 'Shared inbox',
    sender: manual ? 'Rohit Kulkarni (Data Operator)' : vendor.reportEmail,
    fileName: `${vendor.code}_${type.replace(/ /g, '')}_${date.replace(/-/g, '')}.xlsx`,
    status: 'Processed',
    batchId,
    rows,
    ...opts,
  }
  vendorReports.push(r)
  uploadBatches.push({
    id: batchId,
    purpose: 'Vendor report',
    reportType: type,
    planKind: null,
    vendorId: vendor.id,
    fileName: r.fileName,
    fileSizeKb: Math.round(between(9, 40)),
    checksum: `sha1:${Math.floor(rnd() * 1e12).toString(16)}`,
    channel: r.channel,
    uploadedAt: rcv,
    uploadedBy: manual ? 'Rohit Kulkarni' : 'Inbox ingestion (demo)',
    status: r.status === 'Rejected' ? 'Rejected' : r.status === 'Processed with warnings' ? 'Ingested with exclusions' : 'Ingested',
    rowsTotal: rows,
    rowsAccepted: r.status === 'Rejected' ? 0 : rows,
    rowsExcluded: 0,
    issues: [],
    producedIds: r.status === 'Rejected' ? [] : [id],
    demo: true,
  })
  return r
}

// Running FG lots for FIFO simulation, keyed vendor|sku
const lotsState: Record<string, FgLot[]> = {}
const lastDispatchDate: Record<string, string> = {}
export const fgSnapshots: FgSnapshot[] = []

// Opening stock (from before history window), including an old lot to create near-expiry evidence
for (const m of M.vendorSkuMaps) {
  const key = `${m.vendorId}|${m.skuCode}`
  const rate = baseRate[key]
  const sku = skuByCode(m.skuCode)
  const mfg = '2026-08-10'
  lotsState[key] = [{ lotNo: `${vendorById(m.vendorId).code}-${m.skuCode.slice(-4)}-0810`, mfgDate: mfg, expiryDate: addDays(mfg, sku.shelfLifeDays), qtyEa: roundTo(rate * between(3, 5), sku.casePack) }]
}
// legacy near-expiry lots
lotsState['V-PAY|FG2003011'].unshift({ lotNo: 'PAY05-3011-L2411', mfgDate: '2024-11-20', expiryDate: '2026-11-20', qtyEa: 5040 })
lotsState['V-VAN|FG2002011'].unshift({ lotNo: 'VAN02-2011-L2310', mfgDate: '2023-10-28', expiryDate: '2026-10-27', qtyEa: 1920 })
lotsState['V-AAV|FG3001021'].unshift({ lotNo: 'AAV04-1021-L2505', mfgDate: '2025-05-02', expiryDate: '2026-10-24', qtyEa: 660 })

const allDays = eachDay(HISTORY_START, LATEST_DUE_DATE)

for (const date of allDays) {
  for (const vendor of M.vendors) {
    const operating = isOperating(calCtx, vendor, date)
    const maps = M.vendorSkuMaps.filter((m) => m.vendorId === vendor.id)
    const inWindow = date >= DATA_START
    const has = (t: ReportType) => !missing[`${vendor.id}|${t}`]?.includes(date)
    const isRejected = (t: ReportType) => rejected[`${vendor.id}|${t}`]?.includes(date)

    // Production
    let prodReport: VendorReport | null = null
    const producedToday: Record<string, number> = {}
    if (operating) {
      for (const m of maps) {
        const key = `${vendor.id}|${m.skuCode}`
        const sku = skuByCode(m.skuCode)
        const plan = inWindow ? planFor(vendor.id, m.skuCode, date) : baseRate[key]
        let factor = between(0.88, 1.08)
        const story = performance[key]
        if (story && date >= '2026-10-01') factor = between(story[0], story[1])
        let qty: number
        if (MONTHLY_PLAN_VENDORS.has(vendor.id)) qty = roundTo(baseRate[key] * between(0.8, 1.1), sku.casePack)
        else if (plan == null) {
          // No plan for the day – Vanessa occasionally runs Petal Crush Pink anyway
          qty = vendor.id === 'V-VAN' && ['2026-10-03', '2026-10-06', '2026-09-24'].includes(date) ? 2400 : 0
        } else qty = roundTo(plan * factor, sku.casePack)
        // Vanessa reported zero for Cool Surf spray on 6 Oct (line stoppage noted in report)
        if (vendor.id === 'V-VAN' && m.skuCode === 'FG2002012' && date === '2026-10-06') qty = 0
        if (vendor.id === 'V-SAI' && m.skuCode === 'FG1004201' && date === '2026-10-07') qty = 0
        producedToday[m.skuCode] = qty
      }
    }
    if (operating && inWindow && has('Production')) {
      if (isRejected('Production')) {
        prodReport = addReport(vendor, 'Production', date, maps.length, { status: 'Rejected' })
      } else {
        const warn = vendor.id === 'V-RKPL' && date === '2026-10-05'
        prodReport = addReport(vendor, 'Production', date, maps.length + (warn ? 1 : 0), warn ? { status: 'Processed with warnings' } : {})
        for (const m of maps) {
          const qty = producedToday[m.skuCode]
          // Zero-qty lines are only recorded when vendor explicitly reported 0 against a plan or a known product
          const plan = planFor(vendor.id, m.skuCode, date)
          if (qty === 0 && plan == null && !MONTHLY_PLAN_VENDORS.has(vendor.id)) continue
          productionRecords.push({ id: `P-${prodReport.id}-${m.skuCode}`, vendorId: vendor.id, skuCode: m.skuCode, date, qtyEa: qty, reportId: prodReport.id })
        }
      }
    }
    // Physical production still happens even if the report is missing (affects stock later)
    if (operating) {
      for (const m of maps) {
        const q = producedToday[m.skuCode]
        if (!q) continue
        const sku = skuByCode(m.skuCode)
        lotsState[`${vendor.id}|${m.skuCode}`].push({
          lotNo: `${vendor.code}-${m.skuCode.slice(-4)}-${date.slice(5).replace('-', '')}`,
          mfgDate: date,
          expiryDate: addDays(date, sku.shelfLifeDays),
          qtyEa: q,
        })
      }
    }

    // Dispatch (FIFO from lots)
    if (operating) {
      let dispReport: VendorReport | null = null
      const lines: { sku: string; qty: number }[] = []
      for (const m of maps) {
        const key = `${vendor.id}|${m.skuCode}`
        const sku = skuByCode(m.skuCode)
        // dispatch cadence: most SKUs ship ~4 days/week; Payal Aer Matic ships rarely → idle stock
        const shipProb = key === 'V-PAY|FG2003011' ? (date < '2026-09-25' ? 0.35 : 0) : key === 'V-VAN|FG2001013' ? 0.5 : 0.72
        if (rnd() > shipProb) continue
        const stock = lotsState[key].reduce((a, l) => a + l.qtyEa, 0)
        const want = roundTo(baseRate[key] * between(1.0, 1.6), sku.casePack)
        let qty = Math.min(stock, want)
        qty = roundTo(qty, sku.casePack)
        if (qty <= 0) continue
        let rem = qty
        // FIFO but skip the legacy (old) lots – they are the "stuck" evidence
        for (const lot of lotsState[key]) {
          if (rem <= 0) break
          if (lot.mfgDate < '2026-01-01') continue
          const take = Math.min(lot.qtyEa, rem)
          lot.qtyEa -= take
          rem -= take
        }
        qty -= rem
        lotsState[key] = lotsState[key].filter((l) => l.qtyEa > 0)
        if (qty > 0) {
          lines.push({ sku: m.skuCode, qty })
          lastDispatchDate[key] = date
        }
      }
      if (inWindow && has('Dispatch')) {
        dispReport = addReport(vendor, 'Dispatch', date, lines.length)
        lines.forEach((l, i) =>
          dispatchRecords.push({
            id: `D-${dispReport!.id}-${l.sku}`,
            vendorId: vendor.id,
            skuCode: l.sku,
            date,
            qtyEa: l.qty,
            invoiceNo: `INV/${vendor.code}/${date.slice(5).replace('-', '')}/${i + 1}`,
            reportId: dispReport!.id,
          }),
        )
      }
    }

    // FG inventory snapshot (daily report on operating days; history snapshots on Mondays before window)
    const isMonday = new Date(date).getUTCDay() === 1
    if ((inWindow && operating && has('FG Inventory')) || (!inWindow && isMonday)) {
      const rep = inWindow ? addReport(vendor, 'FG Inventory', date, maps.length) : null
      for (const m of maps) {
        const key = `${vendor.id}|${m.skuCode}`
        const lots = lotsState[key].map((l) => ({ ...l }))
        fgSnapshots.push({
          id: `FG-${vendor.code}-${m.skuCode}-${date}`,
          vendorId: vendor.id,
          skuCode: m.skuCode,
          snapshotDate: date,
          qtyEa: lots.reduce((a, l) => a + l.qtyEa, 0),
          lots,
          reportId: rep ? rep.id : `R-HIST-${vendor.code}-${date.replace(/-/g, '')}`,
        })
      }
    }
  }
}

// RKPL 5 Oct report contained an unknown vendor item code → one row excluded
{
  const b = uploadBatches.find((x) => x.fileName === 'RKP03_Production_20261005.xlsx')!
  b.rowsExcluded = 1
  b.rowsAccepted = b.rowsTotal - 1
  b.issues.push({ row: 5, column: 'Item Code', severity: 'Warning', problem: 'Unknown vendor item code “GK-ADV-COIL-X” – no SKU mapping', guidance: 'Add a code mapping in Master Data → Code mappings, then re-process the batch.' })
}
{
  const b = uploadBatches.find((x) => x.fileName === 'PAY05_Production_20261008.xlsx')!
  b.issues.push({
    row: null,
    column: 'Produced Qty',
    severity: 'Error',
    problem: 'Required column “Produced Qty” not found (header row has “Prod Qty (cases)”)',
    guidance: 'Ask vendor to resend using the standard template, or re-upload manually after renaming the column.',
  })
}
// Duplicate file received for Sai dispatch 7 Oct
{
  const orig = uploadBatches.find((x) => x.fileName === 'SAI01_Dispatch_20261007.xlsx')!
  uploadBatches.push({
    ...orig,
    id: nextBatchId(),
    uploadedAt: '2026-10-08T14:02:00+05:30',
    status: 'Duplicate – skipped',
    rowsAccepted: 0,
    producedIds: [],
    issues: [
      {
        row: null,
        column: null,
        severity: 'Warning',
        problem: `Identical checksum to batch ${orig.id} (already ingested)`,
        guidance: 'No action needed. If this is a corrected file, ask the vendor to change the content or upload as a correction.',
      },
    ],
  })
}

// ── RM / PM inventory ───────────────────────────────────────────────────────
export const materialSnapshots: MaterialSnapshot[] = []
const matBase: Record<string, number> = {
  'RM-TRF01': 420,
  'RM-SOLV2': 18500,
  'PM-BTL45': 640000,
  'PM-CTGK1': 520000,
  'RM-CPWD1': 61000,
  'PM-SHRK1': 84000,
  'RM-GEL01': 9200,
  'RM-FRCS1': 780,
  'PM-LAM01': 46,
  'PM-CAN22': 210000,
  'RM-LABS1': 28000,
  'PM-HDPE1': 96000,
  'PM-PCH05': 180000,
  'RM-FRGL2': 310,
  'PM-REF22': 41000,
}
const matDates = eachDay('2026-09-01', LATEST_DUE_DATE).filter((d) => [1, 4].includes(new Date(d).getUTCDay()))
for (const vendor of M.vendors) {
  for (const date of matDates) {
    if (vendor.id === 'V-PAY' && date > '2026-10-01') continue // stale materials report
    if (!isOperating(calCtx, vendor, date)) continue
    const codes = M.vendorMaterials[vendor.id]
    const repRM = addReport(vendor, 'RM Inventory', date, codes.filter((c) => c.startsWith('RM')).length)
    const repPM = addReport(vendor, 'PM Inventory', date, codes.filter((c) => c.startsWith('PM')).length)
    for (const code of codes) {
      const mat = M.materials.find((m) => m.code === code)!
      const total = Math.round(matBase[code] * between(0.6, 1.25) * (vendor.id === 'V-AAV' ? 1 : 0.8))
      const lots: MaterialLot[] = []
      let rem = total
      const n = 2 + Math.floor(rnd() * 3)
      for (let i = 0; i < n; i++) {
        const q = i === n - 1 ? rem : Math.round(rem * between(0.3, 0.6))
        rem -= q
        const recv = addDays(date, -Math.round(between(5, 140)) - i * 15)
        const shelf = mat.kind === 'RM' ? 365 : null
        lots.push({ lotNo: `${code.slice(3)}-${recv.slice(2).replace(/-/g, '')}-${i + 1}`, receivedDate: recv, expiryDate: shelf ? addDays(recv, shelf) : null, qty: q })
      }
      // Deliberately ageing / expiring lots
      if (code === 'RM-FRCS1' && vendor.id === 'V-VAN') lots.push({ lotNo: 'FRCS1-250930-X', receivedDate: '2025-09-30', expiryDate: '2026-09-30', qty: 85 })
      if (code === 'RM-TRF01' && vendor.id === 'V-RKPL') lots.push({ lotNo: 'TRF01-251102-X', receivedDate: '2025-11-02', expiryDate: '2026-11-02', qty: 36 })
      materialSnapshots.push({
        id: `MS-${vendor.code}-${code}-${date}`,
        vendorId: vendor.id,
        materialCode: code,
        snapshotDate: date,
        qty: lots.reduce((a, l) => a + l.qty, 0),
        uom: mat.uom,
        lots: lots.filter((l) => l.qty > 0),
        reportId: mat.kind === 'RM' ? repRM.id : repPM.id,
      })
    }
  }
}

// ── Purchase orders ─────────────────────────────────────────────────────────
export const poLines: PoLine[] = []
{
  let po = 4500210
  for (const vendor of M.vendors) {
    const maps = M.vendorSkuMaps.filter((m) => m.vendorId === vendor.id)
    const poNumber = String(++po)
    maps.forEach((m, i) => {
      const key = `${vendor.id}|${m.skuCode}`
      const sku = skuByCode(m.skuCode)
      const octOperating = eachDay('2026-10-01', '2026-10-31').filter((d) => isOperating(calCtx, vendor, d)).length
      // coverage story: Sai Gold Flash and Payal FAB pouch under-covered; Vanessa Musk fully covered
      const coverFactor = key === 'V-SAI|FG1004011' ? 0.55 : key === 'V-PAY|FG3002011' ? 0.4 : key === 'V-VAN|FG2001013' ? 1.25 : between(0.85, 1.05)
      const ordered = roundTo(baseRate[key] * octOperating * coverFactor, sku.casePack)
      const received = dispatchRecords.filter((d) => d.vendorId === vendor.id && d.skuCode === m.skuCode && d.date >= '2026-10-01').reduce((a, d) => a + d.qtyEa, 0)
      const rec = Math.min(received, ordered)
      poLines.push({
        id: `PO-${poNumber}-${i + 1}`,
        poNumber,
        lineNo: (i + 1) * 10,
        vendorId: vendor.id,
        skuCode: m.skuCode,
        orderedEa: ordered,
        receivedEa: rec,
        deliveryDate: '2026-10-31',
        status: rec === 0 ? 'Open' : rec >= ordered ? 'Closed' : 'Partially received',
      })
    })
    // Sai has a second, smaller PO for Activ+ in Nov – outside Oct horizon
    if (vendor.id === 'V-SAI') poLines.push({ id: `PO-${po + 100}-1`, poNumber: String(po + 100), lineNo: 10, vendorId: vendor.id, skuCode: 'FG1004012', orderedEa: 192000, receivedEa: 0, deliveryDate: '2026-11-15', status: 'Open' })
  }
}

// ── Scale-test scenario (opt-in, GENERATED vendors – not GCPL master data) ───
// Runs after the core dataset with its own PRNG so the core demo numbers never change.
// Each generated vendor gets a story: within / above / below plan, monthly plan, missing,
// stale or rejected reports and explicit zero production. All totals derive from these records.
{
  const srnd = mulberry32(16151413)
  const sb = (lo: number, hi: number) => lo + (hi - lo) * srnd()
  type Story = { rate: number; perf: [number, number]; monthly?: boolean; missing?: string[]; staleAfter?: string; rejected?: string[]; zero?: [string, string][] }
  const stories: Record<string, Story> = {
    'V-S6': { rate: 14400, perf: [0.93, 1.05] },
    'V-S7': { rate: 4800, perf: [1.14, 1.3] },
    'V-S8': { rate: 9600, perf: [0.68, 0.86] },
    'V-S9': { rate: 7200, perf: [0.85, 1.05], monthly: true },
    'V-S10': { rate: 3600, perf: [0.9, 1.06], missing: ['2026-10-06', '2026-10-07'] },
    'V-S11': { rate: 30000, perf: [0.88, 1.02], staleAfter: '2026-10-03' },
    'V-S12': {
      rate: 12000,
      perf: [0.9, 1.04],
      zero: [
        ['FG1004021', '2026-10-05'],
        ['FG1004021', '2026-10-06'],
        ['FG1004101', '2026-10-07'],
      ],
    },
    'V-S13': { rate: 6000, perf: [0.85, 1.1], monthly: true },
    'V-S14': { rate: 240000, perf: [0.95, 1.08] },
    'V-S15': { rate: 4800, perf: [0.86, 1.12], rejected: ['2026-10-08'] },
    'V-S16': { rate: 9600, perf: [0.84, 0.96] },
  }
  const sPlan = new Map<string, number>()
  for (const vendor of M.activeGeneratedVendors) {
    const st = stories[vendor.id]
    const maps = M.scaleVendorSkuMaps.filter((m) => m.vendorId === vendor.id)
    for (const month of PLAN_MONTHS) {
      const days = eachDay(`${month}-01`, monthEnd(month)).filter((d) => isOperating(calCtx, vendor, d))
      const lines: Omit<PlanLine, 'versionId'>[] = []
      for (const m of maps) {
        const step = skuByCode(m.skuCode).casePack
        if (st.monthly) {
          lines.push({ skuCode: m.skuCode, date: null, qtyEa: roundTo(st.rate * days.length * sb(0.95, 1.05), step * 10) })
          continue
        }
        for (const d of days) {
          const q = roundTo(st.rate * sb(0.9, 1.1), step)
          lines.push({ skuCode: m.skuCode, date: d, qtyEa: q })
          sPlan.set(`${vendor.id}|${m.skuCode}|${d}`, q)
        }
      }
      const mon = month === '2026-09' ? 'Sep' : 'Oct'
      const id = addPlanVersion(
        {
          label: `${mon}-26 ${vendor.name} v1`,
          vendorId: vendor.id,
          month,
          granularity: st.monthly ? 'Monthly' : 'Daily',
          kind: 'Baseline',
          versionNo: 1,
          uploadedAt: month === '2026-09' ? '2026-08-27T16:30:00+05:30' : '2026-09-28T16:05:00+05:30',
          uploadedBy: 'Ananya Rao',
          fileName: `Plan_${vendor.code}_${mon.toUpperCase()}26_baseline.xlsx`,
          supersedesId: null,
          note: 'Generated scale-test plan (demo)',
        },
        lines,
      )
      defaultActivePlan[`${vendor.id}|${month}`] = id
    }
    for (const m of maps) {
      const sku = skuByCode(m.skuCode)
      lotsState[`${vendor.id}|${m.skuCode}`] = [{ lotNo: `${vendor.code}-${m.skuCode.slice(-4)}-0810`, mfgDate: '2026-08-10', expiryDate: addDays('2026-08-10', sku.shelfLifeDays), qtyEa: roundTo(st.rate * sb(3, 5), sku.casePack) }]
    }
    for (const date of allDays) {
      const operating = isOperating(calCtx, vendor, date)
      const inWindow = date >= DATA_START
      const received = inWindow && operating && !(st.staleAfter && date > st.staleAfter)
      const prodReceived = received && !st.missing?.includes(date)
      const produced: Record<string, number> = {}
      if (operating) {
        for (const m of maps) {
          const sku = skuByCode(m.skuCode)
          const plan = sPlan.get(`${vendor.id}|${m.skuCode}|${date}`) ?? st.rate
          const f = date >= '2026-10-01' ? sb(st.perf[0], st.perf[1]) : sb(0.9, 1.06)
          produced[m.skuCode] = st.zero?.some(([c, d]) => c === m.skuCode && d === date) ? 0 : roundTo(plan * f, sku.casePack)
        }
      }
      if (prodReceived) {
        const rej = st.rejected?.includes(date)
        const rep = addReport(vendor, 'Production', date, maps.length, rej ? { status: 'Rejected' } : {})
        if (rej) {
          uploadBatches.find((b) => b.id === rep.batchId)!.issues.push({ row: null, column: 'Produced Qty', severity: 'Error', problem: 'Quantity column empty for all rows', guidance: 'Ask the vendor to resend the report.' })
        } else for (const m of maps) productionRecords.push({ id: `P-${rep.id}-${m.skuCode}`, vendorId: vendor.id, skuCode: m.skuCode, date, qtyEa: produced[m.skuCode], reportId: rep.id })
      }
      if (!operating) continue
      const dispatched: { sku: string; qty: number }[] = []
      for (const m of maps) {
        const key = `${vendor.id}|${m.skuCode}`
        const sku = skuByCode(m.skuCode)
        if (produced[m.skuCode]) lotsState[key].push({ lotNo: `${vendor.code}-${m.skuCode.slice(-4)}-${date.slice(5).replace('-', '')}`, mfgDate: date, expiryDate: addDays(date, sku.shelfLifeDays), qtyEa: produced[m.skuCode] })
        if (srnd() > 0.7) continue
        let rem = Math.min(
          lotsState[key].reduce((a, l) => a + l.qtyEa, 0),
          roundTo(st.rate * sb(1.0, 1.5), sku.casePack),
        )
        const qty = rem
        for (const lot of lotsState[key]) {
          if (rem <= 0) break
          const take = Math.min(lot.qtyEa, rem)
          lot.qtyEa -= take
          rem -= take
        }
        lotsState[key] = lotsState[key].filter((l) => l.qtyEa > 0)
        if (qty > 0) {
          dispatched.push({ sku: m.skuCode, qty })
          lastDispatchDate[key] = date
        }
      }
      if (received) {
        const rep = addReport(vendor, 'Dispatch', date, dispatched.length)
        dispatched.forEach((l, i) =>
          dispatchRecords.push({ id: `D-${rep.id}-${l.sku}`, vendorId: vendor.id, skuCode: l.sku, date, qtyEa: l.qty, invoiceNo: `INV/${vendor.code}/${date.slice(5).replace('-', '')}/${i + 1}`, reportId: rep.id }),
        )
      }
      const isMonday = new Date(date).getUTCDay() === 1
      if (received || (!inWindow && isMonday)) {
        const rep = received ? addReport(vendor, 'FG Inventory', date, maps.length) : null
        for (const m of maps) {
          const lots = lotsState[`${vendor.id}|${m.skuCode}`].map((l) => ({ ...l }))
          fgSnapshots.push({
            id: `FG-${vendor.code}-${m.skuCode}-${date}`,
            vendorId: vendor.id,
            skuCode: m.skuCode,
            snapshotDate: date,
            qtyEa: lots.reduce((a, l) => a + l.qtyEa, 0),
            lots,
            reportId: rep ? rep.id : `R-HIST-${vendor.code}-${date.replace(/-/g, '')}`,
          })
        }
      }
    }
    // RM/PM snapshots (Mon/Thu); the stale vendor stops sending after its cut-off
    const codes = M.scaleVendorMaterials[vendor.id]
    for (const date of matDates) {
      if (!isOperating(calCtx, vendor, date) || (st.staleAfter && date > st.staleAfter)) continue
      const repRM = addReport(vendor, 'RM Inventory', date, codes.filter((c) => c.startsWith('RM')).length)
      const repPM = addReport(vendor, 'PM Inventory', date, codes.filter((c) => c.startsWith('PM')).length)
      for (const code of codes) {
        const mat = M.materials.find((x) => x.code === code)!
        const qty = Math.round(matBase[code] * sb(0.3, 0.8))
        const recv = addDays(date, -Math.round(sb(5, 90)))
        materialSnapshots.push({
          id: `MS-${vendor.code}-${code}-${date}`,
          vendorId: vendor.id,
          materialCode: code,
          snapshotDate: date,
          qty,
          uom: mat.uom,
          lots: [{ lotNo: `${code.slice(3)}-${recv.slice(2).replace(/-/g, '')}-1`, receivedDate: recv, expiryDate: mat.kind === 'RM' ? addDays(recv, 365) : null, qty }],
          reportId: mat.kind === 'RM' ? repRM.id : repPM.id,
        })
      }
    }
    // One October PO per generated vendor
    const poNumber = `46${vendor.code.slice(2).padStart(5, '0')}`
    maps.forEach((m, i) => {
      const sku = skuByCode(m.skuCode)
      const ordered = roundTo(st.rate * 24 * sb(0.85, 1.05), sku.casePack)
      const rec = Math.min(
        ordered,
        dispatchRecords.filter((d) => d.vendorId === vendor.id && d.skuCode === m.skuCode && d.date >= '2026-10-01').reduce((a, d) => a + d.qtyEa, 0),
      )
      poLines.push({
        id: `PO-${poNumber}-${i + 1}`,
        poNumber,
        lineNo: (i + 1) * 10,
        vendorId: vendor.id,
        skuCode: m.skuCode,
        orderedEa: ordered,
        receivedEa: rec,
        deliveryDate: '2026-10-31',
        status: rec === 0 ? 'Open' : rec >= ordered ? 'Closed' : 'Partially received',
      })
    })
  }
}

export const lastDispatchByVendorSku = lastDispatchDate
export const DATA_SUMMARY = {
  days: diffDays(LATEST_DUE_DATE, DATA_START) + 1,
  productionRecords: productionRecords.length,
  dispatchRecords: dispatchRecords.length,
  reports: vendorReports.length,
}
