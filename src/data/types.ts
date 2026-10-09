// Typed domain model for the GCPL P2P Control Tower demo.
// All dates are ISO strings (YYYY-MM-DD). All FG quantities are stored in EA (each).

export type ISODate = string

export type Unit = 'EA' | 'CS' | 'MT'

export interface Category {
  id: string
  name: string
}
export interface Brand {
  id: string
  name: string
  categoryId: string
}
export interface ProductLine {
  id: string
  name: string
  brandId: string
}
export interface DT {
  code: string // internal grouping code
  name: string
  productLineId: string
}
export interface Sku {
  code: string // FG code
  name: string
  dtCode: string
  casePack: number // EA per CS – explicit conversion
  kgPerEa: number | null // null = no weight conversion → MT not available
  shelfLifeDays: number
  active: boolean
}

export interface Vendor {
  id: string
  name: string
  code: string
  location: string
  calendarId: string
  reportEmail: string
}

export interface VendorSkuMap {
  vendorId: string
  skuCode: string
  since: ISODate
  primary: boolean
}

export interface OperatingCalendar {
  id: string
  name: string
  weeklyOff: number[] // 0 = Sunday
  offSecondSaturday: boolean
}
export interface CalendarException {
  id: string
  calendarId: string | 'ALL'
  date: ISODate
  type: 'Holiday' | 'Shutdown' | 'Extra working day'
  reason: string
}

// ── Planning ────────────────────────────────────────────────────────────────
export type PlanGranularity = 'Daily' | 'Monthly'
export type PlanUploadKind = 'Baseline' | 'Correction'

export interface PlanVersion {
  id: string
  label: string // e.g. "Oct-26 Sai v2"
  vendorId: string
  month: string // YYYY-MM effective period
  granularity: PlanGranularity
  kind: PlanUploadKind
  versionNo: number
  uploadedAt: string // ISO datetime
  uploadedBy: string
  fileName: string
  batchId: string
  supersedesId: string | null
  note: string
}
export interface PlanLine {
  versionId: string
  skuCode: string
  date: ISODate | null // null for monthly plans
  qtyEa: number
}

// ── Vendor reports ──────────────────────────────────────────────────────────
export type ReportType = 'Production' | 'Dispatch' | 'FG Inventory' | 'RM Inventory' | 'PM Inventory'
export type ReportChannel = 'Shared inbox' | 'Manual upload'
export type ReportStatus = 'Processed' | 'Processed with warnings' | 'Rejected' | 'Pending review'

export interface VendorReport {
  id: string
  vendorId: string
  type: ReportType
  reportDate: ISODate // business date covered
  receivedAt: string // ISO datetime
  channel: ReportChannel
  sender: string
  fileName: string
  status: ReportStatus
  batchId: string
  rows: number
}

export interface ProductionRecord {
  id: string
  vendorId: string
  skuCode: string
  date: ISODate
  qtyEa: number
  reportId: string
}
export interface DispatchRecord {
  id: string
  vendorId: string
  skuCode: string
  date: ISODate
  qtyEa: number
  invoiceNo: string
  reportId: string
}

export interface FgLot {
  lotNo: string
  mfgDate: ISODate
  expiryDate: ISODate
  qtyEa: number
}
export interface FgSnapshot {
  id: string
  vendorId: string
  skuCode: string
  snapshotDate: ISODate
  qtyEa: number
  lots: FgLot[]
  reportId: string
}

export type MaterialKind = 'RM' | 'PM'
export type MaterialUom = 'KG' | 'L' | 'EA' | 'ROLL' | 'MTR'
export interface Material {
  code: string
  name: string
  kind: MaterialKind
  uom: MaterialUom
  usedInSkus: string[]
}
export interface MaterialLot {
  lotNo: string
  receivedDate: ISODate
  expiryDate: ISODate | null
  qty: number
}
export interface MaterialSnapshot {
  id: string
  vendorId: string
  materialCode: string
  snapshotDate: ISODate
  qty: number // in material UOM – never convert with FG case packs
  uom: MaterialUom
  lots: MaterialLot[]
  reportId: string
}

export interface PoLine {
  id: string
  poNumber: string
  lineNo: number
  vendorId: string
  skuCode: string
  orderedEa: number
  receivedEa: number
  deliveryDate: ISODate
  status: 'Open' | 'Partially received' | 'Closed'
}

// ── Upload batches ──────────────────────────────────────────────────────────
export type UploadPurpose = 'Production plan' | 'Vendor report'
export type BatchStatus = 'Ingested' | 'Ingested with exclusions' | 'Rejected' | 'Duplicate – skipped'
export interface UploadBatch {
  id: string
  purpose: UploadPurpose
  reportType: ReportType | null
  planKind: PlanUploadKind | null
  vendorId: string | null
  fileName: string
  fileSizeKb: number
  checksum: string
  channel: ReportChannel
  uploadedAt: string
  uploadedBy: string
  status: BatchStatus
  rowsTotal: number
  rowsAccepted: number
  rowsExcluded: number
  issues: BatchIssue[]
  producedIds: string[] // reportIds / plan version ids created
  demo: boolean // simulated in this prototype
}
export interface BatchIssue {
  row: number | null
  column: string | null
  severity: 'Error' | 'Warning'
  problem: string
  guidance: string
}

// ── Exceptions ──────────────────────────────────────────────────────────────
export type ExceptionKind = 'Performance' | 'Data quality'
export type Severity = 'High' | 'Medium' | 'Low'
export type ExceptionStatus = 'Open' | 'Investigating' | 'Waiting on vendor' | 'Resolved' | 'Dismissed'
export interface ExceptionEvidence {
  label: string
  value: string
  link?: string
}
export interface ExceptionItem {
  id: string
  kind: ExceptionKind
  rule: string // detection rule id
  title: string
  vendorId: string | null
  skuCode: string | null
  severity: Severity
  impactEa: number | null
  impactText: string
  detectedOn: ISODate
  firstSeen: ISODate
  reportDate: ISODate | null
  owner: string | null
  dueDate: ISODate | null
  status: ExceptionStatus
  evidence: ExceptionEvidence[]
  calculation: string
  suggestions: string[]
  sourceLink: string
}
export interface ExceptionComment {
  id: string
  exceptionId: string
  at: string
  by: string
  text: string
}
export interface ActivityEntry {
  id: string
  at: string
  by: string
  area: string
  action: string
  target: string
  detail?: string
}

// ── Users / permissions ─────────────────────────────────────────────────────
export type PersonaId = 'planner' | 'operator' | 'admin' | 'viewer'
export type Permission =
  | 'view.overview'
  | 'view.controlTower'
  | 'view.planning'
  | 'plan.upload'
  | 'view.exceptions'
  | 'exceptions.edit'
  | 'view.dataOps'
  | 'reports.upload'
  | 'view.masterData'
  | 'masterData.edit'
  | 'view.admin'
  | 'admin.manage'
  | 'export.data'
  | 'assistant.use'

export interface PermissionGroup {
  id: string
  name: string
  description: string
  permissions: Permission[]
  builtIn: boolean
}
export interface DemoUser {
  id: string
  name: string
  email: string
  groupId: string
  status: 'Active' | 'Invited' | 'Disabled'
  invitedAt: string | null
  vendorScope: string[] // empty = all vendors
}

export interface Parameter {
  key: string
  label: string
  value: number
  unit: string
  description: string
  assumption: boolean // demo assumption – needs business confirmation
}
export interface CodeMapping {
  id: string
  vendorId: string
  vendorCode: string
  skuCode: string
  note: string
}
