// Assembles the single coherent dataset (fixtures + locally persisted demo edits) and builds lookup indices.
import * as M from './master'
import * as F from './fixtures'
import type {
  Brand,
  CalendarException,
  Category,
  CodeMapping,
  DispatchRecord,
  DT,
  FgSnapshot,
  Material,
  MaterialSnapshot,
  OperatingCalendar,
  Parameter,
  PlanLine,
  PlanVersion,
  PoLine,
  ProductionRecord,
  ProductLine,
  ReportType,
  Sku,
  UploadBatch,
  Vendor,
  VendorReport,
  VendorSkuMap,
} from './types'

export interface MasterTables {
  categories: Category[]
  brands: Brand[]
  productLines: ProductLine[]
  dts: DT[]
  skus: Sku[]
  vendors: Vendor[]
  vendorSkuMaps: VendorSkuMap[]
  calendars: OperatingCalendar[]
  calendarExceptions: CalendarException[]
  materials: Material[]
  codeMappings: CodeMapping[]
  parameters: Parameter[]
}

export const baseMaster: MasterTables = {
  categories: M.categories,
  brands: M.brands,
  productLines: M.productLines,
  dts: M.dts,
  skus: M.skus,
  // The opt-in scale-test scenario appends generated demo vendors (see master.ts)
  vendors: [...M.vendors, ...M.activeGeneratedVendors],
  vendorSkuMaps: [...M.vendorSkuMaps, ...M.activeGeneratedVendorSkuMaps],
  calendars: M.calendars,
  calendarExceptions: M.calendarExceptions,
  materials: M.materials,
  codeMappings: M.codeMappings,
  parameters: M.parameters,
}

export interface SkuHierarchy {
  sku: Sku
  dt: DT
  productLine: ProductLine
  brand: Brand
  category: Category
}

export interface Dataset extends MasterTables {
  planVersions: PlanVersion[]
  planLines: PlanLine[]
  activePlan: Record<string, string> // `${vendorId}|${month}` → versionId
  vendorReports: VendorReport[]
  productionRecords: ProductionRecord[]
  dispatchRecords: DispatchRecord[]
  fgSnapshots: FgSnapshot[]
  materialSnapshots: MaterialSnapshot[]
  poLines: PoLine[]
  uploadBatches: UploadBatch[]
  vendorMaterials: Record<string, string[]>
  // indices
  idx: {
    sku: Map<string, Sku>
    vendor: Map<string, Vendor>
    hierarchy: Map<string, SkuHierarchy>
    param: Record<string, number>
    production: Map<string, ProductionRecord> // v|sku|date
    dispatch: Map<string, DispatchRecord[]> // v|sku
    report: Map<string, VendorReport> // v|type|date (latest received wins)
    dailyPlan: Map<string, number> // v|sku|date from active versions
    monthlyPlan: Map<string, number> // v|sku|month from active monthly versions
    planGranularity: Map<string, 'Daily' | 'Monthly'> // v|month
    vendorSkus: Map<string, string[]> // vendor → skus
    skuVendors: Map<string, string[]> // sku → vendors
    batch: Map<string, UploadBatch>
  }
}

export interface DatasetOverrides {
  master: MasterTables
  extraPlanVersions: PlanVersion[]
  extraPlanLines: PlanLine[]
  activePlan: Record<string, string>
  extraBatches: UploadBatch[]
  extraReports: VendorReport[]
}

