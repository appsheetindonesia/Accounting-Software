// ============================================================
// Integration test — ISOLASI MULTI-TENANT per X-Entity-Id
// (mirror prototype-accounting/src/integration/entity-isolation.test.ts,
// tapi terhadap server HTTP mock yang ASLI via Supertest).
//
// Membuktikan bahwa header `X-Entity-Id` memfilter SEMUA endpoint
// baca data ke entitas yang diminta — tidak ada kebocoran antar
// tenant, termasuk untuk id akun/jurnal yang SAMA (1-1100, dan
// JNL-2026-03-001 ada di kedua entitas dengan isi berbeda):
//   1. dashboard  (/dashboard/summary)         — kartu saldo per entitas
//   2. laporan    (/reports/trial-balance, /reports/income-statement,
//                  /reports/balance-sheet)     — angka & nama entitas
//   3. ledger     (/ledger/accounts/:id)       — saldo & entri per entitas
//   4. export     (/exports/ledger/:id, /exports/accounts) — konten per entitas
//   5. search     (/search)                    — hasil per entitas
//
// Angka baseline seed (base, tanpa --extra) diverifikasi di QA Test Plan:
//   ent-001 PT. Kreasi Inovasi Estetika: Aset 557jt / Utang 150jt /
//     Modal 363jt / Laba 44jt (Pendapatan 155jt − Beban 111jt); 8 jurnal
//     Maret; 15 akun (COA lengkap).
//   ent-002 CV Karya Mandiri: Kas 25jt + jurnal BKM-0001 (+8jt Kas /
//     +8jt Pendapatan) & BKK-0002 (−3jt Kas / +3jt Beban) → Aset 30jt /
//     Laba 10jt (Pendapatan 18jt − Beban 8jt); 2 jurnal; 3 akun CV.
//
// Menjalankan:  cd mock-api && npx vitest run test/entity-isolation.test.js
// ============================================================
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../src/server.js'

const USERS = {
  admin: { email: 'rina@estetikakreasi.co.id', password: 'password123' },
}
const tokens = {}

beforeAll(async () => {
  const res = await request(app).post('/auth/login').send(USERS.admin)
  expect(res.status).toBe(200)
  tokens.admin = res.body.data.accessToken
})

beforeEach(async () => {
  const res = await request(app).post('/admin/reset').send({})
  expect(res.status).toBe(200)
})

const auth = (entityId) => ({
  Authorization: `Bearer ${tokens.admin}`,
  'X-Entity-Id': entityId,
})

