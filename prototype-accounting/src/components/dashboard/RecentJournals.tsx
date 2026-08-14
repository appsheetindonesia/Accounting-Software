import { ArrowRight } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api, toJournalEntry } from '../../api'
import { useApiFetch } from '../../hooks/useApiFetch'
import { formatDateShort, formatIDR } from '../../lib/format'
import StatusBadge from '../StatusBadge'
import type { JournalEntry } from '../../types'

export default function RecentJournals() {
  const journals = useStore((s) => s.journals)
  const setPage = useStore((s) => s.setPage)
  const apiStatus = useStore((s) => s.apiStatus)

  const localRecent = (): JournalEntry[] =>
    [...journals]
      .sort((a, b) => b.date.localeCompare(a.date) || b.transactionNumber.localeCompare(a.transactionNumber))
      .slice(0, 5)

  const { data } = useApiFetch(
    `dashboard-recent:${apiStatus}`,
    apiStatus === 'online' || apiStatus === 'offline',
    () => api.getDashboardRecent().then((d) => d.journals.map(toJournalEntry)),
    localRecent,
  )
  const recent = data ?? localRecent()

  return (
    <div className="rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h3 className="text-sm font-bold text-ink">Jurnal Terbaru</h3>
        <button
          type="button"
          onClick={() => setPage('journal')}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-light"
        >
          Lihat Semua <ArrowRight size={13} />
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              <th className="px-5 py-2.5">Tgl</th>
              <th className="px-3 py-2.5">No. Bukti</th>
              <th className="px-3 py-2.5">Keterangan</th>
              <th className="px-3 py-2.5 text-right">Nominal</th>
              <th className="px-5 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((j) => (
              <tr key={j.id} className="border-b border-line/70 last:border-0 hover:bg-surface-hover/60">
                <td className="px-5 py-3 text-sm text-ink-soft">{formatDateShort(j.date)}</td>
                <td className="num px-3 py-3 text-xs text-ink">{j.transactionNumber}</td>
                <td className="max-w-[220px] truncate px-3 py-3 text-sm text-ink">{j.description}</td>
                <td className="num px-3 py-3 text-right text-sm font-semibold text-ink">{formatIDR(j.lines.reduce((s, l) => s + l.debit, 0))}</td>
                <td className="px-5 py-3"><StatusBadge status={j.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
