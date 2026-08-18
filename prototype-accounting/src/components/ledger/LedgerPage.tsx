import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, NotebookPen } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../api'
import { useApiFetch } from '../../hooks/useApiFetch'
import { computeLedger } from '../../lib/ledger'
import { formatDateShort, formatIDR } from '../../lib/format'
import { SkeletonBar, SkeletonLines, SkeletonTable } from '../Skeleton'
import ExportButtons from '../reports/ExportButtons'

const PERIODS = [
  { key: '2026-01', label: 'Januari 2026', start: '2026-01-01', end: '2026-01-31' },
  { key: '2026-02', label: 'Februari 2026', start: '2026-02-01', end: '2026-02-28' },
  { key: '2026-03', label: 'Maret 2026', start: '2026-03-01', end: '2026-03-31' },
]

interface LedgerRow {
  reference: string
  date: string
  description: string
  debit: number
  credit: number
  balance: number
}

interface LedgerView {
  opening: number
  rows: LedgerRow[]
  closing: number
}

export default function LedgerPage() {
  const accounts = useStore((s) => s.accounts)
  const journals = useStore((s) => s.journals)
  const setPage = useStore((s) => s.setPage)
  const apiStatus = useStore((s) => s.apiStatus)
  const activeEntityId = useStore((s) => s.activeEntityId)
  const entityRefetching = useStore((s) => s.entityRefetching)

  // Fokus dari global search: hasil akun diklik → akun tsb dipilih (reaktif,
  // berfungsi walau halaman sudah terbuka), lalu fokus dibersihkan (transient).
  // Default Kas Besar (1-1100).
  const focusAccountId = useStore((s) => s.focusAccountId)
  const clearSearchFocus = useStore((s) => s.clearSearchFocus)
  const [accountId, setAccountId] = useState('1-1100')
  const [periodIdx, setPeriodIdx] = useState(2) // Maret 2026
  // Rentang tanggal custom (opsional) — kosong → pakai periode aktif. Menggerakkan
  // TAMPILAN Buku Besar (GET /ledger/accounts/:id?start=&end=) DAN export
  // (GET /exports/ledger/:id) sekaligus, konsisten di kedua sisi.
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const rangeActive = Boolean(rangeStart && rangeEnd)
  const exportRange = rangeActive ? { start: rangeStart, end: rangeEnd } : undefined

  useEffect(() => {
    if (focusAccountId) {
      setAccountId(focusAccountId)
      clearSearchFocus()
    }
  }, [focusAccountId, clearSearchFocus])

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0]
  const period = PERIODS[periodIdx]

  // Rentang aktif → ikut rentang (konsisten dengan server & export);
  // kosong → periode bulanan yang dipilih.
  const viewRange = rangeActive ? { start: rangeStart, end: rangeEnd } : { start: period.start, end: period.end }

  // Fallback offline: hitung saldo berjalan dari data lokal
  const localView = useMemo<LedgerView>(
    () => computeLedger(accounts, journals, account?.id ?? '', viewRange),
    [accounts, journals, account, viewRange.start, viewRange.end],
  )

  // Data via API: GET /ledger/accounts/:id?period= (tunggu koneksi menetap)
  const ready = apiStatus === 'online' || apiStatus === 'offline'
  const { data: apiView, loading, offline } = useApiFetch<LedgerView>(
    `ledger:${account?.id}:${period.key}:${apiStatus}:${activeEntityId}:${viewRange.start}:${viewRange.end}`,
    ready,
    () => {
      if (!account) return Promise.resolve(localView)
      return api.getLedger(account.id, period.key, rangeActive ? { start: rangeStart, end: rangeEnd } : undefined).then((d) => ({
        opening: d.openingBalance,
        closing: d.closingBalance,
        rows: d.entries.map((e) => ({
          reference: e.reference,
          date: e.date,
          description: e.description,
          debit: e.debit,
          credit: e.credit,
          balance: e.balance,
        })),
      }))
    },
    () => localView,
  )

  const view: LedgerView = apiView ?? localView

  return (
    <div className="space-y-5 p-5 lg:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink lg:text-2xl">Buku Besar</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Saldo berjalan per akun · hanya jurnal <span className="font-semibold text-ok">posted</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 shadow-card">
            <span className="text-[11px] font-semibold text-ink-faint">Rentang tanggal</span>
            <input
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              aria-label="Tanggal mulai export"
              className="text-xs text-ink focus:outline-none"
            />
            <span className="text-ink-faint">–</span>
            <input
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              aria-label="Tanggal akhir export"
              className="text-xs text-ink focus:outline-none"
            />
          </div>
          <ExportButtons accountId={account?.id ?? ''} accountCode={account?.code ?? ''} accountName={account?.name ?? ''} period={period.key} range={exportRange} />
          <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 shadow-card">
            <NotebookPen size={14} className="shrink-0 text-primary" />
            <select
              value={account?.id ?? ''}
              onChange={(e) => setAccountId(e.target.value)}
              className="max-w-[220px] bg-transparent text-sm text-ink focus:outline-none"
              aria-label="Pilih akun"
            >
              {accounts
                .filter((a) => !a.id.includes('header'))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
            </select>
          </label>
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
            <span className="min-w-[130px] text-center text-sm font-semibold text-ink">
              {rangeActive ? `${rangeStart} s/d ${rangeEnd}` : period.label}
            </span>
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

      {/* Daftar akun klik-di-baris — pola sama seperti Jurnal Terbaru di Dashboard:
          baris role=button + aria-label, klik/Enter/Space memilih akun (detail Buku
          Besar akun tsb ditampilkan). Baris yang aktif di-highlight. */}
      <div className="rounded-xl border border-line bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-sm font-bold text-ink">Daftar Akun</h3>
          <span className="text-xs text-ink-soft">Klik baris untuk melihat detail</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-line bg-canvas text-left text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                <th className="px-5 py-2.5">Kode</th>
                <th className="px-3 py-2.5">Akun</th>
                <th className="px-3 py-2.5">Tipe</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {accounts
                .filter((a) => !a.id.includes('header'))
                .map((a) => {
                  const active = a.id === account?.id
                  return (
                    <tr
                      key={a.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Buka detail akun ${a.code} ${a.name}`}
                      aria-pressed={active}
                      onClick={() => setAccountId(a.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setAccountId(a.id)
                        }
                      }}
                      title={`Buka detail akun ${a.code} ${a.name}`}
                      className={`cursor-pointer border-b border-line/70 last:border-0 transition hover:bg-surface-hover/60 focus-visible:bg-surface-hover/60 focus-visible:outline-none ${
                        active ? 'bg-primary/10 ring-1 ring-primary/30' : ''
                      }`}
                    >
                      <td className="num whitespace-nowrap px-5 py-3 text-xs font-semibold text-primary">{a.code}</td>
                      <td className="px-3 py-3 text-sm text-ink">{a.name}</td>
                      <td className="px-3 py-3 text-xs text-ink-soft">
                        {a.type === 'asset'
                          ? 'Aset'
                          : a.type === 'liability'
                            ? 'Utang'
                            : a.type === 'equity'
                              ? 'Modal'
                              : a.type === 'revenue'
                                ? 'Pendapatan'
                                : 'Beban'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <ChevronRight size={15} className="ml-auto text-ink-faint" />
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>

      {loading && !apiView ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-5 py-3 shadow-card">
          <div className="space-y-2">
            <SkeletonBar className="h-5 w-40" />
            <SkeletonBar className="h-3 w-56" />
          </div>
          <div className="flex gap-2">
            <SkeletonBar className="h-8 w-32" />
            <SkeletonBar className="h-8 w-32" />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-5 py-3 shadow-card">
          <div>
            <p className="text-lg font-bold text-ink">{account?.name}</p>
            <p className="num text-xs text-ink-soft">
              {account?.code} ·{' '}
              {account?.type === 'asset'
                ? 'Aset'
                : account?.type === 'liability'
                  ? 'Utang'
                  : account?.type === 'equity'
                    ? 'Modal'
                    : account?.type === 'revenue'
                      ? 'Pendapatan'
                      : 'Beban'}{' '}
              · saldo normal {account?.normalBalance}
            </p>
          </div>
          <div className="num flex gap-2 text-sm">
            <span className="rounded-lg bg-canvas px-3 py-1.5 text-ink-soft">
              Saldo Awal <strong className="text-ink">{formatIDR(view.opening)}</strong>
            </span>
            <span className="rounded-lg bg-primary/10 px-3 py-1.5 font-semibold text-primary">
              Saldo Akhir <strong>{formatIDR(view.closing)}</strong>
            </span>
          </div>
        </div>
      )}

      {loading || entityRefetching ? (
        <>
          <SkeletonTable rows={5} />
          <div className="mt-3">
            <SkeletonLines rows={2} />
          </div>
        </>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          {view.rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <NotebookPen size={22} className="text-primary/60" />
              <p className="text-sm font-semibold text-ink">Belum ada transaksi di periode ini</p>
              <p className="text-sm text-ink-soft">
                {view.opening !== 0
                  ? `Saldo tetap ${formatIDR(view.opening)} karena tidak ada jurnal posted pada ${period.label}.`
                  : 'Catat dan posting jurnal pada periode ini agar muncul di buku besar.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                  <th className="px-5 py-2.5">Tgl</th>
                  <th className="px-3 py-2.5">Ref</th>
                  <th className="px-3 py-2.5">Deskripsi</th>
                  <th className="px-3 py-2.5 text-right">Debit</th>
                  <th className="px-3 py-2.5 text-right">Kredit</th>
                  <th className="px-5 py-2.5 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line/70 bg-canvas/60 font-semibold text-ink">
                  <td className="px-5 py-2.5 text-xs uppercase tracking-wide text-ink-faint">—</td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-ink-soft">Saldo Awal</td>
                  <td className="px-3 py-2.5 text-right" />
                  <td className="px-3 py-2.5 text-right" />
                  <td className="num px-5 py-2.5 text-right">{formatIDR(view.opening)}</td>
                </tr>
                {view.rows.map((row) => (
                  <tr key={row.reference} className="border-b border-line/70 transition hover:bg-surface-hover/60">
                    <td className="whitespace-nowrap px-5 py-3 text-sm text-ink-soft">{formatDateShort(row.date)}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setPage('journal')}
                        title={`Buka jurnal ${row.reference}`}
                        className="num inline-flex items-center gap-1 text-xs text-primary transition hover:underline"
                      >
                        {row.reference} <ExternalLink size={11} />
                      </button>
                    </td>
                    <td className="px-3 py-3 text-sm text-ink">{row.description}</td>
                    <td className="num px-3 py-3 text-right font-medium text-debit">{row.debit ? formatIDR(row.debit) : '—'}</td>
                    <td className="num px-3 py-3 text-right font-medium text-credit">{row.credit ? formatIDR(row.credit) : '—'}</td>
                    <td className="num px-5 py-3 text-right font-semibold text-ink">{formatIDR(row.balance)}</td>
                  </tr>
                ))}
                <tr className="bg-primary/5 font-bold text-ink">
                  <td className="px-5 py-3 text-xs uppercase tracking-wide text-ink-faint">—</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-xs font-bold uppercase tracking-wider text-primary">Saldo Akhir</td>
                  <td className="num px-3 py-3 text-right text-debit">
                    {view.rows.reduce((s, r) => s + r.debit, 0) ? formatIDR(view.rows.reduce((s, r) => s + r.debit, 0)) : '—'}
                  </td>
                  <td className="num px-3 py-3 text-right text-credit">
                    {view.rows.reduce((s, r) => s + r.credit, 0) ? formatIDR(view.rows.reduce((s, r) => s + r.credit, 0)) : '—'}
                  </td>
                  <td className="num px-5 py-3 text-right text-primary">{formatIDR(view.closing)}</td>
                </tr>
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-ink-faint">
        Saldo berjalan dihitung dari saldo awal + transaksi terurut tanggal. Jurnal draft & pembalik tidak mempengaruhi
        buku besar.
      </p>
    </div>
  )
}
