// ============================================================
// Integration test — ERROR ENVELOPE semua endpoint
// terhadap katalog kode error di `API - Accounting.md` §13.
//
// Memvalidasi:
//   1. Envelope error konsisten untuk SEMUA endpoint:
//      { error: { code, message, details? } } — TANPA field `data`,
//      code & message non-empty, details (bila ada) berbentuk
//      array { field, message }.
//   2. Kode error & status HTTP tiap kategori (401 / 403 / 409 /
//      422 / 404) sesuai katalog.
//   3. Cakupan katalog: setiap kode §13 yang terimplementasi di
//      mock dapat dipicu minimal 1×; kode yang belum
//      terimplementasi terdokumentasi eksplisit sebagai gap.
//
// Menjalankan:  cd mock-api && npx vitest run test/error-envelope.test.js
// ============================================================
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../src/server.js'

const USERS = {
  admin: { email: 'rina@estetikakreasi.co.id', password: 'password123' },
  accountant: { email: 'dimas@estetikakreasi.co.id', password: 'password123' },
  viewer: { email: 'budi@estetikakreasi.co.id', password: 'password123' },
}

const tokens = {}
// Semua kode error yang berhasil dipicu di file ini (untuk cakupan katalog)
const TRIGGERED = new Set()

beforeAll(async () => {
  for (const [role, creds] of Object.entries(USERS)) {
    const res = await request(app).post('/auth/login').send(creds)
    expect(res.status).toBe(200)
    tokens[role] = res.body.data.accessToken
  }
})

beforeEach(async () => {
  const res = await request(app).post('/admin/reset').send({})
  expect(res.status).toBe(200)
})

const auth = (role = 'admin') => ({ Authorization: `Bearer ${tokens[role]}` })

// Validasi envelope error + status HTTP + kode, lalu catat kode yang dipicu
const expectError = (res, status, code) => {
  expect(res.status).toBe(status)
  const e = res.body.error
  expect(e, `envelope error ada (status ${res.status})`).toBeTruthy()
  expect(typeof e.code).toBe('string')
  expect(e.code).toBe(code)
  expect(typeof e.message).toBe('string')
  expect(e.message.length).toBeGreaterThan(0)
  // Envelope error TIDAK membawa field `data`
  expect(res.body.data).toBeUndefined()
  if (e.details !== undefined) {
    expect(Array.isArray(e.details)).toBe(true)
    for (const d of e.details) {
      expect(d.field).toBeTruthy()
      expect(typeof d.message).toBe('string')
    }
  }
  TRIGGERED.add(code)
  return res
}

// ------------------------------------------------------------
describe('401 — Unauthorized / autentikasi gagal (API §13)', () => {
  it('tanpa token → UNAUTHORIZED', async () => {
    const res = await request(app).get('/journals')
    expectError(res, 401, 'UNAUTHORIZED')
  })

  it('token tidak dikenal → UNAUTHORIZED', async () => {
    const res = await request(app).get('/journals').set({ Authorization: 'Bearer mock.user-999.123' })
    expectError(res, 401, 'UNAUTHORIZED')
  })

  it('login password salah → INVALID_CREDENTIALS', async () => {
    const res = await request(app).post('/auth/login').send({ email: USERS.admin.email, password: 'salah' })
    expectError(res, 401, 'INVALID_CREDENTIALS')
  })

  it('refresh token tidak valid → INVALID_REFRESH_TOKEN', async () => {
    const res = await request(app).post('/auth/refresh').send({ refreshToken: 'token-acak' })
    expectError(res, 401, 'INVALID_REFRESH_TOKEN')
  })

  it('change-password current password salah → INVALID_PASSWORD', async () => {
    const res = await request(app)
      .post('/auth/change-password')
      .set(auth())
      .send({ currentPassword: 'salah', newPassword: 'password123' })
    expectError(res, 401, 'INVALID_PASSWORD')
  })

  it('forgot-password email kosong → VALIDATION_ERROR', async () => {
    const res = await request(app).post('/auth/forgot-password').send({})
    expectError(res, 422, 'VALIDATION_ERROR')
  })

  it('forgot-password email tidak terdaftar → USER_NOT_FOUND', async () => {
    const res = await request(app).post('/auth/forgot-password').send({ email: 'tidak.ada@example.com' })
    expectError(res, 404, 'USER_NOT_FOUND')
  })
})

