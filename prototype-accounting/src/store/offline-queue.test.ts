import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockAccounts, mockJournals } from '../data/mock'
import { useStore } from './useStore'
import { CURRENT_VERSION, freshPersistedState, migratePersistedState } from './persist'

// Mock lapisan API — path online memakai modul ini (untuk uji flush).
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
      getDbConfig: vi.fn(),
      saveDbConfig: vi.fn(),
    },
  }
})

import { api, ApiError } from '../api'

const mockedApi = vi.mocked(api)

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
    offlineQueue: [],
    isSyncing: false,
    lastSyncedAt: null,
  })

const input = {
  date: '2026-03-25',
  transactionNumber: 'BKM-2026-03-0009',
  description: 'Penerimaan jasa PT Test',
  lines: [
    { accountId: '1-1100', debit: 10_000_000, credit: 0, description: 'Tunai' },
    { accountId: '4-1000', debit: 0, credit: 10_000_000, description: 'Pendapatan' },
  ],
}

const demoUser = { id: 'user-001', name: 'Rina', email: 'rina@estetikakreasi.co.id', role: 'admin' }

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
  mockedApi.getDbConfig.mockReset()
  mockedApi.saveDbConfig.mockReset()
  mockedApi.getDbConfig.mockResolvedValue({ host: 'localhost', port: '5432', database: 'accounting_db', password: '' } as never)
  mockedApi.saveDbConfig.mockResolvedValue({ host: 'localhost', port: '5432', database: 'accounting_db', password: '' } as never)
  // Default offline (network error) agar path antrian yang teruji
  mockedApi.login.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.logout.mockResolvedValue(undefined)
  mockedApi.getAccounts.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.getJournals.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.createJournal.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.postJournal.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.submitJournal.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.approveJournal.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.rejectJournal.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.reverseJournal.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.deleteJournal.mockRejectedValue(new TypeError('fetch failed'))
})

describe('antrian offline — operasi masuk antrian saat server mati', () => {
  it('saveJournal offline: diterapkan lokal + create op masuk antrian (draft)', async () => {
    await useStore.getState().saveJournal(input, 'draft')
    const s = useStore.getState()
    expect(s.journals).toHaveLength(mockJournals.length + 1)
    const op = s.offlineQueue[0]
    expect(op.kind).toBe('create')
    if (op.kind === 'create') {
      expect(op.action).toBe('draft')
      expect(op.localId).toBe(s.journals[0].id)
      expect(op.input.transactionNumber).toBe('BKM-2026-03-0009')
    }
  })

  it('saveJournal offline action=post: create op dengan action post', async () => {
    await useStore.getState().saveJournal(input, 'post')
    const op = useStore.getState().offlineQueue[0]
    expect(op.kind).toBe('create')
    if (op.kind === 'create') expect(op.action).toBe('post')
    // Efek lokal langsung terlihat (saldo berubah) walau offline
    expect(useStore.getState().journals[0].status).toBe('posted')
  })

  it('saveJournal offline action=submit: create op action submit, status pending-approval lokal', async () => {
    await useStore.getState().saveJournal(input, 'submit')
    const op = useStore.getState().offlineQueue[0]
    expect(op.kind).toBe('create')
    if (op.kind === 'create') expect(op.action).toBe('submit')
    // Efek lokal: langsung menunggu approval walau offline
    expect(useStore.getState().journals[0].status).toBe('pending-approval')
  })

  it('postJournal / reverse / delete / submit / approve / reject offline → op masuk antrian', async () => {
    const draftId = useStore.getState().journals[5].id
    await useStore.getState().postJournal(draftId)
    await useStore.getState().submitJournal(draftId)
    await useStore.getState().approveJournal(draftId)
    await useStore.getState().rejectJournal(draftId, 'cek ulang')
    await useStore.getState().reverseJournal('JNL-2026-03-001')
    await useStore.getState().deleteJournal(draftId)

    const kinds = useStore.getState().offlineQueue.map((o) => o.kind)
    expect(kinds).toEqual(['post', 'submit', 'approve', 'reject', 'reverse', 'delete'])
    const rejectOp = useStore.getState().offlineQueue[3]
    if (rejectOp.kind === 'reject') expect(rejectOp.reason).toBe('cek ulang')
  })

  it('antrian urut (FIFO) dan id unik per operasi', async () => {
    await useStore.getState().saveJournal(input, 'post')
    await useStore.getState().saveJournal({ ...input, transactionNumber: 'BKM-2026-03-0010' }, 'draft')
    const ids = useStore.getState().offlineQueue.map((o) => o.id)
    expect(new Set(ids).size).toBe(2)
    expect(useStore.getState().offlineQueue[1].kind).toBe('create')
  })
})

