import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockAccounts, mockJournals } from '../data/mock'
import { computeBalances, isEffectJournal, useStore } from './useStore'

// Mock lapisan API — path online memakai modul ini, path lokal (offline) tidak.
vi.mock('../api', () => {
  class MockApiError extends Error {
    status: number
    code: string
    constructor(status: number, code: string, message: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.code = code
    }
  }
  return {
    ApiError: MockApiError,
    isNetworkError: (e: unknown) => e instanceof TypeError,
    toJournalEntry: (j: any) => ({
      ...j,
      status: j.status,
      lines: (j.lines ?? []).map((l: any, i: number) => ({ id: l.id ?? `${j.id}-${i}`, ...l })),
    }),
    api: {
      login: vi.fn(),
      logout: vi.fn(),
      getAccounts: vi.fn(),
      getJournals: vi.fn(),
      createJournal: vi.fn(),
      postJournal: vi.fn(),
      submitJournal: vi.fn(),
      approveJournal: vi.fn(),
      rejectJournal: vi.fn(),
      reverseJournal: vi.fn(),
      deleteJournal: vi.fn(),
      resetServerData: vi.fn(),
      closePeriod: vi.fn(),
      getPeriods: vi.fn(),
      health: vi.fn(),
    },
  }
})

import { api, ApiError } from '../api'
import * as clientApi from '../api/client'

const mockedApi = vi.mocked(api)

// Reset store ke seed di awal tiap test (persist tidak aktif di lingkungan Node).
const resetStore = () =>
  useStore.setState({
    accounts: mockAccounts,
    journals: mockJournals,
    activePeriod: '2026-03',
    modalOpen: false,
    toast: null,
    apiStatus: 'idle',
    user: null,
    accessToken: null,
    refreshToken: null,
    authLoading: false,
    authError: null,
    lastSyncedAt: null,
    focusJournalId: null,
    focusAccountId: null,
  })

const bal = () => computeBalances(useStore.getState().accounts, useStore.getState().journals)

const demoUser = { id: 'user-001', name: 'Rina', email: 'rina@estetikakreasi.co.id', role: 'admin' }

const createdJournal: any = {
  id: 'JNL-2026-03-009',
  transactionNumber: 'BKM-2026-03-0009',
  date: '2026-03-25',
  description: 'Penerimaan jasa PT Test',
  lines: [
    { id: 'line-101', accountId: '1-1100', accountCode: '1-1100', accountName: 'Kas Besar', debit: 10_000_000, credit: 0, description: 'Tunai' },
    { id: 'line-102', accountId: '4-1000', accountCode: '4-1000', accountName: 'Pendapatan Jasa', debit: 0, credit: 10_000_000, description: 'Pendapatan' },
  ],
  status: 'draft',
  createdBy: 'user-001',
  createdAt: '2026-03-25T08:00:00Z',
}

beforeEach(() => {
  resetStore()
  mockedApi.login.mockReset()
  mockedApi.logout.mockReset()
  mockedApi.getAccounts.mockReset()
  mockedApi.getJournals.mockReset()
  mockedApi.createJournal.mockReset()
  mockedApi.postJournal.mockReset()
  mockedApi.submitJournal.mockReset()
  mockedApi.approveJournal.mockReset()
  mockedApi.rejectJournal.mockReset()
  mockedApi.reverseJournal.mockReset()
  mockedApi.deleteJournal.mockReset()
  mockedApi.closePeriod.mockReset()
  mockedApi.getPeriods.mockReset()
  mockedApi.health.mockReset()
  mockedApi.health.mockRejectedValue(new TypeError('fetch failed'))
  // Default: gagal jaringan agar path lokal (fallback) yang teruji
  mockedApi.login.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.logout.mockResolvedValue(undefined)
  mockedApi.getAccounts.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.getJournals.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.getPeriods.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.createJournal.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.postJournal.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.submitJournal.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.approveJournal.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.rejectJournal.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.reverseJournal.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.deleteJournal.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.closePeriod.mockRejectedValue(new TypeError('fetch failed'))
})

describe('isEffectJournal — jurnal yang memengaruhi saldo', () => {
  it('posted tanpa reversalOf memengaruhi saldo', () => {
    expect(isEffectJournal(mockJournals[0])).toBe(true) // JNL-001 posted
  })

  it('draft TIDAK memengaruhi saldo', () => {
    expect(isEffectJournal(mockJournals[5])).toBe(false) // JNL-006 draft
  })

  it('reversed TIDAK memengaruhi saldo', () => {
    expect(isEffectJournal(mockJournals[7])).toBe(false) // JNL-008 reversed
  })

  it('jurnal pembalik (posted + reversalOf) TIDAK memengaruhi saldo', () => {
    expect(isEffectJournal({ ...mockJournals[0], status: 'posted', reversalOf: 'REV-X' })).toBe(false)
  })
})

describe('computeBalances — saldo live dari jurnal posted', () => {
  it('menghitung saldo seed: Kas 84jt, Pendapatan 155jt (BR-6/BR-7)', () => {
    const b = bal()
    expect(b.get('1-1100')).toBe(84_000_000) // 60 + 25 - 10 - 3 + 12 (JNL-004 v2)
    expect(b.get('4-1000')).toBe(155_000_000) // 130 + 25
    expect(b.get('5-2000')).toBe(18_000_000) // 8 base + 10 (JNL-002 posted)
  })

  it('draft dan reversed tidak ikut dihitung', () => {
    const b = bal()
    // 5-3000: base 3jt + JNL-003 posted 3jt = 6jt.
    // JNL-006 (5jt) & JNL-007 (2,5jt) draft serta JNL-008 reversed TIDAK menambah
    // (kalau ikut dihitung akan jadi 11,5jt).
    expect(b.get('5-3000')).toBe(6_000_000)
  })
})

