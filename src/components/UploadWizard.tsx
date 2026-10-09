// Upload wizard shared by plan uploads and manual vendor-report uploads.
// Prototype: file name/size are checked; file contents are NOT parsed. Outcomes are simulated from a chosen
// demo scenario and recorded only in this browser.
import { AlertTriangle, Check, CheckCircle2, Download, FileSpreadsheet, FlaskConical, Lock, MinusCircle, Upload, XCircle } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { reportKey, type Dataset } from '@/data/dataset'
import type { BatchIssue, BatchStatus, Permission, PlanGranularity, PlanLine, PlanUploadKind, PlanVersion, ReportStatus, ReportType, UploadBatch, VendorReport } from '@/data/types'
import { operatingDayInfo } from '@/lib/calendar'
import { DEMO_TODAY, LATEST_DUE_DATE, eachDay, fmtDate, fmtDateDow, fmtDateTime, fmtMonth, monthEnd, monthOf, monthStart } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import { currentUserName, demoNow, logActivity, store, useDataset, usePermissions } from '@/lib/store'
import { Badge, Button, Callout, Card, EmptyState, Loading, Select, TableWrap, cx, downloadCsv, td, th } from './ui'

export interface WizardPurpose {
  id: string
  label: string
  description: string
  planKind?: PlanUploadKind
  reportType?: ReportType
}

export type Scenario = 'success' | 'missingColumn' | 'unknownCode' | 'duplicate' | 'partial'
const SCENARIOS: { id: Scenario; label: string; hint: string }[] = [
  { id: 'success', label: 'Success', hint: 'All rows valid' },
  {
    id: 'missingColumn',
    label: 'Missing required column',
    hint: 'Blocks the upload',
  },
  {
    id: 'unknownCode',
    label: 'Unknown SKU / vendor',
    hint: 'Codes not in master data – blocks the upload',
  },
  {
    id: 'duplicate',
    label: 'Duplicate file',
    hint: 'Same checksum as an earlier batch – skipped',
  },
  {
    id: 'partial',
    label: 'Partial failure',
    hint: 'Valid rows ingested, invalid rows excluded',
  },
]
const BLOCKING: Scenario[] = ['missingColumn', 'unknownCode', 'duplicate']
const STEPS = ['Purpose', 'File', 'Validate', 'Preview', 'Confirm', 'Result'] as const
const MAX_MB = 10
const PARTIAL_BAD_IDX = [2, 6, 10]

interface FileInfo {
  name: string
  sizeKb: number
  real: boolean
}
interface Ctx {
  mode: 'plan' | 'report'
  purpose: WizardPurpose
  vendorId: string
  month: string
  reportDate: string
  granularity: PlanGranularity
}
interface PreviewRow {
  row: number
  cells: (string | number)[]
}
interface Outcome {
  batch: UploadBatch
  version?: PlanVersion
  report?: VendorReport
}

// ── helpers ────────────────────────────────────────────────────────────────
function headersFor(c: Pick<Ctx, 'mode' | 'purpose' | 'granularity'>): string[] {
  if (c.mode === 'plan') return c.granularity === 'Monthly' ? ['Vendor Code', 'FG Code', 'Month', 'Plan Qty (EA)'] : ['Vendor Code', 'FG Code', 'Date', 'Plan Qty (EA)']
  switch (c.purpose.reportType) {
    case 'Production':
      return ['Vendor Code', 'FG Code', 'Production Date', 'Produced Qty']
    case 'Dispatch':
      return ['Vendor Code', 'FG Code', 'Dispatch Date', 'Dispatched Qty', 'Invoice No']
    case 'FG Inventory':
      return ['Vendor Code', 'FG Code', 'Snapshot Date', 'Lot No', 'Expiry Date', 'Qty (EA)']
    default:
      return ['Vendor Code', 'Material Code', 'Snapshot Date', 'Lot No', 'Qty', 'UOM']
  }
}
const qtyCol = (h: string[]) => h.findIndex((x) => /qty/i.test(x))
const dateCol = 2