// ------------------------------------------------------------
describe('401 TOKEN_EXPIRED — access token kedaluwarsa terjadwal', () => {
  it('token basi → TOKEN_EXPIRED; POST /auth/refresh memberi token baru yang valid', async () => {
    // Login → token valid + refresh token
    const login = await request(app).post('/auth/login').send(USERS.admin)
    expect(login.status).toBe(200)
    const oldAccess = login.body.data.accessToken
    const refreshToken = login.body.data.refreshToken

    // Paksa semua token lama basi (deterministik — tidak menunggu TTL)
    const exp = await request(app).post('/admin/expire-tokens').send({})
    expect(exp.status).toBe(200)
    expect(exp.body.data.status).toBe('expired')

    // Request dengan token lama → 401 TOKEN_EXPIRED
    const denied = await request(app).get('/journals').set({ Authorization: `Bearer ${oldAccess}` })
    expectError(denied, 401, 'TOKEN_EXPIRED')

    // Refresh → token baru → request sukses (alur auto-refresh klien)
    const refreshed = await request(app).post('/auth/refresh').send({ refreshToken })
    expect(refreshed.status).toBe(200)
    expect(refreshed.body.data.accessToken).toMatch(/^mock\.user-001\./)
    const okRes = await request(app).get('/journals').set({ Authorization: `Bearer ${refreshed.body.data.accessToken}` })
    expect(okRes.status).toBe(200)
  })

  it('login & refresh mengembalikan expiresIn sesuai TTL default (3600 detik)', async () => {
    const login = await request(app).post('/auth/login').send(USERS.admin)
    expect(login.body.data.expiresIn).toBe(3600)
  })
})

// ------------------------------------------------------------
describe('403 — Forbidden (role tanpa izin, API §13)', () => {
  it('viewer POST /journals → FORBIDDEN (tidak punya journal.write)', async () => {
    const res = await request(app).post('/journals').set(auth('viewer')).send({
      date: '2026-03-15',
      lines: [
        { accountId: '1-1100', debit: 1_000_000, credit: 0 },
        { accountId: '4-1000', debit: 0, credit: 1_000_000 },
      ],
    })
    expectError(res, 403, 'FORBIDDEN')
  })

  it('accountant approve → NO_APPROVAL_RIGHTS (tidak punya journal.approve)', async () => {
    const res = await request(app).post('/journals/JNL-2026-03-006/approve').set(auth('accountant'))
    expectError(res, 403, 'NO_APPROVAL_RIGHTS')
  })

  it('viewer reject → NO_APPROVAL_RIGHTS (tidak punya journal.approve)', async () => {
    const res = await request(app).post('/journals/JNL-2026-03-006/reject').set(auth('viewer')).send({ reason: 'x' })
    expectError(res, 403, 'NO_APPROVAL_RIGHTS')
  })
})