describe('login — POST /auth/login (bukan auto-login demo)', () => {
  it('berhasil: token + akun + jurnal dimuat, status online', async () => {
    mockedApi.login.mockResolvedValue({ accessToken: 'mock.user-001.1', refreshToken: 'x', expiresIn: 86400, user: demoUser, activePeriod: { id: '2026-03', name: 'Maret 2026', isOpen: true } } as any)
    mockedApi.getAccounts.mockResolvedValue({ accounts: mockAccounts })
    mockedApi.getJournals.mockResolvedValue({ journals: mockJournals, totals: { debit: 0, credit: 0, difference: 0 } })

    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')

    const s = useStore.getState()
    expect(mockedApi.login).toHaveBeenCalledWith({ email: 'rina@estetikakreasi.co.id', password: 'password123' })
    expect(s.accessToken).toBe('mock.user-001.1')
    expect(s.refreshToken).toBe('x')
    expect(s.apiStatus).toBe('online')
    expect(s.user?.name).toBe('Rina')
    expect(s.accounts).toEqual(mockAccounts)
    expect(s.journals).toHaveLength(mockJournals.length)
    expect(s.authError).toBeNull()
    expect(s.lastSyncedAt).toBeTruthy() // sinkron berhasil tercatat
  })

  it('login memuat status periode (isOpen) — UI tahu periode mana yang tertutup', async () => {
    mockedApi.login.mockResolvedValue({ accessToken: 'mock.user-001.1', refreshToken: 'x', expiresIn: 86400, user: demoUser, activePeriod: { id: '2026-03', name: 'Maret 2026', isOpen: true } } as any)
    mockedApi.getAccounts.mockResolvedValue({ accounts: mockAccounts })
    mockedApi.getJournals.mockResolvedValue({ journals: mockJournals, totals: { debit: 0, credit: 0, difference: 0 } })
    mockedApi.getPeriods.mockResolvedValue({
      periods: [
        { id: 'fp-2026-01', name: 'Januari 2026', month: 1, year: 2026, startDate: '2026-01-01', endDate: '2026-01-31', isOpen: false, isActive: false, closedAt: '2026-02-01T00:00:00Z' },
        { id: 'fp-2026-02', name: 'Februari 2026', month: 2, year: 2026, startDate: '2026-02-01', endDate: '2026-02-28', isOpen: false, isActive: false, closedAt: '2026-03-01T00:00:00Z' },
        { id: 'fp-2026-03', name: 'Maret 2026', month: 3, year: 2026, startDate: '2026-03-01', endDate: '2026-03-31', isOpen: true, isActive: true, closedAt: null },
      ],
    })

    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')

    const s = useStore.getState()
    expect(s.periods).toHaveLength(3)
    expect(s.periods.find((p) => p.id === 'fp-2026-01')?.isOpen).toBe(false)
    expect(s.periods.find((p) => p.id === 'fp-2026-03')?.isOpen).toBe(true)
  })

  it('setAuth dipanggil dengan entitas aktif → X-Entity-Id terkirim SEJAK login (bukan menunggu ganti entitas)', async () => {
    const setAuthSpy = vi.spyOn(clientApi, 'setAuth')
    useStore.setState({ activeEntityId: 'ent-001' })
    mockedApi.login.mockResolvedValue({ accessToken: 'mock.user-001.1', refreshToken: 'x', expiresIn: 86400, user: demoUser, activePeriod: { id: '2026-03', name: 'Maret 2026', isOpen: true } } as any)
    mockedApi.getAccounts.mockResolvedValue({ accounts: mockAccounts })
    mockedApi.getJournals.mockResolvedValue({ journals: mockJournals, totals: { debit: 0, credit: 0, difference: 0 } })

    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')

    // login → client entityId = entitas aktif → semua request berikutnya membawa
    // X-Entity-Id: ent-001 (tanpa kebocoran/null header dari sesi sebelumnya)
    expect(setAuthSpy).toHaveBeenCalledWith('mock.user-001.1', 'ent-001', 'x')
    setAuthSpy.mockRestore()
  })

  it('kredensial salah (401) → authError, TIDAK masuk & TIDAK auto-login demo', async () => {
    mockedApi.login.mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'Email atau password salah'))

    await useStore.getState().login('rina@estetikakreasi.co.id', 'salah')

    const s = useStore.getState()
    expect(s.accessToken).toBeNull()
    expect(s.apiStatus).toBe('idle')
    expect(s.authError).toContain('Email atau password salah')
  })

  it('server mati (network error) → authError offline, tidak masuk', async () => {
    mockedApi.login.mockRejectedValue(new TypeError('fetch failed'))

    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')

    const s = useStore.getState()
    expect(s.accessToken).toBeNull()
    expect(s.authError).toContain('tidak terhubung')
  })
})

describe('loginOffline — masuk dengan data demo lokal (tanpa server)', () => {
  it('mengaktifkan sesi lokal tanpa token API', () => {
    useStore.getState().loginOffline()
    const s = useStore.getState()
    expect(s.accessToken).toBe('local.demo')
    expect(s.apiStatus).toBe('offline')
    expect(s.journals).toEqual(mockJournals)
    expect(s.lastSyncedAt).toBeNull() // data demo — belum pernah tersinkron
  })
})

describe('pollConnection — polling koneksi berkala (GET /health tiap 10 detik)', () => {
  it('saat offline + server hidup → init({ silent: true }) otomatis, banner hilang tanpa klik', async () => {
    useStore.getState().loginOffline() // apiStatus offline, token local.demo
    mockedApi.health.mockResolvedValue({ status: 'ok', time: new Date().toISOString(), journals: 8, accounts: 30 })
    // init → auto-login demo + fetch akun/jurnal
    mockedApi.login.mockResolvedValue({ accessToken: 'mock.user-001.9', refreshToken: 'rt-9', expiresIn: 86400, user: demoUser, activePeriod: { id: '2026-03', name: 'Maret 2026', isOpen: true } } as any)
    mockedApi.getAccounts.mockResolvedValue({ accounts: mockAccounts })
    mockedApi.getJournals.mockResolvedValue({ journals: mockJournals, totals: { debit: 0, credit: 0, difference: 0 } })

    await useStore.getState().pollConnection()

    expect(mockedApi.health).toHaveBeenCalledTimes(1)
    // Reconnect otomatis TANPA klik "Coba lagi"
    expect(useStore.getState().apiStatus).toBe('online')
    expect(useStore.getState().accessToken).toBe('mock.user-001.9')
    // silent → tanpa toast sukses reconnect (poll otomatis, bukan aksi user)
    expect(useStore.getState().toast?.message).not.toContain('tersambung')
  })

  it('saat offline + server masih mati → tetap offline, init TIDAK dipanggil', async () => {
    useStore.getState().loginOffline()
    // Default: health reject TypeError (server mati)

    await useStore.getState().pollConnection()

    expect(useStore.getState().apiStatus).toBe('offline')
    expect(useStore.getState().accessToken).toBe('local.demo')
    expect(mockedApi.login).not.toHaveBeenCalled() // tidak ada percobaan reconnect sia-sia
    // Polling senyap — TANPA toast error baru; toast yang ada berasal dari
    // loginOffline() sebelumnya ("Masuk offline …"), bukan dari poll.
    expect(useStore.getState().toast?.kind).toBe('error')
    expect(useStore.getState().toast?.message).toContain('Masuk offline')
  })

  it('saat online → no-op (health TIDAK dipanggil, tidak mengganggu sesi)', async () => {
    useStore.setState({ apiStatus: 'online', accessToken: 'mock.user-001.1' })

    await useStore.getState().pollConnection()

    expect(mockedApi.health).not.toHaveBeenCalled()
    expect(useStore.getState().apiStatus).toBe('online')
    expect(useStore.getState().accessToken).toBe('mock.user-001.1')
  })
})

