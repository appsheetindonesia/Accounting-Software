// ============================================================
// Integration test — SEED:EXTRA (jurnal lintas bulan Jan–Feb 2026)
//   POST /admin/reset { withExtra: true }
//
// Memvalidasi:
//   1. Seed memuat 15 jurnal (8 base Maret + 7 extra Jan–Feb).
//   2. Saldo berantai Kas Besar (1-1100) antar periode:
//         Jan: 60 → +30 −10 −40 = 40jt
//         Feb: 40 → +28 −4      = 64jt
//         Mar: 64 → +25 −10 −3 +15 = 91jt
//      saldo akhir bulan N menjadi saldo awal bulan N+1.
//   3. Periode Januari & Februari tertutup (isOpen=false):
//      POST jurnal & reverse jurnal posted → 422 PERIOD_CLOSED.
//   4. Periode Maret terbuka → POST jurnal 201.
//
// Menjalankan:  cd mock-api && npx vitest run test/extra-seed.test.js
// ============================================================
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../src/server.js'

const DEMO = { email: 'rina@bukuwarung.com', password: 'password123' }

let token
const auth = () => ({ Authorization: `Bearer ${token}` })
const ledger = (accountId, period) =>
  request(app).get(`/ledger/accounts/${accountId}`).query({ period }).set(auth())

beforeAll(async () => {
  const res = await request(app).post('/auth/login').send(DEMO)
  expect(res.status).toBe(200)
  token = res.body.data.accessToken
})

beforeEach(async () => {
  const res = await request(app).post('/admin/reset').send({ withExtra: true })
  expect(res.status).toBe(200)
  expect(res.body.data.journals).toBe(15) // 8 base Maret + 7 extra Jan–Feb
  expect(res.body.data.seed).toBe('extra')
})

// ------------------------------------------------------------
describe('Seed:extra — muatan & struktur periode', () => {
  it('reset withExtra: 15 jurnal, 3 periode (Jan terbuka=false, Feb=false, Mar=true)', async () => {
    const res = await request(app).get('/periods').query({ includeClosed: 'true' }).set(auth())
    expect(res.status).toBe(200)
    const byKey = Object.fromEntries(res.body.data.periods.map((p) => [p.id, p]))
    expect(byKey['fp-2026-01'].isOpen).toBe(false)
    expect(byKey['fp-2026-02'].isOpen).toBe(false)
    expect(byKey['fp-2026-03'].isOpen).toBe(true)
  })

  it('jurnal lintas bulan termuat: 3 Januari + 4 Februari + 8 Maret', async () => {
    const res = await request(app).get('/journals').query({ pageSize: 200 }).set(auth())
    expect(res.status).toBe(200)
    const byMonth = (m) => res.body.data.journals.filter((j) => j.date.startsWith(m))
    expect(byMonth('2026-01')).toHaveLength(3)
    expect(byMonth('2026-02')).toHaveLength(4)
    expect(byMonth('2026-03')).toHaveLength(8)
  })
})

