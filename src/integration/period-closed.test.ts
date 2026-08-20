// Integration test (MSW): periode tertutup memblokir pembuatan jurnal, posting,
// dan reverse dengan 422 PERIOD_CLOSED — mirror mock-api (validateJournal BR-6
// & handler reverse). Periode dibuka/ditutup lewat handler PATCH /periods/:id/{close,open}.
// Store & lapisan API yang asli (bukan vi.mock), seperti posting-reverse.test.ts.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { handlers, resetDb } from './handlers'
import { useStore } from '../store/useStore'
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

const input = (date: string, transactionNumber: string) => ({
  date,
  transactionNumber,
  description: `Jurnal periode ${date.slice(0, 7)}`,
  lines: [
    { accountId: '1-1100', debit: 5_000_000, credit: 0, description: 'Tunai' },
    { accountId: '4-1000', debit: 0, credit: 5_000_000, description: 'Pendapatan' },
  ],
})

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  resetDb()
  resetStore()
  setAuth(null, null, null)
})
afterAll(() => server.close())

describe('periode tertutup → 422 PERIOD_CLOSED (MSW)', () => {
  it('POST jurnal di periode tertutup (Januari seed) → 422 PERIOD_CLOSED, tidak masuk store', async () => {
    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')

    await useStore.getState().saveJournal(input('2026-01-15', 'BKM-2026-01-0001'), 'post')

    const s = useStore.getState()
    expect(s.toast?.kind).toBe('error')
    expect(s.toast?.message).toContain('sudah ditutup')
    expect(s.journals).toHaveLength(mockJournals.length) // tidak tersimpan
  })

  it('tutup periode Maret via handler → post draft & reverse → 422 PERIOD_CLOSED; buka lagi → sukses', async () => {
    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')

    // Tutup periode Maret lewat handler
    await expect(api.closePeriod('fp-2026-03')).resolves.toMatchObject({ id: 'fp-2026-03', isOpen: false })

    // Posting jurnal draft di Maret → ditolak 422 PERIOD_CLOSED, status tetap draft
    const draftId = mockJournals[5].id // JNL-2026-03-006 draft
    await useStore.getState().postJournal(draftId)
    const s1 = useStore.getState()
    expect(s1.toast?.kind).toBe('error')
    expect(s1.toast?.message).toContain('sudah ditutup')
    expect(s1.journals.find((j) => j.id === draftId)?.status).toBe('draft')

    // Buat jurnal baru di Maret → ditolak 422 PERIOD_CLOSED
    await useStore.getState().saveJournal(input('2026-03-26', 'BKM-2026-03-0011'), 'post')
    expect(useStore.getState().toast?.kind).toBe('error')
    expect(useStore.getState().journals).toHaveLength(mockJournals.length)

    // Reverse jurnal posted di Maret → ditolak 422 PERIOD_CLOSED, tanpa jurnal pembalik
    const postedId = mockJournals[0].id // JNL-2026-03-001 posted
    await useStore.getState().reverseJournal(postedId)
    const s2 = useStore.getState()
    expect(s2.toast?.kind).toBe('error')
    expect(s2.toast?.message).toContain('sudah ditutup')
    expect(s2.journals.find((j) => j.id === postedId)?.status).toBe('posted')
    expect(s2.journals.find((j) => j.reversalOf === postedId)).toBeUndefined()

    // Buka lagi periode → reverse sukses (pembalik dibuat, status reversed)
    await expect(api.openPeriod('fp-2026-03')).resolves.toMatchObject({ id: 'fp-2026-03', isOpen: true })

    await useStore.getState().reverseJournal(postedId)
    const s3 = useStore.getState()
    expect(s3.toast?.kind).toBe('success')
    expect(s3.journals.find((j) => j.id === postedId)?.status).toBe('reversed')
    expect(s3.journals.find((j) => j.reversalOf === postedId)).toBeDefined()
  })

  it('close periode dua kali → 409 PERIOD_ALREADY_CLOSED; periode tak dikenal → 404 PERIOD_NOT_FOUND', async () => {
    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')

    await expect(api.closePeriod('fp-2026-03')).resolves.toMatchObject({ id: 'fp-2026-03', isOpen: false })
    await expect(api.closePeriod('fp-2026-03')).rejects.toMatchObject({ status: 409, code: 'PERIOD_ALREADY_CLOSED' })
    await expect(api.closePeriod('fp-2099-12')).rejects.toMatchObject({ status: 404, code: 'PERIOD_NOT_FOUND' })
  })

  it('request tanpa token ke PATCH /periods → 401 UNAUTHORIZED', async () => {
    setAuth(null, null, null)
    await expect(api.closePeriod('fp-2026-03')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    await expect(api.openPeriod('fp-2026-03')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
  })
})
