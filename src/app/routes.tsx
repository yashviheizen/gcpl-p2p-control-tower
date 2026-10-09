import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from './AppShell'
import { Providers } from './Providers'

const Overview = lazy(() => import('@/pages/Overview'))
const Production = lazy(() => import('@/pages/production/Production'))
const SkuInvestigation = lazy(() => import('@/pages/SkuInvestigation'))
const Dispatch = lazy(() => import('@/pages/inventory/Dispatch'))
const FgInventory = lazy(() => import('@/pages/inventory/FgInventory'))
const Materials = lazy(() => import('@/pages/inventory/Materials'))
const PoCoverage = lazy(() => import('@/pages/inventory/PoCoverage'))
const PlanView = lazy(() => import('@/pages/planning/PlanView'))
const PlanUpload = lazy(() => import('@/pages/planning/PlanUpload'))
const PlanCompare = lazy(() => import('@/pages/planning/PlanCompare'))
const ExceptionsList = lazy(() => import('@/pages/exceptions/ExceptionsList'))
const ExceptionDetail = lazy(() => import('@/pages/exceptions/ExceptionDetail'))
const Reports = lazy(() => import('@/pages/data/Reports'))
const DataQuality = lazy(() => import('@/pages/data/DataQuality'))
const UploadHistory = lazy(() => import('@/pages/data/UploadHistory'))
const BatchDetail = lazy(() => import('@/pages/data/BatchDetail'))
const ReportUpload = lazy(() => import('@/pages/data/ReportUpload'))
const MasterData = lazy(() => import('@/pages/setup/MasterData'))
const Admin = lazy(() => import('@/pages/setup/Admin'))

export const router = createBrowserRouter(
  [
    {
      element: <Providers />,
      children: [
        {
          element: <AppShell />,
          children: [
            { path: '/', element: <Overview /> },
            { path: '/production', element: <Production /> },
            { path: '/sku/:code', element: <SkuInvestigation /> },
            { path: '/dispatch', element: <Dispatch /> },
            { path: '/fg-inventory', element: <FgInventory /> },
            { path: '/materials', element: <Materials /> },
            { path: '/po-coverage', element: <PoCoverage /> },
            { path: '/planning', element: <PlanView /> },
            { path: '/planning/upload', element: <PlanUpload /> },
            { path: '/planning/compare', element: <PlanCompare /> },
            { path: '/exceptions', element: <ExceptionsList /> },
            { path: '/exceptions/:id', element: <ExceptionDetail /> },
            { path: '/data/reports', element: <Reports /> },
            { path: '/data/quality', element: <DataQuality /> },
            { path: '/data/uploads', element: <UploadHistory /> },
            { path: '/data/uploads/:id', element: <BatchDetail /> },
            { path: '/data/upload/new', element: <ReportUpload /> },
            { path: '/master-data', element: <MasterData /> },
            { path: '/admin', element: <Admin /> },
            { path: '*', element: <Navigate to="/" replace /> },
          ],
        },
      ],
    },
  ],
  // Served from a sub-path on GitHub Pages (VITE_BASE); '/' elsewhere.
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
)
