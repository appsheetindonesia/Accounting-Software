import { useState } from 'react'
import { RotateCcw, TriangleAlert, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { SEED_JOURNAL_IDS } from '../data/mock'

interface ResetDataModalProps {
  open: boolean
  onClose: () => void
}

/**
 * Modal konfirmasi reset data demo — dipakai dari Pengaturan dan akses cepat
 * (dropdown avatar user). Konsisten dengan bahasa desain prototipe:
 * overlay fixed z-40, kartu rounded-xl + animasi fadein, aksi destruktif bg-bad.
 */
export default function ResetDataModal({ open, onClose }: ResetDataModalProps) {
  const resetDemoData = useStore((s) => s.resetDemoData)
  const journals = useStore((s) => s.journals)
  const offlineQueue = useStore((s) => s.offlineQueue)
  const apiStatus = useStore((s) => s.apiStatus)

  const [resetting, setResetting] = useState(false)

  if (!open) return null

  const userJournalCount = journals.filter((j) => !SEED_JOURNAL_IDS.includes(j.id)).length

  const handleConfirm = async () => {
    setResetting(true)
    try {
      await resetDemoData()
    } finally {
      setResetting(false)
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !resetting && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Konfirmasi reset data demo"
    >
      <div
        className="w-full max-w-md rounded-xl bg-surface shadow-modal animate-[fadein_0.18s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-bad/10">
              <TriangleAlert size={18} className="text-bad" />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink">Reset Data Demo?</h2>
              <p className="text-xs text-ink-soft">Tindakan ini tidak dapat dibatalkan</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={resetting}
            aria-label="Tutup"
            className="rounded-md p-1.5 text-ink-soft transition hover:bg-surface-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 px-6 py-5">
          <p className="text-sm text-ink-soft">
            Semua data demo akan dikembalikan ke seed awal. Data berikut akan dihapus:
          </p>
          <ul className="space-y-2 rounded-lg border border-line bg-canvas px-4 py-3 text-xs text-ink-soft">
            <li className="flex items-center gap-2">
              <span className="text-bad">·</span>
              <span>
                <strong className="text-ink">{journals.length} jurnal</strong> di perangkat ini ({userJournalCount}{' '}
                buatan pengguna)
              </span>
            </li>
            {offlineQueue.length > 0 && (
              <li className="flex items-center gap-2">
                <span className="text-bad">·</span>
                <span>
                  <strong className="text-ink">{offlineQueue.length} operasi</strong> dalam antrian sinkronisasi offline
                </span>
              </li>
            )}
            <li className="flex items-center gap-2">
              <span className="text-bad">·</span>
              <span>
                Server mock:{' '}
                <strong className="text-ink">
                  {apiStatus === 'online' ? 'ikut di-reset (POST /admin/reset)' : `tidak dijangkau (${apiStatus}) — hanya data lokal`}
                </strong>
              </span>
            </li>
          </ul>
          <p className="text-xs text-ink-faint">Sesi login Anda tidak terpengaruh.</p>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={resetting}
            className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink-soft transition hover:bg-surface-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={resetting}
            className="inline-flex items-center gap-2 rounded-lg bg-bad px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-bad/90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RotateCcw size={15} className={resetting ? 'animate-spin' : undefined} />
            {resetting ? 'Mereset…' : 'Ya, reset data'}
          </button>
        </div>
      </div>
    </div>
  )
}
