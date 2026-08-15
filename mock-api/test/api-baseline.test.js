// ============================================================
// Integration test — mock API terhadap baseline angka
// QA Test Plan - Accounting.md §2.3 ("Angka yang Harus Benar").
//
// Menjalankan:  cd mock-api && npm test
// (Vitest + Supertest; app Express diuji langsung tanpa port;
//  state di-reset ke seed di setiap test via POST /admin/reset)
// ============================================================
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../src/server.js'

const DEMO = { email: 'rina@bukuwarung.com', password: 'password123' }

let token

const auth = () => ({ Authorization: `Bearer ${token}` })
const get = (path, query) => request(app).get(path).query(query ?? {}).set(auth())

beforeAll(async () => {
  const res = await request(app).post('/auth/login').send(DEMO)
  expect(res.status).toBe(200)
  expect(res.body.data.user.role).toBe('admin')
  token = res.body.data.accessToken
})

beforeEach(async () => {
  const res = await request(app).post('/admin/reset').send({})
  expect(res.status).toBe(200)
  expect(res.body.data.journals).toBe(8) // seed Maret 2026
})

// ------------------------------------------------------------------
describe('2.5 Lupa password — hint akun demo', () => {
  it('forgot-password email terdaftar → 200 dengan hint + arahan admin', async () => {
    const res = await request(app).post('/auth/forgot-password').send({ email: DEMO.email })
    expect(res.status).toBe(200)
    expect(res.body.data.email).toBe('rina@bukuwarung.com')
    expect(res.body.data.role).toBe('admin')
    expect(res.body.data.hint).toContain('password123')
    expect(res.body.data.note).toContain('admin')
  })

  it('forgot-password case-insensitive & trim whitespace', async () => {
    const res = await request(app).post('/auth/forgot-password').send({ email: '  RINA@BUKUWARUNG.COM  ' })
    expect(res.status).toBe(200)
    expect(res.body.data.email).toBe('rina@bukuwarung.com')
  })
})

// ------------------------------------------------------------------
describe('2.3 Baseline — Jurnal & Saldo Akun', () => {
  it('5 jurnal posted dengan total debit = kredit = 98.000.000', async () => {
    const res = await get('/journals', { status: 'posted', pageSize: 200 })
    expect(res.status).toBe(200)
    expect(res.body.meta.total).toBe(5)
    expect(res.body.data.totals.debit).toBe(98_000_000)
    expect(res.body.data.totals.credit).toBe(98_000_000)
    expect(res.body.data.totals.difference).toBe(0)
  })

  it('Buku Besar Kas Besar: saldo awal 60jt, akhir 87jt, 4 entri (60+25−10−3+15)', async () => {
    const res = await get('/ledger/accounts/1-1100', { period: '2026-03' })
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.openingBalance).toBe(60_000_000)
    expect(d.closingBalance).toBe(87_000_000)
    expect(d.entries).toHaveLength(4)
    expect(d.entries.map((e) => e.reference)).toEqual([
      'BKM-2026-03-0001', 'BKK-2026-03-0002', 'BKK-2026-03-0003', 'BKM-2026-03-0004',
    ])
    // Saldo berjalan: 60+25 → 85, −10 → 75, −3 → 72, +15 → 87
    expect(d.entries.map((e) => e.balance)).toEqual([85_000_000, 75_000_000, 72_000_000, 87_000_000])
  })

  it('Saldo akun lain: Pendapatan 155jt, Utang 150jt, Modal 363jt', async () => {
    const kasus = [
      ['1-1100', 'Kas Besar', 87_000_000],
      ['4-1000', 'Pendapatan Jasa', 155_000_000],
      ['2-1000', 'Utang Usaha', 150_000_000],
      ['3-1000', 'Modal Pemilik', 363_000_000],
    ]
    for (const [id, name, closing] of kasus) {
      const res = await get(`/ledger/accounts/${id}`, { period: '2026-03' })
      expect(res.status).toBe(200)
      expect(res.body.data.accountName).toBe(name)
      expect(res.body.data.closingBalance).toBe(closing)
    }
  })

  it('Draft & reversed TIDAK memengaruhi saldo (Kas 87jt, bukan 94,5/89jt)', async () => {
    const res = await get('/ledger/accounts/1-1100', { period: '2026-03' })
    expect(res.body.data.closingBalance).toBe(87_000_000)
    // Jurnal draft (BKK-0006 5jt, JV-0007 2,5jt) dan reversed (BKM-0008 2jt)
    // tidak boleh ikut: 87 bukan 94,5 dan bukan 89
    expect(res.body.data.entries.some((e) => e.reference.includes('0006'))).toBe(false)
    expect(res.body.data.entries.some((e) => e.reference.includes('0007'))).toBe(false)
    expect(res.body.data.entries.some((e) => e.reference.includes('0008'))).toBe(false)
  })
})

