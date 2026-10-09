// Master data fixtures (demo). Codes are illustrative, not real GCPL codes.
import type { Brand, CalendarException, Category, CodeMapping, DT, Material, OperatingCalendar, Parameter, ProductLine, Sku, Vendor, VendorSkuMap } from './types'

export const categories: Category[] = [
  { id: 'CAT-HI', name: 'Household Insecticides' },
  { id: 'CAT-AC', name: 'Air Care' },
  { id: 'CAT-FC', name: 'Fabric Care' },
]

export const brands: Brand[] = [
  { id: 'BR-GK', name: 'Good Knight', categoryId: 'CAT-HI' },
  { id: 'BR-AER', name: 'Aer', categoryId: 'CAT-AC' },
  { id: 'BR-FAB', name: 'Godrej FAB', categoryId: 'CAT-FC' },
]

export const productLines: ProductLine[] = [
  { id: 'PL-GK-LV', name: 'Liquid Vaporizer', brandId: 'BR-GK' },
  { id: 'PL-GK-COIL', name: 'Coils', brandId: 'BR-GK' },
  { id: 'PL-GK-FC', name: 'Fast Card', brandId: 'BR-GK' },
  { id: 'PL-AER-PKT', name: 'Aer Pocket', brandId: 'BR-AER' },
  { id: 'PL-AER-SPR', name: 'Aer Spray', brandId: 'BR-AER' },
  { id: 'PL-AER-MAT', name: 'Aer Matic', brandId: 'BR-AER' },
  { id: 'PL-FAB-LQ', name: 'Liquid Detergent', brandId: 'BR-FAB' },
  { id: 'PL-FAB-PCH', name: 'Refill Pouch', brandId: 'BR-FAB' },
]

export const dts: DT[] = [
  { code: 'DT-GKLV45', name: 'GK LV refill 45 ml', productLineId: 'PL-GK-LV' },
  { code: 'DT-GKLVCB', name: 'GK LV machine + refill combo', productLineId: 'PL-GK-LV' },
  { code: 'DT-GKCL10', name: 'GK coil 10 hr', productLineId: 'PL-GK-COIL' },
  { code: 'DT-GKFC10', name: 'GK fast card 10 pc', productLineId: 'PL-GK-FC' },
  { code: 'DT-AERPK10', name: 'Aer Pocket 10 g', productLineId: 'PL-AER-PKT' },
  { code: 'DT-AERSP220', name: 'Aer Spray 220 ml', productLineId: 'PL-AER-SPR' },
  { code: 'DT-AERMT225', name: 'Aer Matic refill 225 ml', productLineId: 'PL-AER-MAT' },
  { code: 'DT-FABLQ1', name: 'FAB liquid 1 L bottle', productLineId: 'PL-FAB-LQ' },
  { code: 'DT-FABLQ2', name: 'FAB liquid 2 L pouch', productLineId: 'PL-FAB-LQ' },
  { code: 'DT-FABPC5', name: 'FAB refill pouch 500 ml', productLineId: 'PL-FAB-PCH' },
]