// ------------------------------------------------------------
describe('Saldo berantai Kas Besar (1-1100) — 60 → 40 → 64 → 91jt', () => {
  it('Januari: 60 → 90 → 80 → 40jt (60+30−10−40)', async () => {
    const res = await ledger('1-1100', '2026-01')
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.openingBalance).toBe(60_000_000)
    expect(d.closingBalance).toBe(40_000_000)
    expect(d.entries).toHaveLength(3)
    expect(d.entries.map((e) => e.reference)).toEqual([
      'BKM-2026-01-0001', 'BKK-2026-01-0002', 'BKK-2026-01-0003',
    ])
    expect(d.entries.map((e) => e.balance)).toEqual([90_000_000, 80_000_000, 40_000_000])
  })

  it('Februari: 40 → 68 → 64jt (40+28−4)', async () => {
    const res = await ledger('1-1100', '2026-02')
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.openingBalance).toBe(40_000_000) // = saldo akhir Januari
    expect(d.closingBalance).toBe(64_000_000)
    expect(d.entries).toHaveLength(2)
    expect(d.entries.map((e) => e.reference)).toEqual([
      'BKM-2026-02-0001', 'BKK-2026-02-0002',
    ])
    expect(d.entries.map((e) => e.balance)).toEqual([68_000_000, 64_000_000])
  })

  it('Maret: 64 → 89 → 79 → 76 → 91jt (64+25−10−3+15)', async () => {
    const res = await ledger('1-1100', '2026-03')
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.openingBalance).toBe(64_000_000) // = saldo akhir Februari
    expect(d.closingBalance).toBe(91_000_000)
    expect(d.entries).toHaveLength(4)
    expect(d.entries.map((e) => e.reference)).toEqual([
      'BKM-2026-03-0001', 'BKK-2026-03-0002', 'BKK-2026-03-0003', 'BKM-2026-03-0004',
    ])
    expect(d.entries.map((e) => e.balance)).toEqual([89_000_000, 79_000_000, 76_000_000, 91_000_000])
  })

  it('rantai antar periode: akhir Jan = awal Feb = 40; akhir Feb = awal Mar = 64', async () => {
    const jan = await ledger('1-1100', '2026-01')
    const feb = await ledger('1-1100', '2026-02')
    const mar = await ledger('1-1100', '2026-03')
    expect(jan.body.data.closingBalance).toBe(40_000_000)
    expect(feb.body.data.openingBalance).toBe(jan.body.data.closingBalance)
    expect(feb.body.data.closingBalance).toBe(64_000_000)
    expect(mar.body.data.openingBalance).toBe(feb.body.data.closingBalance)
    expect(mar.body.data.closingBalance).toBe(91_000_000)
  })

  it('Kas lancar konsisten dengan dashboard: Aset total Maret 581jt (557+24 extra)', async () => {
    const res = await request(app).get('/dashboard/summary').set(auth())
    expect(res.status).toBe(200)
    const cards = Object.fromEntries(res.body.data.cards.map((c) => [c.label, c.value]))
    expect(cards['Total Aset']).toBe(581_000_000)
  })
})

// ------------------------------------------------------------
describe('Periode tertutup (Jan & Feb) — blokade mutasi', () => {
  const validJournal = (date) => ({
    date,
    description: 'Jurnal uji periode tertutup',
    lines: [
      { accountId: '1-1100', debit: 1_000_000, credit: 0 },
      { accountId: '4-1000', debit: 0, credit: 1_000_000 },
    ],
  })

  it('POST jurnal tanggal Januari → 422 PERIOD_CLOSED', async () => {
    const res = await request(app).post('/journals').set(auth()).send(validJournal('2026-01-15'))
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('PERIOD_CLOSED')
  })

  it('POST jurnal tanggal Februari → 422 PERIOD_CLOSED', async () => {
    const res = await request(app).post('/journals').set(auth()).send(validJournal('2026-02-15'))
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('PERIOD_CLOSED')
  })

  it('reverse jurnal posted Januari (JNL-2026-01-001) → 422 PERIOD_CLOSED', async () => {
    const res = await request(app).post('/journals/JNL-2026-01-001/reverse').set(auth())
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('PERIOD_CLOSED')
  })

  it('edit jurnal draft di periode tertutup masih dilarang saat validasi ulang → 422 PERIOD_CLOSED', async () => {
    // Buat draft di Januari tidak mungkin (diblokir POST). Sebagai gantinya verifikasi
    // bahwa PUT jurnal seed Maret yang diubah tanggalnya ke Januari ditolak.
    const res = await request(app)
      .put('/journals/JNL-2026-03-006')
      .set(auth())
      .send({
        date: '2026-01-20', // pindahkan draft Maret ke periode tertutup
        description: 'pindah ke Januari',
        lines: [
          { accountId: '1-1100', debit: 1_000_000, credit: 0 },
          { accountId: '4-1000', debit: 0, credit: 1_000_000 },
        ],
      })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('PERIOD_CLOSED')
  })

  it('periode Maret terbuka → POST jurnal 201 dan tidak terpengaruh blokade', async () => {
    const res = await request(app).post('/journals').set(auth()).send(validJournal('2026-03-25'))
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('draft')
  })
})
