import { AlertTriangle, BarChart3, Boxes, CalendarDays, ClipboardCheck, Database, FileSpreadsheet, GitCompare, History, Inbox, LayoutDashboard, Package, ShieldCheck, Truck, Upload, Warehouse, type LucideIcon } from 'lucide-react'
import type { Permission } from '@/data/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  perm: Permission
  end?: boolean
}
export interface NavGroup {
  id: string
  label: string | null
  icon?: LucideIcon
  secondary?: boolean
  items: NavItem[]
}

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
