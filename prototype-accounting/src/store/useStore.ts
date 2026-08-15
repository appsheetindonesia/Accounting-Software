import { create } from 'zustand'
import { persist, type PersistOptions } from 'zustand/middleware'
import { useMemo } from 'react'
import type { Account, JournalEntry, JournalStatus, NewJournalInput, OfflineJournalOp, OfflineOpInput, PageKey } from '../types'
import { mockAccounts, mockJournals, SEED_JOURNAL_IDS, SEED_VERSION } from '../data/mock'
import { api, ApiError, isNetworkError, toJournalEntry } from '../api'
import { setAuth, setRefreshToken, setSessionExpiredHandler, setTokensRefreshedHandler } from '../api/client'
import type { AuthUser } from '../api'
import { isEffectJournal } from '../lib/ledger'
import { CURRENT_VERSION, migratePersistedState, setMigrationHandler, type PersistedShape } from './persist'

export { isEffectJournal }
export { CURRENT_VERSION, migratePersistedState } from './persist'

export interface Toast {
  message: string
  kind: 'success' | 'error'
}

export type ApiStatus = 'idle' | 'connecting' | 'online' | 'offline'

// Kredensial akun demo (mirror mock-api/src/data.js) — dipakai AUTO-LOGIN saat
// sesi offline ('local.demo') reconnect lewat init() / tombol "Coba lagi".
const DEMO_EMAIL = 'rina@estetikakreasi.co.id'
const DEMO_PASSWORD = 'password123'

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
  // Waktu sinkronisasi terakhir dengan server. Saat offline, data yang tampil
  // berasal dari cache (localStorage) — dipakai untuk indikator "Data dari
  // cache · sinkron terakhir X". null = belum pernah tersinkron (data demo).
  lastSyncedAt: string | null
  // Waktu access token terakhir berhasil di-refresh otomatis (401 → refresh).
  // In-memory saja (tidak dipersist) — indikator transparansi di footer,
  // hilang saat sesi baru (login/logout/reset). null = belum pernah refresh.
  lastRefreshedAt: string | null
  user: Pick<AuthUser, 'id' | 'name' | 'email' | 'role'> | null
  accessToken: string | null
  refreshToken: string | null
  authLoading: boolean
  authError: string | null
  init: (opts?: { silent?: boolean }) => Promise<void>
  // Polling koneksi: cek GET /health saat offline; server hidup → init() otomatis
  pollConnection: () => Promise<void>
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
  resetDemoData: () => Promise<void>

  // Antrian sinkronisasi offline: operasi yang dibuat saat server mati,
  // di-flush ke API begitu koneksi pulih (lihat flushOfflineQueue).
  offlineQueue: OfflineJournalOp[]
  isSyncing: boolean
  enqueueOffline: (op: OfflineJournalOp) => void
  flushOfflineQueue: () => Promise<void>

  toast: Toast | null
  showToast: (message: string, kind?: Toast['kind']) => void
}

const nowIso = () => new Date().toISOString()

