import BalanceCards from './BalanceCards'
import TrendChart from './TrendChart'
import RecentJournals from './RecentJournals'
import AlertsPanel from './AlertsPanel'
import { useStore } from '../../store/useStore'

export default function DashboardPage() {
  const setPage = useStore((s) => s.setPage)
  const openModal = useStore((s) => s.openModal)

  return (
    <div className="space-y-5 p-5 lg:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink lg:text-2xl">Dashboard</h1>
          <p className="mt-0.5 text-sm text-ink-soft">Ringkasan keuangan · Periode Maret 2026</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage('laba-rugi')}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-hover"
          >
            Lihat Laporan
          </button>
          <button
            type="button"
            onClick={openModal}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-primary-light active:translate-y-px"
          >
            + Buat Jurnal
          </button>
        </div>
      </div>

      <BalanceCards />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TrendChart />
        </div>
        <AlertsPanel />
      </div>

      <RecentJournals />
    </div>
  )
}