export function buildDataset(o: DatasetOverrides): Dataset {
  const m = o.master
  const planVersions = [...F.planVersions, ...o.extraPlanVersions]
  const planLines = [...F.planLines, ...o.extraPlanLines]
  const activePlan = { ...F.defaultActivePlan, ...o.activePlan }
  const vendorReports = [...F.vendorReports, ...o.extraReports]
  const uploadBatches = [...F.uploadBatches, ...o.extraBatches]

  const sku = new Map(m.skus.map((s) => [s.code, s]))
  const vendor = new Map(m.vendors.map((v) => [v.id, v]))
  const hierarchy = new Map<string, SkuHierarchy>()
  for (const s of m.skus) {
    const dt = m.dts.find((d) => d.code === s.dtCode)
    const productLine = dt && m.productLines.find((p) => p.id === dt.productLineId)
    const brand = productLine && m.brands.find((b) => b.id === productLine.brandId)
    const category = brand && m.categories.find((c) => c.id === brand.categoryId)
    if (dt && productLine && brand && category) hierarchy.set(s.code, { sku: s, dt, productLine, brand, category })
  }
  const param: Record<string, number> = {}
  for (const p of m.parameters) param[p.key] = p.value

  const production = new Map<string, ProductionRecord>()
  for (const r of F.productionRecords) production.set(`${r.vendorId}|${r.skuCode}|${r.date}`, r)
  const dispatch = new Map<string, DispatchRecord[]>()
  for (const r of F.dispatchRecords) {
    const k = `${r.vendorId}|${r.skuCode}`
    if (!dispatch.has(k)) dispatch.set(k, [])
    dispatch.get(k)!.push(r)
  }
  const report = new Map<string, VendorReport>()
  for (const r of vendorReports) {
    const k = `${r.vendorId}|${r.type}|${r.reportDate}`
    const cur = report.get(k)
    // A processed report beats a rejected one; otherwise latest received wins
    if (!cur || (cur.status === 'Rejected' && r.status !== 'Rejected') || (r.status !== 'Rejected' && r.receivedAt > cur.receivedAt)) report.set(k, r)
  }
  const dailyPlan = new Map<string, number>()
  const monthlyPlan = new Map<string, number>()
  const planGranularity = new Map<string, 'Daily' | 'Monthly'>()
  const activeIds = new Set(Object.values(activePlan))
  const versionById = new Map(planVersions.map((v) => [v.id, v]))
  for (const id of activeIds) {
    const v = versionById.get(id)
    if (v) planGranularity.set(`${v.vendorId}|${v.month}`, v.granularity)
  }
  for (const l of planLines) {
    if (!activeIds.has(l.versionId)) continue
    const v = versionById.get(l.versionId)!
    if (l.date) dailyPlan.set(`${v.vendorId}|${l.skuCode}|${l.date}`, l.qtyEa)
    else monthlyPlan.set(`${v.vendorId}|${l.skuCode}|${v.month}`, l.qtyEa)
  }
  const vendorSkus = new Map<string, string[]>()
  const skuVendors = new Map<string, string[]>()
  for (const mp of m.vendorSkuMaps) {
    if (!vendorSkus.has(mp.vendorId)) vendorSkus.set(mp.vendorId, [])
    vendorSkus.get(mp.vendorId)!.push(mp.skuCode)
    if (!skuVendors.has(mp.skuCode)) skuVendors.set(mp.skuCode, [])
    skuVendors.get(mp.skuCode)!.push(mp.vendorId)
  }
  const batch = new Map(uploadBatches.map((b) => [b.id, b]))

  return {
    ...m,
    planVersions,
    planLines,
    activePlan,
    vendorReports,
    productionRecords: F.productionRecords,
    dispatchRecords: F.dispatchRecords,
    fgSnapshots: F.fgSnapshots,
    materialSnapshots: F.materialSnapshots,
    poLines: F.poLines,
    uploadBatches,
    vendorMaterials: { ...M.vendorMaterials, ...Object.fromEntries(M.activeGeneratedVendors.map((v) => [v.id, M.scaleVendorMaterials[v.id]])) },
    idx: { sku, vendor, hierarchy, param, production, dispatch, report, dailyPlan, monthlyPlan, planGranularity, vendorSkus, skuVendors, batch },
  }
}

export function reportKey(vendorId: string, type: ReportType, date: string) {
  return `${vendorId}|${type}|${date}`
}
