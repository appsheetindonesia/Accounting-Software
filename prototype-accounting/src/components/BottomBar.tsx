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
  const s = STATUS[apiStatus] ?? STATUS.idle

  // Saat offline, perjelas bahwa data bukan live melainkan cache localStorage
  const offlineLabel =
    apiStatus === 'offline'
      ? lastSyncedAt
        ? `Offline · Data dari cache (sinkron ${formatSyncAgo(lastSyncedAt)})`
        : 'Offline · Data demo lokal'
      : s.label

  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-line bg-surface px-4 text-[11px] text-ink-soft">
      <span>© 2026 Appsheet Accounting Journal · v1.0.0</span>
      <span className="hidden sm:inline">Periode: {activePeriod}</span>
      <span className="ml-auto flex items-center gap-1.5">
        <span className={`size-1.5 rounded-full ${s.dot}`} />
        {offlineLabel}
      </span>
    </footer>
  )
}
