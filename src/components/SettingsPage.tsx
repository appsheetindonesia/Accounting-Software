import { useState } from 'react'
import { DatabaseBackup, RotateCcw } from 'lucide-react'
import { useStore } from '../store/useStore'
import { SEED_JOURNAL_IDS } from '../data/mock'
import DatabaseSettings from './DatabaseSettings'
import PeriodSettings from './PeriodSettings'
import ResetDataModal from './ResetDataModal'

export default function SettingsPage() {
  const journals = useStore((s) => s.journals)
  const apiStatus = useStore((s) => s.apiStatus)

  // Konfirmasi reset memakai modal (bukan teks tombol berubah).
  const [confirmOpen, setConfirmOpen] = useState(false)

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
              Saat mock API hidup, reset ini juga memanggil <code className="rounded bg-canvas px-1 py-0.5 font-mono text-primary">POST /admin/reset</code> di server.
            </p>
            <ul className="space-y-1 text-xs text-ink-faint">
              <li>· Data pengguna lokal: <strong className="text-ink-soft">{journals.length} jurnal</strong> (termasuk {userJournalCount} bukan seed)</li>
              <li>· Server mock: <strong className="text-ink-soft">{apiStatus === 'online' ? 'akan ikut di-reset' : 'tidak dijangkau (' + apiStatus + ')'}</strong></li>
            </ul>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-bad/30 bg-bad/10 px-4 py-2.5 text-sm font-semibold text-bad shadow-card transition hover:bg-bad/15 active:translate-y-px"
            >
              <RotateCcw size={15} /> Reset ke data demo
            </button>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              Data yang diposting lewat UI saat online disimpan di memori server mock (dan localStorage saat offline).
              Reset di atas membersihkan keduanya sekaligus — atau jalankan{' '}
              <code className="rounded bg-canvas px-1 py-0.5 font-mono text-primary">npm run reset</code> di{' '}
              <code className="rounded bg-canvas px-1 py-0.5 font-mono text-primary">mock-api/</code> untuk reset server saja.
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

      <ResetDataModal open={confirmOpen} onClose={() => setConfirmOpen(false)} />

      <DatabaseSettings />

      <PeriodSettings />
    </div>
  )
}
