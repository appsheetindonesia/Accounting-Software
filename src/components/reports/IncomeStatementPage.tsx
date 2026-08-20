import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, TrendingUp } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../api'
import { useApiFetch } from '../../hooks/useApiFetch'
import { computeIncomeStatement } from '../../lib/ledger'
import { formatIDR } from '../../lib/format'
import { canWriteJournal } from '../../lib/permissions'
import { SkeletonBar, SkeletonLines } from '../Skeleton'
import ExportButtons from './ExportButtons'

const PERIODS = [
  { key: '2026-01', label: 'Januari 2026', end: '2026-01-31' },
  { key: '2026-02', label: 'Februari 2026', end: '2026-02-28' },
  { key: '2026-03', label: 'Maret 2026', end: '2026-03-31' },
]

interface ReportLine {
  accountId: string
  code: string
  name: string
  amount: number
}

interface ReportView {
  revenueLines: ReportLine[]
  expenseLines: ReportLine[]
  revenueTotal: number
  expenseTotal: number
  netIncome: number
}

export default function IncomeStatementPage() {
  const accounts = useStore((s) => s.accounts)
  const journals = useStore((s) => s.journals)
  const openModal = useStore((s) => s.openModal)
  const entities = useStore((s) => s.entities)
  const activeEntityId = useStore((s) => s.activeEntityId)
  const entityRefetching = useStore((s) => s.entityRefetching)
  const entityName = entities.find((e) => e.id === activeEntityId)?.name ?? 'PT. Kreasi Inovasi Estetika'
  const apiStatus = useStore((s) => s.apiStatus)
  const user = useStore((s) => s.user)
  const canWrite = canWriteJournal(user?.role)
  const [periodIdx, setPeriodIdx] = useState(2) // Maret 2026

  const period = PERIODS[periodIdx]

  // Fallback offline: hitung dari data lokal
  const localView = useMemo<ReportView>(
    () => computeIncomeStatement(accounts, journals, period.end),
    [accounts, journals, period],
  )

  // Data via API: GET /reports/income-statement?period= (tunggu koneksi menetap)
  const ready = apiStatus === 'online' || apiStatus === 'offline'
  const { data: apiView, loading, offline } = useApiFetch<ReportView>(
    `income-statement:${period.key}:${apiStatus}:${activeEntityId}`,
    ready,
    () =>
      api.getIncomeStatement(period.key).then((d) => {
        // Baris isTotal (mis. "Total Pendapatan") bukan baris akun → di-filter,
        // total memakai subtotal section dari API agar tidak dobel-hitung.
        const pick = (title: string): ReportLine[] => {
          const section = d.sections.find((s) => s.title === title)
          return (section?.lines ?? [])
            .filter((l) => !l.isTotal && l.amount !== 0)
            .map((l) => ({
              accountId: l.accountCode || `${title}-${l.accountName}`,
              code: l.accountCode,
              name: l.accountName,
              amount: l.amount,
            }))
        }
        const subtotalOf = (title: string): number => d.sections.find((s) => s.title === title)?.subtotal ?? 0
        return {
          revenueLines: pick('PENDAPATAN'),
          expenseLines: pick('BEBAN'),
          revenueTotal: subtotalOf('PENDAPATAN'),
          expenseTotal: subtotalOf('BEBAN'),
          netIncome: d.netIncome,
        }
      }),
    () => localView,
  )

  const view: ReportView = apiView ?? localView
  const empty = view.revenueLines.length === 0 && view.expenseLines.length === 0

  const Section = ({ title, lines, total }: { title: string; lines: ReportLine[]; total: number }) => (
    <div>
      <p className="px-5 pb-2 pt-4 text-[11px] font-bold uppercase tracking-wider text-primary">{title}</p>
      <div>
        {lines.map((l) => (
          <div key={l.accountId} className="flex items-center justify-between gap-3 px-5 py-2 hover:bg-surface-hover/60">
            <span className="min-w-0">
              <span className="num text-xs text-ink-faint">{l.code}</span>{' '}
              <span className="text-sm text-ink">{l.name}</span>
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
          <h1 className="text-xl font-bold text-ink lg:text-2xl">Laporan Laba Rugi</h1>
          <p className="mt-0.5 text-sm text-ink-soft">{entityName} · dihitung live dari jurnal posted</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ExportButtons reportType="income-statement" period={period.key} />
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

      {loading || entityRefetching ? (
        <div className="space-y-5">
          <SkeletonLines rows={4} />
          <SkeletonLines rows={3} />
          <div className="animate-pulse flex items-center justify-between gap-3 rounded-xl border border-line bg-ok/10 px-5 py-4 shadow-card">
            <SkeletonBar className="h-4 w-28" />
            <SkeletonBar className="h-5 w-24" />
          </div>
        </div>
      ) : empty ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <TrendingUp size={22} />
          </div>
          <p className="text-sm font-semibold text-ink">Belum ada transaksi di periode ini</p>
          <p className="max-w-sm text-sm text-ink-soft">
            Posting jurnal pendapatan atau beban pada {period.label} untuk melihat laba rugi.
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
              Laporan Laba Rugi · Periode {period.label} (1–{period.end.slice(8)} {period.label.split(' ')[0]} {period.key.slice(0, 4)})
            </p>
          </div>
          <Section title="PENDAPATAN" lines={view.revenueLines} total={view.revenueTotal} />
          <Section title="BEBAN" lines={view.expenseLines} total={view.expenseTotal} />
          <div
            className={`flex items-center justify-between gap-3 px-5 py-4 ${
              view.netIncome >= 0 ? 'bg-ok/10' : 'bg-bad/10'
            }`}
          >
            <span className="text-sm font-bold uppercase tracking-wide text-ink">
              {view.netIncome >= 0 ? 'Laba Bersih' : 'Rugi Bersih'}
            </span>
            <span className={`num text-lg font-bold ${view.netIncome >= 0 ? 'text-ok' : 'text-bad'}`}>
              {formatIDR(view.netIncome)}
            </span>
          </div>
        </div>
      )}

      <p className="text-xs text-ink-faint">
        Akurasi: total pendapatan − total beban = laba bersih. Draft & jurnal pembalik tidak dihitung.
      </p>
    </div>
  )
}
