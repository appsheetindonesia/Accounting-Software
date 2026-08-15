import { useEffect, useRef, useState } from 'react'
import { DatabaseBackup, RotateCcw, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { SEED_JOURNAL_IDS } from '../data/mock'

export default function SettingsPage() {
  const resetDemoData = useStore((s) => s.resetDemoData)
  const journals = useStore((s) => s.journals)
  const apiStatus = useStore((s) => s.apiStatus)

  // Konfirmasi 2 langkah: klik pertama menampilkan tombol "Yakin?", hilang setelah 5 detik
  const [confirming, setConfirming] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => clearTimeout(timer.current ?? undefined), [])

  const handleClick = () => {
    if (confirming) {
      clearTimeout(timer.current ?? undefined)
      setConfirming(false)
      resetDemoData()
      return
    }
    setConfirming(true)
    timer.current = setTimeout(() => setConfirming(false), 5000)
  }

  const userJournalCount = journals.filter((j) => !SEED_JOURNAL_IDS.includes(j.id)).length

  return (
    <div className="space-y-5 p-5 lg:p-7">
      <div>
        <h1 className="text-xl font-bold text-ink lg:text-2xl">Pengaturan</h1>
        <p className="mt-0.5 text-sm text-ink-soft">Kelola data demo dan koneksi prototipe</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="flex items-center gap-2 border-b border-line bg-canvas px-5 py-3">
            <DatabaseBackup size={16} className="text-primary" />
            <h2 className="text-sm font-bold text-ink">Data Demo</h2>
          </div>
          <div className="space-y-3 p-5">
            <p className="text-sm text-ink-soft">
              Reset menghapus semua jurnal yang tersimpan di localStorage (perangkat ini) dan mengembalikan data ke
              seed awal demo: <strong className="text-ink">8 jurnal</strong> Maret 2026, saldo Kas 87jt, Aset 557jt.
            </p>
            <ul className="space-y-1 text-xs text-ink-faint">
              <li>· Data pengguna lokal: <strong className="text-ink-soft">{journals.length} jurnal</strong> (termasuk {userJournalCount} bukan seed)</li>
              <li>· Koneksi mock API: <strong className="text-ink-soft">{apiStatus}</strong> — tidak diubah oleh reset ini</li>
            </ul>
            <button
              type="button"
              onClick={handleClick}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-card transition active:translate-y-px ${
                confirming ? 'bg-bad hover:bg-bad/90' : 'border border-bad/30 bg-bad/10 text-bad hover:bg-bad/15'
              }`}
            >
              {confirming ? (
                <>
                  <Trash2 size={15} /> Yakin? Klik lagi untuk reset
                </>
              ) : (
                <>
                  <RotateCcw size={15} /> Reset ke data demo
                </>
              )}
            </button>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              Mock API menyimpan state di memori server. Untuk mengembalikan data server juga, jalankan{' '}
              <code className="rounded bg-canvas px-1 py-0.5 font-mono text-primary">npm run reset</code> di folder{' '}
              <code className="rounded bg-canvas px-1 py-0.5 font-mono text-primary">mock-api/</code>.
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="flex items-center gap-2 border-b border-line bg-canvas px-5 py-3">
            <RotateCcw size={16} className="text-primary" />
            <h2 className="text-sm font-bold text-ink">Koneksi Mock API</h2>
          </div>
          <div className="space-y-3 p-5">
            <p className="text-sm text-ink-soft">
              Prototipe memakai <strong className="text-ink">mock API (localhost:4000)</strong> sebagai sumber data saat
              server hidup, dengan fallback ke data lokal tersimpan saat server mati.
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-xs text-ink-soft">
              <span className={`size-2 rounded-full ${apiStatus === 'online' ? 'bg-ok' : apiStatus === 'offline' ? 'bg-bad' : 'bg-warn'}`} />
              Status: <strong className="text-ink">{apiStatus}</strong>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-hover"
            >
              <RotateCcw size={15} /> Muat ulang & sambungkan lagi
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
