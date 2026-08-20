import { ArrowLeft, Hammer } from 'lucide-react'
import { useStore } from '../store/useStore'
import { SkeletonLines } from './Skeleton'

const LABELS: Record<string, string> = {
  'laporan-lain': 'Laporan Lain',
}

// Indikator loading konsisten dengan halaman lain: selama aplikasi masih
// menyinkronkan data pertama kali (apiStatus 'connecting' & belum pernah
// sinkron), semua menu navigasi menampilkan skeleton yang sama — termasuk
// placeholder modul yang belum diimplementasikan (Laporan Lain).
function useInitialLoading() {
  const apiStatus = useStore((s) => s.apiStatus)
  const lastSyncedAt = useStore((s) => s.lastSyncedAt)
  return apiStatus === 'connecting' && lastSyncedAt === null
}

export default function ComingSoon() {
  const page = useStore((s) => s.page)
  const setPage = useStore((s) => s.setPage)
  const label = LABELS[page] ?? page
  const loading = useInitialLoading()

  if (loading) {
    return (
      <div className="space-y-5 p-5 lg:p-7">
        <SkeletonLines rows={1} />
        <SkeletonLines rows={4} />
        <SkeletonLines rows={3} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Hammer size={26} />
      </div>
      <h2 className="text-lg font-bold text-ink">Modul {label}</h2>
      <p className="max-w-sm text-sm text-ink-soft">
        Modul ini belum diimplementasikan di prototipe. Prototipe saat ini mencakup Dashboard, Jurnal, Buku Besar, Laba Rugi, Neraca, Neraca Lajur, Arus Kas, dan Pengaturan.
      </p>
      <button
        type="button"
        onClick={() => setPage('dashboard')}
        className="mt-2 inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-hover"
      >
        <ArrowLeft size={15} /> Kembali ke Dashboard
      </button>
    </div>
  )
}