export const skus: Sku[] = [
  { code: 'FG1004011', name: 'Good Knight Gold Flash Refill 45 ml', dtCode: 'DT-GKLV45', casePack: 96, kgPerEa: 0.062, shelfLifeDays: 730, active: true },
  { code: 'FG1004012', name: 'Good Knight Activ+ Refill 45 ml', dtCode: 'DT-GKLV45', casePack: 96, kgPerEa: 0.062, shelfLifeDays: 730, active: true },
  { code: 'FG1004021', name: 'Good Knight Gold Flash Machine + Refill', dtCode: 'DT-GKLVCB', casePack: 48, kgPerEa: null, shelfLifeDays: 730, active: true },
  { code: 'FG1004101', name: 'Good Knight Neem Coil 10 hr (10 pc)', dtCode: 'DT-GKCL10', casePack: 60, kgPerEa: 0.135, shelfLifeDays: 1095, active: true },
  { code: 'FG1004102', name: 'Good Knight Advanced Coil 10 hr (10 pc)', dtCode: 'DT-GKCL10', casePack: 60, kgPerEa: 0.135, shelfLifeDays: 1095, active: true },
  { code: 'FG1004201', name: 'Good Knight Fast Card 10 pc', dtCode: 'DT-GKFC10', casePack: 120, kgPerEa: 0.018, shelfLifeDays: 730, active: true },
  { code: 'FG2001011', name: 'Aer Pocket Cool Surf Blue 10 g', dtCode: 'DT-AERPK10', casePack: 144, kgPerEa: 0.016, shelfLifeDays: 730, active: true },
  { code: 'FG2001012', name: 'Aer Pocket Fresh Lush Green 10 g', dtCode: 'DT-AERPK10', casePack: 144, kgPerEa: 0.016, shelfLifeDays: 730, active: true },
  { code: 'FG2001013', name: 'Aer Pocket Musk After Smoke 10 g', dtCode: 'DT-AERPK10', casePack: 144, kgPerEa: 0.016, shelfLifeDays: 730, active: true },
  { code: 'FG2002011', name: 'Aer Spray Petal Crush Pink 220 ml', dtCode: 'DT-AERSP220', casePack: 24, kgPerEa: 0.21, shelfLifeDays: 1095, active: true },
  { code: 'FG2002012', name: 'Aer Spray Cool Surf Blue 220 ml', dtCode: 'DT-AERSP220', casePack: 24, kgPerEa: 0.21, shelfLifeDays: 1095, active: true },
  { code: 'FG2003011', name: 'Aer Matic Refill Fresh Lush Green 225 ml', dtCode: 'DT-AERMT225', casePack: 36, kgPerEa: null, shelfLifeDays: 730, active: true },
  { code: 'FG3001011', name: 'Godrej FAB Liquid Detergent Front Load 1 L', dtCode: 'DT-FABLQ1', casePack: 12, kgPerEa: 1.08, shelfLifeDays: 540, active: true },
  { code: 'FG3001012', name: 'Godrej FAB Liquid Detergent Top Load 1 L', dtCode: 'DT-FABLQ1', casePack: 12, kgPerEa: 1.08, shelfLifeDays: 540, active: true },
  { code: 'FG3001021', name: 'Godrej FAB Liquid Detergent 2 L Pouch', dtCode: 'DT-FABLQ2', casePack: 6, kgPerEa: 2.12, shelfLifeDays: 540, active: true },
  { code: 'FG3002011', name: 'Godrej FAB Refill Pouch 500 ml', dtCode: 'DT-FABPC5', casePack: 24, kgPerEa: 0.53, shelfLifeDays: 540, active: true },
]

export const calendars: OperatingCalendar[] = [
  { id: 'CAL-STD', name: 'Standard (Sunday off)', weeklyOff: [0], offSecondSaturday: false },
  { id: 'CAL-NE', name: 'North-East (Sunday + 2nd Saturday off)', weeklyOff: [0], offSecondSaturday: true },
]

export const vendors: Vendor[] = [
  { id: 'V-SAI', name: 'Sai', code: 'SAI01', location: 'Baddi, HP', calendarId: 'CAL-STD', reportEmail: 'mis@sai-demo.example' },
  { id: 'V-VAN', name: 'Vanessa', code: 'VAN02', location: 'Daman', calendarId: 'CAL-STD', reportEmail: 'reports@vanessa-demo.example' },
  { id: 'V-RKPL', name: 'RKPL-Vengal', code: 'RKP03', location: 'Vengal, Chennai', calendarId: 'CAL-STD', reportEmail: 'ppc@rkpl-demo.example' },
  { id: 'V-AAV', name: 'Aavishkar', code: 'AAV04', location: 'Puducherry', calendarId: 'CAL-STD', reportEmail: 'plant@aavishkar-demo.example' },
  { id: 'V-PAY', name: 'Payal', code: 'PAY05', location: 'Guwahati, AS', calendarId: 'CAL-NE', reportEmail: 'dispatch@payal-demo.example' },
]

