import { create } from 'zustand'
import { persist, type PersistOptions } from 'zustand/middleware'
import { useMemo } from 'react'
import type { Account, JournalEntry, NewJournalInput, PageKey } from '../types'
import { mockAccounts, mockJournals, SEED_JOURNAL_IDS, SEED_VERSION } from '../data/mock'
import { api, ApiError, isNetworkError, toJournalEntry } from '../api'
import { setAuth, setRefreshToken, setSessionExpiredHandler, setTokensRefreshedHandler } from '../api/client'
import type { AuthUser } from '../api'
import { isEffectJournal } from '../lib/ledger'
import { CURRENT_VERSION, migratePersistedState, type PersistedShape } from './persist'

export { isEffectJournal }
export { CURRENT_VERSION, migratePersistedState } from './persist'

export interface Toast {
  message: string
  kind: 'success' | 'error'
}

export type ApiStatus = 'idle' | 'connecting' | 'online' | 'offline'

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

  // Lapisan API (API - Accounting.md)
  apiStatus: ApiStatus
  user: Pick<AuthUser, 'id' | 'name' | 'email' | 'role'> | null
  accessToken: string | null
  refreshToken: string | null
  authLoading: boolean
  authError: string | null
  init: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  loginOffline: () => void
  logout: () => void
  handleSessionExpired: () => void

  saveJournal: (input: NewJournalInput, action: 'draft' | 'post') => Promise<void>
  postJournal: (id: string) => Promise<void>
  submitJournal: (id: string) => Promise<void>
  approveJournal: (id: string) => Promise<void>
  rejectJournal: (id: string, reason?: string) => Promise<void>
  reverseJournal: (id: string) => Promise<void>
  deleteJournal: (id: string) => Promise<void>
  resetDemoData: () => void

  toast: Toast | null
  showToast: (message: string, kind?: Toast['kind']) => void
}

const nowIso = () => new Date().toISOString()

// Key localStorage. JANGAN ganti nama key: data lama dimigrasi lewat
// version + migrate() (lihat src/store/persist.ts), bukan di-reset.
// NAIKKAN CURRENT_VERSION (bukan key) saat mock data berubah.
const STORAGE_KEY = 'appsheet-accounting-v1'

// Hanya field data yang dipersist (bukan UI ephemeral seperti modal/toast)
// + metadata seed agar migrasi ke depan tahu jurnal mana milik seed.
const persistOptions: PersistOptions<AccountingState, PersistedShape> = {
  name: STORAGE_KEY,
  version: CURRENT_VERSION,
  partialize: (s) => ({
    accounts: s.accounts,
    journals: s.journals,
    activePeriod: s.activePeriod,
    seedVersion: SEED_VERSION,
    seedJournalIds: SEED_JOURNAL_IDS,
    accessToken: s.accessToken,
    refreshToken: s.refreshToken,
    user: s.user,
  }),
  migrate: (persisted) => migratePersistedState(persisted),
}

// Ganti createdBy user id (mis. "user-001") dengan nama untuk tampilan UI
const enrichCreatedBy = <T extends JournalEntry>(j: T, user: AccountingState['user']): T =>
  user && j.createdBy === user.id ? { ...j, createdBy: user.name } : j

