// Integration test (MSW): isolasi data PER-ENTITAS server-side — header
// X-Entity-Id (mirror mock-api requireAuth). Buktikan bahwa:
//  1. setActiveEntity mengirim header entitas baru pada request refetch,
//  2. server mengembalikan HANYA data entitas itu (akun & jurnal ent-001
//     tidak bocor ke ent-002, dan sebaliknya) — termasuk id jurnal yang
//     SAMA (JNL-2026-03-001) milik entitas berbeda,
//  3. jurnal yang dibuat di satu entitas tidak terlihat dari entitas lain
//     (isolasi server-side untuk mutasi, bukan sekadar filter baca).
// Store & lapisan API yang asli; MSW hanya menggantikan server HTTP.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { handlers, resetDb } from './handlers'
import { useStore, computeBalances } from '../store/useStore'
import { api } from '../api'
import { setAuth } from '../api/client'
import { mockAccounts, mockJournals } from '../data/mock'

const server = setupServer(...handlers)

// Catat header X-Entity-Id tiap request ber-auth — bukti header yang benar
// terkirim (ent-001 saat login, ent-002 setelah setActiveEntity).
const entityHeaders: string[] = []
const lastEntityHeader = () => entityHeaders[entityHeaders.length - 1] ?? null

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
    entities: [{ id: 'ent-001', name: 'PT. Kreasi Inovasi Estetika', code: 'KI-001', isActive: true }],
    activeEntityId: 'ent-001',
    entityRefetching: false,
    periods: [],
  })

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
  server.events.on('request:start', ({ request }) => {
    const entity = request.headers.get('x-entity-id')
    if (entity) entityHeaders.push(entity)
  })
})
afterEach(() => {
  resetDb()
  resetStore()
  entityHeaders.length = 0
  setAuth(null, null, null)
})
afterAll(() => server.close())

describe('setActiveEntity — isolasi data per-entitas (server-side, MSW)', () => {
  it('login: request membawa X-Entity-Id ent-001 dan server mengembalikan data seed ent-001 saja', async () => {
    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')

    // setAuth(token, ent-001, …) di login → request data membawa header ent-001
    expect(entityHeaders.some((h) => h === 'ent-001')).toBe(true)
    expect(lastEntityHeader()).toBe('ent-001')

    const s = useStore.getState()
    expect(s.apiStatus).toBe('online')
    // Hanya seed ent-001 (9 jurnal Maret) — data ent-002 TIDAK ikut bocor
    expect(s.journals).toHaveLength(mockJournals.length)
    expect(s.accounts).toHaveLength(mockAccounts.length)
    expect(s.journals.some((j) => j.description.includes('CV Karya Mandiri'))).toBe(false)
    // Handler /entities hidup → daftar entitas server asli (bukan fallback demo)
    expect(s.entities.map((e) => e.id)).toEqual(['ent-001', 'ent-002'])
  })

  it('setActiveEntity(ent-002): header berubah + server mengembalikan data ent-002 (bukan salinan ent-001)', async () => {
    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')
    entityHeaders.length = 0 // abaikan request login — fokus ke refetch entitas

    await useStore.getState().setActiveEntity('ent-002')

    // 1) Client mengirim header entitas baru pada request refetch
    expect(lastEntityHeader()).toBe('ent-002')

    const s = useStore.getState()
    expect(s.activeEntityId).toBe('ent-002')
    expect(s.entityRefetching).toBe(false)

    // 2) Filter server-side: HANYA data ent-002 (2 jurnal, 3 akun CV)
    expect(s.journals).toHaveLength(2)
    expect(s.accounts).toHaveLength(3)
    expect(s.journals.every((j) => j.description.includes('ent-002'))).toBe(true)
    expect(s.accounts[0].name).toContain('CV')

    // 3) Id jurnal yang SAMA (JNL-2026-03-001) adalah milik ent-002 — bukti
    //    tidak ada kebocoran data ent-001 dengan id yang sama
    const j = s.journals.find((x) => x.id === 'JNL-2026-03-001')!
    expect(j.description).toContain('CV Karya Mandiri')
    expect(j.lines[0].accountName).toContain('CV')
  })

  it('API langsung (tanpa store): getJournals/getAccounts ter-isolasi per header X-Entity-Id', async () => {
    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')

    // Request manual dengan header ent-002 (client di-set langsung)
    setAuth('mock.user-001.1', 'ent-002', 'rt-1')
    const ent2 = await api.getJournals()
    expect(ent2.journals).toHaveLength(2)
    expect(ent2.journals.every((j) => j.description.includes('ent-002'))).toBe(true)
    const ent2Acc = await api.getAccounts()
    expect(ent2Acc.accounts).toHaveLength(3)
    expect(ent2Acc.accounts.every((a) => a.name.includes('CV'))).toBe(true)

    // Kembali ke ent-001 → data seed penuh lagi, tanpa sisa ent-002
    setAuth('mock.user-001.1', 'ent-001', 'rt-1')
    const ent1 = await api.getJournals()
    expect(ent1.journals).toHaveLength(mockJournals.length)
    expect(ent1.journals.some((j) => j.description.includes('CV Karya Mandiri'))).toBe(false)
  })

  it('jurnal dibuat di ent-002 → tidak bocor ke ent-001 (isolasi server-side untuk mutasi)', async () => {
    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')
    await useStore.getState().setActiveEntity('ent-002')

    // Buat + posting jurnal saat ent-002 aktif → di-stamp ent-002 oleh server
    await useStore.getState().saveJournal(
      {
        date: '2026-03-25',
        transactionNumber: 'BKM-2026-03-0025',
        description: 'Jurnal milik CV Karya Mandiri',
        lines: [
          { accountId: '1-1100', debit: 4_000_000, credit: 0, description: 'Tunai' },
          { accountId: '4-1000', debit: 0, credit: 4_000_000, description: 'Pendapatan' },
        ],
      },
      'post',
    )
    expect(useStore.getState().journals).toHaveLength(3) // 2 seed + 1 baru (ent-002)

    // Pindah ke ent-001 → jurnal ent-002 TIDAK terlihat (store + server)
    await useStore.getState().setActiveEntity('ent-001')
    const s = useStore.getState()
    expect(s.journals).toHaveLength(mockJournals.length)
    expect(s.journals.some((j) => j.description.includes('CV Karya Mandiri'))).toBe(false)
    expect(s.journals.some((j) => j.transactionNumber === 'BKM-2026-03-0025')).toBe(false)

    // Kembali ke ent-002 → jurnal itu masih ada di sana (tidak hilang)
    await useStore.getState().setActiveEntity('ent-002')
    expect(useStore.getState().journals.some((j) => j.transactionNumber === 'BKM-2026-03-0025')).toBe(true)
  })
})