export const vendorSkuMaps: VendorSkuMap[] = [
  { vendorId: 'V-SAI', skuCode: 'FG1004011', since: '2024-04-01', primary: true },
  { vendorId: 'V-SAI', skuCode: 'FG1004012', since: '2024-04-01', primary: true },
  { vendorId: 'V-SAI', skuCode: 'FG1004021', since: '2025-01-15', primary: true },
  { vendorId: 'V-SAI', skuCode: 'FG1004201', since: '2025-06-01', primary: true },
  { vendorId: 'V-VAN', skuCode: 'FG2001011', since: '2023-10-01', primary: true },
  { vendorId: 'V-VAN', skuCode: 'FG2001012', since: '2023-10-01', primary: true },
  { vendorId: 'V-VAN', skuCode: 'FG2001013', since: '2023-10-01', primary: true },
  { vendorId: 'V-VAN', skuCode: 'FG2002011', since: '2024-02-01', primary: true },
  { vendorId: 'V-VAN', skuCode: 'FG2002012', since: '2024-02-01', primary: true },
  { vendorId: 'V-RKPL', skuCode: 'FG1004101', since: '2022-08-01', primary: true },
  { vendorId: 'V-RKPL', skuCode: 'FG1004102', since: '2022-08-01', primary: true },
  { vendorId: 'V-RKPL', skuCode: 'FG1004011', since: '2025-09-01', primary: false },
  { vendorId: 'V-AAV', skuCode: 'FG3001011', since: '2024-07-01', primary: true },
  { vendorId: 'V-AAV', skuCode: 'FG3001012', since: '2024-07-01', primary: true },
  { vendorId: 'V-AAV', skuCode: 'FG3001021', since: '2024-07-01', primary: true },
  { vendorId: 'V-PAY', skuCode: 'FG2003011', since: '2025-03-01', primary: true },
  { vendorId: 'V-PAY', skuCode: 'FG2001011', since: '2025-03-01', primary: false },
  { vendorId: 'V-PAY', skuCode: 'FG3002011', since: '2025-03-01', primary: true },
]

export const calendarExceptions: CalendarException[] = [
  { id: 'CE-1', calendarId: 'ALL', date: '2026-10-02', type: 'Holiday', reason: 'Gandhi Jayanti (national holiday)' },
  { id: 'CE-2', calendarId: 'CAL-STD', date: '2026-10-20', type: 'Holiday', reason: 'Dussehra' },
  { id: 'CE-3', calendarId: 'CAL-NE', date: '2026-10-19', type: 'Holiday', reason: 'Durga Puja (Maha Navami)' },
  { id: 'CE-4', calendarId: 'CAL-NE', date: '2026-10-20', type: 'Holiday', reason: 'Durga Puja (Vijaya Dashami)' },
  { id: 'CE-5', calendarId: 'CAL-STD', date: '2026-09-14', type: 'Holiday', reason: 'Ganesh Chaturthi' },
  { id: 'CE-6', calendarId: 'CAL-STD', date: '2026-09-27', type: 'Extra working day', reason: 'Make-up Sunday for Ganesh Chaturthi' },
]

export const materials: Material[] = [
  { code: 'RM-TRF01', name: 'Transfluthrin technical', kind: 'RM', uom: 'KG', usedInSkus: ['FG1004011', 'FG1004012', 'FG1004021'] },
  { code: 'RM-SOLV2', name: 'Odourless solvent base', kind: 'RM', uom: 'L', usedInSkus: ['FG1004011', 'FG1004012', 'FG1004021'] },
  { code: 'PM-BTL45', name: 'LV refill bottle 45 ml', kind: 'PM', uom: 'EA', usedInSkus: ['FG1004011', 'FG1004012', 'FG1004021'] },
  { code: 'PM-CTGK1', name: 'Printed carton – GK refill', kind: 'PM', uom: 'EA', usedInSkus: ['FG1004011', 'FG1004012'] },
  { code: 'RM-CPWD1', name: 'Coil base powder', kind: 'RM', uom: 'KG', usedInSkus: ['FG1004101', 'FG1004102'] },
  { code: 'PM-SHRK1', name: 'Shrink film 300 mm', kind: 'PM', uom: 'MTR', usedInSkus: ['FG1004101', 'FG1004102'] },
  { code: 'RM-GEL01', name: 'Fragrance gel base', kind: 'RM', uom: 'KG', usedInSkus: ['FG2001011', 'FG2001012', 'FG2001013'] },
  { code: 'RM-FRCS1', name: 'Fragrance – Cool Surf', kind: 'RM', uom: 'KG', usedInSkus: ['FG2001011', 'FG2002012'] },
  { code: 'PM-LAM01', name: 'Aer Pocket laminate', kind: 'PM', uom: 'ROLL', usedInSkus: ['FG2001011', 'FG2001012', 'FG2001013'] },
  { code: 'PM-CAN22', name: 'Aerosol can 220 ml', kind: 'PM', uom: 'EA', usedInSkus: ['FG2002011', 'FG2002012'] },
  { code: 'RM-LABS1', name: 'LABSA surfactant', kind: 'RM', uom: 'KG', usedInSkus: ['FG3001011', 'FG3001012', 'FG3001021', 'FG3002011'] },
  { code: 'PM-HDPE1', name: 'HDPE bottle 1 L', kind: 'PM', uom: 'EA', usedInSkus: ['FG3001011', 'FG3001012'] },
  { code: 'PM-PCH05', name: 'Printed pouch 500 ml', kind: 'PM', uom: 'EA', usedInSkus: ['FG3002011'] },
  { code: 'RM-FRGL2', name: 'Fragrance – Fresh Lush Green', kind: 'RM', uom: 'KG', usedInSkus: ['FG2003011', 'FG2001012'] },
  { code: 'PM-REF22', name: 'Aer Matic refill can 225 ml', kind: 'PM', uom: 'EA', usedInSkus: ['FG2003011'] },
]

