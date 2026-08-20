import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, Lock } from 'lucide-react'
import { useStore } from '../../store/useStore'
import JournalTable from './JournalTable'
import { formatIDR, formatPeriodLabel } from '../../lib/format'
import { canWriteJournal } from '../../lib/permissions'
import { SkeletonLines, SkeletonTable } from '../Skeleton'

type StatusFilter = 'all' | 'draft' | 'pending-approval' | 'posted' | 'reversed'

export default function JournalPage() {
  const journals = useStore((s) => s.journals)
  const openModal = useStore((s) => s.openModal)
  const user = useStore((s) => s.user)
  const apiStatus = useStore((s) => s.apiStatus)
  const lastSyncedAt = useStore((s) => s.lastSyncedAt)
  const activePeriod = useStore((s) => s.activePeriod)
  const periods = useStore((s) => s.periods)
  const entityRefetching = useStore((s) => s.entityRefetching)
  const canWrite = canWriteJournal(user?.role)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  // Periode aktif (dari Sidebar): label + status tertutup/terbuka. id periode
  // API berbentuk 'fp-2026-03' sedangkan activePeriod '2026-03' — samakan via
  // prefiks. Saat daftar belum termuat (offline/loading), anggap terbuka agar
  // demo tetap jalan.
  const periodInfo = periods.find((p) => p.id === `fp-${activePeriod}`)
  const periodLabel = periodInfo?.name ?? formatPeriodLabel(activePeriod)
  const periodOpen = periodInfo?.isOpen ?? true

  // Navigasi masuk ke halaman Jurnal menentukan filter status awal:
  // - Dari dropdown notifikasi (openPendingApproval): journalFilter
  //   'pending-approval' → buka dengan filter Menunggu Approval (flag
  //   transient dibaca lalu dibersihkan).
  // - Dari global search (focusJournalId tanpa journalFilter): reset filter
  //   ke Semua agar jurnal target tidak tersaring (JournalTable membuka baris
  //   detailnya lewat focusJournalId).
  // Ref fromNotifRef menandai bahwa fokus ini berasal dari notifikasi sehingga
  // pembersihan journalFilter (setelah diterapkan) tidak memicu reset ke
  // 'all' pada render berikutnya.
  const focusJournalId = useStore((s) => s.focusJournalId)
  const journalFilter = useStore((s) => s.journalFilter)
  const clearJournalFilter = useStore((s) => s.clearJournalFilter)
  const fromNotifRef = useRef(false)
  useEffect(() => {
    if (journalFilter) {
      fromNotifRef.current = true
      setKeyword('')
      setStatus(journalFilter)
      clearJournalFilter()
      return
    }
    if (focusJournalId) {
      setKeyword('')
      if (!fromNotifRef.current) setStatus('all')
      fromNotifRef.current = false
    }
  }, [journalFilter, focusJournalId, clearJournalFilter])

  // Skeleton saat data jurnal sedang di-fetch: fetch pertama oleh init()
  // (apiStatus 'connecting' & belum pernah sinkron — lastSyncedAt null) ATAU
  // refetch ganti entitas (entityRefetching) — indikator loading konsisten di
  // seluruh alur, bukan hanya fetch pertama. Setelah pernah sinkron & entitas
  // stabil, data store dipakai langsung tanpa flash skeleton (cached/persist).
  const loadingJournals = (apiStatus === 'connecting' && lastSyncedAt === null) || entityRefetching

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return [...journals]
      .filter((j) => j.date.startsWith(activePeriod)) // hanya jurnal periode aktif
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
  }, [journals, keyword, status, activePeriod])

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
            {periodLabel} · {filtered.length} entri jurnal ({journals.filter((j) => j.status === 'draft' && j.date.startsWith(activePeriod)).length} draft)
          </p>
          {!periodOpen && (
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-ink-faint/10 px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
              <Lock size={12} /> Periode tertutup — mutasi diblokir
            </p>
          )}
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={openModal}
            disabled={!periodOpen}
            title={!periodOpen ? 'Periode tertutup — tidak dapat membuat jurnal' : 'Buat jurnal baru'}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-primary-light active:translate-y-px disabled:cursor-not-allowed disabled:bg-ink-faint/30 disabled:text-ink-faint disabled:shadow-none"
          >
            <Plus size={16} /> Buat Jurnal
          </button>
        )}
      </div>

      {loadingJournals ? (
        <div className="space-y-5">
          <SkeletonLines rows={1} />
          <SkeletonTable rows={6} />
          <SkeletonLines rows={1} />
        </div>
      ) : (
        <>
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
                <option value="pending-approval">Menunggu Approval</option>
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
        </>
      )}
    </div>
  )
}
