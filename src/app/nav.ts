import { AlertTriangle, BarChart3, Boxes, CalendarDays, ClipboardCheck, Database, FileSpreadsheet, GitCompare, History, Inbox, LayoutDashboard, Package, ShieldCheck, Truck, Upload, Warehouse, type LucideIcon } from 'lucide-react'
import type { Permission } from '@/data/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  perm: Permission
  end?: boolean
  /** Expandable sub-group (e.g. Master Data sections). The parent row toggles; only children navigate. */
  children?: NavChild[]
}
export interface NavChild {
  to: string
  label: string
}
export interface NavGroup {
  id: string
  label: string | null
  icon?: LucideIcon
  secondary?: boolean
  items: NavItem[]
}

/**
 * Master Data sections, each with a stable URL (/master-data/<slug>). The sidebar, the in-page tabs and
 * direct links all read this list (`label` for the sidebar, sentence-case `tab` for the in-page tabs); '/master-data' alone redirects to the first section.
 */
export const MASTER_SECTIONS = [
  { slug: 'product-hierarchy', label: 'Product Hierarchy', tab: 'Product hierarchy' },
  { slug: 'vendors', label: 'Vendors', tab: 'Vendors' },
  { slug: 'uom-conversions', label: 'UOM Conversions', tab: 'UOM conversions' },
  { slug: 'operating-calendars', label: 'Operating Calendars', tab: 'Operating calendars' },
  { slug: 'calendar-exceptions', label: 'Calendar Exceptions', tab: 'Calendar exceptions' },
  { slug: 'code-mappings', label: 'Code Mappings', tab: 'Code mappings' },
  { slug: 'parameters', label: 'Parameters', tab: 'Parameters' },
  { slug: 'change-history', label: 'Change History', tab: 'Change history' },
] as const
export type MasterSection = (typeof MASTER_SECTIONS)[number]['slug']
export const masterPath = (slug: MasterSection) => `/master-data/${slug}`

export const NAV: NavGroup[] = [
  {
    id: 'overview',
    label: null,
    items: [
      {
        to: '/',
        label: 'Overview',
        icon: LayoutDashboard,
        perm: 'view.overview',
        end: true,
      },
    ],
  },
  {
    id: 'controlTower',
    label: 'Control Tower',
    icon: BarChart3,
    items: [
      {
        to: '/production',
        label: 'Production',
        icon: BarChart3,
        perm: 'view.controlTower',
      },
      {
        to: '/dispatch',
        label: 'Dispatch',
        icon: Truck,
        perm: 'view.controlTower',
      },
      {
        to: '/fg-inventory',
        label: 'FG Inventory',
        icon: Warehouse,
        perm: 'view.controlTower',
      },
      {
        to: '/materials',
        label: 'RM/PM Inventory',
        icon: Boxes,
        perm: 'view.controlTower',
      },
      {
        to: '/po-coverage',
        label: 'PO Coverage',
        icon: ClipboardCheck,
        perm: 'view.controlTower',
      },
    ],
  },
  {
    id: 'planning',
    label: 'Planning',
    icon: CalendarDays,
    items: [
      {
        to: '/planning',
        label: 'Production Plan',
        icon: CalendarDays,
        perm: 'view.planning',
        end: true,
      },
      {
        to: '/planning/upload',
        label: 'Upload Plan',
        icon: Upload,
        perm: 'plan.upload',
      },
      {
        to: '/planning/compare',
        label: 'Compare Versions',
        icon: GitCompare,
        perm: 'view.planning',
      },
    ],
  },
  {
    id: 'exceptions',
    label: null,
    items: [
      {
        to: '/exceptions',
        label: 'Exceptions',
        icon: AlertTriangle,
        perm: 'view.exceptions',
      },
    ],
  },
  {
    id: 'dataOps',
    label: 'Data Operations',
    icon: Inbox,
    items: [
      {
        to: '/data/reports',
        label: 'Reports & Uploads',
        icon: Inbox,
        perm: 'view.dataOps',
      },
      {
        to: '/data/quality',
        label: 'Data Quality',
        icon: FileSpreadsheet,
        perm: 'view.dataOps',
      },
      {
        to: '/data/uploads',
        label: 'Upload History',
        icon: History,
        perm: 'view.dataOps',
      },
    ],
  },
  {
    id: 'setup',
    label: 'Setup',
    icon: Database,
    secondary: true,
    items: [
      {
        to: '/master-data',
        label: 'Master Data',
        icon: Package,
        perm: 'view.masterData',
        children: MASTER_SECTIONS.map((m) => ({ to: masterPath(m.slug), label: m.label })),
      },
      {
        to: '/admin',
        label: 'Administration',
        icon: ShieldCheck,
        perm: 'view.admin',
      },
    ],
  },
]

export const ROUTE_PERMS: { prefix: string; perm: Permission }[] = [
  { prefix: '/planning/upload', perm: 'plan.upload' },
  { prefix: '/production', perm: 'view.controlTower' },
  { prefix: '/dispatch', perm: 'view.controlTower' },
  { prefix: '/fg-inventory', perm: 'view.controlTower' },
  { prefix: '/materials', perm: 'view.controlTower' },
  { prefix: '/po-coverage', perm: 'view.controlTower' },
  { prefix: '/sku', perm: 'view.controlTower' },
  { prefix: '/planning', perm: 'view.planning' },
  { prefix: '/exceptions', perm: 'view.exceptions' },
  { prefix: '/data/upload/new', perm: 'reports.upload' },
  { prefix: '/data', perm: 'view.dataOps' },
  { prefix: '/master-data', perm: 'view.masterData' },
  { prefix: '/admin', perm: 'view.admin' },
]