// ------------------------------------------------------------
describe('409 — Conflict (API §13)', () => {
  it('nomor bukti duplikat → TRANSACTION_NUMBER_DUPLICATE', async () => {
    const res = await request(app).post('/journals').set(auth()).send({
      date: '2026-03-15',
      transactionNumber: 'BKM-2026-03-0001', // sudah dipakai seed posted (ent-001)
      lines: [
        { accountId: '1-1100', debit: 1_000_000, credit: 0 },
        { accountId: '4-1000', debit: 0, credit: 1_000_000 },
      ],
    })
    expectError(res, 409, 'TRANSACTION_NUMBER_DUPLICATE')
  })

  it('nomor bukti sama di entitas lain TIDAK duplikat (multi-tenant, scoped per entityId)', async () => {
    // ent-002 tidak punya jurnal — nomor BKM-2026-03-0001 (dipakai ent-001) sah di sini
    const res = await request(app).post('/journals').set({ ...auth(), 'X-Entity-Id': 'ent-002' }).send({
      date: '2026-03-15',
      transactionNumber: 'BKM-2026-03-0001',
      lines: [
        { accountId: '1-1100', debit: 1_000_000, credit: 0 },
        { accountId: '4-1000', debit: 0, credit: 1_000_000 },
      ],
    })
    expect(res.status).toBe(201)
    expect(res.body.data.entityId).toBe('ent-002')
  })

  it('edit jurnal posted → JOURNAL_ALREADY_POSTED', async () => {
    const res = await request(app).put('/journals/JNL-2026-03-001').set(auth()).send({
      date: '2026-03-05',
      description: 'edit',
      lines: [
        { accountId: '1-1100', debit: 1_000_000, credit: 0 },
        { accountId: '4-1000', debit: 0, credit: 1_000_000 },
      ],
    })
    expectError(res, 409, 'JOURNAL_ALREADY_POSTED')
  })

  it('reverse jurnal sudah reversed → ALREADY_REVERSED', async () => {
    const res = await request(app).post('/journals/JNL-2026-03-008/reverse').set(auth())
    expectError(res, 409, 'ALREADY_REVERSED')
  })

  it('reverse jurnal draft → INVALID_STATUS_TRANSITION', async () => {
    const res = await request(app).post('/journals/JNL-2026-03-006/reverse').set(auth())
    expectError(res, 409, 'INVALID_STATUS_TRANSITION')
  })

  it('submit jurnal posted → INVALID_STATUS_TRANSITION', async () => {
    const res = await request(app).post('/journals/JNL-2026-03-001/submit').set(auth())
    expectError(res, 409, 'INVALID_STATUS_TRANSITION')
  })

  it('optimistic lock If-Match mismatch → DATA_CONFLICT', async () => {
    const res = await request(app)
      .put('/journals/JNL-2026-03-006')
      .set({ ...auth(), 'If-Match': '99' }) // version seed = 1
      .send({
        date: '2026-03-18',
        description: 'konflik',
        lines: [
          { accountId: '1-1100', debit: 1_000_000, credit: 0 },
          { accountId: '4-1000', debit: 0, credit: 1_000_000 },
        ],
      })
    expectError(res, 409, 'DATA_CONFLICT')
  })

  it('kode akun duplikat → ACCOUNT_CODE_EXISTS', async () => {
    const res = await request(app).post('/accounts').set(auth()).send({
      code: '1-1100', // sudah ada di seed
      name: 'Kas Besar Dua',
      type: 'asset',
      normalBalance: 'debit',
    })
    expectError(res, 409, 'ACCOUNT_CODE_EXISTS')
  })

  it('hapus akun header beranak → ACCOUNT_HAS_CHILDREN', async () => {
    const res = await request(app).delete('/accounts/1-1000').set(auth()) // Aktiva Lancar punya anak
    expectError(res, 409, 'ACCOUNT_HAS_CHILDREN')
  })

  it('hapus akun bersaldo → ACCOUNT_HAS_BALANCE', async () => {
    const res = await request(app).delete('/accounts/1-1100').set(auth()) // Kas 87jt
    expectError(res, 409, 'ACCOUNT_HAS_BALANCE')
  })

  it('email user duplikat → EMAIL_EXISTS', async () => {
    const res = await request(app).post('/users').set(auth()).send({
      name: 'Rina Kembar',
      email: USERS.admin.email,
      role: 'accountant',
    })
    expectError(res, 409, 'EMAIL_EXISTS')
  })

  it('periode duplikat → PERIOD_EXISTS', async () => {
    const res = await request(app).post('/periods').set(auth()).send({ month: 3, year: 2026 })
    expectError(res, 409, 'PERIOD_EXISTS')
  })

  it('tutup periode yang sudah tertutup → PERIOD_ALREADY_CLOSED', async () => {
    const res = await request(app).patch('/periods/fp-2026-01/close').set(auth()).send({})
    expectError(res, 409, 'PERIOD_ALREADY_CLOSED')
  })

  it('template COA mode replace saat sudah ada akun → ACCOUNTS_EXIST', async () => {
    const res = await request(app).post('/accounts/template').set(auth()).send({
      templateId: 'ukm-psak-2026',
      mode: 'replace',
    })
    expectError(res, 409, 'ACCOUNTS_EXIST')
  })
})

