import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, NotebookPen } from 'lucide-react'
import { useStore, isEffectJournal } from '../../store/useStore'
import { api } from '../../api'
import { formatDateShort, formatIDR } from '../../lib/format'
import type { JournalEntry } from '../../types'

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

  const [accountId, setAccountId] = useState('1-1100')
  const [periodIdx, setPeriodIdx] = useState(2) // Maret 2026
  const [apiView, setApiView] = useState<LedgerView | null>(null)
  const [offline, setOffline] = useState(false)

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0]
  const period = PERIODS[periodIdx]

  // Fallback offline: hitung saldo berjalan dari data lokal
  const localView = useMemo<LedgerView>(() => {
    if (!account) return { opening: 0, rows: [], closing: 0 }
    const lineOf = (j: JournalEntry) => j.lines.find((ln) => ln.accountId === account.id)
    const relevant = journals.filter((j) => isEffectJournal(j) && lineOf(j))

    let opening = account.baseBalance
    for (const j of relevant) {
      if (j.date < period.start) {
        const ln = lineOf(j)!
        opening += account.normalBalance === 'debit' ? ln.debit - ln.credit : ln.credit - ln.debit
      }
    }

    const within = relevant
      .filter((j) => j.date >= period.start && j.date <= period.end)
      .sort((a, b) => a.date.localeCompare(b.date) || a.transactionNumber.localeCompare(b.transactionNumber))

    let running = opening
    const rows: LedgerRow[] = within.map((j) => {
      const ln = lineOf(j)!
      running += account.normalBalance === 'debit' ? ln.debit - ln.credit : ln.credit - ln.debit
      return {
        reference: j.transactionNumber,
        date: j.date,
        description: ln.description || j.description,
        debit: ln.debit,
        credit: ln.credit,
        balance: running,
      }
    })
    return { opening, rows, closing: running }
  }, [account, journals, period])

  // Data via API: GET /ledger/accounts/:id?period= (tunggu koneksi menetap)
  const ready = apiStatus === 'online' || apiStatus === 'offline'
  useEffect(() => {
    if (!ready) return
    let alive = true
    setOffline(false)
    if (account) {
      api
        .getLedger(account.id, period.key)
        .then((d) => {
          if (!alive) return
          setApiView({
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
          })
        })
        .catch(() => {
          if (alive) {
            setApiView(null)
            setOffline(true)
          }
        })
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, periodIdx, ready])

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

      <p className="text-xs text-ink-faint">
        Saldo berjalan dihitung dari saldo awal + transaksi terurut tanggal. Jurnal draft & pembalik tidak mempengaruhi
        buku besar.
      </p>
    </div>
  )
}
