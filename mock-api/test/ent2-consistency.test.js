// ============================================================
// Integration test — KONSISTENSI SALDO ENTITAS KEDUA (ent-002)
// CV Karya Mandiri — jaring pengaman regresi untuk seed multi-tenant.
//
// Baseline ent-002 (data.js, seed base — TANPA --extra):
//   Akun (3): 1-1100 Kas CV Karya Mandiri 25jt (asset, debit),
//             4-1000 Pendapatan Jasa CV 10jt (revenue, credit),
//             5-1000 Beban Gaji CV 5jt (expense, debit)
//   Jurnal (2, Maret):
//     BKM-0001 (06/03): Kas +8jt / Pendapatan +8jt
//     BKK-0002 (11/03): Beban +3jt / Kas −3jt
//
// Saldo akhir Maret 2026:
//   Kas 25 +8 −3           = 30jt
//   Pendapatan 10 +8       = 18jt
//   Beban 5 +3             = 8jt
//   Laba bersih 18 − 8     = 10jt
//   Total Aset (hanya Kas) = 30jt
//
// Memvalidasi KONSISTENSI antar endpoint (semua harus sepakat):
//   ledger closing  = neraca totalAssets = dashboard totalAssets (30jt)
//   income netIncome = dashboard grossProfit (10jt)
//   neraca seimbang  Aset = Kewajiban + Ekuitas (30jt = 0 + 30jt)
//
// Ini mirror test/extra-seed.test.js (konsistensi ent-001) untuk ent-002 —
// regresi seed/COA/jurnal ent-002 terdeteksi dini tanpa menyentuh ent-001.
//
// Menjalankan:  cd mock-api && npx vitest run test/ent2-consistency.test.js
// ============================================================
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../src/server.js'

const DEMO = { email: 'rina@estetikakreasi.co.id', password: 'password123' }

let token
// Header X-Entity-Id ent-002 — semua request data memakai tenant CV.
const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Entity-Id': 'ent-002' })
const ledger = (accountId, period) =>
  request(app).get(`/ledger/accounts/${accountId}`).query({ period }).set(auth())
const income = (period) => request(app).get('/reports/income-statement').query({ period }).set(auth())

beforeAll(async () => {
  const res = await request(app).post('/auth/login').send(DEMO)
  expect(res.status).toBe(200)
  token = res.body.data.accessToken
})

beforeEach(async () => {
  // Reset seed base (tanpa --extra): ent-002 = 2 jurnal + 3 akun CV
  const res = await request(app).post('/admin/reset').send({})
  expect(res.status).toBe(200)
})

// ------------------------------------------------------------
describe('Ent-002 — COA & muatan seed (3 akun CV, 2 jurnal Maret)', () => {
  it('accounts: hanya 3 akun CV (Kas/Pendapatan/Beban), tanpa akun ent-001', async () => {
    const res = await request(app).get('/accounts').set(auth())
    expect(res.status).toBe(200)
    const accounts = res.body.data.accounts
    expect(accounts).toHaveLength(3)
    expect(accounts.every((a) => a.name.includes('CV'))).toBe(true)
    // Nama akun identik dengan baseline — regresi rename terdeteksi
    expect(accounts.map((a) => a.name)).toEqual([
      'Kas CV Karya Mandiri', 'Pendapatan Jasa CV', 'Beban Gaji CV',
    ])
  })

  it('journals: tepat 2 jurnal Maret ber-label ent-002', async () => {
    const res = await request(app).get('/journals').query({ pageSize: 50 }).set(auth())
    expect(res.status).toBe(200)
    const journals = res.body.data.journals
    expect(journals).toHaveLength(2)
    expect(journals.every((j) => j.description.includes('ent-002'))).toBe(true)
    expect(journals.map((j) => j.transactionNumber).sort()).toEqual([
      'BKK-2026-03-0002', 'BKM-2026-03-0001',
    ])
  })
})

