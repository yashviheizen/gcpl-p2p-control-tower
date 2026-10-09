// Deterministic exception detection over the demo dataset.
// Rules are DEMO ASSUMPTIONS. Exceptions describe deviations and evidence – they never assert a root cause.
import type { Dataset } from '@/data/dataset'
import type { ExceptionItem, Severity } from '@/data/types'
import { addDays, DEMO_TODAY, diffDays, fmtDate, LATEST_DUE_DATE } from './dates'
import { fmtNum, fmtPct, shortSkuName } from './format'
import { aggregateCells, cellsFor, fgBaseline, latestFgSnapshot, reportFreshness, ALL_REPORT_TYPES, thresholds } from './metrics'
import { filterLink } from './links'

const OCT = '2026-10-01'

export function detectExceptions(ds: Dataset): ExceptionItem[] {
  const out: ExceptionItem[] = []
  const t = thresholds(ds)

  // ── Performance: MTD attainment outside range ────────────────────────────
  for (const m of ds.vendorSkuMaps) {
    const vendor = ds.idx.vendor.get(m.vendorId)!
    const sku = ds.idx.sku.get(m.skuCode)!
    const cells = cellsFor(ds, [{ vendor, sku }], OCT, LATEST_DUE_DATE)
    const agg = aggregateCells(ds, cells, 'EA')
    const link = filterLink('/production', {
      vendor: vendor.id,
      sku: sku.code,
      from: OCT,
      to: DEMO_TODAY,
    })
    if (agg.attainment != null && agg.attainment < t.low) {
      const below = cells.filter((c) => c.status === 'below' || c.status === 'zero')
      const sev: Severity = agg.attainment < 80 ? 'High' : 'Medium'
      out.push({
        id: `EX-PERF-BELOW-${vendor.code}-${sku.code}`,
        kind: 'Performance',
        rule: 'MTD attainment below range',
        title: `${shortSkuName(sku.name)} below plan at ${vendor.name}`,
        vendorId: vendor.id,
        skuCode: sku.code,
        severity: sev,
        impactEa: Math.round(-agg.gap),
        impactText: `${fmtNum(-agg.gap)} EA short of plan MTD (${fmtPct(agg.attainment, 1)} attainment)`,
        detectedOn: below[0] ? addDays(below[0].date, 1) : DEMO_TODAY,
        firstSeen: below[0]?.date ?? OCT,
        reportDate: LATEST_DUE_DATE,
        owner: sev === 'High' ? 'Ananya Rao' : null,
        dueDate: sev === 'High' ? '2026-10-12' : null,
        status: sev === 'High' ? 'Investigating' : 'Open',
        evidence: [
          {
            label: 'Plan on reported days (EA)',
            value: fmtNum(agg.planComparable),
          },
          { label: 'Actual reported (EA)', value: fmtNum(agg.actual) },
          {
            label: 'Days below range',
            value: `${below.length} of ${cells.filter((c) => !['nonOp', 'future'].includes(c.status)).length} operating days`,
          },
          {
            label: 'Period',
            value: `1 Oct – ${fmtDate(LATEST_DUE_DATE)} 2026`,
          },
        ],
        calculation: `Attainment = Σ actual ÷ Σ plan on days with a valid production report × 100 = ${fmtNum(agg.actual - agg.actualUnplanned)} ÷ ${fmtNum(agg.planComparable)} × 100 = ${fmtPct(agg.attainment, 1)}. Range ${t.low}–${t.high}% is a demo assumption.`,
        suggestions: [
          'Review daily cells in the production heatmap to see whether the shortfall is concentrated on specific days.',
          'Check RM/PM inventory at the vendor for materials used in this SKU.',
          'Confirm with the vendor whether the plan was acknowledged and capacity was available.',
        ],
        sourceLink: link,
      })
    }
    if (agg.attainment != null && agg.attainment > t.high) {
      out.push({
        id: `EX-PERF-ABOVE-${vendor.code}-${sku.code}`,
        kind: 'Performance',
        rule: 'MTD attainment above range',
        title: `${shortSkuName(sku.name)} above plan at ${vendor.name}`,
        vendorId: vendor.id,
        skuCode: sku.code,
        severity: 'Medium',
        impactEa: Math.round(agg.gap),
        impactText: `${fmtNum(agg.gap)} EA above plan MTD (${fmtPct(agg.attainment, 1)}) – possible excess build`,
        detectedOn: '2026-10-06',
        firstSeen: '2026-10-03',
        reportDate: LATEST_DUE_DATE,
        owner: null,
        dueDate: null,
        status: 'Open',
        evidence: [
          {
            label: 'Plan on reported days (EA)',
            value: fmtNum(agg.planComparable),
          },
          { label: 'Actual reported (EA)', value: fmtNum(agg.actual) },
          {
            label: 'Days above range',
            value: String(cells.filter((c) => c.status === 'above').length),
          },
        ],
        calculation: `Attainment = ${fmtNum(agg.actual - agg.actualUnplanned)} ÷ ${fmtNum(agg.planComparable)} × 100 = ${fmtPct(agg.attainment, 1)} (above the ${t.high}% demo upper bound). High attainment is flagged for review, not treated as good by default.`,
        suggestions: ['Compare FG inventory against baseline for this SKU at the vendor.', 'Check whether dispatches are keeping pace with production.', 'Confirm whether additional volume was requested outside the uploaded plan.'],
        sourceLink: link,
      })
    }
    const zeros = cells.filter((c) => c.status === 'zero')
    for (const z of zeros) {
      out.push({
        id: `EX-PERF-ZERO-${vendor.code}-${sku.code}-${z.date}`,
        kind: 'Performance',
        rule: 'Reported zero against plan',
        title: `Zero production reported – ${shortSkuName(sku.name)} (${vendor.name})`,
        vendorId: vendor.id,
        skuCode: sku.code,
        severity: 'Medium',
        impactEa: z.planEa,
        impactText: `${fmtNum(z.planEa)} EA planned on ${fmtDate(z.date)}; vendor reported 0`,
        detectedOn: addDays(z.date, 1),
        firstSeen: z.date,
        reportDate: z.date,
        owner: null,
        dueDate: null,
        status: 'Open',
        evidence: [
          { label: 'Planned (EA)', value: fmtNum(z.planEa) },
          { label: 'Reported (EA)', value: '0 (explicit zero in report)' },
          {
            label: 'Source report',
            value: z.report?.fileName ?? '—',
            link: z.report ? `/data/uploads/${z.report.batchId}` : undefined,
          },
        ],
        calculation: 'Reported zero is an explicit 0 in the vendor report – distinct from a missing report.',
        suggestions: ['Ask the vendor for the reason logged against this line (e.g. stoppage, material, changeover).', 'Check whether the plan for later days was adjusted.'],
        sourceLink: filterLink('/production', {
          vendor: vendor.id,
          sku: sku.code,
          from: OCT,
          to: DEMO_TODAY,
        }),
      })
    }
    const unplanned = cells.filter((c) => c.status === 'noPlan' && (c.actualEa ?? 0) > 0)
    if (unplanned.length) {
      const qty = unplanned.reduce((a, c) => a + (c.actualEa ?? 0), 0)
      out.push({
        id: `EX-PERF-NOPLAN-${vendor.code}-${sku.code}`,
        kind: 'Performance',
        rule: 'Production without plan',
        title: `Unplanned production – ${shortSkuName(sku.name)} (${vendor.name})`,
        vendorId: vendor.id,
        skuCode: sku.code,
        severity: 'Low',
        impactEa: qty,
        impactText: `${fmtNum(qty)} EA produced on ${unplanned.length} day(s) with no plan line`,
        detectedOn: addDays(unplanned[0].date, 1),
        firstSeen: unplanned[0].date,
        reportDate: unplanned[unplanned.length - 1].date,
        owner: null,
        dueDate: null,
        status: 'Open',
        evidence: unplanned.map((c) => ({
          label: fmtDate(c.date),
          value: `${fmtNum(c.actualEa)} EA, plan: none`,
        })),
        calculation: 'Attainment is not computed when plan is zero or absent (“No plan”).',
        suggestions: ['Check whether a plan correction is pending upload for these dates.'],
        sourceLink: filterLink('/production', {
          vendor: vendor.id,
          sku: sku.code,
          from: OCT,
          to: DEMO_TODAY,
        }),
      })
    }

    // ── FG inventory: excess vs baseline, near expiry ──────────────────────
    const snap = latestFgSnapshot(ds, vendor.id, sku.code)
    if (snap) {
      const base = fgBaseline(ds, vendor.id, sku.code, snap.snapshotDate)
      const excessPct = ds.idx.param.excessPct ?? 30
      if (base.value && snap.qtyEa > base.value * (1 + excessPct / 100)) {
        const dev = ((snap.qtyEa - base.value) / base.value) * 100
        out.push({
          id: `EX-INV-EXCESS-${vendor.code}-${sku.code}`,
          kind: 'Performance',
          rule: 'FG stock above baseline',
          title: `High FG stock – ${shortSkuName(sku.name)} at ${vendor.name}`,
          vendorId: vendor.id,
          skuCode: sku.code,
          severity: dev > 80 ? 'High' : 'Medium',
          impactEa: Math.round(snap.qtyEa - base.value),
          impactText: `${fmtNum(snap.qtyEa - base.value)} EA above ${ds.idx.param.baselineWeeks ?? 4}-week baseline (+${dev.toFixed(0)}%)`,
          detectedOn: addDays(snap.snapshotDate, 1),
          firstSeen: snap.snapshotDate,
          reportDate: snap.snapshotDate,
          owner: null,
          dueDate: null,
          status: 'Open',
          evidence: [
            {
              label: `Stock on ${fmtDate(snap.snapshotDate)} (EA)`,
              value: fmtNum(snap.qtyEa),
            },
            {
              label: 'Baseline (EA)',
              value: `${fmtNum(base.value)} (Mondays ${base.dates.map((d) => fmtDate(d)).join(', ')})`,
            },
          ],
          calculation: `Deviation = (latest − baseline) ÷ baseline = ${dev.toFixed(1)}%. Excess threshold ${excessPct}% is a demo assumption.`,
          suggestions: ['Review dispatch frequency for this SKU at the vendor.', 'Check whether production is running ahead of plan.'],
          sourceLink: filterLink('/fg-inventory', {
            vendor: vendor.id,
            sku: sku.code,
          }),
        })
      }
      const warn = ds.idx.param.expiryWarnDays ?? 60
      const near = snap.lots.filter((l) => diffDays(l.expiryDate, DEMO_TODAY) <= warn)
      if (near.length) {
        const qty = near.reduce((a, l) => a + l.qtyEa, 0)
        out.push({
          id: `EX-INV-EXPIRY-${vendor.code}-${sku.code}`,
          kind: 'Performance',
          rule: 'FG lot near expiry',
          title: `FG lot near expiry – ${shortSkuName(sku.name)} (${vendor.name})`,
          vendorId: vendor.id,
          skuCode: sku.code,
          severity: near.some((l) => diffDays(l.expiryDate, DEMO_TODAY) <= 21) ? 'High' : 'Medium',
          impactEa: qty,
          impactText: `${fmtNum(qty)} EA in ${near.length} lot(s) expiring within ${warn} days`,
          detectedOn: addDays(snap.snapshotDate, 1),
          firstSeen: snap.snapshotDate,
          reportDate: snap.snapshotDate,
          owner: 'Meera Iyer',
          dueDate: '2026-10-14',
          status: 'Open',
          evidence: near.map((l) => ({
            label: `Lot ${l.lotNo}`,
            value: `${fmtNum(l.qtyEa)} EA, mfg ${fmtDate(l.mfgDate, true)}, expires ${fmtDate(l.expiryDate, true)}`,
          })),
          calculation: `Lots from the latest FG snapshot (${fmtDate(snap.snapshotDate)}) with expiry ≤ ${warn} days after ${fmtDate(DEMO_TODAY)} (demo window).`,
          suggestions: ['Confirm physical stock and lot status with the vendor.', 'Review whether these lots can be prioritised in the next dispatch.'],
          sourceLink: filterLink('/fg-inventory', {
            vendor: vendor.id,
            sku: sku.code,
          }),
        })
      }
    }
  }

  // ── Data quality: missing / stale reports ────────────────────────────────
  for (const vendor of ds.vendors) {
    for (const type of ALL_REPORT_TYPES) {
      const f = reportFreshness(ds, vendor, type)
      if (f.freshness === 'Current') continue
      const stale = f.freshness === 'Stale'
      out.push({
        id: `EX-DQ-${stale ? 'STALE' : 'MISSING'}-${vendor.code}-${type.replace(/ /g, '')}`,
        kind: 'Data quality',
        rule: stale ? 'Report stale' : 'Report missing',
        title: `${type} report ${stale ? 'stale' : 'missing'} – ${vendor.name}`,
        vendorId: vendor.id,
        skuCode: null,
        severity: stale && type !== 'RM Inventory' && type !== 'PM Inventory' ? 'High' : 'Medium',
        impactEa: null,
        impactText: f.latestValidDate ? `Latest valid ${type.toLowerCase()} data is for ${fmtDate(f.latestValidDate)} (${f.ageDays} day(s) behind ${fmtDate(LATEST_DUE_DATE)})` : 'No valid report received',
        detectedOn: DEMO_TODAY,
        firstSeen: f.missingDates[0] ?? f.latestValidDate ?? DEMO_TODAY,
        reportDate: f.latestValidDate,
        owner: 'Rohit Kulkarni',
        dueDate: '2026-10-10',
        status: vendor.id === 'V-RKPL' ? 'Waiting on vendor' : 'Open',
        evidence: [
          {
            label: 'Latest received',
            value: f.latest ? `${f.latest.fileName} (${f.latest.status})` : '—',
            link: f.latest ? `/data/uploads/${f.latest.batchId}` : undefined,
          },
          {
            label: 'Missing dates (Oct)',
            value: f.missingDates.length ? f.missingDates.map((d) => fmtDate(d)).join(', ') : '—',
          },
          {
            label: 'Expected by',
            value: f.expectedDate ? `${fmtDate(addDays(f.expectedDate, 1))}, 10:00` : 'Twice weekly (Mon/Thu)',
          },
        ],
        calculation: `Daily reports are due by 10:00 the next day. Stale = latest valid data older than ${ds.idx.param.staleDaysDaily ?? 1} day(s) beyond the latest due date (weekly: ${ds.idx.param.staleDaysWeekly ?? 4} days). Demo assumption.`,
        suggestions: ['Check the shared inbox for a delayed or misrouted email.', 'Contact the vendor for the report or use manual upload as a fallback.'],
        sourceLink: filterLink('/data/reports', { vendor: vendor.id }),
      })
    }
  }

  // ── Data quality: batch issues ───────────────────────────────────────────
  for (const b of ds.uploadBatches) {
    if (!b.issues.length || !b.vendorId) continue
    const vendor = ds.idx.vendor.get(b.vendorId)!
    const titleKind = b.status === 'Duplicate – skipped' ? 'Duplicate file received' : b.status === 'Rejected' ? 'Report rejected – missing column' : 'Unknown item code in report'
    out.push({
      id: `EX-DQ-BATCH-${b.id}`,
      kind: 'Data quality',
      rule: b.status === 'Duplicate – skipped' ? 'Duplicate file' : b.status === 'Rejected' ? 'Validation failure' : 'Unmapped code',
      title: `${titleKind} – ${vendor.name}`,
      vendorId: vendor.id,
      skuCode: null,
      severity: b.status === 'Rejected' ? 'High' : b.status === 'Duplicate – skipped' ? 'Low' : 'Medium',
      impactEa: null,
      impactText: `${b.fileName}: ${b.rowsExcluded || (b.status === 'Rejected' ? b.rowsTotal : 0)} row(s) not ingested`,
      detectedOn: b.uploadedAt.slice(0, 10),
      firstSeen: b.uploadedAt.slice(0, 10),
      reportDate: null,
      owner: b.status === 'Rejected' ? 'Rohit Kulkarni' : null,
      dueDate: null,
      status: b.status === 'Duplicate – skipped' ? 'Resolved' : 'Open',
      evidence: b.issues.map((i) => ({
        label: `${i.severity}${i.row ? ` · row ${i.row}` : ''}${i.column ? ` · ${i.column}` : ''}`,
        value: i.problem,
      })),
      calculation: 'Raised by upload validation for the batch.',
      suggestions: b.issues.map((i) => i.guidance),
      sourceLink: `/data/uploads/${b.id}`,
    })
  }

  const sevRank: Record<Severity, number> = { High: 0, Medium: 1, Low: 2 }
  return out.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || (b.impactEa ?? 0) - (a.impactEa ?? 0))
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Title for tables that show the vendor in its own column: drops the trailing “at V”, “(V)” or “– V”. */
export function titleWithoutVendor(title: string, vendorName?: string): string {
  if (!vendorName) return title
  const v = escapeRe(vendorName)
  const out = title.replace(new RegExp(`\\s+at\\s+${v}$|\\s*\\(${v}\\)$|\\s+[–-]\\s+${v}$`), '').trim()
  return out || title
}
/** Impact sentence without its leading “N EA”, for rows that already show the quantity in its own column. */
export function impactDetail(text: string, impactEa: number | null | undefined): string {
  if (impactEa == null) return text
  return text.replace(/^[−-]?[\d,]+(\.\d+)?\s*EA\s*/, '').replace(/^./, (c) => c.toUpperCase())
}