// ------------------------------------------------------------
describe('422 — Validasi bisnis (API §13)', () => {
  it('login tanpa email/password → VALIDATION_ERROR', async () => {
    const res = await request(app).post('/auth/login').send({})
    expectError(res, 422, 'VALIDATION_ERROR')
  })

  it('change-password baru < 8 karakter → WEAK_PASSWORD', async () => {
    const res = await request(app)
      .post('/auth/change-password')
      .set(auth())
      .send({ currentPassword: 'password123', newPassword: 'abc' })
    expectError(res, 422, 'WEAK_PASSWORD')
  })

  it('jurnal tanpa baris → JOURNAL_NO_LINES', async () => {
    const res = await request(app).post('/journals').set(auth()).send({ date: '2026-03-15', lines: [] })
    expectError(res, 422, 'JOURNAL_NO_LINES')
  })

  it('jurnal tidak balance → JOURNAL_UNBALANCED (dengan details)', async () => {
    const res = await request(app).post('/journals').set(auth()).send({
      date: '2026-03-15',
      lines: [
        { accountId: '1-1100', debit: 1_000_000, credit: 0 },
        { accountId: '4-1000', debit: 0, credit: 2_000_000 },
      ],
    })
    expectError(res, 422, 'JOURNAL_UNBALANCED')
  })

  it('debit negatif → LINE_NEGATIVE_AMOUNT', async () => {
    const res = await request(app).post('/journals').set(auth()).send({
      date: '2026-03-15',
      lines: [
        { accountId: '1-1100', debit: -1_000_000, credit: 0 },
        { accountId: '4-1000', debit: 0, credit: -1_000_000 },
      ],
    })
    expectError(res, 422, 'LINE_NEGATIVE_AMOUNT')
  })

  it('satu baris debit & kredit sekaligus → LINE_BOTH_SIDES', async () => {
    const res = await request(app).post('/journals').set(auth()).send({
      date: '2026-03-15',
      lines: [
        { accountId: '1-1100', debit: 1_000_000, credit: 1_000_000 },
        { accountId: '4-1000', debit: 0, credit: 2_000_000 },
      ],
    })
    expectError(res, 422, 'LINE_BOTH_SIDES')
  })

  it('akun header di baris jurnal → LINE_HEADER_ACCOUNT', async () => {
    const res = await request(app).post('/journals').set(auth()).send({
      date: '2026-03-15',
      lines: [
        { accountId: '1-1000', debit: 1_000_000, credit: 0 }, // Aktiva Lancar (header)
        { accountId: '4-1000', debit: 0, credit: 1_000_000 },
      ],
    })
    expectError(res, 422, 'LINE_HEADER_ACCOUNT')
  })

  it('akun tidak ditemukan di baris jurnal → LINE_NO_ACCOUNT', async () => {
    const res = await request(app).post('/journals').set(auth()).send({
      date: '2026-03-15',
      lines: [
        { accountId: '9-9999', debit: 1_000_000, credit: 0 },
        { accountId: '4-1000', debit: 0, credit: 1_000_000 },
      ],
    })
    expectError(res, 422, 'LINE_NO_ACCOUNT')
  })

  it('jurnal di periode tertutup (Februari) → PERIOD_CLOSED', async () => {
    const res = await request(app).post('/journals').set(auth()).send({
      date: '2026-02-15',
      lines: [
        { accountId: '1-1100', debit: 1_000_000, credit: 0 },
        { accountId: '4-1000', debit: 0, credit: 1_000_000 },
      ],
    })
    expectError(res, 422, 'PERIOD_CLOSED')
  })

  it('reject tanpa alasan → REASON_REQUIRED', async () => {
    const create = await request(app).post('/journals').set(auth()).send({
      date: '2026-03-15',
      submitForApproval: true,
      lines: [
        { accountId: '1-1100', debit: 1_000_000, credit: 0 },
        { accountId: '4-1000', debit: 0, credit: 1_000_000 },
      ],
    })
    expect(create.status).toBe(201)
    const res = await request(app).post(`/journals/${create.body.data.id}/reject`).set(auth()).send({})
    expectError(res, 422, 'REASON_REQUIRED')
  })

  it('format kode akun salah → INVALID_CODE_FORMAT', async () => {
    const res = await request(app).post('/accounts').set(auth()).send({ code: 'abc', name: 'X', type: 'asset' })
    expectError(res, 422, 'INVALID_CODE_FORMAT')
  })

  it('parent akun tidak ditemukan → INVALID_PARENT', async () => {
    const res = await request(app).post('/accounts').set(auth()).send({
      code: '9-1000',
      name: 'X',
      type: 'asset',
      parentId: '9-9999',
    })
    expectError(res, 422, 'INVALID_PARENT')
  })

  it('tutup periode dengan draft tanpa konfirmasi → DRAFT_ACTION_REQUIRED', async () => {
    // Seed Maret 2026 punya 2 jurnal draft (JNL-006, JNL-007)
    const res = await request(app).patch('/periods/fp-2026-03/close').set(auth()).send({})
    expectError(res, 422, 'DRAFT_ACTION_REQUIRED')
  })

  it('periode ledger tidak dikenal → INVALID_PERIOD', async () => {
    const res = await request(app).get('/ledger/accounts/1-1100').query({ period: '2026-99' }).set(auth())
    expectError(res, 422, 'INVALID_PERIOD')
  })

  it('format export tidak didukung → UNSUPPORTED_FORMAT', async () => {
    const res = await request(app)
      .get('/exports/reports/income-statement')
      .query({ format: 'docx' })
      .set(auth())
    expectError(res, 422, 'UNSUPPORTED_FORMAT')
  })
})

