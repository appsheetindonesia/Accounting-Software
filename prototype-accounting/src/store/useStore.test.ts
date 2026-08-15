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
      status: j.status === 'pending-approval' ? 'draft' : j.status,
      lines: (j.lines ?? []).map((l: any, i: number) => ({ id: l.id ?? `${j.id}-${i}`, ...l })),
    }),
    api: {
      login: vi.fn(),
      getAccounts: vi.fn(),
      getJournals: vi.fn(),
      createJournal: vi.fn(),
      postJournal: vi.fn(),
      reverseJournal: vi.fn(),
      deleteJournal: vi.fn(),
    },
  }
})

import { api, ApiError } from '../api'

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
  })

const bal = () => computeBalances(useStore.getState().accounts, useStore.getState().journals)

const demoUser = { id: 'user-001', name: 'Rina', email: 'rina@bukuwarung.com', role: 'admin' }

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
  mockedApi.getAccounts.mockReset()
  mockedApi.getJournals.mockReset()
  mockedApi.createJournal.mockReset()
  mockedApi.postJournal.mockReset()
  mockedApi.reverseJournal.mockReset()
  mockedApi.deleteJournal.mockReset()
  // Default: gagal jaringan agar path lokal (fallback) yang teruji
  mockedApi.login.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.getAccounts.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.getJournals.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.createJournal.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.postJournal.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.reverseJournal.mockRejectedValue(new TypeError('fetch failed'))
  mockedApi.deleteJournal.mockRejectedValue(new TypeError('fetch failed'))
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
  it('menghitung saldo seed: Kas 77jt, Pendapatan 155jt (BR-6/BR-7)', () => {
    const b = bal()
    expect(b.get('1-1100')).toBe(77_000_000) // 50 + 25 - 10 - 3 + 15
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

describe('init — koneksi ke mock API', () => {
  it('berhasil: login + muat akun & jurnal → status online', async () => {
    mockedApi.login.mockResolvedValue({ accessToken: 'mock.user-001.1', refreshToken: 'x', expiresIn: 86400, user: demoUser, activePeriod: { id: '2026-03', name: 'Maret 2026', isOpen: true } } as any)
    mockedApi.getAccounts.mockResolvedValue({ accounts: mockAccounts })
    mockedApi.getJournals.mockResolvedValue({ journals: mockJournals, totals: { debit: 0, credit: 0, difference: 0 } })

    await useStore.getState().init()

    const s = useStore.getState()
    expect(s.apiStatus).toBe('online')
    expect(s.user?.name).toBe('Rina')
    expect(s.accounts).toEqual(mockAccounts)
    expect(s.journals).toHaveLength(mockJournals.length)
  })

  it('gagal (server mati) → status offline, data seed tetap', async () => {
    await useStore.getState().init()
    expect(useStore.getState().apiStatus).toBe('offline')
    expect(useStore.getState().journals).toHaveLength(mockJournals.length)
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
    expect(b.get('1-1100')).toBe(87_000_000) // 77 + 10
    expect(b.get('4-1000')).toBe(165_000_000) // 155 + 10
  })

  it('jurnal draft TIDAK mengubah saldo', async () => {
    await useStore.getState().saveJournal(input, 'draft')
    const b = bal()
    expect(b.get('1-1100')).toBe(77_000_000)
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
    expect(b.get('1-1100')).toBe(52_000_000) // 77 - 25 (efek BKM-0001 dibatalkan)
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

  it('reset tidak crash di lingkungan tanpa localStorage (storage null)', () => {
    expect(() => useStore.getState().resetDemoData()).not.toThrow()
    expect(useStore.getState().journals).toEqual(mockJournals)
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
