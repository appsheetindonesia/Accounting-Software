import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatSyncAgo } from '../lib/format'

const STATUS: Record<string, { dot: string; label: string }> = {
  online: { dot: 'bg-ok', label: 'Online · Mock API' },
  connecting: { dot: 'bg-warn', label: 'Menghubungkan…' },
  offline: { dot: 'bg-bad', label: 'Offline · Data lokal' },
  idle: { dot: 'bg-ink-faint', label: 'Menunggu…' },
}

export default function BottomBar() {
  const activePeriod = useStore((s) => s.activePeriod)
  const apiStatus = useStore((s) => s.apiStatus)
  const lastSyncedAt = useStore((s) => s.lastSyncedAt)
  const lastRefreshedAt = useStore((s) => s.lastRefreshedAt)
  const s = STATUS[apiStatus] ?? STATUS.idle

  // Ticker 30 detik agar teks waktu relatif (tooltip) selalu akurat.
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  // Saat offline, perjelas bahwa data bukan live melainkan cache localStorage
  const offlineLabel =
    apiStatus === 'offline'
      ? lastSyncedAt
        ? `Offline · Data dari cache (sinkron ${formatSyncAgo(lastSyncedAt)})`
        : 'Offline · Data demo lokal'
      : s.label

  // Indikator refresh token: muncul selama sesi aktif punya riwayat refresh
  // otomatis (401 → POST /auth/refresh). Transparan: tooltip menunjukkan
  // kapan token terakhir diperbarui (mis. "Sesi diperbarui otomatis · baru saja").
  const refreshedRecently = lastRefreshedAt ? Date.now() - new Date(lastRefreshedAt).getTime() < 60_000 : false
  const refreshLabel = lastRefreshedAt
    ? `Sesi diperbarui otomatis · ${formatSyncAgo(lastRefreshedAt)}`
    : null

  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-line bg-surface px-4 text-[11px] text-ink-soft">
      <span>© 2026 Appsheet Accounting Journal · v1.0.0</span>
      <span className="hidden sm:inline">Periode: {activePeriod}</span>
      <span className="ml-auto flex items-center gap-1.5">
        {refreshLabel && (
          <span
            title={refreshLabel}
            aria-label={refreshLabel}
            className={`flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium transition ${
              refreshedRecently ? 'bg-ok/10 text-ok' : 'text-ink-faint'
            }`}
          >
            <RefreshCw size={11} className={refreshedRecently ? 'animate-[spin_3s_linear_infinite]' : undefined} />
            <span className="hidden md:inline">token diperbarui</span>
          </span>
        )}
        <span className={`size-1.5 rounded-full ${s.dot}`} />
        {offlineLabel}
      </span>
    </footer>
  )
}
