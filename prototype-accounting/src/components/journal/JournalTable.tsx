import { Fragment, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Inbox, Send, Undo2, X } from 'lucide-react'
import type { JournalEntry } from '../../types'
import { useStore } from '../../store/useStore'
import StatusBadge from '../StatusBadge'
import { formatDateShort, formatIDRPlain } from '../../lib/format'
import { canApproveJournal, canWriteJournal } from '../../lib/permissions'
import RejectJournalDialog from './RejectJournalDialog'

const TONE_CLASS = { debit: 'text-debit', credit: 'text-credit' } as const

function Amount({ value, tone }: { value: number; tone: 'debit' | 'credit' }) {
  return (
    <span
      className={`num whitespace-nowrap ${value ? `font-medium ${TONE_CLASS[tone]}` : 'text-ink-faint'}`}
    >
      {value ? formatIDRPlain(value) : '—'}
    </span>
  )
}

export default function JournalTable({ journals }: { journals: JournalEntry[] }) {
  const postJournal = useStore((s) => s.postJournal)
  const submitJournal = useStore((s) => s.submitJournal)
  const approveJournal = useStore((s) => s.approveJournal)
  const rejectJournal = useStore((s) => s.rejectJournal)
  const reverseJournal = useStore((s) => s.reverseJournal)
  const deleteJournal = useStore((s) => s.deleteJournal)
  const user = useStore((s) => s.user)
  const role = user?.role ?? null
  // Aksi mutasi disembunyikan sesuai permission mock API (API - Accounting.md §2.4):
  //   journal.write  → submit / posting / reverse / hapus (Admin, Akuntan)
  //   journal.approve → approve / reject (hanya Admin)
  const canWrite = canWriteJournal(role)
  const canApprove = canApproveJournal(role)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [rejectingJournal, setRejectingJournal] = useState<JournalEntry | null>(null)

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (journals.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Inbox size={22} />
        </div>
        <p className="text-sm font-semibold text-ink">Belum ada jurnal yang cocok</p>
        <p className="max-w-sm text-sm text-ink-soft">
          Ubah filter pencarian, atau mulai catat jurnal pertama Anda dengan tombol "Buat Jurnal".
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              <th className="px-5 py-2.5">Tgl</th>
              <th className="px-3 py-2.5">No. Bukti</th>
              <th className="px-3 py-2.5">Keterangan</th>
              <th className="px-3 py-2.5 text-right">Debit</th>
              <th className="px-3 py-2.5 text-right">Kredit</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {journals.map((journal) => {
              const isOpen = expanded.has(journal.id)
              const [first, ...rest] = journal.lines
              return (
                <Fragment key={journal.id}>
                  <tr className={`border-b border-line/70 ${isOpen ? 'bg-primary/5' : 'hover:bg-surface-hover/60'}`}>
                    <td className="whitespace-nowrap px-5 py-3 text-sm text-ink-soft">{formatDateShort(journal.date)}</td>
                    <td className="num whitespace-nowrap px-3 py-3 text-xs text-ink">{journal.transactionNumber}</td>
                    <td className="px-3 py-3">
                      <p className="text-sm text-ink">{first.accountName}</p>
                      {first.description && <p className="text-xs text-ink-faint">{first.description}</p>}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Amount value={first.debit} tone="debit" />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Amount value={first.credit} tone="credit" />
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={journal.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggle(journal.id)}
                        aria-label={isOpen ? 'Tutup detail' : 'Buka detail'}
                        className="rounded-md p-1 text-ink-faint transition hover:bg-surface-hover hover:text-ink"
                      >
                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                  </tr>
                  {rest.map((line) => (
                    <tr key={line.id} className="border-b border-line/70 hover:bg-surface-hover/60">
                      <td className="px-5 py-2.5" />
                      <td className="px-3 py-2.5" />
                      <td className="px-3 py-2.5">
                        <p className="text-sm text-ink-soft">{line.accountName}</p>
                        {line.description && <p className="text-xs text-ink-faint">{line.description}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Amount value={line.debit} tone="debit" />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Amount value={line.credit} tone="credit" />
                      </td>
                      <td />
                      <td />
                    </tr>
                  ))}
                  {isOpen && (
                    <tr className="border-b border-line/70 bg-canvas/70">
                      <td colSpan={7} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-[220px] flex-1">
                            <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">Deskripsi</p>
                            <p className="mt-1 text-sm text-ink">{journal.description}</p>
                            <p className="mt-2 text-xs text-ink-soft">
                              Dibuat oleh {journal.createdBy} ·{' '}
                              {journal.status === 'posted' && journal.postedAt
                                ? `Diposting ${new Date(journal.postedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`
                                : journal.status === 'reversed'
                                  ? 'Jurnal telah dibatalkan dengan jurnal pembalik'
                                  : 'Belum diposting'}
                            </p>
                            {journal.rejectionReason && (
                              <p className="mt-2 inline-flex items-start gap-1.5 rounded-lg border border-bad/30 bg-bad/5 px-2.5 py-1.5 text-xs font-medium text-bad">
                                <X size={12} className="mt-0.5 shrink-0" />
                                <span>
                                  Ditolak — alasan: <span className="font-semibold">{journal.rejectionReason}</span>
                                </span>
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {journal.status === 'draft' && canWrite && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => submitJournal(journal.id)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-3.5 py-2 text-xs font-semibold text-[#6d28d9] transition hover:bg-[#7c3aed]/20"
                                >
                                  <Send size={13} /> Submit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => postJournal(journal.id)}
                                  className="rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-primary-light"
                                >
                                  Posting
                                </button>
                                {confirmDelete === journal.id ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      deleteJournal(journal.id)
                                      setConfirmDelete(null)
                                    }}
                                    className="rounded-lg bg-bad px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-bad/90"
                                  >
                                    Yakin hapus?
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDelete(journal.id)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-medium text-bad transition hover:bg-bad/5"
                                  >
                                    <X size={13} /> Hapus
                                  </button>
                                )}
                              </>
                            )}
                            {journal.status === 'pending-approval' && canApprove && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => approveJournal(journal.id)}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-ok px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-ok/90"
                                >
                                  <Check size={13} /> Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRejectingJournal(journal)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-bad/40 bg-bad/5 px-3.5 py-2 text-xs font-medium text-bad transition hover:bg-bad/10"
                                >
                                  <X size={13} /> Reject
                                </button>
                              </>
                            )}
                            {journal.status === 'posted' && canWrite && (
                              <button
                                type="button"
                                onClick={() => reverseJournal(journal.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-medium text-ink-soft transition hover:bg-surface-hover hover:text-ink"
                              >
                                <Undo2 size={13} /> Reverse
                              </button>
                            )}
                            {journal.status === 'reversed' && (
                              <span className="text-xs text-ink-faint">Status final</span>
                            )}
                            {!canWrite && journal.status !== 'reversed' && (
                              <span className="text-xs text-ink-faint">Mode baca saja</span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <RejectJournalDialog journal={rejectingJournal} onClose={() => setRejectingJournal(null)} />
    </div>
  )
}
