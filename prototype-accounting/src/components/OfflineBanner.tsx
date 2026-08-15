import { useEffect, useState } from 'react'
import { RefreshCw, UploadCloud, WifiOff } from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatSyncAgo } from '../lib/format'

export default function OfflineBanner() {
  const apiStatus = useStore((s) => s.apiStatus)
  const isSyncing = useStore((s) => s.isSyncing)
  const pendingCount = useStore((s) => s.offlineQueue.length)
  const lastSyncedAt = useStore((s) => s.lastSyncedAt)
  const init = useStore((s) => s.init)

  // Ticker: "sinkron terakhir X menit lalu" tetap akurat tanpa reload
  const [, setTick] = useState(0)
  useEffect(() => {
    if (apiStatus !== 'offline' || isSyncing) return
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [apiStatus, isSyncing])

  // Saat sinkronisasi berjalan (koneksi sudah pulih) → banner status berbeda
  if (isSyncing) {
    return (
      <div className="flex items-center gap-3 border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs text-primary">
        <UploadCloud size={14} className="shrink-0 animate-pulse" />
        <p className="min-w-0 flex-1">
          Menyinkronkan {pendingCount} operasi offline ke server…
        </p>
      </div>
    )
  }

  if (apiStatus !== 'offline') return null

  const cacheLabel = lastSyncedAt
    ? `Data dari cache · sinkron terakhir ${formatSyncAgo(lastSyncedAt)}`
    : 'Data demo lokal · belum pernah tersinkron dengan server'

  return (
    <div className="flex items-center gap-3 border-b border-warn/30 bg-warn/10 px-4 py-2 text-xs text-[#b45309]">
      <WifiOff size={14} className="shrink-0" />
      <p className="min-w-0 flex-1">
        <strong className="font-semibold">{cacheLabel}</strong>
        {pendingCount > 0 ? (
          <>
            {' '}— <strong>{pendingCount} operasi</strong> menunggu sinkronisasi dan akan
            dikirim otomatis begitu koneksi pulih.
          </>
        ) : (
          <> — Mock API tidak terhubung. Jalankan <code className="rounded bg-warn/10 px-1">npm start</code> di folder{' '}
            <code className="rounded bg-warn/10 px-1">mock-api/</code> (port 4000).</>
        )}{' '}
        <span className="font-medium">Mencoba ulang otomatis…</span>
      </p>
      <button
        type="button"
        onClick={() => init()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-warn/40 bg-surface px-3 py-1.5 font-semibold text-[#b45309] transition hover:bg-warn/10"
      >
        <RefreshCw size={12} /> Coba lagi
      </button>
    </div>
  )
}