// Id unik untuk operasi antrian (bukan id jurnal).
const uid = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(36).slice(2)}`

// Operasi offline → enqueue + tetap diterapkan lokal (UI konsisten).
// Id antrian unik per operasi; urutan penting (replay berurutan saat flush).
const toOp = (partial: OfflineOpInput): OfflineJournalOp => ({ id: uid(), ...partial })

// Nomor urut jurnal lokal berikutnya — berbasis id TERBESAR yang sudah ada
// (bukan journals.length + 1), supaya TIDAK tabrakan dengan id seed/jurnal
// user lain (mis. seed JNL-2026-03-010 → jurnal lokal berikutnya 011).
const nextLocalSeq = (journals: JournalEntry[]) =>
  journals.reduce((max, j) => {
    const m = /(\d+)$/.exec(j.id)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0) + 1

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
    offlineQueue: s.offlineQueue,
    lastSyncedAt: s.lastSyncedAt,
  }),
  migrate: (persisted, version) => migratePersistedState(persisted, version),
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
          const seq = nextLocalSeq(state.journals)
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
            source: 'manual' as const, // format persist v2
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

          const seq = nextLocalSeq(state.journals)
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
            source: 'manual' as const, // format persist v2
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
        // Dipanggil App saat mount, tombol "Coba lagi" (OfflineBanner), dan
        // polling koneksi berkala (App.tsx, GET /health tiap 10 detik).
        // `silent` menekan toast error saat percobaan otomatis — toast hanya
        // untuk aksi user (mount/manual).
        init: async (opts) => {
          const token = get().accessToken
          if (!token) return
          if (token !== 'local.demo') setAuth(token, undefined, get().refreshToken)
          const status = get().apiStatus
          if (status === 'connecting' || status === 'online') return
          set({ apiStatus: 'connecting' })
          try {
            // Sesi offline ('local.demo') TIDAK punya sesi server — request
            // langsung cuma dapat 401 tanpa refresh token untuk menebusnya.
            // Reconnect = AUTO-LOGIN demo dulu (api.login juga setAuth token
            // baru di client), alih-alih menunggu 401 yang tak akan pernah pulih.
            const auth = token === 'local.demo' ? await api.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD }) : null
            const [accRes, jrnRes] = await Promise.all([api.getAccounts(), api.getJournals()])
            const journals = jrnRes.journals.map((j) => enrichCreatedBy(toJournalEntry(j), auth?.user ?? get().user))
            set({
              apiStatus: 'online',
              ...(auth
                ? {
                    accessToken: auth.accessToken,
                    refreshToken: auth.refreshToken ?? null,
                    user: { id: auth.user.id, name: auth.user.name, email: auth.user.email, role: auth.user.role },
                  }
                : {}),
              accounts: accRes.accounts,
              journals,
              activePeriod: get().activePeriod,
              lastSyncedAt: nowIso(),
              ...(auth && !opts?.silent
                ? { toast: { message: 'Sesi offline tersambung — login demo otomatis', kind: 'success' as const } }
                : {}),
            })
          } catch {
            set({
              apiStatus: 'offline',
              ...(opts?.silent ? {} : { toast: { message: 'Mock API tidak terhubung — menampilkan data lokal', kind: 'error' as const } }),
            })
            return
          }
          // Koneksi pulih → kirim operasi offline yang tertunda ke server.
          await get().flushOfflineQueue()
        },

        // Polling koneksi berkala (dipanggil App tiap 10 detik): selama OFFLINE,
        // cek GET /health (ringan, tanpa auth). Begitu server hidup → init()
        // otomatis (auto-login demo bila token 'local.demo') → banner offline
        // hilang TANPA klik "Coba lagi". No-op saat online/connecting.
        pollConnection: async () => {
          if (get().apiStatus !== 'offline') return
          try {
            const h = await api.health()
            if (h?.status === 'ok') await get().init({ silent: true })
          } catch {
            // Server masih mati — poll berikutnya (10 detik) akan mencoba lagi.
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
              lastSyncedAt: nowIso(),
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
            lastSyncedAt: null, // data demo — belum pernah tersinkron
            lastRefreshedAt: null,
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
            offlineQueue: [],
            isSyncing: false,
            lastSyncedAt: null,
            lastRefreshedAt: null,
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
            lastRefreshedAt: null,
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
                // Masuk antrian offline — di-flush otomatis saat koneksi pulih.
                get().enqueueOffline(toOp({ kind: 'create', localId: get().journals[0].id, input, action }))
                return
              }
              const msg = e instanceof ApiError ? e.message : 'Gagal menyimpan jurnal'
              set({ modalOpen: false, toast: { message: msg, kind: 'error' } })
            }
            return
          }
          localSave(input, action)
          get().enqueueOffline(toOp({ kind: 'create', localId: get().journals[0].id, input, action }))
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
                get().enqueueOffline(toOp({ kind: 'post', ref: id }))
                return
              }
              set({ toast: { message: e instanceof ApiError ? e.message : 'Gagal posting jurnal', kind: 'error' } })
            }
            return
          }
          localPost(id)
          get().enqueueOffline(toOp({ kind: 'post', ref: id }))
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
                get().enqueueOffline(toOp({ kind: 'reverse', ref: id }))
                return
              }
              set({ toast: { message: e instanceof ApiError ? e.message : 'Gagal reverse jurnal', kind: 'error' } })
            }
            return
          }
          localReverse(id)
          get().enqueueOffline(toOp({ kind: 'reverse', ref: id }))
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
                get().enqueueOffline(toOp({ kind: 'delete', ref: id }))
                return
              }
              set({ toast: { message: e instanceof ApiError ? e.message : 'Gagal hapus jurnal', kind: 'error' } })
            }
            return
          }
          localDelete(id)
          get().enqueueOffline(toOp({ kind: 'delete', ref: id }))
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
                get().enqueueOffline(toOp({ kind: 'submit', ref: id }))
                return
              }
              set({ toast: { message: e instanceof ApiError ? e.message : 'Gagal submit jurnal', kind: 'error' } })
            }
            return
          }
          localSubmit(id)
          get().enqueueOffline(toOp({ kind: 'submit', ref: id }))
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
                get().enqueueOffline(toOp({ kind: 'approve', ref: id }))
                return
              }
              set({ toast: { message: e instanceof ApiError ? e.message : 'Gagal approve jurnal', kind: 'error' } })
            }
            return
          }
          localApprove(id)
          get().enqueueOffline(toOp({ kind: 'approve', ref: id }))
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
                get().enqueueOffline(toOp({ kind: 'reject', ref: id, reason }))
                return
              }
              set({ toast: { message: e instanceof ApiError ? e.message : 'Gagal reject jurnal', kind: 'error' } })
            }
            return
          }
          localReject(id)
          get().enqueueOffline(toOp({ kind: 'reject', ref: id, reason }))
        },

        // Reset demo: hapus localStorage (data pengguna) + kembali ke seed murni.
        // Saat online, sekaligus reset state server mock via POST /admin/reset
        // (dev-only, tanpa auth) — satu klik mereset lokal + server.
        resetDemoData: async () => {
          const wasOnline = get().apiStatus === 'online'
          let serverReset = false
          let serverFailed = false
          let serverUnreachable = false
          if (wasOnline) {
            try {
              await api.resetServerData()
              serverReset = true
            } catch (e) {
              // Reset server gagal — tetap lanjut reset lokal. Jaringan putus
              // ditandai offline; error lain (mis. 500) tidak menghentikan reset.
              serverFailed = true
              if (isNetworkError(e)) {
                serverUnreachable = true
                set({ apiStatus: 'offline' })
              }
            }
          }
          // `persist` API hanya ada saat storage tersedia (browser);
          // di lingkungan tanpa storage (test) di-skip aman.
          useStore.persist?.clearStorage()
          set({
            accounts: mockAccounts,
            journals: mockJournals,
            activePeriod: '2026-03',
            page: 'dashboard',
            modalOpen: false,
            offlineQueue: [],
            isSyncing: false,
            lastSyncedAt: null,
            lastRefreshedAt: null,
            toast: {
              message: serverReset
                ? 'Data demo di-reset ke seed awal (lokal + server mock)'
                : serverFailed
                  ? serverUnreachable
                    ? 'Data lokal di-reset — server mock tidak dapat dijangkau (offline)'
                    : 'Data lokal di-reset — server mock tidak ikut ter-reset'
                  : 'Data demo di-reset ke seed awal',
              kind: serverReset || !serverFailed ? 'success' : 'error',
            },
          })
        },

        // ---------- Antrian sinkronisasi offline ----------
        // Operasi masuk antrian saat server mati (tetap diterapkan lokal agar
        // UI konsisten), lalu di-replay berurutan begitu koneksi pulih.
        offlineQueue: [],
        isSyncing: false,
        lastSyncedAt: null,
        lastRefreshedAt: null,

        enqueueOffline: (op) => {
          set((s) => ({ offlineQueue: [...s.offlineQueue, op] }))
        },

        // Kirim semua operasi tertunda ke API (berurutan), lalu rekonsiliasi
        // dengan state server. Dipanggil otomatis saat koneksi pulih (init),
        // dan bisa dipicu manual via tombol "Coba lagi" di banner offline.
        flushOfflineQueue: async () => {
          if (get().apiStatus !== 'online') return
          const pending = get().offlineQueue
          if (pending.length === 0) return

          set({ isSyncing: true })

          // Map id lokal (dibuat offline) → id server, agar operasi ref-based
          // (post/reverse/delete/...) yang menyusul menunjuk jurnal yang benar.
          const idMap = new Map<string, string>()
          const errors: string[] = []
          let synced = 0

          for (const op of [...pending]) {
            try {
              if (op.kind === 'create') {
                const created = await api.createJournal({ ...op.input, submitForApproval: false })
                let status: JournalStatus = 'draft'
                let postedAt: string | undefined
                if (op.action === 'post') {
                  const r = await api.postJournal(created.id)
                  status = 'posted'
                  postedAt = r.postedAt
                }
                // Id lokal → id server, untuk operasi selanjutnya di antrian.
                idMap.set(op.localId, created.id)
                // Update store: jurnal lokal memakai id server (untuk kasus
                // flush terputus di tengah, ref berikutnya tetap valid).
                set((s) => ({
                  journals: s.journals.map((j) =>
                    j.id === op.localId ? { ...j, id: created.id, status, postedAt } : j,
                  ),
                }))
                // Rewrite sisa antrian: ref yang menunjuk id lokal → id server.
                set((s) => ({
                  offlineQueue: s.offlineQueue.map((o) =>
                    'ref' in o && o.ref === op.localId ? { ...o, ref: created.id } : o,
                  ),
                }))
              } else {
                const ref = idMap.get(op.ref) ?? op.ref
                switch (op.kind) {
                  case 'post':
                    await api.postJournal(ref)
                    break
                  case 'submit':
                    await api.submitJournal(ref)
                    break
                  case 'approve':
                    await api.approveJournal(ref)
                    break
                  case 'reject':
                    await api.rejectJournal(ref, op.reason)
                    break
                  case 'reverse':
                    await api.reverseJournal(ref)
                    break
                  case 'delete':
                    await api.deleteJournal(ref)
                    break
                }
              }
              // Sukses → hapus dari antrian (urut, pakai op.id asli).
              set((s) => ({ offlineQueue: s.offlineQueue.filter((o) => o.id !== op.id) }))
              synced += 1
            } catch (e) {
              if (isNetworkError(e)) {
                // Koneksi putus lagi di tengah flush — berhenti, sisanya
                // tetap di antrian untuk flush berikutnya.
                set({ apiStatus: 'offline', isSyncing: false })
                return
              }
              // Server menolak operasi (mis. PERIOD_CLOSED) → keluarkan dari
              // antrian agar tidak macet, laporkan ke user, lanjut ke berikutnya.
              set((s) => ({ offlineQueue: s.offlineQueue.filter((o) => o.id !== op.id) }))
              errors.push(e instanceof ApiError ? e.message : 'Operasi gagal disinkronkan')
            }
          }

          // Rekonsiliasi: ambil state terbaru dari server (termasuk id & status
          // asli server, jurnal pembalik, dst.). Jika rekonsiliasi gagal karena
          // jaringan, jangan timpa — biarkan antrian/state apa adanya.
          try {
            const [accRes, jrnRes] = await Promise.all([api.getAccounts(), api.getJournals()])
            const journals = jrnRes.journals.map((j) => enrichCreatedBy(toJournalEntry(j), get().user))
            set({ accounts: accRes.accounts, journals, lastSyncedAt: nowIso() })
          } catch {
            // Jaringan turun tepat setelah flush — tetap online tidak valid.
            set({ apiStatus: 'offline' })
          }

          set({ isSyncing: false })
          if (errors.length > 0) {
            set({
              toast: {
                message: `${errors.length} operasi offline gagal disinkronkan: ${errors[0]}`,
                kind: 'error',
              },
            })
          } else if (synced > 0) {
            set({ toast: { message: `${synced} operasi offline berhasil disinkronkan`, kind: 'success' } })
          }
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
  // Token berhasil di-refresh otomatis (401) — catat waktu untuk indikator
  // transparansi di footer ("Sesi diperbarui otomatis · baru saja").
  useStore.setState({ accessToken, refreshToken, lastRefreshedAt: nowIso() })
})
setSessionExpiredHandler(() => useStore.getState().handleSessionExpired())

// Migrasi state tersimpan berhasil (upgrade versi) → beri tahu user bahwa
// data lokalnya TIDAK hilang: seed diganti nilai terbaru, jurnal pengguna
// dipertahankan. (Rehydrate berjalan async — handler ini sudah ter-register
// saat modul selesai dievaluasi, jadi aman dipanggil kapan pun.)
setMigrationHandler(({ fromVersion, toVersion, preservedUserJournals }) => {
  useStore.setState({
    toast: {
      message: `Data lokal dimigrasi ke versi baru (v${fromVersion} → v${toVersion}) — ${preservedUserJournals} jurnal pengguna dipertahankan`,
      kind: 'success',
    },
  })
})

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