describe('init — reconnect sesi offline (accessToken local.demo) via "Coba lagi"', () => {
  it('auto-login demo dulu (bukan menunggu 401) → online + token/user baru', async () => {
    useStore.getState().loginOffline() // sesi offline tanpa sesi server
    expect(useStore.getState().accessToken).toBe('local.demo')

    mockedApi.login.mockResolvedValue({ accessToken: 'mock.user-001.2', refreshToken: 'rt-2', expiresIn: 86400, user: demoUser, activePeriod: { id: '2026-03', name: 'Maret 2026', isOpen: true } } as any)
    mockedApi.getAccounts.mockResolvedValue({ accounts: mockAccounts })
    mockedApi.getJournals.mockResolvedValue({ journals: mockJournals, totals: { debit: 0, credit: 0, difference: 0 } })

    await useStore.getState().init()

    const s = useStore.getState()
    // Login demo dijalankan otomatis saat reconnect, bukan menunggu 401
    expect(mockedApi.login).toHaveBeenCalledWith({ email: 'rina@estetikakreasi.co.id', password: 'password123' })
    expect(s.apiStatus).toBe('online')
    expect(s.accessToken).toBe('mock.user-001.2')
    expect(s.refreshToken).toBe('rt-2')
    expect(s.user?.name).toBe('Rina')
    expect(s.journals).toHaveLength(mockJournals.length)
    expect(s.lastSyncedAt).toBeTruthy()
    // Toast sukses reconnect (non-silent — aksi user via tombol "Coba lagi")
    expect(s.toast?.kind).toBe('success')
    expect(s.toast?.message).toContain('tersambung')
  })

  it('server masih mati → tetap offline, sesi local.demo tidak terganggu', async () => {
    useStore.getState().loginOffline()
    // Default beforeEach: api.login & getAccounts/getJournals reject TypeError

    await useStore.getState().init()

    const s = useStore.getState()
    expect(s.apiStatus).toBe('offline')
    expect(s.accessToken).toBe('local.demo')
    expect(s.toast?.kind).toBe('error')
  })

  it('percobaan otomatis (silent) berhasil tanpa toast sukses', async () => {
    useStore.getState().loginOffline()
    mockedApi.login.mockResolvedValue({ accessToken: 'mock.user-001.3', refreshToken: 'rt-3', expiresIn: 86400, user: demoUser, activePeriod: { id: '2026-03', name: 'Maret 2026', isOpen: true } } as any)
    mockedApi.getAccounts.mockResolvedValue({ accounts: mockAccounts })
    mockedApi.getJournals.mockResolvedValue({ journals: mockJournals, totals: { debit: 0, credit: 0, difference: 0 } })

    await useStore.getState().init({ silent: true })

    expect(useStore.getState().apiStatus).toBe('online')
    // silent → TANPA toast sukses reconnect (toast "Masuk offline" dari
    // loginOffline boleh tetap ada, tapi tidak ada toast sukses baru)
    expect(useStore.getState().toast?.message).not.toContain('tersambung')
  })
})

describe('logout — kembali ke halaman login', () => {
  it('menghapus token & user, reset ke seed', async () => {
    // Masuk dulu (offline), lalu keluar
    useStore.getState().loginOffline()
    expect(useStore.getState().accessToken).toBe('local.demo')

    useStore.getState().logout()

    const s = useStore.getState()
    expect(s.accessToken).toBeNull()
    expect(s.refreshToken).toBeNull()
    expect(s.user).toBeNull()
    expect(s.journals).toEqual(mockJournals)
    expect(s.apiStatus).toBe('idle')
    expect(s.lastSyncedAt).toBeNull() // sesi dibersihkan
    expect(s.lastRefreshedAt).toBeNull() // riwayat refresh sesi lama dibersihkan
    // Toast logout di-set di store — tampil di halaman login karena <Toast />
    // dirender di level paling luar App (bukan di dalam branch utama).
    expect(s.toast?.kind).toBe('success')
    expect(s.toast?.message).toContain('keluar')
  })

  it('logout memanggil POST /auth/logout dengan refresh token (best-effort)', () => {
    useStore.setState({ accessToken: 'mock.t', refreshToken: 'r1' })
    useStore.getState().logout()
    expect(mockedApi.logout).toHaveBeenCalledWith('r1')
  })

  it('memanggil POST /auth/logout DAN membersihkan state sesi lengkap (accessToken, refreshToken, user, apiStatus, entityId)', () => {
    const setAuthSpy = vi.spyOn(clientApi, 'setAuth')
    // Sesi penuh: user terautentikasi, terhubung online, pernah sinkron & refresh
    useStore.setState({
      accessToken: 'mock.user-001.1',
      refreshToken: 'r1',
      user: demoUser,
      apiStatus: 'online',
      activeEntityId: 'ent-002',
      lastSyncedAt: '2026-03-25T08:00:00Z',
      lastRefreshedAt: '2026-03-25T08:05:00Z',
    })

    useStore.getState().logout()

    // 1) Lapisan API: refresh token dikirim → api.logout = POST /auth/logout
    expect(mockedApi.logout).toHaveBeenCalledTimes(1)
    expect(mockedApi.logout).toHaveBeenCalledWith('r1')

    // 1b) Client layer: setAuth(null, null, null) → entityId API-layer ikut
    //     dibersihkan — request tenant berikutnya TIDAK membawa X-Entity-Id
    //     ent-002 yang basi (kebocoran lintas tenant)
    expect(setAuthSpy).toHaveBeenCalledWith(null, null, null)

    // 2) State sesi dibersihkan lengkap — tidak ada sisa sesi yang bocor
    const s = useStore.getState()
    expect(s.accessToken).toBeNull()
    expect(s.refreshToken).toBeNull()
    expect(s.user).toBeNull()
    expect(s.apiStatus).toBe('idle')
    expect(s.activeEntityId).toBe('ent-001')
    expect(s.lastSyncedAt).toBeNull()
    expect(s.lastRefreshedAt).toBeNull()
    setAuthSpy.mockRestore()
  })
})

