import { RefreshCw, WifiOff } from 'lucide-react'
import { useStore } from '../store/useStore'

export default function OfflineBanner() {
  const apiStatus = useStore((s) => s.apiStatus)
  const init = useStore((s) => s.init)

  if (apiStatus !== 'offline') return null

  return (
    <div className="flex items-center gap-3 border-b border-warn/30 bg-warn/10 px-4 py-2 text-xs text-[#b45309]">
      <WifiOff size={14} className="shrink-0" />
      <p className="min-w-0 flex-1">
        Mock API tidak terhubung — menampilkan data lokal. Jalankan <code className="rounded bg-warn/10 px-1">npm start</code> di folder{' '}
        <code className="rounded bg-warn/10 px-1">mock-api/</code> (port 4000), lalu muat ulang.
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
