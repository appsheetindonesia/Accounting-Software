import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { JournalEntry } from '../../types'

interface RejectJournalDialogProps {
  journal: JournalEntry | null
  onClose: () => void
}

/**
 * Dialog Reject jurnal — alasan penolakan WAJIB diisi (dikirim ke
 * POST /journals/:id/reject dan tampil di detail jurnal). Gaya konsisten
 * dengan ResetDataModal: overlay fixed z-40, kartu rounded-xl, aksi bad.
 */
export default function RejectJournalDialog({ journal, onClose }: RejectJournalDialogProps) {
  const rejectJournal = useStore((s) => s.rejectJournal)
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  // Reset input tiap dialog dibuka (journal berubah null → objek)
  useEffect(() => {
    if (journal) setReason('')
  }, [journal])

  if (!journal) return null

  const canConfirm = reason.trim().length > 0 && !rejecting

  const handleConfirm = async () => {
    if (!canConfirm) return
    setRejecting(true)
    try {
      await rejectJournal(journal.id, reason.trim())
    } finally {
      setRejecting(false)
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !rejecting && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Tolak jurnal"
    >
      <div
        className="w-full max-w-md rounded-xl bg-surface shadow-modal animate-[fadein_0.18s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-bad/10">
              <X size={18} className="text-bad" />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink">Tolak Jurnal?</h2>
              <p className="text-xs text-ink-soft">
                {journal.transactionNumber} akan kembali ke draft — alasan wajib diisi dan tampil di detail.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={rejecting}
            aria-label="Tutup"
            className="rounded-md p-1.5 text-ink-soft transition hover:bg-surface-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 px-6 py-5">
          <label htmlFor="reject-reason" className="block text-xs font-bold uppercase tracking-wider text-ink-faint">
            Alasan penolakan <span className="text-bad">*</span>
          </label>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={rejecting}
            rows={3}
            maxLength={300}
            placeholder="Tulis alasan penolakan…"
            aria-label="Alasan penolakan"
            className="w-full resize-none rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          <p className="text-xs text-ink-faint">Alasan ini akan terlihat oleh pembuat jurnal di detail.</p>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={rejecting}
            className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink-soft transition hover:bg-surface-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="inline-flex items-center gap-2 rounded-lg bg-bad px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-bad/90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={15} />
            {rejecting ? 'Menolak…' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}
