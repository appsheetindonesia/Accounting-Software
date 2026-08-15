// Integration test (MSW): approval workflow submit → approve/reject — mirror
// mock-api/server.js. Verifikasi transisi status (draft → pending-approval →
// posted/draft), efek saldo saat approve (jurnal masuk posted), penegakan
// permission (journal.write utk submit/post, journal.approve utk approve/reject),
// dan error envelope (404/409/401). Store & lapisan API yang asli.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { handlers, resetDb } from './handlers'
import { useStore, computeBalances } from '../store/useStore'
import { api } from '../api'
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
  transactionNumber: 'BKM-2026-03-0012',
  description: 'Penerimaan jasa — menunggu approval',
  lines: [
    { accountId: '1-1100', debit: 10_000_000, credit: 0, description: 'Tunai' },
    { accountId: '4-1000', debit: 0, credit: 10_000_000, description: 'Pendapatan' },
  ],
}

const findId = () => useStore.getState().journals.find((j) => j.transactionNumber === input.transactionNumber)!.id

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  resetDb()
  resetStore()
  setAuth(null, null, null)
})
afterAll(() => server.close())

describe('approval workflow → submit → approve/reject (MSW)', () => {
  it('submit → approve → posted: status & saldo berubah setelah approve, server sinkron', async () => {
    await useStore.getState().login('rina@bukuwarung.com', 'password123')

    // Draft tidak berpengaruh ke saldo
    await useStore.getState().saveJournal(input, 'draft')
    const id = findId()
    const before = computeBalances(useStore.getState().accounts, useStore.getState().journals).get('1-1100')!

    // Submit → pending-approval (store + server)
    await useStore.getState().submitJournal(id)
    let s = useStore.getState()
    expect(s.toast?.kind).toBe('success')
    expect(s.journals.find((j) => j.id === id)?.status).toBe('pending-approval')
    let serverJournals = await api.getJournals()
    expect(serverJournals.journals.find((j) => j.id === id)?.status).toBe('pending-approval')

    // Approve → posted dengan postedAt; saldo naik 10jt (jurnal kini berpengaruh)
    await useStore.getState().approveJournal(id)
    s = useStore.getState()
    expect(s.toast?.message).toContain('disetujui')
    const posted = s.journals.find((j) => j.id === id)!
    expect(posted.status).toBe('posted')
    expect(posted.postedAt).toBeTruthy()
    const after = computeBalances(s.accounts, s.journals).get('1-1100')!
    expect(after - before).toBe(10_000_000)
    serverJournals = await api.getJournals()
    expect(serverJournals.journals.find((j) => j.id === id)?.status).toBe('posted')
  })

  it('reject: pending-approval → draft + rejectionReason; saldo tidak berubah', async () => {
    await useStore.getState().login('rina@bukuwarung.com', 'password123')
    await useStore.getState().saveJournal(input, 'draft')
    const id = findId()
    const before = computeBalances(useStore.getState().accounts, useStore.getState().journals).get('1-1100')!

    await useStore.getState().submitJournal(id)
    await useStore.getState().rejectJournal(id, 'Nomor bukti tidak valid')

    const s = useStore.getState()
    expect(s.toast?.message).toContain('ditolak')
    expect(s.journals.find((j) => j.id === id)?.status).toBe('draft')
    const serverJ = (await api.getJournals()).journals.find((j) => j.id === id)!
    expect(serverJ.status).toBe('draft')
    expect(serverJ.rejectionReason).toBe('Nomor bukti tidak valid')
    const after = computeBalances(s.accounts, s.journals).get('1-1100')!
    expect(after - before).toBe(0) // draft tidak memengaruhi saldo
  })

  it('transisi tidak valid → 409 INVALID_STATUS_TRANSITION (submit posted, approve draft, reject posted)', async () => {
    await useStore.getState().login('rina@bukuwarung.com', 'password123')

    const postedId = mockJournals[0].id // JNL-2026-03-001 posted
    await useStore.getState().submitJournal(postedId)
    expect(useStore.getState().toast?.kind).toBe('error')
    expect(useStore.getState().toast?.message).toContain('Hanya jurnal draft')

    const draftId = mockJournals[5].id // JNL-2026-03-006 draft
    await useStore.getState().approveJournal(draftId)
    expect(useStore.getState().toast?.kind).toBe('error')
    expect(useStore.getState().toast?.message).toContain('Hanya jurnal pending-approval')

    await useStore.getState().rejectJournal(postedId)
    expect(useStore.getState().toast?.kind).toBe('error')
    expect(useStore.getState().toast?.message).toContain('Hanya jurnal pending-approval')

    // Tidak ada transisi yang mengubah state (tanpa jurnal baru)
    expect(useStore.getState().journals).toHaveLength(mockJournals.length)
  })

  it('permission: akuntan dapat submit tapi approve → 403 FORBIDDEN; admin approve → sukses', async () => {
    // Akuntan (Dimas): journal.write YA, journal.approve TIDAK
    await useStore.getState().login('dimas@estetikakreasi.co.id', 'password123')
    await useStore.getState().saveJournal(input, 'draft')
    const id = findId()

    await useStore.getState().submitJournal(id) // boleh (journal.write)
    expect(useStore.getState().journals.find((j) => j.id === id)?.status).toBe('pending-approval')

    await useStore.getState().approveJournal(id) // dilarang (tanpa journal.approve)
    expect(useStore.getState().toast?.kind).toBe('error')
    expect(useStore.getState().toast?.message).toContain('Tidak memiliki akses')
    expect(useStore.getState().journals.find((j) => j.id === id)?.status).toBe('pending-approval')

    // Admin (Rina) approve → sukses
    await useStore.getState().login('rina@bukuwarung.com', 'password123')
    await useStore.getState().approveJournal(id)
    expect(useStore.getState().toast?.kind).toBe('success')
    expect(useStore.getState().journals.find((j) => j.id === id)?.status).toBe('posted')
  })

  it('request tanpa token → 401 UNAUTHORIZED (submit/approve/reject)', async () => {
    setAuth(null, null, null)
    await expect(api.submitJournal('JNL-2026-03-006')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    await expect(api.approveJournal('JNL-2026-03-006')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    await expect(api.rejectJournal('JNL-2026-03-006')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
  })
})