// ------------------------------------------------------------
describe('Ent-002 — saldo Kas CV (1-1100): 25 → 33 → 30jt', () => {
  it('Maret: opening 25jt, entri BKM-0001 (+8) & BKK-0002 (−3), closing 30jt', async () => {
    const res = await ledger('1-1100', '2026-03')
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.accountName).toBe('Kas CV Karya Mandiri')
    expect(d.openingBalance).toBe(25_000_000) // baseBalance CV
    expect(d.closingBalance).toBe(30_000_000) // 25 + 8 − 3
    expect(d.entries).toHaveLength(2)
    expect(d.entries.map((e) => e.reference)).toEqual(['BKM-2026-03-0001', 'BKK-2026-03-0002'])
    expect(d.entries.map((e) => e.balance)).toEqual([33_000_000, 30_000_000])
  })

  it('Pendapatan CV (4-1000): 10 → 18jt; Beban CV (5-1000): 5 → 8jt', async () => {
    const rev = await ledger('4-1000', '2026-03')
    expect(rev.status).toBe(200)
    expect(rev.body.data.accountName).toBe('Pendapatan Jasa CV')
    expect(rev.body.data.closingBalance).toBe(18_000_000) // 10 + 8

    const exp = await ledger('5-1000', '2026-03')
    expect(exp.status).toBe(200)
    expect(exp.body.data.accountName).toBe('Beban Gaji CV')
    expect(exp.body.data.closingBalance).toBe(8_000_000) // 5 + 3
  })
})

// ------------------------------------------------------------
describe('Ent-002 — konsistensi antar laporan (semua sepakat 30jt / 10jt)', () => {
  it('dashboard summary: Aset 30jt, Laba Bruto 10jt (Utang & Modal 0)', async () => {
    const res = await request(app).get('/dashboard/summary').set(auth())
    expect(res.status).toBe(200)
    const cards = Object.fromEntries(res.body.data.cards.map((c) => [c.key, c.value]))
    expect(cards.totalAssets).toBe(30_000_000)
    expect(cards.totalLiabilities).toBe(0)
    expect(cards.totalEquity).toBe(0)
    expect(cards.grossProfit).toBe(10_000_000)
  })

  it('laba rugi: Pendapatan 18jt − Beban 8jt = Laba bersih 10jt', async () => {
    const res = await income('2026-03')
    expect(res.status).toBe(200)
    const d = res.body.data
    const subtotal = (title) => d.sections.find((s) => s.title === title).subtotal
    expect(subtotal('PENDAPATAN')).toBe(18_000_000)
    expect(subtotal('BEBAN')).toBe(8_000_000)
    expect(d.netIncome).toBe(10_000_000)
    expect(18_000_000 - 8_000_000).toBe(d.netIncome)
  })

  it('neraca: Aset 30jt = Kewajiban 0 + Ekuitas 0 + Laba berjalan 30jt → seimbang', async () => {
    const res = await request(app).get('/reports/balance-sheet').set(auth())
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.entity.name).toBe('CV Karya Mandiri')
    expect(d.totalAssets).toBe(30_000_000)
    expect(d.totalLiabilitiesEquity).toBe(30_000_000)
    expect(d.isBalanced).toBe(true)
    // Laba berjalan (penyeimbang) = Aset − (Utang + Modal) = 30jt
    const liabEquity = d.sections.find((s) => s.title === 'KEWAJIBAN & EKUITAS')
    const retained = liabEquity.lines.find((l) => l.accountName === 'Laba Ditahan (berjalan)')
    expect(retained.amount).toBe(30_000_000)
  })

  it('KONSISTENSI LINTAS ENDPOINT: ledger closing = neraca = dashboard = 30jt; laba rugi = dashboard = 10jt', async () => {
    const [ld, bs, ds, is] = await Promise.all([
      ledger('1-1100', '2026-03'),
      request(app).get('/reports/balance-sheet').set(auth()),
      request(app).get('/dashboard/summary').set(auth()),
      income('2026-03'),
    ])
    const ledClosing = ld.body.data.closingBalance
    const bsAssets = bs.body.data.totalAssets
    const dashAssets = Object.fromEntries(ds.body.data.cards.map((c) => [c.key, c.value])).totalAssets
    const dashProfit = Object.fromEntries(ds.body.data.cards.map((c) => [c.key, c.value])).grossProfit
    const isNet = is.body.data.netIncome

    // Semua sumber saldo aset harus sepakat
    expect(ledClosing).toBe(bsAssets)
    expect(bsAssets).toBe(dashAssets)
    expect(ledClosing).toBe(30_000_000)
    // Semua sumber laba harus sepakat
    expect(isNet).toBe(dashProfit)
    expect(isNet).toBe(10_000_000)
  })
})
