import { useState } from 'react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../api'

type ExportFormat = 'pdf' | 'xlsx'

type ExportButtonsProps =
  | { reportType: 'trial-balance' | 'income-statement' | 'balance-sheet' | 'cash-flow'; period: string }
  | { accountId: string; accountCode: string; accountName: string; period: string; range?: { start: string; end: string } }

/**
 * Tombol Export PDF / XLSX untuk halaman laporan & Buku Besar per akun.
 * - reportType → GET /exports/reports/:type (laporan)
 * - accountId   → GET /exports/ledger/:accountId (Buku Besar per akun)
 * Auth via navigasi (Bearer + X-Entity-Id di query) lalu memicu unduhan file
 * di browser. Nonaktif saat offline; feedback via toast (sukses/error).
 */
export default function ExportButtons(props: ExportButtonsProps) {
  const period = props.period
  const apiStatus = useStore((s) => s.apiStatus)
  const showToast = useStore((s) => s.showToast)
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const online = apiStatus === 'online'

  const doExport = async (format: ExportFormat) => {
    if (busy) return
    setBusy(format)
    try {
      const filename =
        'reportType' in props
          ? await api.exportReport(props.reportType, format, period)
          : await api.exportLedger(props.accountId, props.accountCode, format, period, props.range)
      showToast(`Laporan berhasil diekspor — ${filename}`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Export gagal — coba lagi', 'error')
    } finally {
      setBusy(null)
    }
  }

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink shadow-card transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => doExport('pdf')}
        disabled={!online || busy !== null}
        aria-label="Export PDF"
        title={online ? 'Unduh laporan sebagai PDF' : 'Export tidak tersedia saat offline'}
        className={btn}
      >
        {busy === 'pdf' ? <FileText size={15} className="animate-pulse text-primary" /> : <FileText size={15} className="text-primary" />}
        <span className="hidden sm:inline">Export PDF</span>
      </button>
      <button
        type="button"
        onClick={() => doExport('xlsx')}
        disabled={!online || busy !== null}
        aria-label="Export XLSX"
        title={online ? 'Unduh laporan sebagai XLSX' : 'Export tidak tersedia saat offline'}
        className={btn}
      >
        {busy === 'xlsx' ? (
          <FileSpreadsheet size={15} className="animate-pulse text-ok" />
        ) : (
          <FileSpreadsheet size={15} className="text-ok" />
        )}
        <span className="hidden sm:inline">Export XLSX</span>
      </button>
    </div>
  )
}