// ------------------------------------------------------------
describe('Export laporan — auth via query token (unduhan navigasi browser)', () => {
  it('export PDF dengan ?token= → 200 + Content-Disposition attachment', async () => {
    const res = await request(app)
      .get('/exports/reports/income-statement')
      .query({ format: 'pdf', period: '2026-03', token: tokens.admin })
    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toContain('attachment')
    expect(res.headers['content-disposition']).toContain('Laba-Rugi-2026-03.pdf')
  })

  it('token query invalid → 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .get('/exports/reports/income-statement')
      .query({ format: 'pdf', token: 'mock.user-999.1234567890' })
    expectError(res, 401, 'UNAUTHORIZED')
  })
})

// ------------------------------------------------------------
describe('404 — Not Found (API §13)', () => {
  it('jurnal tidak ada → JOURNAL_NOT_FOUND', async () => {
    const res = await request(app).get('/journals/JNL-2026-03-999').set(auth())
    expectError(res, 404, 'JOURNAL_NOT_FOUND')
  })

  it('akun tidak ada → ACCOUNT_NOT_FOUND', async () => {
    const res = await request(app).delete('/accounts/9-9999').set(auth())
    expectError(res, 404, 'ACCOUNT_NOT_FOUND')
  })

  it('periode tidak ada → PERIOD_NOT_FOUND', async () => {
    const res = await request(app).patch('/periods/fp-2099-01/activate').set(auth())
    expectError(res, 404, 'PERIOD_NOT_FOUND')
  })

  it('route tidak dikenal → NOT_FOUND', async () => {
    const res = await request(app).get('/entah-apa').set(auth())
    expectError(res, 404, 'NOT_FOUND')
  })
})