describe('flushOfflineQueue — replay ke API saat koneksi pulih', () => {
  it('create+post offline → createJournal + postJournal server, antrian kosong, id diganti id server', async () => {
    // Buat jurnal offline (draft), lalu posting offline → 2 operasi berantai
    await useStore.getState().saveJournal(input, 'draft')
    const localId = useStore.getState().journals[0].id
    await useStore.getState().postJournal(localId)
    expect(useStore.getState().offlineQueue).toHaveLength(2)

    // Koneksi pulih
    useStore.setState({ apiStatus: 'online', user: demoUser })
    const serverJournal: any = {
      id: 'JNL-2026-03-009',
      transactionNumber: 'BKM-2026-03-0009',
      date: '2026-03-25',
      description: 'Penerimaan jasa PT Test',
      lines: input.lines.map((l, i) => ({ id: `ln-${i}`, accountId: l.accountId, accountCode: l.accountId, accountName: 'x', debit: l.debit, credit: l.credit })),
      status: 'draft',
      createdBy: 'user-001',
      createdAt: '2026-03-25T08:00:00Z',
    }
    mockedApi.createJournal.mockResolvedValue(serverJournal)
    mockedApi.postJournal.mockResolvedValue({ id: serverJournal.id, status: 'posted', postedAt: '2026-03-25T08:01:00Z', affectedAccounts: [] })
    // Rekonsiliasi: server mengembalikan data lengkap (termasuk jurnal baru)
    const postedServer = { ...serverJournal, status: 'posted', postedAt: '2026-03-25T08:01:00Z' }
    mockedApi.getJournals.mockResolvedValue({ journals: [postedServer, ...mockJournals], totals: { debit: 0, credit: 0, difference: 0 } })
    mockedApi.getAccounts.mockResolvedValue({ accounts: mockAccounts })

    await useStore.getState().flushOfflineQueue()

    // create dipanggil dgn input asli; post memakai id server (ref remap)
    expect(mockedApi.createJournal).toHaveBeenCalledWith(expect.objectContaining({ transactionNumber: 'BKM-2026-03-0009' }))
    expect(mockedApi.postJournal).toHaveBeenCalledWith('JNL-2026-03-009')
    const s = useStore.getState()
    expect(s.offlineQueue).toHaveLength(0)
    expect(s.isSyncing).toBe(false)
    expect(s.journals[0].id).toBe('JNL-2026-03-009') // id server dari rekonsiliasi
    expect(s.journals[0].status).toBe('posted')
    expect(s.toast?.kind).toBe('success')
    expect(s.toast?.message).toContain('2 operasi offline')
  })

  it('flush terputus setelah create: ref sisa antrian di-remap ke id server', async () => {
    // Sesi offline: buat draft L1, lalu posting → [create(L1), post(ref=L1)]
    useStore.setState({ apiStatus: 'offline' })
    await useStore.getState().saveJournal(input, 'draft')
    const localId = useStore.getState().journals[0].id
    await useStore.getState().postJournal(localId)

    // Koneksi pulih → flush. create sukses (id server S1), tapi jaringan putus
    // saat post → post harus tetap di antrian dengan ref SUDAH di-remap ke S1.
    useStore.setState({ apiStatus: 'online' })
    const serverJournal: any = {
      id: 'JNL-2026-03-009',
      transactionNumber: 'BKM-2026-03-0009',
      date: '2026-03-25',
      description: 'Penerimaan jasa PT Test',
      lines: input.lines.map((l, i) => ({ id: `ln-${i}`, accountId: l.accountId, accountCode: l.accountId, accountName: 'x', debit: l.debit, credit: l.credit })),
      status: 'draft',
      createdBy: 'user-001',
      createdAt: '2026-03-25T08:00:00Z',
    }
    mockedApi.createJournal.mockResolvedValue(serverJournal)
    mockedApi.postJournal.mockRejectedValue(new TypeError('fetch failed')) // putus di sini
    mockedApi.getJournals.mockRejectedValue(new TypeError('fetch failed'))

    await useStore.getState().flushOfflineQueue()

    const s = useStore.getState()
    expect(s.apiStatus).toBe('offline')
    expect(s.offlineQueue).toHaveLength(1)
    const remaining = s.offlineQueue[0]
    if (remaining.kind === 'post') {
      expect(remaining.ref).toBe('JNL-2026-03-009') // ref id lokal → id server
    }
    // Store juga memakai id server untuk jurnal lokal itu
    expect(s.journals.find((j) => j.transactionNumber === 'BKM-2026-03-0009')?.id).toBe('JNL-2026-03-009')
  })

  it('operasi ditolak server (ApiError) → keluar dari antrian + toast error, sisanya tetap jalan', async () => {
    useStore.setState({ apiStatus: 'online', user: demoUser })
    // 2 operasi: post (gagal) lalu delete (sukses)
    useStore.getState().enqueueOffline({ id: 'op-1', kind: 'post', ref: 'JNL-2026-03-006' })
    useStore.getState().enqueueOffline({ id: 'op-2', kind: 'delete', ref: 'JNL-2026-03-007' })
    mockedApi.postJournal.mockRejectedValue(new ApiError(422, 'PERIOD_CLOSED', 'Periode sudah ditutup'))
    mockedApi.deleteJournal.mockResolvedValue(undefined)
    mockedApi.getJournals.mockResolvedValue({ journals: mockJournals, totals: { debit: 0, credit: 0, difference: 0 } })
    mockedApi.getAccounts.mockResolvedValue({ accounts: mockAccounts })

    await useStore.getState().flushOfflineQueue()

    expect(useStore.getState().offlineQueue).toHaveLength(0) // keduanya keluar
    expect(mockedApi.deleteJournal).toHaveBeenCalledWith('JNL-2026-03-007') // tetap jalan
    expect(useStore.getState().toast?.kind).toBe('error')
    expect(useStore.getState().toast?.message).toContain('Periode sudah ditutup')
  })

  it('jaringan putus di tengah flush → apiStatus offline, sisa operasi tetap di antrian', async () => {
    useStore.setState({ apiStatus: 'online' })
    useStore.getState().enqueueOffline({ id: 'op-1', kind: 'post', ref: 'JNL-2026-03-006' })
    useStore.getState().enqueueOffline({ id: 'op-2', kind: 'delete', ref: 'JNL-2026-03-007' })
    mockedApi.postJournal.mockResolvedValue({ id: 'JNL-2026-03-006', status: 'posted', postedAt: 'x', affectedAccounts: [] })
    mockedApi.deleteJournal.mockRejectedValue(new TypeError('fetch failed')) // putus di op-2
    mockedApi.getJournals.mockRejectedValue(new TypeError('fetch failed'))

    await useStore.getState().flushOfflineQueue()

    const s = useStore.getState()
    expect(s.apiStatus).toBe('offline')
    expect(s.isSyncing).toBe(false)
    // op-1 sukses keluar; op-2 gagal jaringan → tetap antri
    expect(s.offlineQueue).toHaveLength(1)
    expect(s.offlineQueue[0].id).toBe('op-2')
  })

  it('antrian kosong / belum online → no-op tanpa panggilan API', async () => {
    useStore.setState({ apiStatus: 'offline' })
    await useStore.getState().flushOfflineQueue()
    expect(mockedApi.createJournal).not.toHaveBeenCalled()

    useStore.setState({ apiStatus: 'online' })
    await useStore.getState().flushOfflineQueue()
    expect(mockedApi.createJournal).not.toHaveBeenCalled()
  })
})

