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

const DEMO = { email: 'rina@estetikakreasi.co.id', password: 'password123' }

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
  expect(res.body.data.journals).toBe(17) // 15 base+extra ent-001 + 2 seed ent-002
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
describe('Laba Rugi YTD bertingkat per periode — 57 / 59 / 26jt (seed:extra)', () => {
  const income = (period) => request(app).get('/reports/income-statement').query({ period }).set(auth())

  it('Januari: Pendapatan 160jt − Beban 103jt = Laba bersih 57jt', async () => {
    const res = await income('2026-01')
    expect(res.status).toBe(200)
    const d = res.body.data
    const subtotal = (title) => d.sections.find((s) => s.title === title).subtotal
    expect(subtotal('PENDAPATAN')).toBe(160_000_000)
    expect(subtotal('BEBAN')).toBe(103_000_000)
    expect(d.netIncome).toBe(57_000_000)
    expect(160_000_000 - 103_000_000).toBe(d.netIncome)
  })

  it('Februari: Pendapatan 208jt − Beban 149jt = Laba bersih 59jt', async () => {
    const res = await income('2026-02')
    expect(res.status).toBe(200)
    const d = res.body.data
    const subtotal = (title) => d.sections.find((s) => s.title === title).subtotal
    expect(subtotal('PENDAPATAN')).toBe(208_000_000)
    expect(subtotal('BEBAN')).toBe(149_000_000)
    expect(d.netIncome).toBe(59_000_000)
    expect(208_000_000 - 149_000_000).toBe(d.netIncome)
  })

  it('Maret: Pendapatan 233jt − Beban 207jt = Laba bersih 26jt', async () => {
    const res = await income('2026-03')
    expect(res.status).toBe(200)
    const d = res.body.data
    const subtotal = (title) => d.sections.find((s) => s.title === title).subtotal
    expect(subtotal('PENDAPATAN')).toBe(233_000_000)
    expect(subtotal('BEBAN')).toBe(207_000_000)
    expect(d.netIncome).toBe(26_000_000)
    expect(233_000_000 - 207_000_000).toBe(d.netIncome)
  })

  it('rantai YTD: 57 (Jan) → 59 (Feb) → 26 (Mar) — konsisten dengan Laba Ditahan di Neraca', async () => {
    const jan = await income('2026-01')
    const feb = await income('2026-02')
    const mar = await income('2026-03')
    expect(jan.body.data.netIncome).toBe(57_000_000)
    expect(feb.body.data.netIncome).toBe(59_000_000)
    expect(mar.body.data.netIncome).toBe(26_000_000)

    // Laba Ditahan (berjalan) di Neraca per akhir bulan = laba bersih periode itu
    const neracaJan = await request(app).get('/reports/balance-sheet').query({ asOf: '2026-01-31' }).set(auth())
    const neracaFeb = await request(app).get('/reports/balance-sheet').query({ asOf: '2026-02-28' }).set(auth())
    const neracaMar = await request(app).get('/reports/balance-sheet').query({ asOf: '2026-03-31' }).set(auth())
    const labaDitahan = (d) =>
      d.body.data.sections
        .find((s) => s.title === 'KEWAJIBAN & EKUITAS')
        .lines.find((l) => l.accountName === 'Laba Ditahan (berjalan)').amount
    expect(labaDitahan(neracaJan)).toBe(57_000_000)
    expect(labaDitahan(neracaFeb)).toBe(59_000_000)
    expect(labaDitahan(neracaMar)).toBe(26_000_000)
    expect(neracaJan.body.data.isBalanced).toBe(true)
    expect(neracaFeb.body.data.isBalanced).toBe(true)
    expect(neracaMar.body.data.isBalanced).toBe(true)
  })

  it('konsisten dengan baseline Maret: delta YTD = efek jurnal Jan–Feb (+78jt rev, +96jt beban)', async () => {
    // Baseline (tanpa extra) meng-embed saldo pre-Maret sebagai baseBalance,
    // jadi laporan Maret-nya = 155/111/44 (lihat api-baseline.test.js).
    // Seed extra memuat Jan–Feb sebagai jurnal eksplisit → YTD Maret 233/207/26.
    // Konsistensi: selisih keduanya PERSIS efek jurnal Jan–Feb:
    //   pendapatan +78jt = 30 (Jan BKM) + 28 (Feb BKM) + 20 (Feb JV)
    //   beban     +96jt = 50 (Jan: 10 sewa + 40 gaji) + 46 (Feb: 4 + 42 gaji)
    const reset = (body) => request(app).post('/admin/reset').send(body)
    const subtotal = (d, title) => d.body.data.sections.find((s) => s.title === title).subtotal

    await reset({}).then((r) => expect(r.status).toBe(200))
    const base = await income('2026-03')
    expect(subtotal(base, 'PENDAPATAN')).toBe(155_000_000)
    expect(subtotal(base, 'BEBAN')).toBe(111_000_000)
    expect(base.body.data.netIncome).toBe(44_000_000)

    await reset({ withExtra: true }).then((r) => expect(r.status).toBe(200))
    const extra = await income('2026-03')
    expect(subtotal(extra, 'PENDAPATAN')).toBe(233_000_000)
    expect(subtotal(extra, 'BEBAN')).toBe(207_000_000)
    expect(extra.body.data.netIncome).toBe(26_000_000)

    expect(subtotal(extra, 'PENDAPATAN') - subtotal(base, 'PENDAPATAN')).toBe(78_000_000)
    expect(subtotal(extra, 'BEBAN') - subtotal(base, 'BEBAN')).toBe(96_000_000)
    expect(extra.body.data.netIncome - base.body.data.netIncome).toBe(-18_000_000)
  })
})

