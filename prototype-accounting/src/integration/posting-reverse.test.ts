// Integration test (MSW): memvalidasi alur POSTING → REVERSE terhadap skema
// API (`API - Accounting.md`) TANPA server nyata — MSW mencegat fetch di level
// HTTP. Store & lapisan API yang asli (bukan vi.mock), sehingga seluruh jalur
// envelope `{ data }`/`{ error }`, auth, dan validasi balance benar-benar diuji.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { handlers, resetDb } from './handlers'
import { useStore, computeBalances } from '../store/useStore'
import { api, ApiError } from '../api'
import { setAuth } from '../api/client'
import { mockAccounts, mockJournals } from '../data/mock'

const server = setupServer(...handlers)

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

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  resetDb()
  resetStore()
  setAuth(null, null, null)
})
afterAll(() => server.close())

describe('alur posting → reverse terhadap skema API (MSW)', () => {
  it('login → buat + posting jurnal → saldo Kas 74 → 84jt (data dari API)', async () => {
    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')
    expect(useStore.getState().apiStatus).toBe('online')

    await useStore.getState().saveJournal(input, 'post')

    const s = useStore.getState()
    expect(s.toast?.kind).toBe('success')
    const created = s.journals.find((j) => j.transactionNumber === 'BKM-2026-03-0009')!
    expect(created.status).toBe('posted')
    expect(created.createdBy).toBe('Rina') // enrichment user id → nama dari API login

    // Saldo live dihitung dari jurnal posted (via API response yang masuk store)
    const b = computeBalances(s.accounts, s.journals)
    expect(b.get('1-1100')).toBe(94_000_000) // 84 + 10
    expect(b.get('4-1000')).toBe(165_000_000) // 155 + 10
  })

  it('reverse: jurnal pembalik debit/kredit ditukar + saldo kembali 84jt (net 0)', async () => {
    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')
    await useStore.getState().saveJournal(input, 'post')
    const id = useStore.getState().journals.find((j) => j.transactionNumber === 'BKM-2026-03-0009')!.id

    await useStore.getState().reverseJournal(id)

    const s = useStore.getState()
    const original = s.journals.find((j) => j.id === id)!
    const reversal = s.journals.find((j) => j.reversalOf === id)!
    expect(original.status).toBe('reversed')
    expect(reversal).toBeDefined()
    expect(reversal.transactionNumber).toBe('REV-BKM-2026-03-0009')
    expect(reversal.status).toBe('posted')
    // Baris pembalik: debit ↔ kredit ditukar
    expect(reversal.lines[0]).toMatchObject({ accountId: '1-1100', debit: 0, credit: 10_000_000 })
    expect(reversal.lines[1]).toMatchObject({ accountId: '4-1000', debit: 10_000_000, credit: 0 })

    // Saldo kembali ke baseline (pasangan bernet 0)
    const b = computeBalances(s.accounts, s.journals)
    expect(b.get('1-1100')).toBe(84_000_000)
    expect(b.get('4-1000')).toBe(155_000_000)
  })

  it('jurnal TIDAK balance → 422 JOURNAL_UNBALANCED, tidak masuk store', async () => {
    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')
    const bad = {
      ...input,
      transactionNumber: 'BKM-2026-03-0010',
      lines: [
        { accountId: '1-1100', debit: 10_000_000, credit: 0 },
        { accountId: '4-1000', debit: 0, credit: 7_500_000 },
      ],
    }
    // Store menangkap ApiError → toast error, jurnal TIDAK masuk state
    await useStore.getState().saveJournal(bad, 'post')
    expect(useStore.getState().toast?.kind).toBe('error')
    expect(useStore.getState().toast?.message).toContain('Total debit dan kredit')
    expect(useStore.getState().journals).toHaveLength(mockJournals.length) // tidak tersimpan
  })

  it('reverse jurnal draft → 409 INVALID_STATUS_TRANSITION (API menolak)', async () => {
    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')
    const draftId = mockJournals[5].id // JNL-006 draft
    // Store menangkap ApiError 409 → toast error, tanpa jurnal pembalik
    await useStore.getState().reverseJournal(draftId)
    expect(useStore.getState().toast?.kind).toBe('error')
    expect(useStore.getState().journals).toHaveLength(mockJournals.length)
    expect(useStore.getState().journals.find((j) => j.reversalOf === draftId)).toBeUndefined()
  })

  it('request tanpa token → 401 UNAUTHORIZED', async () => {
    setAuth(null, null, null)
    await expect(api.getJournals()).rejects.toThrowError(ApiError)
    await expect(api.getJournals()).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
  })

  it('access token kedaluwarsa → POST /auth/refresh → retry sukses (alur refresh nyata)', async () => {
    // Login langsung ke API untuk mengambil refresh token valid
    const auth = await api.login({ email: 'rina@estetikakreasi.co.id', password: 'password123' })
    // Access token "kedaluwarsa", refresh token tetap valid
    setAuth('mock.expired.999', undefined, auth.refreshToken)

    const { journals } = await api.getJournals() // 401 → refresh → retry

    expect(journals).toHaveLength(mockJournals.length)
    // Token di client sudah diganti (refresh sukses) — buktikan request berikutnya jalan tanpa 401
    const again = await api.getJournals()
    expect(again.journals).toHaveLength(mockJournals.length)
    // Store mencatat waktu refresh (indikator footer "Sesi diperbarui otomatis")
    expect(useStore.getState().lastRefreshedAt).toBeTruthy()
  })

  it('refresh token invalid → sesi berakhir (request menolak, tanpa retry)', async () => {
    setAuth('mock.expired.999', undefined, 'invalid-refresh')
    await expect(api.getJournals()).rejects.toThrowError(ApiError)
    await expect(api.getJournals()).rejects.toMatchObject({ status: 401 })
  })

  it('logout → POST /auth/logout menghapus refresh token di server (refresh berikutnya 401)', async () => {
    // Login → dapat refresh token valid
    const auth = await api.login({ email: 'rina@estetikakreasi.co.id', password: 'password123' })
    setAuth('mock.user-001.1', undefined, auth.refreshToken)

    // Logout: server harus membuang sesi (refresh token tidak bisa dipakai lagi)
    await api.logout(auth.refreshToken)

    // Refresh token lama → 401 INVALID_REFRESH_TOKEN (sesi sudah dihapus)
    setAuth('mock.expired.999', undefined, auth.refreshToken)
    await expect(api.getJournals()).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
  })

  it('store logout: bersihkan sesi lokal + token di client (request berikutnya tanpa auth)', async () => {
    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')
    expect(useStore.getState().accessToken).toBeTruthy()
    expect(useStore.getState().refreshToken).toBeTruthy()

    useStore.getState().logout()

    const s = useStore.getState()
    expect(s.accessToken).toBeNull()
    expect(s.refreshToken).toBeNull()
    expect(s.user).toBeNull()
    expect(s.apiStatus).toBe('idle')
    // Client (modul api) juga dibersihkan → request tanpa Authorization
    await expect(api.getJournals()).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
  })
})
