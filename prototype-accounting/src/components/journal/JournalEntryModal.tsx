import { useMemo, useState } from 'react'
import { CheckCircle2, Plus, Trash2, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { journalPrefixes } from '../../data/mock'
import { formatIDR } from '../../lib/format'
import { computeLineTotals, toNumber } from '../../lib/accounting'
import { canWriteJournal } from '../../lib/permissions'

interface LineDraft {
  key: number
  accountId: string
  debit: string
  credit: string
  description: string
}

const nextLineKey = (() => {
  let n = 100
  return () => ++n
})()

export default function JournalEntryModal() {
  const accounts = useStore((s) => s.accounts)
  const journals = useStore((s) => s.journals)
  const activePeriod = useStore((s) => s.activePeriod)
  const closeModal = useStore((s) => s.closeModal)
  const saveJournal = useStore((s) => s.saveJournal)
  const user = useStore((s) => s.user)
  const canWrite = canWriteJournal(user?.role)

  const activeAccounts = useMemo(() => accounts.filter((a) => a.isActive), [accounts])

  const [date, setDate] = useState('2026-03-15')
  const [prefix, setPrefix] = useState<string>('BKM')
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([
    { key: 1, accountId: '1-1100', debit: '', credit: '', description: '' },
    { key: 2, accountId: '4-1000', debit: '', credit: '', description: '' },
  ])

  const nextNumber = useMemo(() => {
    const period = activePeriod.replace('-', '-')
    const count = journals.length + 1
    return `${prefix}-${period}-${String(count).padStart(4, '0')}`
  }, [prefix, journals.length, activePeriod])

  const totals = useMemo(() => computeLineTotals(lines), [lines])
  const isBalanced = totals.isBalanced
  const hasAccount = lines.every((l) => l.accountId)
  const canSave = isBalanced && hasAccount

  const updateLine = (key: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const handleAmount = (key: number, side: 'debit' | 'credit', value: string) => {
    if (side === 'debit') updateLine(key, { debit: value, credit: value ? '' : undefined })
    else updateLine(key, { credit: value, debit: value ? '' : undefined })
  }

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      { key: nextLineKey(), accountId: activeAccounts[0]?.id ?? '', debit: '', credit: '', description: '' },
    ])

  const removeLine = (key: number) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev))

  const submit = (action: 'draft' | 'post') => {
    if (!canSave) return
    saveJournal(
      {
        date,
        transactionNumber: nextNumber,
        description,
        lines: lines.map((l) => ({ accountId: l.accountId, debit: toNumber(l.debit), credit: toNumber(l.credit), description: l.description })),
      },
      action,
    )
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={closeModal}
      role="dialog"
      aria-modal="true"
      aria-label="Entri jurnal baru"
    >
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-surface shadow-modal animate-[fadein_0.18s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-ink">Entri Jurnal Baru</h2>
            <p className="text-xs text-ink-soft">Transaksi otomatis balance (debit = kredit)</p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            aria-label="Tutup"
            className="rounded-md p-1.5 text-ink-soft transition hover:bg-surface-hover hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Tanggal</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-ink-soft">No. Bukti</span>
              <div className="flex h-10 overflow-hidden rounded-lg border border-line bg-canvas focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                <select
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  className="border-r border-line bg-transparent px-2 text-sm text-ink focus:outline-none"
                  aria-label="Prefix nomor bukti"
                >
                  {journalPrefixes.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <input
                  value={nextNumber}
                  readOnly
                  className="num w-full bg-transparent px-3 text-sm text-ink focus:outline-none"
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Periode</span>
              <div className="flex h-10 items-center rounded-lg border border-line bg-canvas px-3 text-sm text-ink-soft">
                {activePeriod} · aktif
              </div>
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Deskripsi</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Keterangan transaksi..."
              className="h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-soft">Baris Jurnal</span>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-light"
              >
                <Plus size={13} /> Tambah Baris
              </button>
            </div>
            <div className="overflow-hidden rounded-lg border border-line">
              <div className="grid grid-cols-[1fr_110px_110px_32px] gap-2 border-b border-line bg-canvas px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                <span>Akun</span>
                <span className="text-right">Debit (Rp)</span>
                <span className="text-right">Kredit (Rp)</span>
                <span />
              </div>
              {lines.map((line) => (
                <div key={line.key} className="grid grid-cols-[1fr_110px_110px_32px] items-center gap-2 border-b border-line/70 px-3 py-2 last:border-0">
                  <select
                    value={line.accountId}
                    onChange={(e) => updateLine(line.key, { accountId: e.target.value })}
                    className="h-9 w-full rounded-md border border-line bg-canvas px-2 text-sm text-ink focus:border-primary focus:outline-none"
                  >
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={line.debit}
                    onChange={(e) => handleAmount(line.key, 'debit', e.target.value)}
                    placeholder="0"
                    className="num h-9 w-full rounded-md border border-line bg-canvas px-2 text-right text-sm text-debit placeholder:text-ink-faint focus:border-debit focus:outline-none focus:ring-2 focus:ring-debit/20"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={line.credit}
                    onChange={(e) => handleAmount(line.key, 'credit', e.target.value)}
                    placeholder="0"
                    className="num h-9 w-full rounded-md border border-line bg-canvas px-2 text-right text-sm text-credit placeholder:text-ink-faint focus:border-credit focus:outline-none focus:ring-2 focus:ring-credit/20"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length <= 1}
                    aria-label="Hapus baris"
                    className="flex size-8 items-center justify-center rounded-md text-ink-faint transition hover:bg-bad/10 hover:text-bad disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_110px_110px_32px] items-center gap-2 border-t-2 border-line bg-canvas px-3 py-2.5 text-sm font-bold">
                <span className="text-ink-soft">Total</span>
                <span className="num text-right text-debit">{totals.debit ? formatIDR(totals.debit) : 'Rp 0'}</span>
                <span className="num text-right text-credit">{totals.credit ? formatIDR(totals.credit) : 'Rp 0'}</span>
                <span />
              </div>
            </div>

            <p
              className={`mt-2.5 flex items-center gap-1.5 text-xs font-medium ${
                isBalanced ? 'text-ok' : 'text-bad'
              }`}
            >
              {isBalanced ? (
                <>
                  <CheckCircle2 size={14} /> Jurnal seimbang (Debit = Kredit)
                </>
              ) : (
                <>
                  <X size={14} /> Total debit dan kredit harus sama. Selisih:{' '}
                  <span className="num">{formatIDR(totals.difference)}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={closeModal}
            className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink-soft transition hover:bg-surface-hover hover:text-ink"
          >
            Batal
          </button>
          {canWrite && (
            <>
              <button
                type="button"
                onClick={() => submit('draft')}
                disabled={!canSave}
                className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                Simpan Draft
              </button>
              <button
                type="button"
                onClick={() => submit('post')}
                disabled={!canSave}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-light active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
              >
                Posting
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