describe('persist — antrian offline ikut tersimpan & dimigrasi (v4)', () => {
  it('CURRENT_VERSION naik ke 6 (antrian offline + lastSyncedAt + entityDataCache)', () => {
    expect(CURRENT_VERSION).toBe(6)
  })

  it('freshPersistedState memuat antrian kosong + lastSyncedAt null', () => {
    expect(freshPersistedState().offlineQueue).toEqual([])
    expect(freshPersistedState().lastSyncedAt).toBeNull()
  })

  it('migrasi data v3 (tanpa offlineQueue) → antrian kosong, jurnal pengguna dipertahankan', () => {
    const userJournal: any = { id: 'JNL-USER-1', transactionNumber: 'BKM-X-1', date: '2026-03-20', description: 'buatan user', lines: [], status: 'draft', createdBy: 'user-001', createdAt: 'x' }
    const v3: any = {
      accounts: mockAccounts,
      journals: [...mockJournals, userJournal],
      activePeriod: '2026-03',
      seedVersion: 1,
      seedJournalIds: mockJournals.map((j) => j.id),
      accessToken: 'mock.t',
      user: { id: 'user-001', name: 'Rina', email: 'r@x.id', role: 'admin' },
    }
    const migrated = migratePersistedState(v3, 3) // data v3 → belum punya antrian
    expect(migrated.offlineQueue).toEqual([])
    expect(migrated.lastSyncedAt).toBeNull() // v3 tidak punya → null
    expect(migrated.journals.find((j) => j.id === 'JNL-USER-1')).toBeDefined()
    // Sesi login dipertahankan — migrasi versi tidak memaksa login ulang
    expect(migrated.accessToken).toBe('mock.t')
    expect(migrated.user?.name).toBe('Rina')
  })

  it('migrasi data v4 → antrian yang ada dipertahankan apa adanya', () => {
    const op = { id: 'op-1', kind: 'post' as const, ref: 'JNL-2026-03-006' }
    const v4: any = {
      accounts: mockAccounts,
      journals: mockJournals,
      activePeriod: '2026-03',
      seedVersion: 1,
      seedJournalIds: mockJournals.map((j) => j.id),
      offlineQueue: [op],
    }
    const migrated = migratePersistedState(v4, 4) // data v4 → antrian dipertahankan
    expect(migrated.offlineQueue).toEqual([op])
  })

  it('migrasi mempertahankan lastSyncedAt bila ada (v5)', () => {
    const v5: any = {
      accounts: mockAccounts,
      journals: mockJournals,
      activePeriod: '2026-03',
      seedVersion: 1,
      seedJournalIds: mockJournals.map((j) => j.id),
      lastSyncedAt: '2026-08-15T04:00:00Z',
    }
    const migrated = migratePersistedState(v5, 5) // data v5 → nilai dipertahankan
    expect(migrated.lastSyncedAt).toBe('2026-08-15T04:00:00Z')
  })
})

