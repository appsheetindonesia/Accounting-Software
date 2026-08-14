import { create } from 'zustand'
import { useMemo } from 'react'
import type { Account, JournalEntry, NewJournalInput, PageKey } from '../types'
import { mockAccounts, mockJournals } from '../data/mock'

export interface Toast {
  message: string
  kind: 'success' | 'error'
}

interface AccountingState {
  page: PageKey
  setPage: (page: PageKey) => void

  accounts: Account[]
  journals: JournalEntry[]
  activePeriod: string
  setActivePeriod: (period: string) => void

  modalOpen: boolean
  openModal: () => void
  closeModal: () => void

  saveJournal: (input: NewJournalInput, action: 'draft' | 'post') => void
  postJournal: (id: string) => void
  reverseJournal: (id: string) => void
  deleteJournal: (id: string) => void

  toast: Toast | null
  showToast: (message: string, kind?: Toast['kind']) => void
}

const nowIso = () => new Date().toISOString()

export const useStore = create<AccountingState>((set) => ({
  page: 'dashboard',
  setPage: (page) => set({ page }),

  accounts: mockAccounts,
  journals: mockJournals,
  activePeriod: '2026-03',
  setActivePeriod: (activePeriod) => set({ activePeriod }),

  modalOpen: false,
  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),

  saveJournal: (input, action) =>
    set((state) => {
      const seq = state.journals.length + 1
      const entry: JournalEntry = {
        id: `JNL-${input.date.slice(0, 7).replace('-', '-')}-${String(seq).padStart(3, '0')}`,
        transactionNumber: input.transactionNumber,
        date: input.date,
        description: input.description.trim() || 'Tanpa keterangan',
        lines: input.lines.map((ln, i) => {
          const account = state.accounts.find((a) => a.id === ln.accountId)!
          return {
            id: `n-${seq}-${i + 1}`,
            accountId: account.id,
            accountCode: account.code,
            accountName: account.name,
            debit: ln.debit,
            credit: ln.credit,
            description: ln.description,
          }
        }),
        status: action === 'post' ? 'posted' : 'draft',
        createdBy: 'Rina',
        createdAt: nowIso(),
        postedAt: action === 'post' ? nowIso() : undefined,
      }
      return {
        journals: [entry, ...state.journals],
        modalOpen: false,
        toast: {
          message: action === 'post' ? 'Jurnal berhasil diposting' : 'Jurnal disimpan sebagai draft',
          kind: 'success',
        },
      }
    }),

  postJournal: (id) =>
    set((state) => ({
      journals: state.journals.map((j) =>
        j.id === id && j.status === 'draft'
          ? { ...j, status: 'posted' as const, postedAt: nowIso() }
          : j,
      ),
      toast: { message: 'Jurnal berhasil diposting', kind: 'success' },
    })),

  reverseJournal: (id) =>
    set((state) => {
      const original = state.journals.find((j) => j.id === id)
      if (!original || original.status !== 'posted') return state

      const seq = state.journals.length + 1
      const reversal: JournalEntry = {
        id: `JNL-2026-03-${String(seq).padStart(3, '0')}`,
        transactionNumber: `REV-${original.transactionNumber}`,
        date: nowIso().slice(0, 10),
        description: `Pembalikan: ${original.description}`,
        lines: original.lines.map((ln, i) => ({
          id: `r-${seq}-${i + 1}`,
          accountId: ln.accountId,
          accountCode: ln.accountCode,
          accountName: ln.accountName,
          debit: ln.credit,
          credit: ln.debit,
        })),
        status: 'posted',
        createdBy: 'Rina',
        createdAt: nowIso(),
        postedAt: nowIso(),
        reversalOf: original.transactionNumber,
      }

      return {
        journals: [
          reversal,
          ...state.journals.map((j) =>
            j.id === id ? { ...j, status: 'reversed' as const, reversalOf: reversal.transactionNumber } : j,
          ),
        ],
        toast: { message: 'Jurnal dibatalkan dan jurnal pembalik dibuat', kind: 'success' },
      }
    }),

  deleteJournal: (id) =>
    set((state) => ({
      journals: state.journals.filter((j) => j.id !== id),
      toast: { message: 'Jurnal draft dihapus', kind: 'success' },
    })),

  toast: null,
  showToast: (message, kind = 'success') => set({ toast: { message, kind } }),
}))

// Hitung saldo live: saldo awal + efek jurnal posted (BR-6, BR-7)
export const computeBalances = (accounts: Account[], journals: JournalEntry[]) => {
  const map = new Map(accounts.map((a) => [a.id, a.baseBalance]))
  for (const journal of journals) {
    if (journal.status !== 'posted') continue
    for (const ln of journal.lines) {
      const account = accounts.find((a) => a.id === ln.accountId)
      if (!account) continue
      const current = map.get(account.id) ?? 0
      const delta =
        account.normalBalance === 'debit' ? ln.debit - ln.credit : ln.credit - ln.debit
      map.set(account.id, current + delta)
    }
  }
  return map
}

// Hook selector: peta saldo live (re-render otomatis saat jurnal/akun berubah)
export const useBalances = () => {
  const accounts = useStore((s) => s.accounts)
  const journals = useStore((s) => s.journals)
  return useMemo(() => computeBalances(accounts, journals), [accounts, journals])
}