function hash(s: string) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16)
}
function nextBatchId(ds: Dataset) {
  let max = 0
  for (const b of ds.uploadBatches) {
    const m = /^B-(\d+)$/.exec(b.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `B-${max + 1}`
}
const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step)

function vendorGranularity(ds: Dataset, vendorId: string): PlanGranularity {
  return ds.planVersions.some((v) => v.vendorId === vendorId && v.granularity === 'Monthly') ? 'Monthly' : 'Daily'
}

/** Stand-in plan lines (the file is not parsed): derived from the vendor's existing plans. */
function generatePlanLines(ds: Dataset, c: Ctx): Omit<PlanLine, 'versionId'>[] {
  const vendor = ds.idx.vendor.get(c.vendorId)!
  const activeId = ds.activePlan[`${c.vendorId}|${c.month}`]
  const base = ds.planLines.filter((l) => l.versionId === activeId)
  if (base.length) {
    const firstSku = [...new Set(base.map((l) => l.skuCode))].sort()[0]
    return base.map((l) => {
      const sku = ds.idx.sku.get(l.skuCode)
      const bump = c.purpose.planKind === 'Correction' && l.skuCode === firstSku && (l.date == null || l.date >= DEMO_TODAY)
      return {
        skuCode: l.skuCode,
        date: l.date,
        qtyEa: bump ? roundTo(l.qtyEa * 1.1, sku?.casePack ?? 1) : l.qtyEa,
      }
    })
  }
  // New period: carry forward the latest active plan's average rate per SKU onto operating days
  const refMonth = [...new Set(ds.planVersions.filter((v) => v.vendorId === c.vendorId && v.month < c.month).map((v) => v.month))].sort().pop()
  const refLines = refMonth ? ds.planLines.filter((l) => l.versionId === ds.activePlan[`${c.vendorId}|${refMonth}`]) : []
  const skus = ds.idx.vendorSkus.get(c.vendorId) ?? []
  if (c.granularity === 'Monthly') {
    return skus.map((code) => ({
      skuCode: code,
      date: null,
      qtyEa: refLines.find((l) => l.skuCode === code)?.qtyEa ?? (ds.idx.sku.get(code)?.casePack ?? 1) * 2000,
    }))
  }
  const days = eachDay(monthStart(c.month), monthEnd(c.month)).filter((d) => operatingDayInfo(ds, vendor, d).operating)
  const out: Omit<PlanLine, 'versionId'>[] = []
  for (const code of skus) {
    const sku = ds.idx.sku.get(code)
    const ls = refLines.filter((l) => l.skuCode === code)
    const avg = ls.length ? ls.reduce((a, l) => a + l.qtyEa, 0) / ls.length : (sku?.casePack ?? 1) * 100
    for (const d of days)
      out.push({
        skuCode: code,
        date: d,
        qtyEa: roundTo(avg, sku?.casePack ?? 1),
      })
  }
  return out
}

function buildRows(ds: Dataset, c: Ctx, planLines: Omit<PlanLine, 'versionId'>[], headers: string[]): PreviewRow[] {
  const vendor = ds.idx.vendor.get(c.vendorId)!
  if (c.mode === 'plan') {
    return planLines.map((l, i) => ({
      row: i + 2,
      cells: [vendor.code, l.skuCode, l.date ? fmtDate(l.date, true) : fmtMonth(c.month), l.qtyEa],
    }))
  }
  if (c.purpose.reportType === 'RM Inventory' || c.purpose.reportType === 'PM Inventory') {
    const kind = c.purpose.reportType === 'RM Inventory' ? 'RM' : 'PM'
    const mats = (ds.vendorMaterials[c.vendorId] ?? []).map((code) => ds.materials.find((m) => m.code === code)).filter((m) => m && m.kind === kind)
    return mats.map((m, i) => ({
      row: i + 2,
      cells: [vendor.code, m!.code, fmtDate(c.reportDate, true), `L${c.reportDate.replace(/-/g, '').slice(2)}${i}`, 100 * (i + 3), m!.uom],
    }))
  }
  const skus = ds.idx.vendorSkus.get(c.vendorId) ?? []
  return skus.map((code, i) => {
    const sku = ds.idx.sku.get(code)!
    const plan = ds.idx.dailyPlan.get(`${c.vendorId}|${code}|${c.reportDate}`) ?? sku.casePack * 80
    const cells: (string | number)[] = [vendor.code, code, fmtDate(c.reportDate, true)]
    if (c.purpose.reportType === 'FG Inventory') cells.push(`LOT${c.reportDate.replace(/-/g, '').slice(2)}${i}`, fmtDate(`${Number(c.reportDate.slice(0, 4)) + 1}${c.reportDate.slice(4)}`, true), plan * 3)
    else if (c.purpose.reportType === 'Dispatch') cells.push(plan, `INV-${vendor.code}-${4100 + i}`)
    else cells.push(plan)
    return { row: i + 2, cells: cells.slice(0, headers.length) }
  })
}

function issuesFor(ds: Dataset, c: Ctx, scenario: Scenario, rows: PreviewRow[], headers: string[], file: FileInfo): BatchIssue[] {
  const vendor = ds.idx.vendor.get(c.vendorId)!
  const qc = headers[qtyCol(headers)]
  const issues: BatchIssue[] = []
  if (file.real && !/\.(xlsx|csv)$/i.test(file.name))
    issues.push({
      row: null,
      column: null,
      severity: 'Error',
      problem: `File type “${file.name.split('.').pop()}” is not accepted`,
      guidance: 'Save the file as .xlsx or .csv using the template.',
    })
  switch (scenario) {
    case 'missingColumn':
      issues.push({
        row: null,
        column: qc,
        severity: 'Error',
        problem: `Required column “${qc}” not found in the header row`,
        guidance: `Download the template and keep header names unchanged. Columns found: ${headers.filter((h) => h !== qc).join(', ')}.`,
      })
      break
    case 'unknownCode': {
      issues.push({
        row: null,
        column: 'Vendor Code',
        severity: 'Error',
        problem: `Vendor code “${vendor.code.slice(0, 3)}9” does not match the selected vendor (${vendor.code}) or any vendor in master data`,
        guidance: 'Correct the vendor code in the file, or add a code mapping under Master data → Code mappings.',
      })
      for (const i of [3, 8].filter((i) => i < rows.length))
        issues.push({
          row: rows[i].row,
          column: headers[1],
          severity: 'Error',
          problem: `Code “${i === 3 ? 'GK-AO-45ML' : 'FG9999901'}” is not mapped to an FG/material code`,
          guidance: 'Map the vendor item code to an FG code under Master data → Code mappings, or correct it in the file.',
        })
      break
    }
    case 'duplicate': {
      const prev = [...ds.uploadBatches].reverse().find((b) => b.vendorId === c.vendorId && (c.mode === 'plan' ? b.purpose === 'Production plan' : b.reportType === c.purpose.reportType) && b.status !== 'Duplicate – skipped')
      issues.push({
        row: null,
        column: null,
        severity: 'Error',
        problem: prev ? `Identical checksum to batch ${prev.id} (${prev.fileName}, received ${fmtDateTime(prev.uploadedAt)})` : 'Identical checksum to an earlier batch',
        guidance:
          c.mode === 'plan'
            ? 'No action needed if this is the same file. To change the plan, edit the file and upload it as a Correction.'
            : 'No action needed if this is the same file. For corrected figures, ask the vendor to resend the changed report.',
      })
      break
    }
    case 'partial': {
      // Each flagged sample row is given the invalid value it is reported for, so preview and problem list agree.
      const qi = qtyCol(headers)
      const badDate = `31-${c.month.slice(5)}-${c.month.slice(0, 4)}`
      const probs = [
        {
          fix: (r: PreviewRow) => (r.cells[qi] = -Math.abs(Number(r.cells[qi]))),
          problem: (r: PreviewRow) => `${qc} is negative (${fmtNum(Number(r.cells[qi]))})`,
          col: qc,
          guidance: 'Quantities must be zero or positive. Correct the row and upload a correction if needed.',
        },
        {
          fix: (r: PreviewRow) => (r.cells[dateCol] = badDate),
          problem: () => `${headers[dateCol]} “${badDate}” is not a valid date in the effective period`,
          col: headers[dateCol],
          guidance: `Use dates within ${c.mode === 'plan' ? fmtMonth(c.month) : 'the report period'} in DD-MM-YYYY format.`,
        },
        {
          fix: (r: PreviewRow) => (r.cells[qi] = '12O0'),
          problem: () => `${qc} “12O0” is not a number`,
          col: qc,
          guidance: 'Remove letters, spaces or formatting from quantity cells.',
        },
      ]
      PARTIAL_BAD_IDX.filter((i) => i < rows.length).forEach((i, k) => {
        probs[k].fix(rows[i])
        issues.push({
          row: rows[i].row,
          column: probs[k].col,
          severity: 'Error',
          problem: probs[k].problem(rows[i]),
          guidance: probs[k].guidance,
        })
      })
      break
    }
  }
  return issues
}

// ── component ──────────────────────────────────────────────────────────────
export function UploadWizard({
  mode,
  purposes,
  permission,
  initial,
}: {
  mode: 'plan' | 'report'
  purposes: WizardPurpose[]
  permission: Permission
  initial?: {
    purposeId?: string
    vendorId?: string
    month?: string
    reportDate?: string
  }
}) {
  const ds = useDataset()
  const { can } = usePermissions()
  const [step, setStep] = useState(0)
  const [purposeId, setPurposeId] = useState(initial?.purposeId && purposes.some((p) => p.id === initial.purposeId) ? initial.purposeId : purposes[0].id)
  const [vendorId, setVendorId] = useState(initial?.vendorId && ds.idx.vendor.has(initial.vendorId) ? initial.vendorId : ds.vendors[0].id)
  const [month, setMonth] = useState(initial?.month ?? monthOf(DEMO_TODAY))
  const [reportDate, setReportDate] = useState(initial?.reportDate ?? LATEST_DUE_DATE)
  const [file, setFile] = useState<FileInfo | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [scenario, setScenario] = useState<Scenario>('success')
  const [validating, setValidating] = useState(false)
  const [setActive, setSetActive] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const purpose = purposes.find((p) => p.id === purposeId)!
  const vendor = ds.idx.vendor.get(vendorId)!
  const granularity = vendorGranularity(ds, vendorId)
  const ctx: Ctx = { mode, purpose, vendorId, month, reportDate, granularity }
  const headers = headersFor(ctx)
  const existing = ds.planVersions.filter((v) => v.vendorId === vendorId && v.month === month)
  const activeId = ds.activePlan[`${vendorId}|${month}`] ?? null
  const months = useMemo(() => {
    const ms = [...new Set(ds.planVersions.map((v) => v.month))].sort()
    const last = ms[ms.length - 1]
    const [y, m] = last.split('-').map(Number)
    ms.push(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`)
    return ms
  }, [ds.planVersions])

  const correctionBlocked = mode === 'plan' && purpose.planKind === 'Correction' && !existing.length
  const planLines = useMemo(() => (mode === 'plan' && !correctionBlocked ? generatePlanLines(ds, ctx) : []), [ds, mode, vendorId, month, purposeId, correctionBlocked])
  const baseRows = useMemo(() => buildRows(ds, ctx, planLines, headers), [ds, planLines, vendorId, reportDate, purposeId])
  // issuesFor writes the scenario's invalid values into the flagged rows, so it works on a fresh copy per scenario.
  const { rows, issues } = useMemo(() => {
    const rows = baseRows.map((r) => ({ ...r, cells: [...r.cells] }))
    return {
      rows,
      issues: file ? issuesFor(ds, ctx, scenario, rows, headers, file) : [],
    }
  }, [ds, scenario, baseRows, file])
  const badRows = new Set(issues.filter((i) => i.row != null).map((i) => i.row!))
  const blocking = BLOCKING.includes(scenario) || issues.some((i) => i.row == null && i.severity === 'Error')
  const accepted = blocking ? 0 : rows.length - badRows.size

  useEffect(() => {
    headingRef.current?.focus()
  }, [step])
  useEffect(() => {
    if (step !== 2) return
    setValidating(true)
    const t = setTimeout(() => setValidating(false), 900)
    return () => clearTimeout(t)
  }, [step])

  if (!can(permission))
    return (
      <Card>
        <EmptyState icon={Lock} title="Uploads are not available for this demo persona">
          The current permission group does not include “{permission === 'plan.upload' ? 'Upload / activate plan versions' : 'Upload vendor reports manually'}
          ”. Switch persona or change the group under Administration.
        </EmptyState>
      </Card>
    )

  const reset = () => {
    setStep(0)
    setFile(null)
    setScenario('success')
    setOutcome(null)
    setSetActive(false)
  }

  const commit = () => {
    const user = currentUserName()
    const now = demoNow()
    const batchId = nextBatchId(ds)
    const status: BatchStatus = scenario === 'duplicate' ? 'Duplicate – skipped' : blocking ? 'Rejected' : badRows.size ? 'Ingested with exclusions' : 'Ingested'
    const ingest = status === 'Ingested' || status === 'Ingested with exclusions'
    let version: PlanVersion | undefined
    let report: VendorReport | undefined
    let lines: PlanLine[] = []
    if (mode === 'plan' && ingest) {
      const n = Math.max(0, ...existing.map((v) => v.versionNo)) + 1
      const id = `PV-${vendorId.slice(2)}-${month.replace('-', '')}-v${n}`
      version = {
        id,
        label: `${fmtMonth(month).replace(' 20', '-')} ${vendor.name} v${n}`,
        vendorId,
        month,
        granularity,
        kind: purpose.planKind!,
        versionNo: n,
        uploadedAt: now,
        uploadedBy: user,
        fileName: file!.name,
        batchId,
        supersedesId: activeId,
        note: 'Demo upload – plan lines generated from demo data (file contents not parsed)',
      }
      lines = planLines.filter((_, i) => !PARTIAL_BAD_IDX.includes(i) || scenario !== 'partial').map((l) => ({ ...l, versionId: id }))
    }
    if (mode === 'report' && scenario !== 'duplicate') {
      const rt = purpose.reportType!
      const rstatus: ReportStatus = blocking ? 'Rejected' : badRows.size ? 'Processed with warnings' : 'Processed'
      report = {
        id: `R-${vendor.code}-${rt.split(' ')[0].slice(0, 3).toUpperCase()}${rt.includes('PM') ? 'P' : ''}-${reportDate.replace(/-/g, '')}-M${batchId.slice(2)}`,
        vendorId,
        type: rt,
        reportDate,
        receivedAt: now,
        channel: 'Manual upload',
        sender: `${user} (manual upload)`,
        fileName: file!.name,
        status: rstatus,
        batchId,
        rows: rows.length,
      }
    }
    const batch: UploadBatch = {
      id: batchId,
      purpose: mode === 'plan' ? 'Production plan' : 'Vendor report',
      reportType: purpose.reportType ?? null,
      planKind: purpose.planKind ?? null,
      vendorId,
      fileName: file!.name,
      fileSizeKb: file!.sizeKb,
      checksum: `sha1:${hash(`${file!.name}|${file!.sizeKb}|${scenario === 'duplicate' ? 'dup' : batchId}`)}`,
      channel: 'Manual upload',
      uploadedAt: now,
      uploadedBy: user,
      status,
      rowsTotal: rows.length,
      rowsAccepted: ingest ? accepted : 0,
      rowsExcluded: ingest ? badRows.size : rows.length,
      issues,
      producedIds: [version?.id, report?.id].filter((x): x is string => !!x),
      demo: true,
    }
    store.set((s) => ({
      ...s,
      extraBatches: [...s.extraBatches, batch],
      extraPlanVersions: version ? [...s.extraPlanVersions, version] : s.extraPlanVersions,
      extraPlanLines: lines.length ? [...s.extraPlanLines, ...lines] : s.extraPlanLines,
      extraReports: report ? [...s.extraReports, report] : s.extraReports,
      activePlan: version && setActive ? { ...s.activePlan, [`${vendorId}|${month}`]: version.id } : s.activePlan,
    }))
    logActivity(
      mode === 'plan' ? 'Planning' : 'Data operations',
      `${mode === 'plan' ? `${purpose.label} upload` : `Manual ${purpose.reportType} report upload`} – ${status}`,
      batchId,
      `${file!.name} · ${vendor.name}${version ? ` · created ${version.id}${setActive ? ' (set active)' : ''}` : ''}`,
    )
    setOutcome({ batch, version, report })
    setStep(5)
  }

  const canNext = step === 0 ? !correctionBlocked : step === 1 ? !!file : step === 2 ? !validating : true

  return (
    <Card bodyClass="p-0">
      <Stepper step={step} />
      <div className="px-5 py-4">
        <h2 ref={headingRef} tabIndex={-1} className="mb-3 text-title font-semibold outline-none">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </h2>

        {step === 0 && (
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-1.5 text-dense font-medium text-ink-muted">What are you uploading?</legend>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {purposes.map((p) => (
                  <label key={p.id} className={cx('flex cursor-pointer items-start gap-2 rounded-md border p-3', p.id === purposeId ? 'border-accent bg-accent-soft/40 ring-1 ring-accent' : 'border-line hover:border-line-strong')}>
                    <input type="radio" name="purpose" value={p.id} checked={p.id === purposeId} onChange={() => setPurposeId(p.id)} className="mt-0.5 accent-[var(--color-accent)]" />
                    <span>
                      <span className="block text-body font-semibold">{p.label}</span>
                      <span className="block text-dense text-ink-muted">{p.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap gap-4">
              <Select label="Vendor" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                {ds.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.code})
                  </option>
                ))}
              </Select>
              {mode === 'plan' ? (
                <Select label="Effective period" value={month} onChange={(e) => setMonth(e.target.value)}>
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {fmtMonth(m)}
                    </option>
                  ))}
                </Select>
              ) : (
                <label className="inline-flex items-center gap-1.5 text-dense text-ink-muted">
                  Report date
                  <input
                    type="date"
                    value={reportDate}
                    max={LATEST_DUE_DATE}
                    onChange={(e) => e.target.value && setReportDate(e.target.value)}
                    className="h-8 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 text-body text-ink"
                  />
                </label>
              )}
            </div>
            {mode === 'plan' ? (
              <div className="space-y-2">
                <p className="text-dense text-ink-muted">
                  Plan granularity for {vendor.name}: <strong className="text-ink">{granularity}</strong>
                  {granularity === 'Monthly' ? ' – one quantity per SKU for the month, no daily split.' : ' – one quantity per SKU per date.'} Existing versions for {fmtMonth(month)}: <strong className="text-ink">{existing.length}</strong>
                  {activeId && <> (active: {activeId})</>}.
                </p>
                {correctionBlocked && (
                  <Callout tone="warn" icon={AlertTriangle} title="A correction needs an existing plan">
                    There is no plan for {vendor.name} · {fmtMonth(month)} yet. Upload a baseline plan first.
                  </Callout>
                )}
                {purpose.planKind === 'Baseline' && existing.length > 0 && (
                  <Callout tone="info" title="A plan already exists for this period">
                    The new baseline is stored as version {Math.max(...existing.map((v) => v.versionNo)) + 1}. Earlier versions are preserved and remain viewable.
                  </Callout>
                )}
                {purpose.planKind === 'Correction' && !correctionBlocked && <p className="text-dense text-ink-muted">The correction will supersede the active version {activeId}. The baseline and earlier versions are preserved.</p>}
              </div>
            ) : (
              <>
                <Callout tone="info" title="Manual fallback">
                  Use this when a vendor report did not arrive through the shared inbox (demo). Normally {vendor.name} sends reports from {vendor.reportEmail}.
                </Callout>
                {(() => {
                  const existing = ds.idx.report.get(reportKey(vendorId, purpose.reportType!, reportDate))
                  return existing && existing.status !== 'Rejected' ? (
                    <Callout tone="warn" title={`A ${purpose.reportType} report for ${fmtDate(reportDate)} already exists (${existing.id}, ${existing.status})`}>
                      Uploading will supersede it for this date. Because file contents are not parsed in this prototype, the replacement carries no quantities – pick a date with a missing report to demonstrate the fallback.
                    </Callout>
                  ) : null
                })()}
              </>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="rounded-md border border-line bg-surface-muted p-3 text-dense">
                <div className="font-semibold">File requirements</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-muted">
                  <li>Formats: .xlsx or .csv</li>
                  <li>Maximum size: {MAX_MB} MB</li>
                  <li>Header row with columns: {headers.join(', ')}</li>
                  <li>{mode === 'plan' && granularity === 'Monthly' ? 'One row per SKU for the month' : 'One row per code per date'}; quantities in EA (materials in their own UOM)</li>
                </ul>
                <Button size="sm" className="mt-2" icon={Download} onClick={() => downloadCsv(`Template_${mode === 'plan' ? `Plan_${granularity}` : purpose.reportType!.replace(/[ /]/g, '')}.csv`, [headers, baseRows[0]?.cells ?? []])}>
                  Download template
                </Button>
              </div>
              <FilePicker
                file={file}
                error={fileError}
                onFile={(f) => {
                  if (f.size > MAX_MB * 1024 * 1024) {
                    setFileError(`“${f.name}” is ${(f.size / 1048576).toFixed(1)} MB – the limit is ${MAX_MB} MB.`)
                    setFile(null)
                    return
                  }
                  setFileError(null)
                  setFile({
                    name: f.name,
                    sizeKb: Math.max(1, Math.round(f.size / 1024)),
                    real: true,
                  })
                }}
                onSample={() => {
                  setFileError(null)
                  setFile({
                    name: mode === 'plan' ? `Plan_${vendor.code}_${month.replace('-', '')}_${purpose.planKind!.toLowerCase()}.xlsx` : `${vendor.code}_${purpose.reportType!.replace(/ /g, '')}_${reportDate.replace(/-/g, '')}_manual.xlsx`,
                    sizeKb: 24,
                    real: false,
                  })
                }}
              />
            </div>
            <fieldset className="rounded-md border border-dashed border-warn-line bg-warn-soft/40 p-3">
              <legend className="flex items-center gap-1 px-1 text-dense font-semibold text-warn">
                <FlaskConical size={13} aria-hidden /> Demo outcome to simulate
              </legend>
              <p className="mb-2 text-dense text-ink-muted">The prototype does not read file contents. Choose which validation outcome to demonstrate.</p>
              <div className="space-y-1.5">
                {SCENARIOS.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-start gap-2 text-body">
                    <input type="radio" name="scenario" checked={scenario === s.id} onChange={() => setScenario(s.id)} className="mt-0.5 accent-[var(--color-accent)]" />
                    <span>
                      <span className="font-medium">{s.label}</span> <span className="text-dense text-ink-muted">– {s.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Callout tone="warn" icon={FlaskConical} title="Simulated validation — the file contents are not parsed in this prototype">
              File name and size are checked for real; column, code, duplicate and value checks follow the chosen demo scenario.
            </Callout>
            {validating ? <Loading label={`Validating ${file?.name}…`} /> : <ValidationChecks issues={issues} scenario={scenario} file={file!} />}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            {blocking ? (
              <Callout tone="bad" icon={XCircle} title={scenario === 'duplicate' ? 'Duplicate file – nothing will be ingested' : 'This file cannot be ingested'}>
                Fix the problems below and upload again. You can record this attempt so it appears in Upload History.
              </Callout>
            ) : badRows.size ? (
              <Callout tone="warn" icon={AlertTriangle} title={`${badRows.size} row(s) will be excluded`}>
                {accepted} valid rows can be ingested; the highlighted rows are excluded with the reasons below.
              </Callout>
            ) : (
              <Callout tone="ok" icon={CheckCircle2} title="All rows passed validation (simulated)" />
            )}
            {issues.length > 0 && <IssueTable issues={issues} />}
            <PreviewTable headers={headers} rows={rows} badRows={badRows} missingCol={scenario === 'missingColumn' ? headers[qtyCol(headers)] : null} />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <dl className="grid gap-x-6 gap-y-2 text-body md:grid-cols-2">
              {[
                ['Purpose', purpose.label],
                ['Vendor', `${vendor.name} (${vendor.code})`],
                [mode === 'plan' ? 'Effective period' : 'Report date', mode === 'plan' ? `${fmtMonth(month)} · ${granularity}` : fmtDateDow(reportDate)],
                ['File', `${file!.name} (${fmtNum(file!.sizeKb)} KB)`],
                ['Rows to ingest', `${accepted} of ${rows.length}`],
                ['Rows excluded', String(badRows.size)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-label text-ink-muted">{k}</dt>
                  <dd className="num font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {mode === 'plan' && (
              <label className="flex items-start gap-2 rounded-md border border-line p-3 text-body">
                <input type="checkbox" checked={setActive} onChange={(e) => setSetActive(e.target.checked)} className="mt-0.5 accent-[var(--color-accent)]" />
                <span>
                  <span className="font-medium">Set as active version immediately</span>
                  <span className="block text-dense text-ink-muted">If unchecked, the new version is stored but analysis keeps using {activeId ?? 'no plan'} until you activate it from Version history.</span>
                </span>
              </label>
            )}
            <p className="text-dense text-ink-muted">Confirming records a demo batch in this browser only. Nothing is sent to GCPL systems.</p>
          </div>
        )}

        {step === 5 && outcome && <ResultView outcome={outcome} mode={mode} setActive={setActive} />}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
        <div>
          {step > 0 && step < 5 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {step < 3 && (
            <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Continue
            </Button>
          )}
          {step === 3 &&
            (blocking ? (
              <Button variant="danger" onClick={commit}>
                Record {scenario === 'duplicate' ? 'skipped duplicate' : 'rejected upload'}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setStep(4)}>
                Continue
              </Button>
            ))}
          {step === 4 && (
            <Button variant="primary" icon={Upload} onClick={commit}>
              Confirm {mode === 'plan' ? 'plan upload' : 'report upload'}
            </Button>
          )}
          {step === 5 && <Button onClick={reset}>Start another upload</Button>}
        </div>
      </div>
    </Card>
  )
}

function Stepper({ step }: { step: number }) {
  return (
    <ol aria-label="Upload steps" className="flex flex-wrap gap-y-1 border-b border-line bg-surface-muted px-5 py-2.5">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === step ? 'step' : undefined} className="flex items-center text-dense">
          <span
            className={cx(
              'mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-label font-semibold',
              i < step ? 'bg-accent text-white' : i === step ? 'border-2 border-accent text-accent-ink' : 'border border-line-strong text-ink-subtle',
            )}
          >
            {i < step ? <Check size={12} aria-hidden /> : i + 1}
          </span>
          <span className={cx(i === step ? 'font-semibold text-ink' : 'text-ink-muted')}>
            {s}
            {i < step && <span className="sr-only"> (done)</span>}
          </span>
          {i < STEPS.length - 1 && <span className="mx-2.5 h-px w-6 bg-line-strong" aria-hidden />}
        </li>
      ))}
    </ol>
  )
}

function FilePicker({ file, error, onFile, onSample }: { file: FileInfo | null; error: string | null; onFile: (f: File) => void; onSample: () => void }) {
  const id = useId()
  const [drag, setDrag] = useState(false)
  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          const f = e.dataTransfer.files[0]
          if (f) onFile(f)
        }}
        className={cx(
          'flex cursor-pointer flex-col items-center gap-1 rounded-md border-2 border-dashed px-4 py-5 text-center text-body focus-within:ring-2 focus-within:ring-accent',
          drag ? 'border-accent bg-accent-soft/40' : 'border-line-strong hover:border-accent/60',
        )}
      >
        <FileSpreadsheet size={22} className="text-ink-subtle" aria-hidden />
        <span className="font-medium">Choose a file or drag it here</span>
        <span className="text-dense text-ink-muted">.xlsx or .csv, up to {MAX_MB} MB</span>
        <input
          id={id}
          type="file"
          accept=".xlsx,.csv"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            e.target.value = ''
          }}
        />
      </label>
      <div className="mt-2 flex items-center gap-2 text-dense text-ink-muted">
        or
        <Button size="sm" variant="ghost" icon={FlaskConical} onClick={onSample}>
          Use demo sample file
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-1 flex items-center gap-1 text-dense text-bad">
          <XCircle size={13} aria-hidden /> {error}
        </p>
      )}
      {file && (
        <p className="mt-1 flex items-center gap-1.5 text-dense">
          <CheckCircle2 size={14} className="text-ok" aria-hidden /> Selected: <strong>{file.name}</strong> ({fmtNum(file.sizeKb)} KB)
          {!file.real && <Badge tone="warn">Demo sample</Badge>}
        </p>
      )}
    </div>
  )
}

function ValidationChecks({ issues, scenario, file }: { issues: BatchIssue[]; scenario: Scenario; file: FileInfo }) {
  const typeOk = !file.real || /\.(xlsx|csv)$/i.test(file.name)
  const rowErr = issues.filter((i) => i.row != null).length
  // Once a check fails, later checks that depend on readable columns/rows are reported as not run.
  const blockedBy = !typeOk ? 0 : scenario === 'missingColumn' ? 2 : -1
  const checks: {
    label: string
    state: 'pass' | 'fail' | 'warn' | 'skip'
    detail?: string
    simulated: boolean
  }[] = (
    [
      {
        label: 'File type (.xlsx / .csv)',
        state: typeOk ? 'pass' : 'fail',
        simulated: false,
      },
      {
        label: `File size ≤ ${MAX_MB} MB`,
        state: 'pass',
        detail: `${fmtNum(file.sizeKb)} KB`,
        simulated: false,
      },
      {
        label: 'Required columns present',
        state: scenario === 'missingColumn' ? 'fail' : 'pass',
        simulated: true,
      },
      {
        label: 'Vendor and item codes exist in master data',
        state: scenario === 'unknownCode' ? 'fail' : 'pass',
        simulated: true,
      },
      {
        label: 'Not a duplicate of an earlier file (checksum)',
        state: scenario === 'duplicate' ? 'fail' : 'pass',
        simulated: true,
      },
      {
        label: 'Dates in period, quantities numeric and ≥ 0',
        state: scenario === 'partial' ? 'warn' : 'pass',
        detail: scenario === 'partial' ? `${rowErr} row(s) fail – will be excluded` : undefined,
        simulated: true,
      },
    ] as const
  ).map((c, i) => (blockedBy >= 0 && i > blockedBy && i >= 2 ? { ...c, state: 'skip' as const, detail: undefined } : c))
  const icon = {
    pass: <CheckCircle2 size={15} className="text-ok" aria-hidden />,
    fail: <XCircle size={15} className="text-bad" aria-hidden />,
    warn: <AlertTriangle size={15} className="text-warn" aria-hidden />,
    skip: <MinusCircle size={15} className="text-ink-subtle" aria-hidden />,
  }
  const text = {
    pass: 'Passed',
    fail: 'Failed',
    warn: 'Row errors',
    skip: 'Not run – blocked by the failure above',
  }
  return (
    <ul className="divide-y divide-line rounded-md border border-line">
      {checks.map((c) => (
        <li key={c.label} className="flex flex-wrap items-center gap-2 px-3 py-2 text-body">
          {icon[c.state]}
          <span className="font-medium">{c.label}</span>
          <span className={cx('text-dense', c.state === 'pass' ? 'text-ok' : c.state === 'fail' ? 'text-bad' : c.state === 'skip' ? 'text-ink-subtle' : 'text-warn')}>{text[c.state]}</span>
          {c.detail && <span className="text-dense text-ink-muted">· {c.detail}</span>}
          <span className="ml-auto text-label text-ink-subtle">{c.simulated ? 'Simulated' : 'Checked'}</span>
        </li>
      ))}
    </ul>
  )
}

function IssueTable({ issues }: { issues: BatchIssue[] }) {
  return (
    <div className="rounded-md border border-line">
      <div className="border-b border-line px-3 py-2 text-body font-semibold">Problems found ({issues.length})</div>
      <TableWrap maxHeight={240}>
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={th}>Row</th>
              <th className={th}>Column</th>
              <th className={th}>Severity</th>
              <th className={th}>Problem</th>
              <th className={th}>How to fix</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((i, k) => (
              <tr key={k}>
                <td className={cx(td, 'num')}>{i.row ?? 'File'}</td>
                <td className={td}>{i.column ?? '—'}</td>
                <td className={td}>
                  <Badge tone={i.severity === 'Error' ? 'bad' : 'warn'} icon={i.severity === 'Error' ? XCircle : AlertTriangle}>
                    {i.severity}
                  </Badge>
                </td>
                <td className={td}>{i.problem}</td>
                <td className={cx(td, 'text-ink-muted')}>{i.guidance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </div>
  )
}

function PreviewTable({ headers, rows, badRows, missingCol }: { headers: string[]; rows: PreviewRow[]; badRows: Set<number>; missingCol: string | null }) {
  const shown = rows.slice(0, 40)
  return (
    <div className="rounded-md border border-line">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-body">
        <span className="font-semibold">File preview</span>
        <span className="text-dense text-ink-muted">
          Sample rows generated for the demo · showing {shown.length} of {rows.length}
        </span>
      </div>
      <TableWrap maxHeight={320}>
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={th}>Row</th>
              {headers.map((h) => (
                <th key={h} className={cx(th, h === missingCol && 'bg-bad-soft text-bad line-through')} title={h === missingCol ? 'Column missing from file' : undefined}>
                  {h}
                  {h === missingCol && <span className="sr-only"> (missing)</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const bad = badRows.has(r.row)
              return (
                <tr key={r.row} className={cx(bad && 'bg-bad-soft')}>
                  <td className={cx(td, 'num py-1.5')}>
                    <span className="inline-flex items-center gap-1">
                      {bad && <XCircle size={13} className="text-bad" aria-label="Row has errors" />}
                      {r.row}
                    </span>
                  </td>
                  {headers.map((h, i) => (
                    <td key={h} className={cx(td, 'num py-1.5', typeof r.cells[i] === 'number' && 'text-right')}>
                      {h === missingCol ? <span className="text-ink-subtle">—</span> : typeof r.cells[i] === 'number' ? fmtNum(r.cells[i] as number) : r.cells[i]}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
    </div>
  )
}

function ResultView({ outcome, mode, setActive }: { outcome: Outcome; mode: 'plan' | 'report'; setActive: boolean }) {
  const { batch, version, report } = outcome
  const ok = batch.status === 'Ingested' || batch.status === 'Ingested with exclusions'
  const tone = batch.status === 'Ingested' ? 'ok' : ok ? 'warn' : 'bad'
  const link = (to: string, children: ReactNode) => (
    <Link to={to} className="inline-flex h-8 items-center rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-body font-medium hover:bg-surface-muted">
      {children}
    </Link>
  )
  return (
    <div className="space-y-3">
      <Callout tone={tone} icon={ok ? CheckCircle2 : XCircle} title={`Batch ${batch.id}: ${batch.status}`}>
        Recorded in this browser as a demo batch — nothing was sent to GCPL systems. {batch.rowsAccepted} of {batch.rowsTotal} rows accepted
        {batch.rowsExcluded ? `, ${batch.rowsExcluded} excluded` : ''}.
      </Callout>
      {version && (
        <p className="text-body">
          Created plan version <strong className="num">{version.id}</strong> ({version.kind}, {version.granularity}){version.supersedesId ? `, superseding ${version.supersedesId}` : ''}.{' '}
          {setActive ? 'It is now the active version used by analysis.' : 'It is stored but not active – activate it from Version history when ready.'}
          <span className="mt-1 block text-dense text-ink-muted">Plan lines were generated from demo data to stand in for the file contents — the uploaded file was not parsed.</span>
        </p>
      )}
      {report && (
        <p className="text-body">
          Recorded {report.type} report <strong className="num">{report.id}</strong> for {fmtDateDow(report.reportDate)} as “{report.status}”.
          {report.status !== 'Rejected' && (
            <span className="mt-1 block text-dense text-ink-muted">Quantities are not parsed in this prototype, so SKU lines for that date show as “SKU line not present in the received report” rather than as real figures.</span>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {link(`/data/uploads/${batch.id}`, 'View batch detail')}
        {version && link(`/planning?vendor=${version.vendorId}&month=${version.month}&version=${version.id}`, 'View plan version')}
        {version?.supersedesId && link(`/planning/compare?vendor=${version.vendorId}&month=${version.month}&a=${version.supersedesId}&b=${version.id}`, 'Compare with previous version')}
        {mode === 'report' && link('/data/reports', 'Open Reports & Uploads')}
        {link('/data/uploads', 'Upload history')}
      </div>
    </div>
  )
}