describe('closePeriod — tutup periode fiskal', () => {
  it('sukses: closePeriod dipanggil, jurnal di-refetch (draft ter-post dari server), toast handledDrafts', async () => {
    useStore.setState({ apiStatus: 'online', user: demoUser })
    mockedApi.closePeriod.mockResolvedValue({ id: 'fp-2026-03', isOpen: false, handledDrafts: { posted: 2, deleted: 0, kept: 0 } })
    // Server kini mengembalikan kedua draft seed sebagai posted
    const postedJournals = mockJournals.map((j) =>
      j.id === 'JNL-2026-03-006' || j.id === 'JNL-2026-03-007' ? { ...j, status: 'posted' as const } : j,
    )
    mockedApi.getJournals.mockResolvedValue({ journals: postedJournals, totals: { debit: 0, credit: 0, difference: 0 } })

    await useStore.getState().closePeriod('fp-2026-03')

    expect(mockedApi.closePeriod).toHaveBeenCalledWith('fp-2026-03', undefined)
    const s = useStore.getState()
    expect(s.journals.find((j) => j.id === 'JNL-2026-03-006')?.status).toBe('posted')
    expect(s.toast?.kind).toBe('success')
    expect(s.toast?.message).toContain('2 draft diposting')
    expect(s.lastSyncedAt).toBeTruthy()
  })

  it('sukses: periode ditandai isOpen=false di state → UI bisa tampilkan "tertutup" tanpa refetch', async () => {
    useStore.setState({ apiStatus: 'online', periods: [{ id: 'fp-2026-03', name: 'Maret 2026', month: 3, year: 2026, startDate: '2026-03-01', endDate: '2026-03-31', isOpen: true, isActive: true, closedAt: null }] })
    mockedApi.closePeriod.mockResolvedValue({ id: 'fp-2026-03', isOpen: false, handledDrafts: { posted: 0, deleted: 0, kept: 0 } })
    mockedApi.getJournals.mockResolvedValue({ journals: mockJournals, totals: { debit: 0, credit: 0, difference: 0 } })

    await useStore.getState().closePeriod('fp-2026-03')

    const p = useStore.getState().periods.find((x) => x.id === 'fp-2026-03')
    expect(p?.isOpen).toBe(false)
  })

  it('dengan draftAction → confirmDraftAction ikut dikirim ke server', async () => {
    useStore.setState({ apiStatus: 'online' })
    mockedApi.closePeriod.mockResolvedValue({ id: 'fp-2026-03', isOpen: false, handledDrafts: { posted: 0, deleted: 0, kept: 2 } })
    mockedApi.getJournals.mockResolvedValue({ journals: mockJournals, totals: { debit: 0, credit: 0, difference: 0 } })

    await useStore.getState().closePeriod('fp-2026-03', 'keep')

    expect(mockedApi.closePeriod).toHaveBeenCalledWith('fp-2026-03', 'keep')
  })

  it('DRAFT_ACTION_REQUIRED (ada draft, tanpa aksi) → error dilempar ke UI, state tidak berubah', async () => {
    useStore.setState({ apiStatus: 'online' })
    mockedApi.closePeriod.mockRejectedValue(new ApiError(422, 'DRAFT_ACTION_REQUIRED', 'Masih ada jurnal draft; pilih aksi terlebih dahulu'))

    await expect(useStore.getState().closePeriod('fp-2026-03')).rejects.toMatchObject({ code: 'DRAFT_ACTION_REQUIRED' })
    const s = useStore.getState()
    expect(s.apiStatus).toBe('online')
    expect(s.toast?.kind).not.toBe('success')
  })

  it('jaringan putus → status offline + toast error (tanpa throw)', async () => {
    useStore.setState({ apiStatus: 'online' })
    // beforeEach: closePeriod reject TypeError (network)

    await useStore.getState().closePeriod('fp-2026-03', 'post-all')

    const s = useStore.getState()
    expect(s.apiStatus).toBe('offline')
    expect(s.toast?.kind).toBe('error')
    expect(s.toast?.message).toContain('tidak terhubung')
  })
})

describe('setActiveEntity — ganti entitas aktif (multi-tenant)', () => {
  it('online: ganti entitas → refetch akun+jurnal, data entitas BARU menggantikan (tidak tercampur)', async () => {
    useStore.setState({ apiStatus: 'online', user: demoUser, accessToken: 'mock.user-001.1', refreshToken: 'r1', activeEntityId: 'ent-001' })
    // Server mengembalikan data entitas 2 yang jelas berbeda (nama akun + deskripsi jurnal)
    const ent2Journals = mockJournals.map((j) => ({ ...j, description: `${j.description} [ent-002]` }))
    mockedApi.getAccounts.mockResolvedValue({ accounts: mockAccounts.map((a) => ({ ...a, name: `${a.name} E2` })) })
    mockedApi.getJournals.mockResolvedValue({ journals: ent2Journals, totals: { debit: 0, credit: 0, difference: 0 } })

    await useStore.getState().setActiveEntity('ent-002')

    const s = useStore.getState()
    expect(s.activeEntityId).toBe('ent-002')
    expect(mockedApi.getAccounts).toHaveBeenCalledTimes(1)
    expect(mockedApi.getJournals).toHaveBeenCalledTimes(1)
    // Isolasi: seluruh data store kini milik entitas 2 — jurnal entitas 1 tidak bocor
    expect(s.journals).toHaveLength(ent2Journals.length)
    expect(s.journals[0].description).toContain('[ent-002]')
    expect(s.accounts[0].name).toContain('E2')
  })

  it('setAuth dipanggil dengan entity baru → header X-Entity-Id berubah untuk request berikutnya', async () => {
    const setAuthSpy = vi.spyOn(clientApi, 'setAuth')
    useStore.setState({ apiStatus: 'online', accessToken: 'mock.user-001.1', refreshToken: 'r1', activeEntityId: 'ent-001' })
    mockedApi.getAccounts.mockResolvedValue({ accounts: mockAccounts })
    mockedApi.getJournals.mockResolvedValue({ journals: mockJournals, totals: { debit: 0, credit: 0, difference: 0 } })

    await useStore.getState().setActiveEntity('ent-002')

    expect(setAuthSpy).toHaveBeenCalledWith('mock.user-001.1', 'ent-002', 'r1')
    setAuthSpy.mockRestore()
  })

  it('entitas yang sama → no-op (tidak refetch, tidak setAuth)', async () => {
    const setAuthSpy = vi.spyOn(clientApi, 'setAuth')
    useStore.setState({ apiStatus: 'online', activeEntityId: 'ent-001' })

    await useStore.getState().setActiveEntity('ent-001')

    expect(mockedApi.getAccounts).not.toHaveBeenCalled()
    expect(mockedApi.getJournals).not.toHaveBeenCalled()
    expect(setAuthSpy).not.toHaveBeenCalled()
    setAuthSpy.mockRestore()
  })

  it('offline: hanya ganti penanda entitas — TIDAK refetch, data demo lokal tetap', async () => {
    useStore.setState({ apiStatus: 'offline', accessToken: 'local.demo', activeEntityId: 'ent-001' })

    await useStore.getState().setActiveEntity('ent-002')

    const s = useStore.getState()
    expect(s.activeEntityId).toBe('ent-002')
    expect(mockedApi.getAccounts).not.toHaveBeenCalled()
    expect(mockedApi.getJournals).not.toHaveBeenCalled()
    expect(s.journals).toEqual(mockJournals)
  })

  it('fetch gagal saat online → entitas tetap terganti, status offline', async () => {
    useStore.setState({ apiStatus: 'online', activeEntityId: 'ent-001' })
    // beforeEach: getAccounts/getJournals reject TypeError (network)

    await useStore.getState().setActiveEntity('ent-002')

    const s = useStore.getState()
    expect(s.activeEntityId).toBe('ent-002')
    expect(s.apiStatus).toBe('offline')
  })

  it('entityRefetching: true SELAMA refetch (indikator skeleton), false setelah selesai', async () => {
    useStore.setState({ apiStatus: 'online', activeEntityId: 'ent-001', entityRefetching: false })
    // Deferred promises: refetch tertahan → flag harus tetap true selama menunggu
    let resolveAcc!: (v: { accounts: typeof mockAccounts }) => void
    let resolveJrn!: (v: { journals: typeof mockJournals; totals: { debit: number; credit: number; difference: number } }) => void
    mockedApi.getAccounts.mockReturnValue(new Promise((r) => { resolveAcc = r }) as any)
    mockedApi.getJournals.mockReturnValue(new Promise((r) => { resolveJrn = r }) as any)

    const p = useStore.getState().setActiveEntity('ent-002')
    expect(useStore.getState().entityRefetching).toBe(true)

    resolveAcc({ accounts: mockAccounts })
    resolveJrn({ journals: mockJournals, totals: { debit: 0, credit: 0, difference: 0 } })
    await p

    expect(useStore.getState().entityRefetching).toBe(false)
    expect(useStore.getState().activeEntityId).toBe('ent-002')
  })

  it('entityRefetching tetap false saat offline (tidak ada refetch → tidak ada skeleton)', async () => {
    useStore.setState({ apiStatus: 'offline', activeEntityId: 'ent-001', entityRefetching: false })

    await useStore.getState().setActiveEntity('ent-002')

    expect(useStore.getState().entityRefetching).toBe(false)
    expect(mockedApi.getAccounts).not.toHaveBeenCalled()
  })
})