describe('setActiveEntity — saldo dashboard & laporan ikut berubah (server-side)', () => {
  it('kartu saldo dashboard: ent-001 (aset 557jt) → ent-002 (aset 30jt) setelah ganti entitas', async () => {
    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')

    // Baseline ent-001 (seed Maret — angka terverifikasi di QA Test Plan)
    const ent1 = await api.getDashboardSummary()
    const card = (key: string) => ent1.cards.find((c) => c.key === key)!.value
    expect(card('totalAssets')).toBe(557_000_000)
    expect(card('totalLiabilities')).toBe(150_000_000)
    expect(card('totalEquity')).toBe(363_000_000)
    expect(card('grossProfit')).toBe(44_000_000)

    // Ganti entitas → header X-Entity-Id berubah → kartu = data ent-002
    await useStore.getState().setActiveEntity('ent-002')
    const ent2 = await api.getDashboardSummary()
    const card2 = (key: string) => ent2.cards.find((c) => c.key === key)!.value
    expect(card2('totalAssets')).toBe(30_000_000) // Kas CV 25jt + 8jt − 3jt
    expect(card2('totalLiabilities')).toBe(0)
    expect(card2('totalEquity')).toBe(0)
    expect(card2('grossProfit')).toBe(10_000_000) // Pendapatan 18jt − Beban 8jt
  })

  it('laporan Laba Rugi: entity & laba bersih ikut berubah setelah ganti entitas', async () => {
    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')

    // ent-001: Pendapatan 155jt − Beban 111jt = Laba 44jt
    const ent1 = await api.getIncomeStatement('2026-03')
    expect(ent1.entity.name).toBe('PT. Kreasi Inovasi Estetika')
    expect(ent1.netIncome).toBe(44_000_000)
    expect(ent1.sections.find((s) => s.title === 'PENDAPATAN')!.subtotal).toBe(155_000_000)
    expect(ent1.sections.find((s) => s.title === 'BEBAN')!.subtotal).toBe(111_000_000)

    // ent-002: Pendapatan 18jt − Beban 8jt = Laba 10jt, baris akun milik CV
    await useStore.getState().setActiveEntity('ent-002')
    const ent2 = await api.getIncomeStatement('2026-03')
    expect(ent2.entity.name).toBe('CV Karya Mandiri')
    expect(ent2.netIncome).toBe(10_000_000)
    expect(ent2.sections.find((s) => s.title === 'PENDAPATAN')!.subtotal).toBe(18_000_000)
    expect(ent2.sections.find((s) => s.title === 'BEBAN')!.subtotal).toBe(8_000_000)
    expect(ent2.sections[0].lines.some((l) => l.accountName.includes('CV'))).toBe(true)
  })

  it('saldo live lokal (useBalances) konsisten dengan kartu API setelah refetch entitas', async () => {
    await useStore.getState().login('rina@estetikakreasi.co.id', 'password123')
    const bal = () => computeBalances(useStore.getState().accounts, useStore.getState().journals)
    // Seed ent-001: Kas 84jt (60 + 25 − 10 − 3 + 12), Pendapatan 155jt
    expect(bal().get('1-1100')).toBe(84_000_000)
    expect(bal().get('4-1000')).toBe(155_000_000)

    // Ent-002: Kas CV 30jt (25 + 8 − 3), Pendapatan CV 18jt — konsisten
    // dengan kartu API (totalAssets 30jt, grossProfit 10jt) di test di atas.
    await useStore.getState().setActiveEntity('ent-002')
    expect(bal().get('1-1100')).toBe(30_000_000)
    expect(bal().get('4-1000')).toBe(18_000_000)
  })
})
