import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Waves } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api, type CashFlow } from '../../api'
import { useApiFetch } from '../../hooks/useApiFetch'
import { computeCashFlow, type CashFlowView } from '../../lib/ledger'
import { formatIDR } from '../../lib/format'
import { SkeletonLines } from '../Skeleton'
import ExportButtons from './ExportButtons'

const PERIODS = [
  { key: '2026-01', label: 'Januari 2026', start: '2026-01-01', end: '2026-01-31' },
  { key: '2026-02', label: 'Februari 2026', start: '2026-02-01', end: '2026-02-28' },
  { key: '2026-03', label: 'Maret 2026', start: '2026-03-01', end: '2026-03-31' },
]

// Bentuk API (/reports/cash-flow) identik dengan hasil lib lokal — hanya
// perlu drop id/type/period untuk memakai satu tipe view.
const toView = (d: CashFlow): CashFlowView => ({
  sections: d.sections,
  netCashFlow: d.netCashFlow,
  beginningCash: d.beginningCash,
  endingCash: d.endingCash,
})

export default function CashFlowPage() {
  const accounts = useStore((s) => s.accounts)
  const journals = useStore((s) => s.journals)
  const apiStatus = useStore((s) => s.apiStatus)
  const activeEntityId = useStore((s) => s.activeEntityId)
  const entityRefetching = useStore((s) => s.entityRefetching)
  const [periodIdx, setPeriodIdx] = useState(2) // Maret 2026

  const period = PERIODS[periodIdx]

  // Fallback offline: arus kas dihitung dari data lokal (metode tidak
  // langsung, konsisten dengan server) — saldo kas awal/akhir + laba bersih.
  const localView = useMemo<CashFlowView>(
    () => computeCashFlow(accounts, journals, period.start, period.end),
    [accounts, journals, period],
  )

  // Data via API: GET /reports/cash-flow?period= (tunggu koneksi menetap)
  const ready = apiStatus === 'online' || apiStatus === 'offline'
  const { data: apiView, loading, offline } = useApiFetch<CashFlowView>(
    `cash-flow:${period.key}:${apiStatus}:${activeEntityId}`,
    ready,
    () => api.getCashFlow(period.key).then(toView),
    () => localView,
  )

  const view: CashFlowView = apiView ?? localView
  const empty = view.sections.every((s) => s.lines.length === 0)

  const Section = ({ title, lines, total }: { title: string; lines: CashFlowView['sections'][number]['lines']; total: number }) => (
    <div>
      <p className="px-5 pb-2 pt-4 text-[11px] font-bold uppercase tracking-wider text-primary">{title}</p>
      <div>
        {lines.map((l, i) => (
          <div
            key={`${title}-${i}-${l.accountName}`}
            className="flex items-center justify-between gap-3 px-5 py-2 hover:bg-surface-hover/60"
            style={{ paddingLeft: `${20 + (l.indentLevel ?? 0) * 16}px` }}
          >
            <span className="min-w-0">
              <span className="num text-xs text-ink-faint">{l.accountCode}</span>{' '}
              <span className={`text-sm ${l.isBold ? 'font-semibold text-ink' : 'text-ink'}`}>{l.accountName}</span>
            </span>
            <span className="num text-sm font-medium text-ink">{formatIDR(l.amount)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 border-t border-line/70 bg-canvas/70 px-5 py-2.5">
          <span className="text-sm font-bold uppercase tracking-wide text-ink">Total {title}</span>
          <span className="num text-sm font-bold text-ink">{formatIDR(total)}</span>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-5 p-5 lg:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink lg:text-2xl">Laporan Arus Kas</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Perubahan kas bersih · dihitung live dari jurnal <span className="font-semibold text-ok">posted</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ExportButtons reportType="cash-flow" period={period.key} />
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
      </div>

      {offline && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs font-medium text-[#b45309]">
          Mock API tidak terhubung — menampilkan perhitungan dari data lokal.
        </p>
      )}

      {(loading && !apiView) || entityRefetching ? (
        <div className="space-y-5">
          <SkeletonLines rows={3} />
          <SkeletonLines rows={5} />
        </div>
      ) : (
        <>
          {/* Ringkasan arus kas bersih: saldo awal → akhir periode */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-5 py-4 shadow-card">
            <div className="flex items-center gap-3">
              <Waves size={20} className="text-primary" />
              <div>
                <p className="text-sm font-bold text-ink">Arus kas bersih {period.label}</p>
                <p className="text-xs text-ink-soft">
                  Saldo kas awal {formatIDR(view.beginningCash)} → akhir {formatIDR(view.endingCash)}
                </p>
              </div>
            </div>
            <div className="num text-right text-sm">
              <span className={`font-semibold ${view.netCashFlow >= 0 ? 'text-ok' : 'text-bad'}`}>
                {view.netCashFlow >= 0 ? '+' : '−'} {formatIDR(Math.abs(view.netCashFlow))}
              </span>
            </div>
          </div>

          {empty ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Waves size={22} />
              </div>
              <p className="text-sm font-semibold text-ink">Belum ada transaksi di periode ini</p>
              <p className="max-w-sm text-sm text-ink-soft">
                Posting jurnal pada {period.label} untuk melihat arus kas.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
              <div className="border-b border-line bg-canvas px-5 py-4">
                <p className="text-xs text-ink-soft">
                  Laporan Arus Kas · {period.label}
                </p>
              </div>
              {view.sections.map((s) => (
                <Section key={s.title} title={s.title} lines={s.lines} total={s.subtotal} />
              ))}
            </div>
          )}
        </>
      )}

      <p className="text-xs text-ink-faint">
        Metode tidak langsung: aktivitas operasi dimulai dari laba bersih. Draft & jurnal pembalik tidak dihitung.
      </p>
    </div>
  )
}