describe('openSearchResult — fokus hasil global search', () => {
  it('hasil jurnal → pindah ke halaman Jurnal + focusJournalId di-set', () => {
    useStore.getState().openSearchResult('journal', 'JNL-2026-03-005')
    const s = useStore.getState()
    expect(s.page).toBe('journal')
    expect(s.focusJournalId).toBe('JNL-2026-03-005')
    expect(s.focusAccountId).toBeNull()
  })

  it('hasil akun → pindah ke Buku Besar + focusAccountId di-set', () => {
    useStore.getState().openSearchResult('account', '4-1000')
    const s = useStore.getState()
    expect(s.page).toBe('buku-besar')
    expect(s.focusAccountId).toBe('4-1000')
    expect(s.focusJournalId).toBeNull()
  })

  it('hasil laporan (report) → pindah ke halaman laporan tanpa focus akun/jurnal', () => {
    useStore.getState().openSearchResult('report', 'arus-kas')
    const s = useStore.getState()
    expect(s.page).toBe('arus-kas')
    expect(s.focusAccountId).toBeNull()
    expect(s.focusJournalId).toBeNull()

    useStore.getState().openSearchResult('report', 'neraca-lajur')
    expect(useStore.getState().page).toBe('neraca-lajur')
  })

  it('hasil halaman (page) → pindah ke halaman tsb (menu navigasi bisa dicari)', () => {
    useStore.getState().openSearchResult('page', 'dashboard')
    expect(useStore.getState().page).toBe('dashboard')

    useStore.getState().openSearchResult('page', 'pengaturan')
    expect(useStore.getState().page).toBe('pengaturan')
    expect(useStore.getState().focusJournalId).toBeNull()
    expect(useStore.getState().focusAccountId).toBeNull()
  })

  it('clearSearchFocus mengosongkan kedua fokus (transient — tidak persist)', () => {
    useStore.getState().openSearchResult('journal', 'JNL-2026-03-005')
    useStore.getState().clearSearchFocus()
    const s = useStore.getState()
    expect(s.focusJournalId).toBeNull()
    expect(s.focusAccountId).toBeNull()
  })

  it('logout membersihkan fokus search', () => {
    useStore.setState({ accessToken: 'mock.t', refreshToken: 'r1' })
    useStore.getState().openSearchResult('account', '4-1000')
    useStore.getState().logout()
    const s = useStore.getState()
    expect(s.focusJournalId).toBeNull()
    expect(s.focusAccountId).toBeNull()
  })
})

describe('handleSessionExpired — refresh gagal → logout otomatis + modal "Sesi berakhir"', () => {
  it('menghapus token & user, mengisi authError DAN membuka modal sessionExpired', () => {
    useStore.setState({ accessToken: 'mock.t', refreshToken: 'r1', user: demoUser, apiStatus: 'online' })
    useStore.getState().handleSessionExpired()

    const s = useStore.getState()
    expect(s.accessToken).toBeNull()
    expect(s.refreshToken).toBeNull()
    expect(s.user).toBeNull()
    // Konsisten dengan logout: status kembali idle, bukan offline/connecting
    expect(s.apiStatus).toBe('idle')
    expect(s.authError).toContain('Sesi berakhir')
    // Modal "Sesi berakhir" terbuka — user tahu kenapa dilempar ke login
    expect(s.sessionExpired).toBe(true)
    // Toast konsisten dengan logout ('Anda telah keluar'): user dapat umpan
    // balik eksplisit sesi berakhir, bukan cuma halaman login yang kosong
    expect(s.toast?.kind).toBe('error')
    expect(s.toast?.message).toContain('Sesi berakhir')
  })

  it('dismissSessionExpired menutup modal (user siap login lagi)', () => {
    useStore.getState().handleSessionExpired()
    expect(useStore.getState().sessionExpired).toBe(true)

    useStore.getState().dismissSessionExpired()

    expect(useStore.getState().sessionExpired).toBe(false)
  })

  it('me-reset activeEntityId & entities ke default (tanpa kebocoran tenant ke user berikutnya)', () => {
    // User sebelumnya pindah ke entitas kedua (ent-002)
    useStore.setState({ activeEntityId: 'ent-002', entities: [{ id: 'ent-002', name: 'PT Lain', code: 'KI-002', isActive: true }] })
    useStore.getState().handleSessionExpired()

    const s = useStore.getState()
    // Sesi berakhir → pilihan entitas dikembalikan ke default (mirror logout),
    // sehingga login berikutnya tidak mewarisi tenant user sebelumnya.
    expect(s.activeEntityId).toBe('ent-001')
    expect(s.entities).toEqual([{ id: 'ent-001', name: 'PT. Kreasi Inovasi Estetika', code: 'KI-001', isActive: true }])
  })

  it('login baru & logout me-reset sessionExpired (modal tidak menempel)', async () => {
    useStore.getState().handleSessionExpired()
    expect(useStore.getState().sessionExpired).toBe(true)

    // Logout saat modal terbuka → modal tertutup
    useStore.getState().logout()
    expect(useStore.getState().sessionExpired).toBe(false)

    // Login baru setelah sesi berakhir → modal tertutup
    useStore.getState().handleSessionExpired()
    expect(useStore.getState().sessionExpired).toBe(true)
    mockedApi.login.mockResolvedValue({ accessToken: 'mock.user-001.1', refreshToken: 'x', expiresIn: 86400, user: demoUser, activePeriod: { id: '2026-03', name: 'Maret 2026', isOpen: true } } as any)
    mockedApi.getAccounts.mockResolvedValue({ accounts: mockAccounts })
    mockedApi.getJournals.mockResolvedValue({ journals: mockJournals, totals: { debit: 0, credit: 0, difference: 0 } })
    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')
    expect(useStore.getState().sessionExpired).toBe(false)
  })

  it('ganti entitas lalu logout → entity lama tidak bocor (store reset + setAuth(null,null,null) bersihkan X-Entity-Id)', async () => {
    const setAuthSpy = vi.spyOn(clientApi, 'setAuth')
    useStore.setState({ apiStatus: 'online', user: demoUser, accessToken: 'mock.user-001.1', refreshToken: 'r1', activeEntityId: 'ent-001' })
    mockedApi.getAccounts.mockResolvedValue({ accounts: mockAccounts })
    mockedApi.getJournals.mockResolvedValue({ journals: mockJournals, totals: { debit: 0, credit: 0, difference: 0 } })

    // User berpindah ke entitas kedua → store & client sama-sama memegang ent-002
    await useStore.getState().setActiveEntity('ent-002')
    expect(useStore.getState().activeEntityId).toBe('ent-002')
    expect(setAuthSpy).toHaveBeenLastCalledWith('mock.user-001.1', 'ent-002', 'r1')

    // Logout → tidak ada jejak entitas lama, baik di store MAUPUN client layer
    useStore.getState().logout()
    const s = useStore.getState()
    expect(s.activeEntityId).toBe('ent-001')
    expect(s.entities).toEqual([{ id: 'ent-001', name: 'PT. Kreasi Inovasi Estetika', code: 'KI-001', isActive: true }])
    // setAuth(null, null, null): entityId API-layer dibersihkan → request tenant
    // berikutnya TIDAK membawa X-Entity-Id ent-002 yang basi (kebocoran lintas tenant)
    expect(setAuthSpy).toHaveBeenLastCalledWith(null, null, null)
    setAuthSpy.mockRestore()
  })
})