/** Material codes held at each vendor */
export const vendorMaterials: Record<string, string[]> = {
  'V-SAI': ['RM-TRF01', 'RM-SOLV2', 'PM-BTL45', 'PM-CTGK1'],
  'V-VAN': ['RM-GEL01', 'RM-FRCS1', 'PM-LAM01', 'PM-CAN22'],
  'V-RKPL': ['RM-CPWD1', 'PM-SHRK1', 'RM-TRF01', 'PM-BTL45'],
  'V-AAV': ['RM-LABS1', 'PM-HDPE1'],
  'V-PAY': ['RM-FRGL2', 'PM-REF22', 'PM-PCH05', 'RM-LABS1'],
}

export const codeMappings: CodeMapping[] = [
  { id: 'CM-1', vendorId: 'V-SAI', vendorCode: 'GFR-45', skuCode: 'FG1004011', note: 'Vendor ERP item code' },
  { id: 'CM-2', vendorId: 'V-SAI', vendorCode: 'ACT-45', skuCode: 'FG1004012', note: 'Vendor ERP item code' },
  { id: 'CM-3', vendorId: 'V-RKPL', vendorCode: 'GK-GF-REF', skuCode: 'FG1004011', note: 'Mapped Sep 2026 when line added' },
  { id: 'CM-4', vendorId: 'V-VAN', vendorCode: 'AP-CSB', skuCode: 'FG2001011', note: '' },
  { id: 'CM-5', vendorId: 'V-PAY', vendorCode: 'AERPKT-BLUE', skuCode: 'FG2001011', note: '' },
  { id: 'CM-6', vendorId: 'V-PAY', vendorCode: 'FAB500', skuCode: 'FG3002011', note: '' },
]

/** Every threshold here is a provisional DEMO ASSUMPTION pending business confirmation. */
export const parameters: Parameter[] = [
  { key: 'attainLow', label: 'Attainment lower bound', value: 90, unit: '%', description: 'Below this attainment a SKU/day is “Below plan”.', assumption: true },
  { key: 'attainHigh', label: 'Attainment upper bound', value: 110, unit: '%', description: 'Above this attainment a SKU/day is “Above plan” (possible excess build).', assumption: true },
  { key: 'staleDaysDaily', label: 'Stale after (daily reports)', value: 1, unit: 'days', description: 'A daily report older than the latest due date by more than this is stale.', assumption: true },
  { key: 'staleDaysWeekly', label: 'Stale after (RM/PM inventory)', value: 4, unit: 'days', description: 'Material inventory snapshots older than this are stale.', assumption: true },
  { key: 'dispatchLagDays', label: 'Allowed dispatch lag', value: 10, unit: 'days', description: 'FG stock produced more than this many days ago and not dispatched is flagged.', assumption: true },
  { key: 'excessPct', label: 'Excess FG vs baseline', value: 30, unit: '%', description: 'Latest FG stock above baseline by more than this is “Excess”.', assumption: true },
  { key: 'idleDays', label: 'Idle stock window', value: 10, unit: 'days', description: 'No dispatch for this many days while stock > 0 is “Idle”.', assumption: true },
  { key: 'expiryWarnDays', label: 'Near-expiry window', value: 60, unit: 'days', description: 'Lots expiring within this window are flagged.', assumption: true },
  { key: 'baselineWeeks', label: 'FG baseline window', value: 4, unit: 'weeks', description: 'Baseline = average of weekly (Monday) FG snapshots over this window.', assumption: true },
]