// ------------------------------------------------------------------
describe('2.3 Baseline — Neraca & Keseimbangan Buku', () => {
  it('Neraca per 31 Mar: Aset 557 = Utang 150 + Modal 363 + Laba berjalan 44', async () => {
    const res = await get('/reports/balance-sheet', { asOf: '2026-03-31' })
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.totalAssets).toBe(557_000_000)
    expect(d.totalLiabilitiesEquity).toBe(557_000_000)
    expect(d.isBalanced).toBe(true)

    const liabEq = d.sections.find((s) => s.title === 'KEWAJIBAN & EKUITAS')
    const lineOf = (name) => liabEq.lines.find((l) => l.accountName === name).amount
    expect(lineOf('Utang Usaha')).toBe(150_000_000)
    expect(lineOf('Modal Pemilik')).toBe(363_000_000)
    expect(lineOf('Laba Ditahan (berjalan)')).toBe(44_000_000)

    // Identitas akuntansi: Aset = Utang + Modal + Laba
    expect(150_000_000 + 363_000_000 + 44_000_000).toBe(d.totalAssets)
  })

  it('Trial balance Maret: debit = kredit = 668.000.000, isBalanced = true', async () => {
    const res = await get('/reports/trial-balance', { period: '2026-03' })
    expect(res.status).toBe(200)
    const t = res.body.data.totals
    expect(t.debit).toBe(668_000_000)
    expect(t.credit).toBe(668_000_000)
    expect(t.isBalanced).toBe(true)
  })
})

// ------------------------------------------------------------------
describe('2.3 Baseline — Laba Rugi & Dashboard', () => {
  it('Laba Rugi Maret: Pendapatan 155jt − Beban 111jt = Laba bersih 44jt', async () => {
    const res = await get('/reports/income-statement', { period: '2026-03' })
    expect(res.status).toBe(200)
    const d = res.body.data
    const subtotal = (title) => d.sections.find((s) => s.title === title).subtotal
    expect(subtotal('PENDAPATAN')).toBe(155_000_000)
    expect(subtotal('BEBAN')).toBe(111_000_000)
    expect(d.netIncome).toBe(44_000_000)
    expect(155_000_000 - 111_000_000).toBe(d.netIncome)
  })

  it('Dashboard: 4 kartu — Aset 557 / Utang 150 / Modal 363 / Laba Bruto 44', async () => {
    const res = await get('/dashboard/summary')
    expect(res.status).toBe(200)
    const cards = Object.fromEntries(res.body.data.cards.map((c) => [c.label, c.value]))
    expect(cards).toEqual({
      'Total Aset': 557_000_000,
      'Total Utang': 150_000_000,
      'Total Modal': 363_000_000,
      'Laba Bruto': 44_000_000,
    })
  })

  it('Alert dashboard: 2 jurnal draft belum diposting (JNL-06, JNL-07)', async () => {
    const res = await get('/dashboard/alerts')
    expect(res.status).toBe(200)
    const alerts = res.body.data.alerts
    const draftAlert = alerts.find((a) => a.type === 'draft_journals')
    expect(draftAlert).toBeTruthy()
    expect(draftAlert.count).toBe(2)
    expect(draftAlert.severity).toBe('warning')
  })
})

// ------------------------------------------------------------------
describe('2.3 Baseline — integritas setelah mutasi (saldo live)', () => {
  it('Posting 10jt: Kas 87→97jt, Pendapatan 155→165jt, Aset 557→567jt (TC-JRN-21)', async () => {
    const create = await request(app)
      .post('/journals')
      .set(auth())
      .send({
        date: '2026-03-15',
        transactionNumber: 'BKM-2026-03-0009',
        description: 'Penerimaan jasa (integration test)',
        lines: [
          { accountId: '1-1100', debit: 10_000_000, credit: 0 },
          { accountId: '4-1000', debit: 0, credit: 10_000_000 },
        ],
      })
    expect(create.status).toBe(201)
    const post = await request(app).post(`/journals/${create.body.data.id}/post`).set(auth())
    expect(post.status).toBe(200)

    const kas = await get('/ledger/accounts/1-1100', { period: '2026-03' })
    expect(kas.body.data.closingBalance).toBe(97_000_000)
    const pendapatan = await get('/ledger/accounts/4-1000', { period: '2026-03' })
    expect(pendapatan.body.data.closingBalance).toBe(165_000_000)
    const neraca = await get('/reports/balance-sheet', { asOf: '2026-03-31' })
    expect(neraca.body.data.totalAssets).toBe(567_000_000)
    expect(neraca.body.data.isBalanced).toBe(true)
  })

  it('Reverse setelah posting → kembali ke baseline (net 0, RG-02)', async () => {
    const create = await request(app)
      .post('/journals')
      .set(auth())
      .send({
        date: '2026-03-15',
        description: 'Jurnal untuk di-reverse (integration test)',
        lines: [
          { accountId: '1-1100', debit: 10_000_000, credit: 0 },
          { accountId: '4-1000', debit: 0, credit: 10_000_000 },
        ],
      })
    const id = create.body.data.id
    await request(app).post(`/journals/${id}/post`).set(auth())
    const rev = await request(app).post(`/journals/${id}/reverse`).set(auth())
    expect(rev.status).toBe(200)
    expect(rev.body.data.reversalJournal.status).toBe('posted')

    const kas = await get('/ledger/accounts/1-1100', { period: '2026-03' })
    expect(kas.body.data.closingBalance).toBe(87_000_000) // kembali ke seed
    const tb = await get('/reports/trial-balance', { period: '2026-03' })
    expect(tb.body.data.totals.isBalanced).toBe(true)
    expect(tb.body.data.totals.debit).toBe(668_000_000)
  })
})