describe('saveJournal — simpan draft / posting (path lokal)', () => {
  const input = {
    date: '2026-03-25',
    transactionNumber: 'BKM-2026-03-0009',
    description: 'Penerimaan jasa PT Test',
    lines: [
      { accountId: '1-1100', debit: 10_000_000, credit: 0, description: 'Tunai' },
      { accountId: '4-1000', debit: 0, credit: 10_000_000, description: 'Pendapatan' },
    ],
  }

  it('action=draft menyimpan status draft tanpa postedAt', async () => {
    await useStore.getState().saveJournal(input, 'draft')
    const j = useStore.getState().journals[0]
    expect(j.status).toBe('draft')
    expect(j.postedAt).toBeUndefined()
    expect(j.transactionNumber).toBe('BKM-2026-03-0009')
    expect(useStore.getState().journals).toHaveLength(mockJournals.length + 1)
  })

  it('action=post menyimpan status posted + postedAt', async () => {
    await useStore.getState().saveJournal(input, 'post')
    const j = useStore.getState().journals[0]
    expect(j.status).toBe('posted')
    expect(j.postedAt).toBeDefined()
  })

  it('jurnal posted langsung mengubah saldo (+10jt)', async () => {
    await useStore.getState().saveJournal(input, 'post')
    const b = bal()
    expect(b.get('1-1100')).toBe(94_000_000) // 84 + 10
    expect(b.get('4-1000')).toBe(165_000_000) // 155 + 10
  })

  it('jurnal draft TIDAK mengubah saldo', async () => {
    await useStore.getState().saveJournal(input, 'draft')
    const b = bal()
    expect(b.get('1-1100')).toBe(84_000_000)
  })
})

describe('saveJournal — path online (via API)', () => {
  const input = {
    date: '2026-03-25',
    transactionNumber: 'BKM-2026-03-0009',
    description: 'Penerimaan jasa PT Test',
    lines: [
      { accountId: '1-1100', debit: 10_000_000, credit: 0, description: 'Tunai' },
      { accountId: '4-1000', debit: 0, credit: 10_000_000, description: 'Pendapatan' },
    ],
  }

  it('post: createJournal + postJournal dipanggil, store memakai respons API', async () => {
    useStore.setState({ apiStatus: 'online', user: demoUser })
    mockedApi.createJournal.mockResolvedValue(createdJournal)
    mockedApi.postJournal.mockResolvedValue({ id: createdJournal.id, status: 'posted', postedAt: '2026-03-25T08:01:00Z', affectedAccounts: [] })

    await useStore.getState().saveJournal(input, 'post')

    expect(mockedApi.createJournal).toHaveBeenCalledWith(expect.objectContaining({ transactionNumber: 'BKM-2026-03-0009' }))
    expect(mockedApi.postJournal).toHaveBeenCalledWith(createdJournal.id)
    const j = useStore.getState().journals[0]
    expect(j.id).toBe(createdJournal.id)
    expect(j.status).toBe('posted') // postJournal response diterapkan ke store
    expect(j.postedAt).toBe('2026-03-25T08:01:00Z')
    expect(useStore.getState().toast?.kind).toBe('success')
  })

  it('draft: hanya createJournal, tanpa postJournal', async () => {
    useStore.setState({ apiStatus: 'online', user: demoUser })
    mockedApi.createJournal.mockResolvedValue(createdJournal)

    await useStore.getState().saveJournal(input, 'draft')

    expect(mockedApi.createJournal).toHaveBeenCalledTimes(1)
    expect(mockedApi.postJournal).not.toHaveBeenCalled()
    expect(useStore.getState().journals[0].status).toBe('draft')
  })

  it('submit: createJournal dengan submitForApproval=true → status pending-approval langsung', async () => {
    useStore.setState({ apiStatus: 'online', user: demoUser })
    mockedApi.createJournal.mockResolvedValue({ ...createdJournal, status: 'pending-approval' })

    await useStore.getState().saveJournal(input, 'submit')

    expect(mockedApi.createJournal).toHaveBeenCalledWith(
      expect.objectContaining({ transactionNumber: 'BKM-2026-03-0009', submitForApproval: true }),
    )
    expect(mockedApi.postJournal).not.toHaveBeenCalled()
    const j = useStore.getState().journals[0]
    expect(j.status).toBe('pending-approval')
    expect(useStore.getState().toast?.message).toContain('diajukan untuk persetujuan')
  })

  it('server menolak (ApiError) → jurnal TIDAK disimpan lokal, toast error', async () => {
    useStore.setState({ apiStatus: 'online', user: demoUser })
    mockedApi.createJournal.mockRejectedValue(new ApiError(422, 'JOURNAL_UNBALANCED', 'Total debit dan kredit harus sama'))

    await useStore.getState().saveJournal(input, 'post')

    expect(useStore.getState().journals).toHaveLength(mockJournals.length)
    expect(useStore.getState().toast?.kind).toBe('error')
    expect(useStore.getState().toast?.message).toContain('Total debit')
  })

  it('jaringan putus di tengah sesi → fallback lokal + status offline', async () => {
    useStore.setState({ apiStatus: 'online', user: demoUser })
    mockedApi.createJournal.mockRejectedValue(new TypeError('fetch failed'))

    await useStore.getState().saveJournal(input, 'post')

    expect(useStore.getState().apiStatus).toBe('offline')
    expect(useStore.getState().journals).toHaveLength(mockJournals.length + 1)
  })
})