// ── Scale-test scenario (opt-in) ────────────────────────────────────────────
// GENERATED demo vendors used to check the UI with 15+ vendors. They are NOT GCPL master data.
// Switch with Demo controls → Dataset, or ?scenario=scale / ?scenario=core (persisted in this browser).
export type DemoScenario = 'core' | 'scale'
export const SCENARIO_KEY = 'gcpl-p2p-scenario-v1'
function readScenario(): DemoScenario {
  try {
    const p = new URLSearchParams(globalThis.location?.search ?? '').get('scenario')
    if (p === 'scale' || p === 'core') {
      localStorage.setItem(SCENARIO_KEY, p)
      return p
    }
    return localStorage.getItem(SCENARIO_KEY) === 'scale' ? 'scale' : 'core'
  } catch {
    return 'core'
  }
}
export const SCENARIO: DemoScenario = readScenario()
export const SCALE_VENDOR_PREFIX = 'V-S'

const gen = (n: number, name: string, calendarId = 'CAL-STD'): Vendor => ({
  id: `V-S${n}`,
  name,
  code: `SC${n}`,
  location: 'Generated scale-test vendor (demo)',
  calendarId,
  reportEmail: `mis@sc${n}-demo.example`,
})
/** 11 generated vendors → 16 in total with the core five. */
export const scaleVendors: Vendor[] = [
  gen(6, 'Shree Ganesh Fillers'),
  gen(7, 'Kanha Aerosols'),
  gen(8, 'Sri Venkateswara Contract Packaging'),
  gen(9, 'Mahalaxmi Polypack'),
  gen(10, 'Orbit Home Care'),
  gen(11, 'Deccan Coil Works'),
  gen(12, 'Nirmal Liquids'),
  gen(13, 'Brahmaputra Consumer Products', 'CAL-NE'),
  gen(14, 'Vasant Industries'),
  gen(15, 'Patel Fragrance Fills'),
  gen(16, 'Unnati Contract Manufacturing Services'),
]
/** Varied SKU counts per generated vendor (1–6), reusing demo SKUs as secondary sources. */
const scaleSkus: Record<string, string[]> = {
  'V-S6': ['FG1004011', 'FG1004012', 'FG1004201'],
  'V-S7': ['FG2002011', 'FG2002012'],
  'V-S8': ['FG2001011', 'FG2001012', 'FG2001013', 'FG2002011', 'FG2002012', 'FG2003011'],
  'V-S9': ['FG3002011'],
  'V-S10': ['FG3001011', 'FG3001012', 'FG3001021', 'FG3002011'],
  'V-S11': ['FG1004101', 'FG1004102'],
  'V-S12': ['FG1004011', 'FG1004012', 'FG1004021', 'FG1004101', 'FG1004201'],
  'V-S13': ['FG2001011', 'FG2001013', 'FG3002011'],
  'V-S14': ['FG1004201'],
  'V-S15': ['FG2001012', 'FG2003011', 'FG3001011', 'FG3001021'],
  'V-S16': ['FG1004102', 'FG2001011'],
}
export const scaleVendorSkuMaps: VendorSkuMap[] = Object.entries(scaleSkus).flatMap(([vendorId, codes]) => codes.map((skuCode) => ({ vendorId, skuCode, since: '2026-08-01', primary: false })))
export const scaleVendorMaterials: Record<string, string[]> = Object.fromEntries(Object.entries(scaleSkus).map(([v, codes]) => [v, materials.filter((m) => m.usedInSkus.some((s) => codes.includes(s))).map((m) => m.code)]))

// The default demo includes five generated vendors; scale mode includes all eleven.
export const activeGeneratedVendors = SCENARIO === 'scale' ? scaleVendors : scaleVendors.slice(0, 5)
const activeGeneratedIds = new Set(activeGeneratedVendors.map((v) => v.id))
export const activeGeneratedVendorSkuMaps = scaleVendorSkuMaps.filter((m) => activeGeneratedIds.has(m.vendorId))
