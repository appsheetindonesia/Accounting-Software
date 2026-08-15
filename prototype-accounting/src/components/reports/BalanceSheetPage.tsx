import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Landmark, Plus } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../api'
import { computeBalanceSheet, type BalanceSheetLine, type BalanceSheetView } from '../../lib/ledger'
import { formatIDR } from '../../lib/format'
import { canWriteJournal } from '../../lib/permissions'
import ExportButtons from './ExportButtons'

const PERIODS = [
  { key: '2026-01', label: 'Januari 2026', end: '2026-01-31' },
  { key: '2026-02', label: 'Februari 2026', end: '2026-02-28' },
  { key: '2026-03', label: 'Maret 2026', end: '2026-03-31' },
]

// BSView = hasil lib + label lokal (asOfLabel dipakai di kop laporan)
interface BSView extends BalanceSheetView {
  asOfLabel: string
  totalLiabEq: number // alias tampilan = totalLiabilitiesEquity
}

const toBSView = (v: BalanceSheetView, asOfLabel: string): BSView => ({
  ...v,
  asOfLabel,
  totalLiabEq: v.totalLiabilitiesEquity,
})

export default function BalanceSheetPage() {
  const accounts = useStore((s) => s.accounts)
  const journals = useStore((s) => s.journals)
  const apiStatus = useStore((s) => s.apiStatus)
  const entities = useStore((s) => s.entities)
  const activeEntityId = useStore((s) => s.activeEntityId)
  const entityName = entities.find((e) => e.id === activeEntityId)?.name ?? 'PT. Kreasi Inovasi Estetika'
  const openModal = useStore((s) => s.openModal)
  const user = useStore((s) => s.user)
  const canWrite = canWriteJournal(user?.role)
  const [periodIdx, setPeriodIdx] = useState(2) // Maret 2026
  const [apiView, setApiView] = useState<BSView | null>(null)
  const [offline, setOffline] = useState(false)

  const period = PERIODS[periodIdx]

  // Fallback offline: identitas Aset = Kewajiban + Ekuitas dari data lokal
  const localView = useMemo<BSView>(
    () =>
      toBSView(
        computeBalanceSheet(accounts, journals, period.end),
        `Per ${period.end.slice(8)} ${period.label.split(' ')[0]} ${period.key.slice(0, 4)}`,
      ),
    [accounts, journals, period],
  )

  // Data via API: GET /reports/balance-sheet?asOf= (tunggu koneksi menetap)
  const ready = apiStatus === 'online' || apiStatus === 'offline'
  useEffect(() => {
    if (!ready) return
    let alive = true
    setOffline(false)
    api
      .getBalanceSheet(period.end)
      .then((d) => {
        if (!alive) return
        const mk = (title: string) => {
          const section = d.sections.find((s) => s.title === title)
          return {
            title,
            total: section?.subtotal ?? 0,
            lines: (section?.lines ?? [])
              .filter((l) => !l.isTotal && l.amount !== 0)
              .map((l) => ({ code: l.accountCode, name: l.accountName, amount: l.amount, isBold: l.isBold })),
          }
        }
        const aset = mk('ASET')
        const liabEq = mk('KEWAJIBAN & EKUITAS')
        // Keseimbangan genuin: Aset vs (Utang + Modal + Laba Ditahan) dari baris akun
        const liabEqSum = liabEq.lines.filter((l) => !l.isBold).reduce((s, l) => s + l.amount, 0)
        const retained = liabEq.lines.find((l) => l.name.includes('Laba Ditahan'))?.amount ?? 0
        const totalLiabEq = liabEqSum + retained
        const balanced = d.totalAssets === totalLiabEq
        setApiView(
          toBSView(
            {
              sections: [aset, liabEq],
              totalAssets: d.totalAssets,
              totalLiabilitiesEquity: totalLiabEq,
              balanced,
              difference: d.totalAssets - totalLiabEq,
              netIncome: retained,
            },
            `Per ${d.asOf.slice(8)} ${['Januari', 'Februari', 'Maret'][periodIdx]} ${period.key.slice(0, 4)}`,
          ),
        )
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

  const view: BSView = apiView ?? localView
  const empty = view.sections.every((s) => s.lines.length === 0)

  const Section = ({ title, lines, total }: { title: string; lines: BalanceSheetLine[]; total: number }) => (
    <div>
      <p className="px-5 pb-2 pt-4 text-[11px] font-bold uppercase tracking-wider text-primary">{title}</p>
      <div>
        {lines.map((l) => (
          <div
            key={`${title}-${l.code}-${l.name}`}
            className="flex items-center justify-between gap-3 px-5 py-2 hover:bg-surface-hover/60"
          >
            <span className="min-w-0">
              <span className="num text-xs text-ink-faint">{l.code}</span>{' '}
              <span className={`text-sm ${l.isBold ? 'font-semibold text-ink' : 'text-ink'}`}>{l.name}</span>
            </span>
            <span className={`num text-sm ${l.isBold ? 'font-bold text-ink' : 'font-medium text-ink'}`}>
              {formatIDR(l.amount)}
            </span>
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
          <h1 className="text-xl font-bold text-ink lg:text-2xl">Laporan Neraca</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Posisi keuangan · dihitung live dari jurnal <span className="font-semibold text-ok">posted</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ExportButtons reportType="balance-sheet" period={period.key} />
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

      {/* Indikator keseimbangan Aset = Kewajiban + Ekuitas */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-5 py-4 shadow-card ${
          view.balanced ? 'border-ok/40 bg-ok/10' : 'border-bad/40 bg-bad/10'
        }`}
      >
        <div className="flex items-center gap-3">
          <Landmark size={20} className={view.balanced ? 'text-ok' : 'text-bad'} />
          <div>
            <p className={`text-sm font-bold ${view.balanced ? 'text-ok' : 'text-bad'}`}>
              {view.balanced ? '✓ Seimbang (Aset = Kewajiban + Ekuitas)' : '✗ Tidak seimbang'}
            </p>
            <p className="text-xs text-ink-soft">
              Aset {formatIDR(view.totalAssets)} = Kewajiban + Ekuitas {formatIDR(view.totalLiabEq)}
              {!view.balanced && <> · selisih {formatIDR(Math.abs(view.difference))}</>}
            </p>
          </div>
        </div>
        <div className="num text-right text-sm">
          <span className="font-semibold text-ink">A {formatIDR(view.totalAssets)}</span>
          <span className="mx-2 text-ink-faint">=</span>
          <span className="font-semibold text-ink">K+E {formatIDR(view.totalLiabEq)}</span>
        </div>
      </div>

      {empty ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Landmark size={22} />
          </div>
          <p className="text-sm font-semibold text-ink">Belum ada transaksi di periode ini</p>
          <p className="max-w-sm text-sm text-ink-soft">
            Posting jurnal pada {period.label} untuk melihat posisi keuangan.
          </p>
          {canWrite && (
            <button
              type="button"
              onClick={openModal}
              className="mt-1 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-primary-light"
            >
              <Plus size={15} /> Buat Jurnal
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="border-b border-line bg-canvas px-5 py-4">
            <p className="text-sm font-bold text-ink">{entityName}</p>
            <p className="text-xs text-ink-soft">
              Laporan Neraca · {view.asOfLabel}
            </p>
          </div>
          <Section title="ASET" lines={view.sections[0].lines} total={view.totalAssets} />
          <Section title="KEWAJIBAN & EKUITAS" lines={view.sections[1].lines} total={view.totalLiabEq} />
        </div>
      )}

      <p className="text-xs text-ink-faint">
        Identitas akuntansi: Aset = Kewajiban + Modal + Laba berjalan. Draft & jurnal pembalik tidak dihitung.
      </p>
    </div>
  )
}