describe('Isolasi multi-tenant per X-Entity-Id — endpoint baca data', () => {
  it('dashboard/summary: ent-001 (Aset 557jt/Laba 44jt) vs ent-002 (Aset 30jt/Laba 10jt)', async () => {
    const ent1 = await request(app).get('/dashboard/summary').set(auth('ent-001'))
    expect(ent1.status).toBe(200)
    const card1 = (key) => ent1.body.data.cards.find((c) => c.key === key).value
    expect(card1('totalAssets')).toBe(557_000_000)
    expect(card1('totalLiabilities')).toBe(150_000_000)
    expect(card1('totalEquity')).toBe(363_000_000)
    expect(card1('grossProfit')).toBe(44_000_000)

    const ent2 = await request(app).get('/dashboard/summary').set(auth('ent-002'))
    expect(ent2.status).toBe(200)
    const card2 = (key) => ent2.body.data.cards.find((c) => c.key === key).value
    expect(card2('totalAssets')).toBe(30_000_000) // Kas CV 25jt + 8jt − 3jt
    expect(card2('totalLiabilities')).toBe(0)
    expect(card2('totalEquity')).toBe(0)
    expect(card2('grossProfit')).toBe(10_000_000) // Pendapatan 18jt − Beban 8jt
  })

  it('income-statement: nama entitas & laba bersih terisolasi (ent-001 44jt vs ent-002 10jt)', async () => {
    const ent1 = await request(app).get('/reports/income-statement').set(auth('ent-001'))
    expect(ent1.status).toBe(200)
    expect(ent1.body.data.entity.name).toBe('PT. Kreasi Inovasi Estetika')
    expect(ent1.body.data.netIncome).toBe(44_000_000)
    expect(ent1.body.data.sections.find((s) => s.title === 'PENDAPATAN').subtotal).toBe(155_000_000)
    expect(ent1.body.data.sections.find((s) => s.title === 'BEBAN').subtotal).toBe(111_000_000)

    const ent2 = await request(app).get('/reports/income-statement').set(auth('ent-002'))
    expect(ent2.status).toBe(200)
    expect(ent2.body.data.entity.name).toBe('CV Karya Mandiri')
    expect(ent2.body.data.netIncome).toBe(10_000_000)
    expect(ent2.body.data.sections.find((s) => s.title === 'PENDAPATAN').subtotal).toBe(18_000_000)
    expect(ent2.body.data.sections.find((s) => s.title === 'BEBAN').subtotal).toBe(8_000_000)
    // Baris akun milik ent-002 (nama akun CV) — bukan salinan ent-001
    expect(ent2.body.data.sections[0].lines.some((l) => l.accountName.includes('CV'))).toBe(true)
  })

  it('balance-sheet: total aset & entitas terisolasi (557jt vs 30jt), keduanya seimbang', async () => {
    const ent1 = await request(app).get('/reports/balance-sheet').set(auth('ent-001'))
    expect(ent1.status).toBe(200)
    expect(ent1.body.data.entity.name).toBe('PT. Kreasi Inovasi Estetika')
    expect(ent1.body.data.totalAssets).toBe(557_000_000)
    expect(ent1.body.data.isBalanced).toBe(true)

    const ent2 = await request(app).get('/reports/balance-sheet').set(auth('ent-002'))
    expect(ent2.status).toBe(200)
    expect(ent2.body.data.entity.name).toBe('CV Karya Mandiri')
    expect(ent2.body.data.totalAssets).toBe(30_000_000)
    expect(ent2.body.data.isBalanced).toBe(true)
  })

  it('trial-balance: baris akun per entitas (COA CV 3 akun, bukan 12 akun base)', async () => {
    const ent1 = await request(app).get('/reports/trial-balance').set(auth('ent-001'))
    expect(ent1.status).toBe(200)
    expect(ent1.body.data.lines.length).toBeGreaterThan(10)
    expect(ent1.body.data.totals.isBalanced).toBe(true)

    const ent2 = await request(app).get('/reports/trial-balance').set(auth('ent-002'))
    expect(ent2.status).toBe(200)
    const lines2 = ent2.body.data.lines
    // Hanya akun ent-002: Kas CV, Pendapatan Jasa CV, Beban Gaji CV
    expect(lines2.length).toBe(3)
    expect(lines2.every((l) => l.accountName.includes('CV'))).toBe(true)
    // Seed ent-002 sengaja TANPA ekuitas → trial balance tidak seimbang
    // (debit 30+8=38jt vs kredit 18jt) — yang penting: total = data ent-002 saja
    expect(ent2.body.data.totals.debit).toBe(38_000_000)
    expect(ent2.body.data.totals.credit).toBe(18_000_000)
  })

  it('ledger/accounts/:id: id akun SAMA (1-1100) → isi berbeda per entitas, tanpa kebocoran', async () => {
    // ent-001: Kas Besar, saldo akhir 87jt (seed Maret)
    const ent1 = await request(app).get('/ledger/accounts/1-1100').set(auth('ent-001'))
    expect(ent1.status).toBe(200)
    expect(ent1.body.data.accountName).toBe('Kas Besar')
    expect(ent1.body.data.closingBalance).toBe(87_000_000)

    // ent-002: Kas CV Karya Mandiri, saldo akhir 30jt (25 + 8 − 3)
    const ent2 = await request(app).get('/ledger/accounts/1-1100').set(auth('ent-002'))
    expect(ent2.status).toBe(200)
    expect(ent2.body.data.accountName).toBe('Kas CV Karya Mandiri')
    expect(ent2.body.data.openingBalance).toBe(25_000_000)
    expect(ent2.body.data.closingBalance).toBe(30_000_000)
    expect(ent2.body.data.entries).toHaveLength(2) // BKM-0001 & BKK-0002

    // Akun yang TIDAK ada di ent-002 → 404 (tidak jatuh ke ent-001)
    const missing = await request(app).get('/ledger/accounts/2-1000').set(auth('ent-002'))
    expect(missing.status).toBe(404)
    expect(missing.body.error.code).toBe('ACCOUNT_NOT_FOUND')
  })

  it('export: konten placeholder memuat nama entitas masing-masing (bukan entitas lain)', async () => {
    const ent1 = await request(app).get('/exports/ledger/1-1100').query({ format: 'pdf', period: '2026-03' }).set(auth('ent-001'))
    expect(ent1.status).toBe(200)
    expect(ent1.body.toString('utf8')).toContain('company=PT. Kreasi Inovasi Estetika')
    expect(ent1.body.toString('utf8')).toContain('account=1-1100 Kas Besar')

    const ent2 = await request(app).get('/exports/ledger/1-1100').query({ format: 'pdf', period: '2026-03' }).set(auth('ent-002'))
    expect(ent2.status).toBe(200)
    expect(ent2.body.toString('utf8')).toContain('company=CV Karya Mandiri')
    expect(ent2.body.toString('utf8')).toContain('account=1-1100 Kas CV Karya Mandiri')
    expect(ent2.body.toString('utf8')).not.toContain('PT. Kreasi Inovasi Estetika')
  })

  it('export/accounts (COA): daftar akun per entitas (12 base vs 3 CV)', async () => {
    const ent1 = await request(app).get('/exports/accounts').set(auth('ent-001'))
    expect(ent1.status).toBe(200)
    const rows1 = ent1.text.trim().split('\n')
    expect(rows1.length).toBe(12)
    expect(rows1.some((r) => r.includes('Kas Besar'))).toBe(true)

    const ent2 = await request(app).get('/exports/accounts').set(auth('ent-002'))
    expect(ent2.status).toBe(200)
    const rows2 = ent2.text.trim().split('\n')
    expect(rows2.length).toBe(3)
    expect(rows2.every((r) => r.includes('CV'))).toBe(true)
    expect(rows2.some((r) => r.includes('Kas Besar'))).toBe(false)
  })

  it('search: query yang sama → hasil per entitas (jurnal & akun CV untuk ent-002, kosong utk ent-001)', async () => {
    // 'CV' hanya muncul di data ent-002 (nama akun & deskripsi jurnal)
    const ent1 = await request(app).get('/search').query({ q: 'CV' }).set(auth('ent-001'))
    expect(ent1.status).toBe(200)
    expect(ent1.body.data.results).toHaveLength(0)

    const ent2 = await request(app).get('/search').query({ q: 'CV' }).set(auth('ent-002'))
    expect(ent2.status).toBe(200)
    const results2 = ent2.body.data.results
    expect(results2.length).toBeGreaterThan(0)
    // Jurnal ent-002 muncul (deskripsi mengandung "CV Karya Mandiri (ent-002)")
    expect(results2.some((r) => r.type === 'journal' && r.subtitle.includes('CV Karya Mandiri'))).toBe(true)
    // Akun ent-002 muncul (nama akun CV) — bukan akun ent-001 yang kebetulan mirip
    expect(results2.some((r) => r.type === 'account' && r.title.includes('CV'))).toBe(true)

    // Kebalikannya: 'Pendapatan Jasa' ada di KEDUA entitas — pastikan isi beda
    const a1 = await request(app).get('/search').query({ q: 'Pendapatan Jasa' }).set(auth('ent-001'))
    const a1Title = a1.body.data.results.find((r) => r.type === 'account').title
    expect(a1Title).toBe('Pendapatan Jasa')
    const a2 = await request(app).get('/search').query({ q: 'Pendapatan Jasa' }).set(auth('ent-002'))
    const a2Title = a2.body.data.results.find((r) => r.type === 'account').title
    expect(a2Title).toBe('Pendapatan Jasa CV')
  })
})
