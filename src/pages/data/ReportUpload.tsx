import { useSearchParams } from 'react-router-dom'
import { BackLink, PageHeader } from '@/components/ui'
import { UploadWizard, type WizardPurpose } from '@/components/UploadWizard'
import type { ReportType } from '@/data/types'
import { usePageFilters } from '@/lib/filters'

const TYPES: { type: ReportType; description: string }[] = [
  { type: 'Production', description: 'Daily produced quantity per FG code.' },
  {
    type: 'Dispatch',
    description: 'Daily dispatched quantity per FG code with invoice numbers.',
  },
  {
    type: 'FG Inventory',
    description: 'Finished-goods stock snapshot by lot and expiry.',
  },
  { type: 'RM Inventory', description: 'Raw-material stock snapshot by lot.' },
  {
    type: 'PM Inventory',
    description: 'Packing-material stock snapshot by lot.',
  },
]
const PURPOSES: WizardPurpose[] = TYPES.map((t) => ({
  id: t.type,
  label: `${t.type} report`,
  description: t.description,
  reportType: t.type,
}))

export default function ReportUpload() {
  usePageFilters([])
  const [sp] = useSearchParams()
  return (
    <div className="space-y-4">
      <BackLink fallback="/data/reports" fallbackLabel="Reports & uploads" />
      <PageHeader title="Upload vendor report" subtitle="Manual fallback when a vendor report did not arrive through the shared inbox" />
      <UploadWizard
        mode="report"
        purposes={PURPOSES}
        permission="reports.upload"
        initial={{
          purposeId: sp.get('type') ?? undefined,
          vendorId: sp.get('vendor') ?? undefined,
        }}
      />
    </div>
  )
}
