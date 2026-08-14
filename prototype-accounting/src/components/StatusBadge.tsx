import type { JournalStatus } from '../types'

const STYLES: Record<JournalStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-warn/15 text-[#b45309]' },
  posted: { label: 'Posted', className: 'bg-ok/15 text-primary-light' },
  reversed: { label: 'Reversed', className: 'bg-bad/10 text-bad' },
}

export default function StatusBadge({ status }: { status: JournalStatus }) {
  const { label, className } = STYLES[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  )
}