// ------------------------------------------------------------
describe('Neraca — konsistensi baseline Maret (delta = efek jurnal Jan–Feb)', () => {
  it('delta Aset/Utang/Modal/Laba = efek jurnal Jan–Feb (+24 aset, +42 utang, 0 modal, −18 laba)', async () => {
    // Baseline (tanpa extra) meng-embed saldo pre-Maret sebagai baseBalance:
    //   Aset 557 = Utang 150 + Modal 363 + Laba berjalan 44 (api-baseline.test.js).
    // Seed extra memuat Jan–Feb sebagai jurnal eksplisit → Neraca Maret:
    //   Aset 581, Utang 192, Modal 363, Laba 26.
    // Konsistensi: selisih keduanya PERSIS efek jurnal Jan–Feb:
    //   aset  +24jt = kas +4 (30−10−40+28−4) + piutang +20 (JV-04)
    //   utang +42jt = utang gaji Februari (BKK-03, kredit 2-1000, belum dibayar)
    //   modal   0jt = Modal Pemilik (3-1000) tidak tersentuh
    //   laba  −18jt = pendapatan +78 − beban +96
    const reset = (body) => request(app).post('/admin/reset').send(body)
    const neraca = () =>
      request(app).get('/reports/balance-sheet').query({ asOf: '2026-03-31' }).set(auth())
    const lineOf = (d, name) =>
      d.body.data.sections
        .find((s) => s.title === 'KEWAJIBAN & EKUITAS')
        .lines.find((l) => l.accountName === name).amount

    await reset({}).then((r) => expect(r.status).toBe(200))
    const base = await neraca()
    expect(base.body.data.totalAssets).toBe(557_000_000)
    expect(lineOf(base, 'Utang Usaha')).toBe(150_000_000)
    expect(lineOf(base, 'Modal Pemilik')).toBe(363_000_000)
    expect(lineOf(base, 'Laba Ditahan (berjalan)')).toBe(44_000_000)
    expect(base.body.data.isBalanced).toBe(true)

    await reset({ withExtra: true }).then((r) => expect(r.status).toBe(200))
    const extra = await neraca()
    expect(extra.body.data.totalAssets).toBe(581_000_000)
    expect(lineOf(extra, 'Utang Usaha')).toBe(192_000_000)
    expect(lineOf(extra, 'Modal Pemilik')).toBe(363_000_000)
    expect(lineOf(extra, 'Laba Ditahan (berjalan)')).toBe(26_000_000)
    expect(extra.body.data.isBalanced).toBe(true)

    // Delta = efek jurnal Jan–Feb; identitas akuntansi tetap terjaga
    expect(extra.body.data.totalAssets - base.body.data.totalAssets).toBe(24_000_000)
    expect(lineOf(extra, 'Utang Usaha') - lineOf(base, 'Utang Usaha')).toBe(42_000_000)
    expect(lineOf(extra, 'Modal Pemilik') - lineOf(base, 'Modal Pemilik')).toBe(0)
    expect(lineOf(extra, 'Laba Ditahan (berjalan)') - lineOf(base, 'Laba Ditahan (berjalan)')).toBe(-18_000_000)
    // ΔAset = ΔUtang + ΔModal + ΔLaba
    expect(extra.body.data.totalAssets - base.body.data.totalAssets).toBe(
      (lineOf(extra, 'Utang Usaha') - lineOf(base, 'Utang Usaha')) +
        (lineOf(extra, 'Modal Pemilik') - lineOf(base, 'Modal Pemilik')) +
        (lineOf(extra, 'Laba Ditahan (berjalan)') - lineOf(base, 'Laba Ditahan (berjalan)')),
    )
  })
})

