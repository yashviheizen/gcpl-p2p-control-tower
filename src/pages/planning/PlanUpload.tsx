import { useSearchParams } from 'react-router-dom'
import { BackLink, PageHeader } from '@/components/ui'
import { UploadWizard, type WizardPurpose } from '@/components/UploadWizard'
import { usePageFilters } from '@/lib/filters'

const PURPOSES: WizardPurpose[] = [
  {
    id: 'Baseline',
    label: 'Baseline plan',
    description: 'The first plan for a vendor and month (or a full replacement). Stored as a new version.',
    planKind: 'Baseline',
  },
  {
    id: 'Correction',
    label: 'Correction plan',
    description: 'Revised quantities for a period that already has a plan. Supersedes the active version; earlier versions are kept.',
    planKind: 'Correction',
  },
]

export default function PlanUpload() {
  usePageFilters([])
  const [sp] = useSearchParams()
  return (
    <div className="space-y-4">
      <BackLink fallback="/planning" fallbackLabel="Production plan" />
      <PageHeader title="Upload production plan" subtitle="Add a baseline or correction plan version for a vendor and month" />
      <UploadWizard
        mode="plan"
        purposes={PURPOSES}
        permission="plan.upload"
        initial={{
          purposeId: sp.get('kind') ?? undefined,
          vendorId: sp.get('vendor') ?? undefined,
          month: sp.get('month') ?? undefined,
        }}
      />
    </div>
  )
}