describe('postJournal — draft → posted', () => {
  it('memposting draft dan mencatat postedAt (path lokal)', async () => {
    const draftId = useStore.getState().journals[5].id // JNL-006 draft
    await useStore.getState().postJournal(draftId)
    const j = useStore.getState().journals.find((x) => x.id === draftId)!
    expect(j.status).toBe('posted')
    expect(j.postedAt).toBeDefined()
  })

  it('jurnal yang sudah posted tidak berubah', async () => {
    const postedId = useStore.getState().journals[0].id
    const before = useStore.getState().journals[0].postedAt
    await useStore.getState().postJournal(postedId)
    expect(useStore.getState().journals[0].postedAt).toBe(before)
  })

  it('path online memakai respons API (postedAt dari server)', async () => {
    useStore.setState({ apiStatus: 'online' })
    mockedApi.postJournal.mockResolvedValue({ id: 'JNL-2026-03-006', status: 'posted', postedAt: '2026-03-25T09:00:00Z', affectedAccounts: [] })

    await useStore.getState().postJournal('JNL-2026-03-006')

    expect(mockedApi.postJournal).toHaveBeenCalledWith('JNL-2026-03-006')
    const j = useStore.getState().journals.find((x) => x.id === 'JNL-2026-03-006')!
    expect(j.status).toBe('posted')
    expect(j.postedAt).toBe('2026-03-25T09:00:00Z')
  })
})

describe('approval workflow — submit/approve/reject', () => {
  it('submit: draft → pending-approval (path lokal)', async () => {
    await useStore.getState().submitJournal('JNL-2026-03-006')
    const j = useStore.getState().journals.find((x) => x.id === 'JNL-2026-03-006')!
    expect(j.status).toBe('pending-approval')
  })

  it('approve: pending-approval → posted, saldo live ikut berubah', async () => {
    useStore.setState({ apiStatus: 'online' })
    mockedApi.submitJournal.mockResolvedValue({ id: 'JNL-2026-03-006', status: 'pending-approval' })
    mockedApi.approveJournal.mockResolvedValue({ status: 'posted', approvedBy: 'user-001', approvedAt: '2026-03-25T10:00:00Z' })

    await useStore.getState().submitJournal('JNL-2026-03-006')
    expect(useStore.getState().journals.find((x) => x.id === 'JNL-2026-03-006')!.status).toBe('pending-approval')
    // Belum approve → saldo belum berubah (JNL-006 draft 5jt tidak dihitung)
    expect(bal().get('5-3000')).toBe(6_000_000)

    await useStore.getState().approveJournal('JNL-2026-03-006')
    const j = useStore.getState().journals.find((x) => x.id === 'JNL-2026-03-006')!
    expect(j.status).toBe('posted')
    expect(j.postedAt).toBe('2026-03-25T10:00:00Z')
    // Approve mem-post → efek 5jt masuk saldo
    expect(bal().get('5-3000')).toBe(11_000_000)
  })

  it('reject: pending-approval → draft, saldo tidak berubah', async () => {
    useStore.setState({ apiStatus: 'online' })
    mockedApi.submitJournal.mockResolvedValue({ id: 'JNL-2026-03-006', status: 'pending-approval' })
    mockedApi.rejectJournal.mockResolvedValue({ id: 'JNL-2026-03-006', status: 'draft', rejectionReason: 'Nominal tidak sesuai' })

    await useStore.getState().submitJournal('JNL-2026-03-006')
    await useStore.getState().rejectJournal('JNL-2026-03-006', 'Nominal tidak sesuai')

    expect(mockedApi.rejectJournal).toHaveBeenCalledWith('JNL-2026-03-006', 'Nominal tidak sesuai')
    const j = useStore.getState().journals.find((x) => x.id === 'JNL-2026-03-006')!
    expect(j.status).toBe('draft')
    expect(j.rejectionReason).toBe('Nominal tidak sesuai') // tersimpan dari respons API
    expect(bal().get('5-3000')).toBe(6_000_000) // tetap tidak dihitung
  })

  it('NO_APPROVAL_RIGHTS (403) dari server → toast pesan KHUSUS, bukan pesan API mentah/generik', async () => {
    useStore.setState({ apiStatus: 'online' })
    mockedApi.approveJournal.mockRejectedValue(new ApiError(403, 'NO_APPROVAL_RIGHTS', 'Role Anda tidak memiliki izin approve'))

    await useStore.getState().approveJournal('JNL-2026-03-012')

    const s = useStore.getState()
    expect(s.toast?.kind).toBe('error')
    // Pesan khusus: siapa yang berhak + langkah berikutnya (bukan e.message server)
    expect(s.toast?.message).toContain('Hanya Admin yang dapat menyetujui')
    expect(s.toast?.message).toContain('Hubungi admin')
    expect(s.toast?.message).not.toContain('Role Anda tidak memiliki izin approve')
    expect(s.toast?.message).not.toContain('Gagal approve jurnal')
    // Tidak ada jurnal yang berubah (server menolak sebelum mutasi)
    expect(s.journals).toHaveLength(mockJournals.length)
  })

  it('reject dengan NO_APPROVAL_RIGHTS → pesan khusus yang sama', async () => {
    useStore.setState({ apiStatus: 'online' })
    mockedApi.rejectJournal.mockRejectedValue(new ApiError(403, 'NO_APPROVAL_RIGHTS', 'Role Anda tidak memiliki izin approve'))

    await useStore.getState().rejectJournal('JNL-2026-03-012', 'alasan')

    const s = useStore.getState()
    expect(s.toast?.kind).toBe('error')
    expect(s.toast?.message).toContain('Hanya Admin yang dapat menyetujui')
    expect(s.toast?.message).toContain('Hubungi admin')
  })

  it('error approval lain (mis. INVALID_STATUS_TRANSITION) tetap memakai pesan API', async () => {
    useStore.setState({ apiStatus: 'online' })
    mockedApi.approveJournal.mockRejectedValue(new ApiError(409, 'INVALID_STATUS_TRANSITION', 'Hanya jurnal pending-approval yang dapat di-approve'))

    await useStore.getState().approveJournal('JNL-2026-03-006')

    expect(useStore.getState().toast?.kind).toBe('error')
    expect(useStore.getState().toast?.message).toContain('Hanya jurnal pending-approval')
  })

  it('gagal jaringan (offline) → fallback lokal tetap transisi status', async () => {
    useStore.setState({ apiStatus: 'online' })
    // Default mock: TypeError (fetch failed) → masuk path offline
    await useStore.getState().submitJournal('JNL-2026-03-006')
    expect(useStore.getState().apiStatus).toBe('offline')
    expect(useStore.getState().journals.find((x) => x.id === 'JNL-2026-03-006')!.status).toBe('pending-approval')

    await useStore.getState().approveJournal('JNL-2026-03-006')
    expect(useStore.getState().journals.find((x) => x.id === 'JNL-2026-03-006')!.status).toBe('posted')
  })
})

