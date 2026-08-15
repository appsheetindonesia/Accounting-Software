import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Scale } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../api'
import { computeTrialBalance, type TrialBalanceView } from '../../lib/ledger'
import { formatIDR } from '../../lib/format'

const PERIODS = [
  { key: '2026-01', label: 'Januari 2026', end: '2026-01-31' },
  { key: '2026-02', label: 'Februari 2026', end: '2026-02-28' },
  { key: '2026-03', label: 'Maret 2026', end: '2026-03-31' },
]

type TBView = TrialBalanceView

export default function TrialBalancePage() {
  const accounts = useStore((s) => s.accounts)
  const journals = useStore((s) => s.journals)
  const apiStatus = useStore((s) => s.apiStatus)
  const [periodIdx, setPeriodIdx] = useState(2) // Maret 2026
  const [apiView, setApiView] = useState<TBView | null>(null)
  const [offline, setOffline] = useState(false)

  const period = PERIODS[periodIdx]

  // Fallback offline: saldo YTD per akhir periode, Debit harus = Kredit
  const localView = useMemo<TBView>(
    () => computeTrialBalance(accounts, journals, period.end),
    [accounts, journals, period],
  )

  // Data via API: GET /reports/trial-balance?period= (tunggu koneksi menetap)
  const ready = apiStatus === 'online' || apiStatus === 'offline'
  useEffect(() => {
    if (!ready) return
    let alive = true
    setOffline(false)
    api
      .getTrialBalance(period.key)
      .then((d) => {
        if (!alive) return
        setApiView({
          lines: d.lines.map((l) => ({
            accountCode: l.accountCode,
            accountName: l.accountName,
            debit: l.debit,
            credit: l.credit,
          })),
          debit: d.totals.debit,
          credit: d.totals.credit,
          balanced: d.totals.isBalanced,
        })
      })
      .catch(() => {
        if (alive) {
          setApiView(null)
          setOffline(true)
        }
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodIdx, ready])

  const view: TBView = apiView ?? localView

  return (
    <div className="space-y-5 p-5 lg:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink lg:text-2xl">Neraca Lajur</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Trial balance · dihitung live dari jurnal <span className="font-semibold text-ok">posted</span>
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface px-1 py-1 shadow-card">
          <button
            type="button"
            onClick={() => setPeriodIdx((i) => Math.max(0, i - 1))}
            disabled={periodIdx === 0}
            aria-label="Periode sebelumnya"
            className="rounded-md p-1.5 text-ink-soft transition hover:bg-surface-hover disabled:opacity-30"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="min-w-[130px] text-center text-sm font-semibold text-ink">{period.label}</span>
          <button
            type="button"
            onClick={() => setPeriodIdx((i) => Math.min(PERIODS.length - 1, i + 1))}
            disabled={periodIdx === PERIODS.length - 1}
            aria-label="Periode berikutnya"
            className="rounded-md p-1.5 text-ink-soft transition hover:bg-surface-hover disabled:opacity-30"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {offline && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs font-medium text-[#b45309]">
          Mock API tidak terhubung — menampilkan perhitungan dari data lokal.
        </p>
      )}

      {/* Indikator keseimbangan Debit = Kredit */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-5 py-4 shadow-card ${
          view.balanced ? 'border-ok/40 bg-ok/10' : 'border-bad/40 bg-bad/10'
        }`}
      >
        <div className="flex items-center gap-3">
          <Scale size={20} className={view.balanced ? 'text-ok' : 'text-bad'} />
          <div>
            <p className={`text-sm font-bold ${view.balanced ? 'text-ok' : 'text-bad'}`}>
              {view.balanced ? '✓ Seimbang (Debit = Kredit)' : '✗ Tidak seimbang'}
            </p>
            <p className="text-xs text-ink-soft">
              Total debit {formatIDR(view.debit)} = total kredit {formatIDR(view.credit)}
              {!view.balanced && <> · selisih {formatIDR(Math.abs(view.debit - view.credit))}</>}
            </p>
          </div>
        </div>
        <div className="num text-right text-sm">
          <span className="font-semibold text-debit">D {formatIDR(view.debit)}</span>
          <span className="mx-2 text-ink-faint">=</span>
          <span className="font-semibold text-credit">K {formatIDR(view.credit)}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="border-b border-line bg-canvas px-5 py-4">
          <p className="text-sm font-bold text-ink">PT. Kreasi Inovasi Estetika</p>
          <p className="text-xs text-ink-soft">
            Neraca Lajur · Periode {period.label} (1–{period.end.slice(8)} {period.label.split(' ')[0]} {period.key.slice(0, 4)})
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-line bg-canvas text-left text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                <th className="px-5 py-2.5">Kode</th>
                <th className="px-3 py-2.5">Nama Akun</th>
                <th className="px-3 py-2.5 text-right">Debit</th>
                <th className="px-5 py-2.5 text-right">Kredit</th>
              </tr>
            </thead>
            <tbody>
              {view.lines.map((l) => (
                <tr key={`${l.accountCode}-${l.accountName}`} className="border-b border-line/70 transition hover:bg-surface-hover/60">
                  <td className="num whitespace-nowrap px-5 py-3 text-xs text-ink-soft">{l.accountCode}</td>
                  <td className="px-3 py-3 text-sm text-ink">{l.accountName}</td>
                  <td className="num px-3 py-3 text-right font-medium text-debit">{l.debit ? formatIDR(l.debit) : '—'}</td>
                  <td className="num px-5 py-3 text-right font-medium text-credit">{l.credit ? formatIDR(l.credit) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={`font-bold ${view.balanced ? 'bg-ok/5 text-ink' : 'bg-bad/5 text-bad'}`}>
                <td className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-ink-soft" colSpan={2}>
                  Total {view.balanced ? '· Seimbang' : '· Selisih'}
                </td>
                <td className="num px-3 py-3 text-right text-debit">{formatIDR(view.debit)}</td>
                <td className="num px-5 py-3 text-right text-credit">{formatIDR(view.credit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="text-xs text-ink-faint">
        Saldo diambil dari saldo awal + efek jurnal posted (YTD per akhir periode). Draft, jurnal pembalik & akun tanpa
        saldo tidak muncul.
      </p>
    </div>
  )
}
