import { ArrowLeft, Hammer } from 'lucide-react'
import { useStore } from '../store/useStore'

const LABELS: Record<string, string> = {
  'buku-besar': 'Buku Besar',
  'neraca-lajur': 'Neraca Lajur',
  'laba-rugi': 'Laba Rugi',
  neraca: 'Neraca',
  'arus-kas': 'Arus Kas',
  'laporan-lain': 'Laporan Lain',
  pengaturan: 'Pengaturan',
}

export default function ComingSoon() {
  const page = useStore((s) => s.page)
  const setPage = useStore((s) => s.setPage)
  const label = LABELS[page] ?? page

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Hammer size={26} />
      </div>
      <h2 className="text-lg font-bold text-ink">Modul {label}</h2>
      <p className="max-w-sm text-sm text-ink-soft">
        Modul ini belum diimplementasikan di prototipe. Prototipe saat ini mencakup Dashboard dan Jurnal.
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