// ------------------------------------------------------------
describe('Rantai Buku Besar Pendapatan Jasa (4-1000) — 130 → 160 → 208 → 233jt', () => {
  it('Januari: 130 → 160jt (1 entri BKM-01)', async () => {
    const res = await ledger('4-1000', '2026-01')
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.openingBalance).toBe(130_000_000)
    expect(d.closingBalance).toBe(160_000_000)
    expect(d.entries.map((e) => e.reference)).toEqual(['BKM-2026-01-0001'])
    expect(d.entries.map((e) => e.balance)).toEqual([160_000_000])
  })

  it('Februari: 160 → 188 → 208jt (BKM-01 +28jt, JV-04 +20jt)', async () => {
    const res = await ledger('4-1000', '2026-02')
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.openingBalance).toBe(160_000_000) // = saldo akhir Januari
    expect(d.closingBalance).toBe(208_000_000)
    expect(d.entries.map((e) => e.reference)).toEqual(['BKM-2026-02-0001', 'JV-2026-02-0004'])
    expect(d.entries.map((e) => e.balance)).toEqual([188_000_000, 208_000_000])
  })

  it('Maret: 208 → 233jt (BKM-01 +25jt)', async () => {
    const res = await ledger('4-1000', '2026-03')
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.openingBalance).toBe(208_000_000) // = saldo akhir Februari
    expect(d.closingBalance).toBe(233_000_000)
    expect(d.entries.map((e) => e.reference)).toEqual(['BKM-2026-03-0001'])
    expect(d.entries.map((e) => e.balance)).toEqual([233_000_000])
  })

  it('rantai antar periode: akhir Jan 160 = awal Feb; akhir Feb 208 = awal Mar', async () => {
    const jan = await ledger('4-1000', '2026-01')
    const feb = await ledger('4-1000', '2026-02')
    const mar = await ledger('4-1000', '2026-03')
    expect(jan.body.data.closingBalance).toBe(160_000_000)
    expect(feb.body.data.openingBalance).toBe(jan.body.data.closingBalance)
    expect(feb.body.data.closingBalance).toBe(208_000_000)
    expect(mar.body.data.openingBalance).toBe(feb.body.data.closingBalance)
    expect(mar.body.data.closingBalance).toBe(233_000_000)
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