describe('reverseJournal — pembalikan otomatis', () => {
  it('membuat jurnal pembalik dengan debit/kredit ditukar dan original jadi reversed (path lokal)', async () => {
    await useStore.getState().reverseJournal('JNL-2026-03-001')
    const journals = useStore.getState().journals
    const reversal = journals[0]
    const original = journals.find((x) => x.id === 'JNL-2026-03-001')!

    expect(reversal.description).toContain('Pembalikan')
    expect(reversal.status).toBe('posted')
    expect(reversal.reversalOf).toBeDefined()
    expect(reversal.lines[0].debit).toBe(0)
    expect(reversal.lines[0].credit).toBe(25_000_000)
    expect(reversal.lines[1].debit).toBe(25_000_000)
    expect(reversal.lines[1].credit).toBe(0)

    expect(original.status).toBe('reversed')
    expect(original.reversalOf).toBe(reversal.transactionNumber)
  })

  it('pasangan asli + pembalik bernet 0 di saldo (tidak dobel-hitung)', async () => {
    await useStore.getState().reverseJournal('JNL-2026-03-001')
    const b = bal()
    expect(b.get('1-1100')).toBe(59_000_000) // 84 - 25 (efek BKM-0001 dibatalkan)
    expect(b.get('4-1000')).toBe(130_000_000) // 155 - 25
  })

  it('jurnal draft / non-posted tidak bisa di-reverse', async () => {
    await useStore.getState().reverseJournal('JNL-2026-03-006') // draft
    expect(useStore.getState().journals).toHaveLength(mockJournals.length)
  })

  it('path online memakai reversalJournal dari API', async () => {
    useStore.setState({ apiStatus: 'online', user: demoUser })
    mockedApi.reverseJournal.mockResolvedValue({
      reversedJournalId: 'JNL-2026-03-001',
      status: 'reversed',
      reversalJournal: { ...createdJournal, id: 'JNL-2026-03-010', transactionNumber: 'REV-BKM-2026-03-0001', description: 'Pembalikan: Penerimaan pembayaran jasa', status: 'posted', reversalOf: 'JNL-2026-03-001' },
    })

    await useStore.getState().reverseJournal('JNL-2026-03-001')

    expect(mockedApi.reverseJournal).toHaveBeenCalledWith('JNL-2026-03-001')
    const journals = useStore.getState().journals
    expect(journals[0].transactionNumber).toBe('REV-BKM-2026-03-0001')
    expect(journals.find((x) => x.id === 'JNL-2026-03-001')!.status).toBe('reversed')
  })
})

describe('resetDemoData — kembali ke seed awal', () => {
  beforeEach(() => {
    mockedApi.resetServerData.mockReset()
    mockedApi.resetServerData.mockResolvedValue({
      status: 'reset',
      seed: 'base',
      journals: 8,
      message: 'State di-reset ke seed awal (Maret 2026)',
    })
  })

  it('reset menghapus jurnal pengguna & kembali ke seed murni', async () => {
    // Tambah dulu 1 jurnal pengguna + ubah periode → lalu reset
    await useStore.getState().saveJournal(
      {
        date: '2026-03-25',
        transactionNumber: 'BKM-2026-03-0009',
        description: 'Penerimaan jasa PT Test',
        lines: [
          { accountId: '1-1100', debit: 10_000_000, credit: 0, description: 'Tunai' },
          { accountId: '4-1000', debit: 0, credit: 10_000_000, description: 'Pendapatan' },
        ],
      },
      'post',
    )
    useStore.setState({ activePeriod: '2026-02', page: 'journal' })
    expect(useStore.getState().journals).toHaveLength(mockJournals.length + 1)

    useStore.getState().resetDemoData()

    const s = useStore.getState()
    expect(s.journals).toEqual(mockJournals)
    expect(s.accounts).toEqual(mockAccounts)
    expect(s.activePeriod).toBe('2026-03')
    expect(s.page).toBe('dashboard')
    expect(s.toast?.kind).toBe('success')
    expect(s.toast?.message).toContain('di-reset')
  })

  it('reset tidak crash di lingkungan tanpa localStorage (storage null)', async () => {
    await expect(useStore.getState().resetDemoData()).resolves.toBeUndefined()
    expect(useStore.getState().journals).toEqual(mockJournals)
  })

  it('saat online: memanggil POST /admin/reset di server mock + reset lokal, toast menyebut server', async () => {
    useStore.setState({ apiStatus: 'online' })
    // Jurnal pengguna sebelum reset
    useStore.setState((s) => ({ journals: [...s.journals, { ...mockJournals[0], id: 'JNL-USER-1' }] }))

    await useStore.getState().resetDemoData()

    expect(mockedApi.resetServerData).toHaveBeenCalledTimes(1)
    const s = useStore.getState()
    expect(s.journals).toEqual(mockJournals)
    expect(s.toast?.kind).toBe('success')
    expect(s.toast?.message).toContain('server mock')
    expect(s.apiStatus).toBe('online')
  })

  it('saat online tapi reset server gagal (network): tetap reset lokal, status offline', async () => {
    useStore.setState({ apiStatus: 'online' })
    mockedApi.resetServerData.mockRejectedValue(new TypeError('Failed to fetch'))

    await useStore.getState().resetDemoData()

    const s = useStore.getState()
    expect(s.journals).toEqual(mockJournals)
    expect(s.apiStatus).toBe('offline')
    expect(s.toast?.kind).toBe('error')
    expect(s.toast?.message).toContain('tidak dapat dijangkau')
  })

  it('saat online tapi reset server gagal (ApiError non-network): reset lokal tetap jalan, status tetap online', async () => {
    useStore.setState({ apiStatus: 'online' })
    mockedApi.resetServerData.mockRejectedValue(new ApiError(500, 'INTERNAL', 'Gagal reset server'))

    await useStore.getState().resetDemoData()

    const s = useStore.getState()
    expect(s.journals).toEqual(mockJournals)
    expect(s.apiStatus).toBe('online')
    expect(s.toast?.kind).toBe('error')
    expect(s.toast?.message).toContain('tidak ikut ter-reset')
  })

  it('saat offline: tidak memanggil server, reset lokal saja', async () => {
    useStore.setState({ apiStatus: 'offline' })
    useStore.setState((s) => ({ journals: [...s.journals, { ...mockJournals[0], id: 'JNL-USER-2' }] }))

    await useStore.getState().resetDemoData()

    expect(mockedApi.resetServerData).not.toHaveBeenCalled()
    const s = useStore.getState()
    expect(s.journals).toEqual(mockJournals)
    expect(s.apiStatus).toBe('offline')
    expect(s.toast?.kind).toBe('success')
    expect(s.toast?.message).toContain('di-reset')
  })
})

describe('deleteJournal — hapus draft', () => {
  it('menghapus jurnal yang dimaksud saja (path lokal)', async () => {
    await useStore.getState().deleteJournal('JNL-2026-03-006')
    const journals = useStore.getState().journals
    expect(journals).toHaveLength(mockJournals.length - 1)
    expect(journals.find((x) => x.id === 'JNL-2026-03-006')).toBeUndefined()
    expect(journals.find((x) => x.id === 'JNL-2026-03-001')).toBeDefined()
  })

  it('path online memanggil DELETE API lalu menghapus dari store', async () => {
    useStore.setState({ apiStatus: 'online' })
    mockedApi.deleteJournal.mockResolvedValue(undefined)

    await useStore.getState().deleteJournal('JNL-2026-03-006')

    expect(mockedApi.deleteJournal).toHaveBeenCalledWith('JNL-2026-03-006')
    expect(useStore.getState().journals.find((x) => x.id === 'JNL-2026-03-006')).toBeUndefined()
  })
})
