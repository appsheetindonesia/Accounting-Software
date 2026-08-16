import { Clock3, LogIn, X } from 'lucide-react'
import { useStore } from '../store/useStore'

/**
 * Modal "Sesi berakhir" — muncul saat refresh token gagal (401 berulang →
 * SESSION_EXPIRED / INVALID_REFRESH_TOKEN dari mock API). Client sudah
 * melakukan logout otomatis (token & user dibersihkan, kembali ke halaman
 * login); modal ini memberi tahu user secara eksplisit sebelum dia masuk lagi.
 *
 * Konsisten dengan bahasa desain prototipe (ResetDataModal): overlay fixed,
 * kartu rounded-xl + animasi fadein. z-50 agar tampil di atas halaman login.
 */
export default function SessionExpiredModal() {
  const sessionExpired = useStore((s) => s.sessionExpired)
  const dismissSessionExpired = useStore((s) => s.dismissSessionExpired)

  if (!sessionExpired) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={dismissSessionExpired}
      role="dialog"
      aria-modal="true"
      aria-label="Sesi berakhir"
    >
      <div
        className="w-full max-w-md rounded-xl bg-surface shadow-modal animate-[fadein_0.18s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-warn/10">
              <Clock3 size={18} className="text-[#b45309]" />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink">Sesi Berakhir</h2>
              <p className="text-xs text-ink-soft">Anda telah keluar otomatis</p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissSessionExpired}
            aria-label="Tutup"
            className="rounded-md p-1.5 text-ink-soft transition hover:bg-surface-hover hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 px-6 py-5">
          <p className="text-sm leading-relaxed text-ink-soft">
            Token sesi Anda tidak dapat diperbarui lagi (refresh token kedaluwarsa atau tidak valid).
            Untuk keamanan, sesi ditutup otomatis dan data Anda aman.
          </p>
          <p className="text-xs text-ink-faint">Silakan masuk kembali untuk melanjutkan pekerjaan.</p>
        </div>

        <div className="flex items-center justify-end border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={dismissSessionExpired}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-light active:translate-y-px"
          >
            <LogIn size={15} />
            Masuk kembali
          </button>
        </div>
      </div>
    </div>
  )
}