export const useStore = create<AccountingState>()(
  persist(
    (set, get) => {
      // ---------- Mutasi lokal (fallback offline) ----------
      const localSave = (input: NewJournalInput, action: 'draft' | 'post') => {
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
            createdBy: get().user?.name ?? 'Rina',
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
        })
      }

      const localPost = (id: string) => {
        set((state) => ({
          journals: state.journals.map((j) =>
            j.id === id && j.status === 'draft' ? { ...j, status: 'posted' as const, postedAt: nowIso() } : j,
          ),
          toast: { message: 'Jurnal berhasil diposting', kind: 'success' },
        }))
      }

      // Approval workflow — fallback offline (transisi status sederhana)
      const localSubmit = (id: string) => {
        set((state) => ({
          journals: state.journals.map((j) =>
            j.id === id && j.status === 'draft' ? { ...j, status: 'pending-approval' as const } : j,
          ),
          toast: { message: 'Jurnal diajukan untuk persetujuan', kind: 'success' },
        }))
      }

      const localApprove = (id: string) => {
        set((state) => ({
          journals: state.journals.map((j) =>
            j.id === id && j.status === 'pending-approval'
              ? { ...j, status: 'posted' as const, postedAt: nowIso() }
              : j,
          ),
          toast: { message: 'Jurnal disetujui dan diposting', kind: 'success' },
        }))
      }

      const localReject = (id: string) => {
        set((state) => ({
          journals: state.journals.map((j) =>
            j.id === id && j.status === 'pending-approval' ? { ...j, status: 'draft' as const } : j,
          ),
          toast: { message: 'Jurnal ditolak — kembali ke draft', kind: 'success' },
        }))
      }

      const localReverse = (id: string) => {
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
            createdBy: get().user?.name ?? 'Rina',
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
        })
      }

      const localDelete = (id: string) => {
        set((state) => ({
          journals: state.journals.filter((j) => j.id !== id),
          toast: { message: 'Jurnal draft dihapus', kind: 'success' },
        }))
      }

      // ---------- State + aksi ----------
      return {
        page: 'dashboard',
        setPage: (page) => set({ page }),

        accounts: mockAccounts,
        journals: mockJournals,
        activePeriod: '2026-03',
        setActivePeriod: (activePeriod) => set({ activePeriod }),

        modalOpen: false,
        openModal: () => set({ modalOpen: true }),
        closeModal: () => set({ modalOpen: false }),

        apiStatus: 'idle',
        user: null,
        accessToken: null,
        refreshToken: null,
        authLoading: false,
        authError: null,
        // Reconnect sesi tersimpan (reload) — TANPA auto-login demo.
        // Dipanggil App saat mount & tombol "Coba lagi" (OfflineBanner).
        init: async () => {
          const token = get().accessToken
          if (!token) return
          if (token !== 'local.demo') setAuth(token, undefined, get().refreshToken)
          const status = get().apiStatus
          if (status === 'connecting' || status === 'online') return
          set({ apiStatus: 'connecting' })
          try {
            const [accRes, jrnRes] = await Promise.all([api.getAccounts(), api.getJournals()])
            const journals = jrnRes.journals.map((j) => enrichCreatedBy(toJournalEntry(j), get().user))
            set({
              apiStatus: 'online',
              accounts: accRes.accounts,
              journals,
              activePeriod: get().activePeriod,
            })
          } catch {
            set({
              apiStatus: 'offline',
              toast: { message: 'Mock API tidak terhubung — menampilkan data lokal', kind: 'error' },
            })
          }
        },

        // Login sungguhan: POST /auth/login dengan email/password dari form.
        login: async (email, password) => {
          set({ authLoading: true, authError: null })
          try {
            const auth = await api.login({ email, password })
            const [accRes, jrnRes] = await Promise.all([api.getAccounts(), api.getJournals()])
            const journals = jrnRes.journals.map((j) => enrichCreatedBy(toJournalEntry(j), auth.user))
            set({
              apiStatus: 'online',
              accessToken: auth.accessToken,
              refreshToken: auth.refreshToken ?? null,
              user: { id: auth.user.id, name: auth.user.name, email: auth.user.email, role: auth.user.role },
              accounts: accRes.accounts,
              journals,
              activePeriod: auth.activePeriod?.id ?? get().activePeriod,
              authLoading: false,
              toast: { message: `Selamat datang, ${auth.user.name}`, kind: 'success' },
            })
          } catch (e) {
            const message = isNetworkError(e)
              ? 'Mock API tidak terhubung — pastikan server berjalan (npm start di mock-api, port 4000)'
              : e instanceof ApiError
                ? e.message
                : 'Gagal login'
            set({ authLoading: false, authError: message })
          }
        },

        // Masuk offline: lanjut dengan data demo lokal (tanpa server).
        loginOffline: () => {
          set({
            apiStatus: 'offline',
            accessToken: 'local.demo',
            refreshToken: null,
            user: null,
            accounts: mockAccounts,
            journals: mockJournals,
            authLoading: false,
            authError: null,
            toast: { message: 'Masuk offline — menampilkan data demo lokal', kind: 'error' },
          })
        },

        // Keluar: hapus sesi & kembali ke halaman login.
        logout: () => {
          const rt = get().refreshToken
          if (rt) api.logout(rt).catch(() => {}) // best-effort, jangan blokir logout
          setAuth(null, null, null)
          setRefreshToken(null)
          set({
            apiStatus: 'idle',
            accessToken: null,
            refreshToken: null,
            user: null,
            authLoading: false,
            authError: null,
            accounts: mockAccounts,
            journals: mockJournals,
            activePeriod: '2026-03',
            page: 'dashboard',
            modalOpen: false,
            toast: { message: 'Anda telah keluar', kind: 'success' },
          })
        },

        // Dipanggil client saat refresh token gagal (401 berulang) → login ulang.
        handleSessionExpired: () => {
          setAuth(null, null, null)
          setRefreshToken(null)
          set({
            apiStatus: 'idle',
            accessToken: null,
            refreshToken: null,
            user: null,
            authError: 'Sesi berakhir. Silakan login kembali.',
          })
        },

        saveJournal: async (input, action) => {
          if (get().apiStatus === 'online') {
            try {
              const created = await api.createJournal({ ...input, submitForApproval: false })
              let entry = enrichCreatedBy(toJournalEntry(created), get().user)
              if (action === 'post') {
                const r = await api.postJournal(created.id)
                entry = { ...entry, status: 'posted' as const, postedAt: r.postedAt }
              }
              set((s) => ({
                journals: [entry, ...s.journals],
                modalOpen: false,
                toast: {
                  message: action === 'post' ? 'Jurnal berhasil diposting' : 'Jurnal disimpan sebagai draft',
                  kind: 'success',
                },
              }))
            } catch (e) {
              if (isNetworkError(e)) {
                set({ apiStatus: 'offline' })
                localSave(input, action)
                return
              }
              const msg = e instanceof ApiError ? e.message : 'Gagal menyimpan jurnal'
              set({ modalOpen: false, toast: { message: msg, kind: 'error' } })
            }
            return
          }
          localSave(input, action)
        },

        postJournal: async (id) => {
          if (get().apiStatus === 'online') {
            try {
              const r = await api.postJournal(id)
              set((s) => ({
                journals: s.journals.map((j) =>
                  j.id === id ? { ...j, status: 'posted' as const, postedAt: r.postedAt } : j,
                ),
                toast: { message: 'Jurnal berhasil diposting', kind: 'success' },
              }))
            } catch (e) {
              if (isNetworkError(e)) {
                set({ apiStatus: 'offline' })
                localPost(id)
                return
              }
              set({ toast: { message: e instanceof ApiError ? e.message : 'Gagal posting jurnal', kind: 'error' } })
            }
            return
          }
          localPost(id)
        },

        reverseJournal: async (id) => {
          if (get().apiStatus === 'online') {
            try {
              const r = await api.reverseJournal(id)
              const reversal = enrichCreatedBy(toJournalEntry(r.reversalJournal), get().user)
              set((s) => ({
                journals: [
                  reversal,
                  ...s.journals.map((j) =>
                    j.id === id ? { ...j, status: 'reversed' as const, reversalOf: reversal.transactionNumber } : j,
                  ),
                ],
                toast: { message: 'Jurnal dibatalkan dan jurnal pembalik dibuat', kind: 'success' },
              }))
            } catch (e) {
              if (isNetworkError(e)) {
                set({ apiStatus: 'offline' })
                localReverse(id)
                return
              }
              set({ toast: { message: e instanceof ApiError ? e.message : 'Gagal reverse jurnal', kind: 'error' } })
            }
            return
          }
          localReverse(id)
        },

        deleteJournal: async (id) => {
          if (get().apiStatus === 'online') {
            try {
              await api.deleteJournal(id)
              set((s) => ({
                journals: s.journals.filter((j) => j.id !== id),
                toast: { message: 'Jurnal draft dihapus', kind: 'success' },
              }))
            } catch (e) {
              if (isNetworkError(e)) {
                set({ apiStatus: 'offline' })
                localDelete(id)
                return
              }
              set({ toast: { message: e instanceof ApiError ? e.message : 'Gagal hapus jurnal', kind: 'error' } })
            }
            return
          }
          localDelete(id)
        },

        submitJournal: async (id) => {
          if (get().apiStatus === 'online') {
            try {
              await api.submitJournal(id)
              set((s) => ({
                journals: s.journals.map((j) =>
                  j.id === id && j.status === 'draft' ? { ...j, status: 'pending-approval' as const } : j,
                ),
                toast: { message: 'Jurnal diajukan untuk persetujuan', kind: 'success' },
              }))
            } catch (e) {
              if (isNetworkError(e)) {
                set({ apiStatus: 'offline' })
                localSubmit(id)
                return
              }
              set({ toast: { message: e instanceof ApiError ? e.message : 'Gagal submit jurnal', kind: 'error' } })
            }
            return
          }
          localSubmit(id)
        },

        approveJournal: async (id) => {
          if (get().apiStatus === 'online') {
            try {
              const r = await api.approveJournal(id)
              set((s) => ({
                journals: s.journals.map((j) =>
                  j.id === id && j.status === 'pending-approval'
                    ? { ...j, status: 'posted' as const, postedAt: r.approvedAt }
                    : j,
                ),
                toast: { message: 'Jurnal disetujui dan diposting', kind: 'success' },
              }))
            } catch (e) {
              if (isNetworkError(e)) {
                set({ apiStatus: 'offline' })
                localApprove(id)
                return
              }
              set({ toast: { message: e instanceof ApiError ? e.message : 'Gagal approve jurnal', kind: 'error' } })
            }
            return
          }
          localApprove(id)
        },

        rejectJournal: async (id, reason) => {
          if (get().apiStatus === 'online') {
            try {
              await api.rejectJournal(id, reason)
              set((s) => ({
                journals: s.journals.map((j) =>
                  j.id === id && j.status === 'pending-approval' ? { ...j, status: 'draft' as const } : j,
                ),
                toast: { message: 'Jurnal ditolak — kembali ke draft', kind: 'success' },
              }))
            } catch (e) {
              if (isNetworkError(e)) {
                set({ apiStatus: 'offline' })
                localReject(id)
                return
              }
              set({ toast: { message: e instanceof ApiError ? e.message : 'Gagal reject jurnal', kind: 'error' } })
            }
            return
          }
          localReject(id)
        },

        // Reset demo: hapus localStorage (data pengguna) + kembali ke seed murni.
        // Koneksi mock API tidak diubah — reload berikutnya akan memuat ulang
        // dari server (server di-reset terpisah via `npm run reset` di mock-api).
        resetDemoData: () => {
          // `persist` API hanya ada saat storage tersedia (browser);
          // di lingkungan tanpa storage (test) di-skip aman.
          useStore.persist?.clearStorage()
          set({
            accounts: mockAccounts,
            journals: mockJournals,
            activePeriod: '2026-03',
            page: 'dashboard',
            modalOpen: false,
            toast: { message: 'Data demo di-reset ke seed awal', kind: 'success' },
          })
        },

        toast: null,
        showToast: (message, kind = 'success') => set({ toast: { message, kind } }),
      }
    },
    persistOptions,
  ),
)

// Wire callback dari klien API ke store:
// - token berhasil di-refresh (401) → store ikut update + persist
// - refresh gagal (sesi habis) → kembali ke halaman login
setTokensRefreshedHandler(({ accessToken, refreshToken }) => {
  useStore.setState({ accessToken, refreshToken })
})
setSessionExpiredHandler(() => useStore.getState().handleSessionExpired())

// Hitung saldo live: saldo awal + efek jurnal posted (BR-6, BR-7)
export const computeBalances = (accounts: Account[], journals: JournalEntry[]) => {
  const map = new Map(accounts.map((a) => [a.id, a.baseBalance]))
  for (const journal of journals) {
    if (!isEffectJournal(journal)) continue
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