// ------------------------------------------------------------
describe('Kode error katalog yang baru terimplementasi (API §13)', () => {
  it('refresh dengan sesi kedaluwarsa → SESSION_EXPIRED (modal "Sesi berakhir")', async () => {
    // TTL refresh = 0 → expiresAt = waktu login → sesi langsung kedaluwarsa
    process.env.MOCK_REFRESH_TTL_MS = '0'
    try {
      const login = await request(app).post('/auth/login').send(USERS.admin)
      expect(login.status).toBe(200)
      const res = await request(app).post('/auth/refresh')
        .send({ refreshToken: login.body.data.refreshToken })
      expectError(res, 401, 'SESSION_EXPIRED')
    } finally {
      delete process.env.MOCK_REFRESH_TTL_MS
    }
  })

  it('refresh dengan token tak dikenal → INVALID_REFRESH_TOKEN', async () => {
    const res = await request(app).post('/auth/refresh')
      .send({ refreshToken: 'bukan-token-yang-ada' })
    expectError(res, 401, 'INVALID_REFRESH_TOKEN')
  })

  it('upload lampiran > 5 MB → FILE_TOO_LARGE', async () => {
    const res = await request(app).post('/journals/JNL-2026-03-006/attachments').set(auth()).send({
      fileName: 'bukti-besar.pdf',
      size: 6 * 1024 * 1024, // 6 MB
      mimeType: 'application/pdf',
    })
    expectError(res, 422, 'FILE_TOO_LARGE')
  })

  it('upload lampiran tipe tak didukung → UNSUPPORTED_FILE_TYPE', async () => {
    const res = await request(app).post('/journals/JNL-2026-03-006/attachments').set(auth()).send({
      fileName: 'catatan.txt',
      size: 1024,
      mimeType: 'text/plain',
    })
    expectError(res, 422, 'UNSUPPORTED_FILE_TYPE')
  })

  it('upload lampiran VALID → 201 (jpg/png/pdf ≤ 5 MB)', async () => {
    const res = await request(app).post('/journals/JNL-2026-03-006/attachments').set(auth()).send({
      fileName: 'bukti.png',
      size: 245_760,
      mimeType: 'image/png',
    })
    expect(res.status).toBe(201)
    expect(res.body.data.mimeType).toBe('image/png')
  })

  it('melebihi ambang request → RATE_LIMITED (429)', async () => {
    process.env.MOCK_RATE_MAX = '3'
    try {
      let last
      for (let i = 0; i < 5; i++) last = await request(app).get('/health')
      expectError(last, 429, 'RATE_LIMITED')
    } finally {
      delete process.env.MOCK_RATE_MAX
    }
  })

  it('default 30 req/menit per endpoint (API §1.5) → RATE_LIMITED pada ~request ke-31', async () => {
    // Non-test: default 30 aktif (NODE_ENV=test justru tanpa batas agar suite
    // unit tidak kena throttle). Bucket /health bisa menyimpan sisa hitungan
    // dari test threshold-3 di atas, jadi rentang 25–30 memvalidasi batas
    // default ≈ 30/menit per endpoint secara deterministik (urutan aman).
    const prevEnv = process.env.NODE_ENV
    const prevMax = process.env.MOCK_RATE_MAX
    process.env.NODE_ENV = 'development'
    delete process.env.MOCK_RATE_MAX
    try {
      let last, okCount = 0
      for (let i = 0; i < 40; i++) {
        last = await request(app).get('/health')
        if (last.status === 429) break
        okCount += 1
      }
      expect(okCount).toBeGreaterThanOrEqual(25)
      expect(okCount).toBeLessThanOrEqual(30)
      expectError(last, 429, 'RATE_LIMITED')
    } finally {
      process.env.NODE_ENV = prevEnv
      if (prevMax !== undefined) process.env.MOCK_RATE_MAX = prevMax
      else delete process.env.MOCK_RATE_MAX
    }
  })

  it('approve tanpa izin approve → NO_APPROVAL_RIGHTS', async () => {
    const create = await request(app).post('/journals').set(auth()).send({
      date: '2026-03-15',
      description: 'jurnal untuk uji izin approve',
      submitForApproval: true,
      lines: [
        { accountId: '1-1100', debit: 2_000_000, credit: 0 },
        { accountId: '4-1000', debit: 0, credit: 2_000_000 },
      ],
    })
    expect(create.status).toBe(201)
    const res = await request(app).post(`/journals/${create.body.data.id}/approve`).set(auth('viewer'))
    expectError(res, 403, 'NO_APPROVAL_RIGHTS')
  })

  it('error server tak terduga → INTERNAL_ERROR (500) dengan kode', async () => {
    const res = await request(app).post('/admin/debug/error')
    expectError(res, 500, 'INTERNAL_ERROR')
    expect(res.body.error.message).toMatch(/Kode: E\d{5}/)
  })
})

// ------------------------------------------------------------
describe('Cakupan katalog error (API §13)', () => {
  // Kode katalog yang TERIMPLEMENTASI di mock — harus bisa dipicu minimal 1×
  const IMPLEMENTED = [
    'VALIDATION_ERROR', 'UNAUTHORIZED', 'INVALID_CREDENTIALS', 'FORBIDDEN',
    'NOT_FOUND', 'ACCOUNT_NOT_FOUND', 'JOURNAL_NOT_FOUND', 'PERIOD_NOT_FOUND',
    'JOURNAL_UNBALANCED', 'JOURNAL_NO_LINES', 'LINE_NEGATIVE_AMOUNT',
    'JOURNAL_ALREADY_POSTED', 'ALREADY_REVERSED', 'INVALID_STATUS_TRANSITION',
    'TRANSACTION_NUMBER_DUPLICATE', 'ACCOUNT_CODE_EXISTS', 'ACCOUNT_HAS_CHILDREN',
    'ACCOUNT_HAS_BALANCE', 'PERIOD_CLOSED', 'PERIOD_ALREADY_CLOSED', 'PERIOD_EXISTS',
    'DRAFT_ACTION_REQUIRED', 'DATA_CONFLICT',
    'SESSION_EXPIRED', 'FILE_TOO_LARGE', 'UNSUPPORTED_FILE_TYPE',
    'RATE_LIMITED', 'NO_APPROVAL_RIGHTS', 'INTERNAL_ERROR',
  ]

  it('setiap kode katalog terimplementasi dapat dipicu minimal 1×', () => {
    const missing = IMPLEMENTED.filter((code) => !TRIGGERED.has(code))
    expect(missing).toEqual([])
  })
})
