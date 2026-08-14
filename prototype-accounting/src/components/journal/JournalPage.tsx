import { useMemo, useState } from 'react'
import { Search, Plus } from 'lucide-react'
import { useStore } from '../../store/useStore'
import JournalTable from './JournalTable'
import { formatIDR } from '../../lib/format'

type StatusFilter = 'all' | 'draft' | 'posted' | 'reversed'

export default function JournalPage() {
  const journals = useStore((s) => s.journals)
  const openModal = useStore((s) => s.openModal)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return [...journals]
      .filter((j) => {
        const matchStatus = status === 'all' || j.status === status
        const matchKw =
          !kw ||
          j.transactionNumber.toLowerCase().includes(kw) ||
          j.description.toLowerCase().includes(kw) ||
          j.lines.some(
            (l) => l.accountName.toLowerCase().includes(kw) || l.accountCode.includes(kw),
          )
        return matchStatus && matchKw
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.transactionNumber.localeCompare(a.transactionNumber))
  }, [journals, keyword, status])

  const totals = useMemo(() => {
    let debit = 0
    let credit = 0
    for (const j of filtered) {
      for (const l of j.lines) {
        debit += l.debit
        credit += l.credit
      }
    }
    return { debit, credit, difference: debit - credit }
  }, [filtered])

  return (
    <div className="space-y-5 p-5 lg:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink lg:text-2xl">Jurnal Umum</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Maret 2026 · {filtered.length} entri jurnal ({journals.filter((j) => j.status === 'draft').length} draft)
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-primary-light active:translate-y-px"
        >
          <Plus size={16} /> Buat Jurnal
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-line bg-surface p-3 shadow-card">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Cari no. bukti, keterangan, atau akun..."
            className="h-9 w-full rounded-lg border border-line bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
          <span className="text-xs font-semibold text-ink-soft">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="bg-transparent text-sm text-ink focus:outline-none"
          >
            <option value="all">Semua</option>
            <option value="posted">Posted</option>
            <option value="draft">Draft</option>
            <option value="reversed">Reversed</option>
          </select>
        </label>
      </div>

      <JournalTable journals={filtered} />

      <div className="flex flex-wrap items-center justify-end gap-x-8 gap-y-2 rounded-xl border border-line bg-surface px-5 py-3 text-sm shadow-card">
        <span className="text-ink-soft">Total Debit: <strong className="num text-debit">{formatIDR(totals.debit)}</strong></span>
        <span className="text-ink-soft">Total Kredit: <strong className="num text-credit">{formatIDR(totals.credit)}</strong></span>
        <span className={`font-semibold ${totals.difference === 0 ? 'text-ok' : 'text-bad'}`}>
          {totals.difference === 0 ? '✓ Seimbang' : `Selisih: ${formatIDR(totals.difference)}`}
        </span>
      </div>
    </div>
  )
}