describe('flush otomatis via init() — koneksi pulih', () => {
  it('init sukses memanggil flushOfflineQueue (operasi antrian terkirim)', async () => {
    // User membuat jurnal offline (login offline) → antrian terisi
    useStore.getState().loginOffline()
    await useStore.getState().saveJournal(input, 'post')
    expect(useStore.getState().offlineQueue).toHaveLength(1)

    // Koneksi pulih → init() (dipanggil poll/\"Coba lagi\") memuat + flush
    const serverJournal: any = {
      id: 'JNL-2026-03-009',
      transactionNumber: 'BKM-2026-03-0009',
      date: '2026-03-25',
      description: 'Penerimaan jasa PT Test',
      lines: input.lines.map((l, i) => ({ id: `ln-${i}`, accountId: l.accountId, accountCode: l.accountId, accountName: 'x', debit: l.debit, credit: l.credit })),
      status: 'posted',
      createdBy: 'user-001',
      createdAt: '2026-03-25T08:00:00Z',
      postedAt: '2026-03-25T08:01:00Z',
    }
    // Sesi offline ('local.demo') reconnect via init() → auto-login demo dulu
    // (fix: alih-alih menunggu 401), baru muat data + flush antrian.
    mockedApi.login.mockResolvedValue({ accessToken: 'mock.user-001.1', refreshToken: 'rt-1', expiresIn: 86400, user: demoUser, activePeriod: { id: '2026-03', name: 'Maret 2026', isOpen: true } } as any)
    mockedApi.getAccounts.mockResolvedValue({ accounts: mockAccounts })
    mockedApi.getJournals.mockResolvedValue({ journals: [serverJournal, ...mockJournals], totals: { debit: 0, credit: 0, difference: 0 } })
    mockedApi.createJournal.mockResolvedValue({ ...serverJournal, status: 'draft' })
    mockedApi.postJournal.mockResolvedValue({ id: serverJournal.id, status: 'posted', postedAt: '2026-03-25T08:01:00Z', affectedAccounts: [] })

    await useStore.getState().init()

    expect(useStore.getState().apiStatus).toBe('online')
    expect(useStore.getState().offlineQueue).toHaveLength(0)
    expect(mockedApi.postJournal).toHaveBeenCalled()
    expect(useStore.getState().toast?.message).toContain('disinkronkan')
    expect(useStore.getState().lastSyncedAt).toBeTruthy() // sinkron tercatat
  })
})
