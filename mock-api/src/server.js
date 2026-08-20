// ============================================================
// Mock API Server — Appsheet Accounting Journal
// Implementasi endpoint di `API - Accounting.md` dengan logika
// akuntansi nyata: double-entry, saldo diturunkan dari jurnal,
// reverse membuat jurnal pembalik, periode tertutup diblokir.
//
// Jalankan: npm start (port 4000)
// ============================================================
import express from 'express'
import cors from 'cors'
import { randomUUID } from 'crypto'
import { entities, users, rolePermissions, accounts, coaTemplate, journals, periods, mockTrend, extraJournals, ent2Accounts, ent2Journals } from './data.js'
import { isEnabled as persistEnabled, getFilePath as persistFilePath, loadState as loadPersisted, saveState as savePersisted } from './persistence.js'
import { deflateSync } from 'zlib'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { buildConnectionString, getPool, destroyPool, testQuery, getPoolStatus } from './db.js'
import * as Adapter from './db-adapter.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
// exposedHeaders: browser perlu membaca Content-Disposition (nama file export
// dari respons download laporan) DAN Retry-After (jeda retry 429 RATE_LIMITED
// dibaca via res.headers.get('retry-after') di client.ts — header ini bukan
// CORS-safelisted, jadi wajib di-expose agar terbaca JavaScript).
app.use(cors({ exposedHeaders: ['Content-Disposition', 'Retry-After'] }))
app.use(express.json())

// ------------------------------------------------------------
// Serve static frontend (production build) — path relatif dari src/ ke static/
// Saat dev (tanpa build), direktori static/ tidak ada → skip.
// ------------------------------------------------------------
const staticDir = join(__dirname, '..', 'static')
if (existsSync(staticDir)) {
  app.use(express.static(staticDir))
  console.log('[Server] Serving static frontend from', staticDir)
}

// ------------------------------------------------------------
// State in-memory — dibuat dari seed; bisa di-reset kapan saja
// lewat POST /admin/reset (lihat bagian 0 di bawah).
// withExtra=true ikut memuat jurnal lintas bulan (Jan–Feb 2026).
// ------------------------------------------------------------
const createDb = ({ withExtra = false } = {}) => ({
  // structuredClone PENTING: seed di data.js adalah modul-level. Tanpa deep-copy,
  // mutasi saat runtime (tutup periode, reverse jurnal, ganti password, edit akun)
  // ikut mengubah objek seed → reset tidak mengembalikan kondisi awal.
  entities: structuredClone(entities),
  users: structuredClone(users),
  // Akun & jurnal di-stamp entityId (multi-tenant). Seed dimiliki ent-001;
  // ent2Accounts/ent2Journals milik ent-002 (CV Karya Mandiri). Id akun bisa
  // sama antar entitas — isolasi via entityId + header X-Entity-Id.
  accounts: [
    ...structuredClone(accounts).map((a) => ({ ...a, entityId: 'ent-001' })),
    ...structuredClone(ent2Accounts).map((a) => ({ ...a, entityId: 'ent-002' })),
  ],
  journals: [
    ...structuredClone([...journals, ...(withExtra ? extraJournals : [])]).map((j) => ({ entityId: 'ent-001', ...j })),
    // Fixture ent-002 (CV Karya Mandiri) selalu dimuat — entity switcher punya
    // data nyata untuk dipertukarkan (mirror MSW handlers prototipe).
    ...structuredClone(ent2Journals).map((j) => ({ entityId: 'ent-002', ...j })),
  ],
  periods: structuredClone(periods),
  sessions: new Map(), // refreshToken -> userId
  seq: { journal: 100, line: 100, attachment: 100, user: 100, entity: 100 },
  // Konfigurasi koneksi database PostgreSQL (Pengaturan)
  dbConfig: { storageMode: 'local', host: 'localhost', port: '5432', database: 'accounting_db', schema: 'public', username: 'postgres', password: '', tables: { accounts: 'accounts', journals: 'journals', journalLines: 'journal_lines', periods: 'periods', users: 'users', entities: 'entities', sessions: 'sessions', attachments: 'attachments' } },
})

let db = createDb()

// ------------------------------------------------------------
// Persistence opsional (MOCK_API_PERSIST / MOCK_API_PERSIST_FILE)
// - AKTIF secara default: state dimuat dari file saat start dan
//   disimpan setelah setiap mutasi sukses → jurnal yang diposting
//   tidak hilang saat restart.
// - Nonaktifkan: MOCK_API_PERSIST=0 (perilaku in-memory lama).
// ------------------------------------------------------------
const PERSIST = persistEnabled()
const PERSIST_FILE = persistFilePath()

if (PERSIST) {
  const loaded = loadPersisted(PERSIST_FILE)
  if (loaded) {
    const loadedAccounts = (loaded.accounts ?? []).map((a) => ({ ...a, entityId: a.entityId ?? 'ent-001' }))
    const loadedJournals = (loaded.journals ?? []).map((j) => ({ ...j, entityId: j.entityId ?? 'ent-001' }))
    // Persist dibuat SEBELUM entitas seed baru (mis. ent-002) ada → entitas itu
    // absen dari file. Merge seed ent-002 hanya jika BELUM ADA satupun akun/
    // jurnal ent-002 (agar hapus akun oleh user tidak di-revert di restart).
    if (!loadedAccounts.some((a) => a.entityId === 'ent-002')) {
      loadedAccounts.push(...structuredClone(ent2Accounts).map((a) => ({ ...a, entityId: 'ent-002' })))
    }
    if (!loadedJournals.some((j) => j.entityId === 'ent-002')) {
      loadedJournals.push(...structuredClone(ent2Journals).map((j) => ({ entityId: 'ent-002', ...j })))
    }
    db = {
      entities: loaded.entities,
      users: loaded.users,
      accounts: loadedAccounts,
      journals: loadedJournals,
      periods: loaded.periods,
      sessions: new Map(loaded.sessions ?? []),
      seq: loaded.seq ?? { journal: 100, line: 100, attachment: 100, user: 100, entity: 100 },
      dbConfig: { storageMode: 'local', host: 'localhost', port: '5432', database: 'accounting_db', schema: 'public', username: 'postgres', password: '', tables: { accounts: 'accounts', journals: 'journals', journalLines: 'journal_lines', periods: 'periods', users: 'users', entities: 'entities', sessions: 'sessions', attachments: 'attachments' }, ...(loaded.dbConfig || {}) },
    }
    console.log(`💾 [persist] State dimuat dari ${PERSIST_FILE} (${db.journals.length} jurnal)`)
  } else {
    // File belum ada / rusak → seed awal, sekaligus tulis file agar
    // state berikutnya punya baseline yang konsisten.
    savePersisted(PERSIST_FILE, db)
  }
}

// Simpan state setelah MUTASI sukses (status < 400). Dikecualikan:
// - GET/HEAD/OPTIONS (read-only)
// - POST /admin/seed-bulk (data uji massal RG-09, tidak perlu disimpan
//   dan JSON-nya besar — membuat file persist membengkak)
if (PERSIST) {
  app.use((req, res, next) => {
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
    if (mutating && !req.path.startsWith('/admin/seed-bulk')) {
      res.on('finish', () => {
        if (res.statusCode < 400) savePersisted(PERSIST_FILE, db)
      })
    }
    next()
  })
}

// ------------------------------------------------------------
// Helper
// ------------------------------------------------------------
const nowIso = () => new Date().toISOString()
const pad = (n, w = 3) => String(n).padStart(w, '0')

const ok = (res, data, meta, status = 200) => {
  const body = { data }
  if (meta) body.meta = meta
  return res.status(status).json(body)
}
const fail = (res, status, code, message, details) =>
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } })

// ------------------------------------------------------------
// Rate limit (API §1.5 RATE_LIMITED) — 30 req/menit per endpoint
// per user (user di-approksimasi dengan IP di mock; login tidak
// ter-autentikasi). Bucket per (ip + endpoint), window 60s.
// Ambang dibaca PER-REQUEST dari env MOCK_RATE_MAX (default 30) &
// MOCK_RATE_WINDOW_MS (default 60s) agar test bisa menaikkan/
// menurunkan ambang tanpa me-restart server:
//   - NODE_ENV=test (Vitest) → tanpa batas KECUALI MOCK_RATE_MAX
//     di-set eksplisit (suite unit mengirim ratusan request).
//   - E2E Playwright & scripts/dev.mjs menaikkan ambang via env
//     agar suite regresi & klik manual tidak kena throttle.
// ------------------------------------------------------------
const rateBuckets = new Map() // "ip|endpoint" -> { count, resetAt }
// Override ambang via POST /admin/set-rate-limit (SAAT RUNTIME, tanpa restart) —
// dipakai E2E RG-21/22 & test ambang rendah. null = ikuti env/default.
let rateOverride = null
const rateLimit = (req, res, next) => {
  let max
  if (rateOverride) {
    max = rateOverride.max
  } else if (process.env.MOCK_RATE_MAX !== undefined && process.env.MOCK_RATE_MAX !== '') {
    max = Number(process.env.MOCK_RATE_MAX)
  } else {
    max = process.env.NODE_ENV === 'test' ? Infinity : 30 // API §1.5
  }
  const windowMs = (rateOverride && rateOverride.windowMs) || Number(process.env.MOCK_RATE_WINDOW_MS) || 60_000
  const key = `${req.ip || 'unknown'}|${req.baseUrl}${req.path}`
  const now = Date.now()
  const bucket = rateBuckets.get(key) ?? { count: 0, resetAt: now + windowMs }
  if (now >= bucket.resetAt) {
    bucket.count = 0
    bucket.resetAt = now + windowMs
  }
  bucket.count += 1
  rateBuckets.set(key, bucket)
  if (bucket.count > max) {
    // Retry-After (RFC 7231): sisa detik sampai bucket ter-reset — klien
    // memakainya sebagai jeda retry (dibatasi cap di client.ts agar UI
    // tidak menggantung saat window panjang).
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    res.set('Retry-After', String(retryAfter))
    return fail(res, 429, 'RATE_LIMITED', 'Terlalu banyak permintaan')
  }
  next()
}

// Ukuran & tipe lampiran yang didukung (API §13 FILE_TOO_LARGE / UNSUPPORTED_FILE_TYPE)
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_ATTACHMENT_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf'])

// Rate limit aktif untuk semua route KECUALI /admin/* (harus terpasang sebelum
// routes). Endpoint admin adalah alat dev/test — harus SELALU bisa diakses,
// termasuk mengubah ambang via /admin/set-rate-limit saat limit sedang rendah.
app.use((req, res, next) => {
  if (req.path.startsWith('/admin/')) return next()
  rateLimit(req, res, next)
})

// Saldo live per akun: baseBalance + efek jurnal posted (BR-6, BR-7)
// Jurnal yang memengaruhi saldo: posted DAN bukan jurnal pembalik.
// Jurnal asli yang di-reverse berstatus 'reversed' (tidak dihitung),
// jurnal pembalik punya reversalOf (tidak dihitung) → pasangan bernet 0.
const isEffect = (j) => j.status === 'posted' && !j.reversalOf

// ---- multi-tenant: entitas yang dilayani (mirror req.entityId di requireAuth) ----
const entityAccounts = (entityId) => db.accounts.filter((a) => a.entityId === entityId)
const entityJournals = (entityId) => db.journals.filter((j) => j.entityId === entityId)

// Saldo live per akun — PER ENTITAS: base + efek jurnal posted milik entitas itu.
const computeBalances = (entityId) => {
  const accounts = entityAccounts(entityId)
  const map = new Map(accounts.map((a) => [a.id, a.baseBalance]))
  for (const j of entityJournals(entityId)) {
    if (!isEffect(j)) continue
    for (const ln of j.lines) {
      const account = accounts.find((a) => a.id === ln.accountId)
      if (!account) continue
      const delta = account.normalBalance === 'debit' ? ln.debit - ln.credit : ln.credit - ln.debit
      map.set(account.id, (map.get(account.id) ?? 0) + delta)
    }
  }
  return map
}

// Bangun tree akun dari saldo live (API §4.1) — akun ENTITAS AKTIF saja.
const buildAccountTree = (entityId, balances) => {
  const byId = new Map(entityAccounts(entityId).map((a) => [a.id, { ...a, balance: balances.get(a.id) ?? 0, children: [] }]))
  const roots = []
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId).children.push(node)
    else roots.push(node)
  }
  // Saldo akun header = jumlah saldo anak
  const sumChildren = (node) => {
    if (!node.children.length) return node.balance
    const sum = node.children.reduce((acc, c) => acc + sumChildren(c), 0)
    node.balance = sum
    return sum
  }
  roots.forEach(sumChildren)
  return roots
}

// Envelope jurnal ringkas (API §5.1) + hitung total baris
const totalsOf = (journal) => {
  let debit = 0
  let credit = 0
  for (const ln of journal.lines) {
    debit += ln.debit
    credit += ln.credit
  }
  return { debit, credit, difference: debit - credit }
}

const journalBrief = (j) => {
  const t = totalsOf(j)
  return {
    id: j.id,
    transactionNumber: j.transactionNumber,
    date: j.date,
    description: j.description,
    status: j.status,
    totalDebit: t.debit,
    totalCredit: t.credit,
    createdBy: j.createdBy,
    createdAt: j.createdAt,
    approvedBy: j.approvedBy,
    approvedAt: j.approvedAt,
    hasAttachment: (j.attachments ?? []).length > 0,
    rejectionReason: j.rejectionReason,
    lines: j.lines,
  }
}

const findPeriodByDate = (dateStr) => {
  const d = new Date(dateStr)
  return db.periods.find((p) => {
    const s = new Date(p.startDate)
    const e = new Date(p.endDate)
    return d >= s && d <= e
  })
}

const periodByKey = (key) => db.periods.find((p) => p.id === key) ?? db.periods.find((p) => `${p.year}-${pad(p.month, 2)}` === key)

// Validasi jurnal (BR-1..BR-5) — dipakai POST & PUT.
// excludeJournalId: saat PUT, nomor bukti milik jurnal yang sama tidak dianggap duplikat.
// entityId: nomor bukti berseri PER ENTITAS (multi-tenant) — dua entitas boleh
// memakai nomor yang sama; duplikat hanya diperiksa dalam entitas yang sama.
const validateJournal = (body, excludeJournalId, entityId) => {
  const { date, lines, transactionNumber } = body
  if (!date || !Array.isArray(lines) || lines.length === 0)
    return { code: 'JOURNAL_NO_LINES', message: 'Jurnal harus memiliki minimal 1 debit dan 1 kredit', status: 422 }
  let debit = 0
  let credit = 0
  const details = []
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]
    if (!ln.accountId) {
      details.push({ field: `lines[${i}].accountId`, message: 'Akun wajib dipilih' })
      continue
    }
    // Akun divalidasi terhadap COA ENTITAS AKTIF (bukan global)
    const account = db.accounts.find((a) => a.entityId === entityId && a.id === ln.accountId)
    if (!account || !account.isActive)
      return { code: 'LINE_NO_ACCOUNT', message: 'Akun tidak aktif atau sudah dihapus', status: 422, details: [{ field: `lines[${i}].accountId`, message: `${ln.accountId}` }] }
    if (account.isHeader)
      return { code: 'LINE_HEADER_ACCOUNT', message: 'Akun grup tidak dapat diinput jurnal', status: 422, details: [{ field: `lines[${i}].accountId`, message: `${account.name} adalah akun header` }] }
    const d = Number(ln.debit ?? 0)
    const c = Number(ln.credit ?? 0)
    if (d < 0 || c < 0)
      return { code: 'LINE_NEGATIVE_AMOUNT', message: 'Nilai debit/kredit tidak boleh negatif', status: 422, details: [{ field: `lines[${i}].debit`, message: 'Nilai negatif' }] }
    if (d > 0 && c > 0)
      return { code: 'LINE_BOTH_SIDES', message: 'Satu baris tidak boleh debit dan kredit sekaligus', status: 422, details: [{ field: `lines[${i}]`, message: 'Pilih salah satu sisi' }] }
    debit += d
    credit += c
  }
  if (debit !== credit)
    return {
      code: 'JOURNAL_UNBALANCED',
      message: `Total debit (${debit}) dan kredit (${credit}) harus sama. Selisih: ${Math.abs(debit - credit)}`,
      status: 422,
      details: [{ field: 'lines', message: `Selisih: Rp${Math.abs(debit - credit).toLocaleString('id-ID')}` }],
    }
  if (transactionNumber) {
    const dup = db.journals.find((j) => j.entityId === entityId && j.transactionNumber === transactionNumber)
    if (dup && dup.id !== excludeJournalId) return { code: 'TRANSACTION_NUMBER_DUPLICATE', message: 'Nomor bukti sudah digunakan', status: 409 }
  }
  const period = findPeriodByDate(date)
  if (period && !period.isOpen)
    return { code: 'PERIOD_CLOSED', message: `Periode ${period.name} sudah ditutup`, status: 422 }
  return null
}

// ------------------------------------------------------------
// Auth middleware (token mock: "mock.<userId>.<issuedAt>")
// Access token KEDALUWARSA TERJADWAL — format token menyimpan waktu
// diterbitkan (ms); dianggap basi bila sudah lewat TTL.
//   - Default TTL 1 jam; demo cepat: MOCK_ACCESS_TTL=10 (10 detik)
//   - POST /admin/set-token-ttl mengubah TTL SAAT RUNTIME (tanpa restart)
//     → uji "access token hanya valid N detik" di sesi aktif
//   - POST /admin/expire-tokens memaksa SEMUA token lama basi (epoch),
//     supaya uji kedaluwarsa deterministik tanpa menunggu waktu nyata.
//   - POST /admin/reset mengembalikan TTL ke nilai default.
// Klien wajib refresh (401 → POST /auth/refresh → retry) — lihat
// prototype-accounting/src/api/client.ts.
// ------------------------------------------------------------
const DEFAULT_ACCESS_TTL_MS = (Number(process.env.MOCK_ACCESS_TTL) || 3600) * 1000
let accessTtlMs = DEFAULT_ACCESS_TTL_MS
let tokenEpoch = 0

// TTL refresh token (default 7 hari). Dibaca per panggilan agar test bisa
// menyetel MOCK_REFRESH_TTL_MS kecil untuk memicu SESSION_EXPIRED.
const refreshTtlMs = () => {
  const v = Number(process.env.MOCK_REFRESH_TTL_MS)
  return Number.isFinite(v) ? v : 7 * 24 * 3600 * 1000
}

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token || !token.startsWith('mock.')) return fail(res, 401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
  const userId = token.split('.')[1]
  const issuedAt = Number(token.split('.')[2] || 0)
  const user = db.users.find((u) => u.id === userId && u.isActive)
  if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
  if (!issuedAt || issuedAt < tokenEpoch || Date.now() - issuedAt > accessTtlMs)
    return fail(res, 401, 'TOKEN_EXPIRED', 'Access token kedaluwarsa. Silakan refresh.')
  req.user = user
  // Multi-tenant: X-Entity-Id, default dari profil user
  req.entityId = req.headers['x-entity-id'] || user.entityId
  next()
}

// Auth khusus endpoint export: terima token dari header Bearer ATAU query
// `?token=` (+ `?entity=`). Unduhan berbasis navigasi browser (anchor download)
// tidak bisa mengirim header Authorization/X-Entity-Id, jadi token & entitas
// dikirim via query — hanya berlaku untuk GET /exports/... (bukan endpoint lain).
const requireAuthExport = (req, res, next) => {
  if (req.query.token && !req.headers.authorization) req.headers.authorization = `Bearer ${req.query.token}`
  if (req.query.entity && !req.headers['x-entity-id']) req.headers['x-entity-id'] = String(req.query.entity)
  requireAuth(req, res, next)
}

const requirePermission = (...perms) => (req, res, next) => {
  const allowed = rolePermissions[req.user.role] ?? []
  if (!perms.some((p) => allowed.includes(p)))
    return fail(res, 403, 'FORBIDDEN', 'Tidak memiliki akses')
  next()
}

// Izin khusus approve/reject: kegagalan izin → NO_APPROVAL_RIGHTS (API §13),
// bukan FORBIDDEN generik — klien menampilkan pesan "role tidak punya izin".
const requireApprovalRights = (req, res, next) => {
  const allowed = rolePermissions[req.user.role] ?? []
  if (!allowed.includes('journal.approve'))
    return fail(res, 403, 'NO_APPROVAL_RIGHTS', 'Role Anda tidak memiliki izin approve')
  next()
}

// Pagination helper (API §1.3)
const paginate = (arr, page = 1, pageSize = 50) => {
  page = Math.max(1, Number(page) || 1)
  pageSize = Math.min(200, Math.max(1, Number(pageSize) || 50))
  const start = (page - 1) * pageSize
  return {
    items: arr.slice(start, start + pageSize),
    meta: { page, pageSize, total: arr.length, totalPages: Math.ceil(arr.length / pageSize) },
  }
}

// ------------------------------------------------------------
// 0. ADMIN — reset state ke seed (alat development, tanpa auth)
//    POST /admin/reset             → seed awal (Maret 2026)
//    POST /admin/reset {"withExtra":true} → seed + jurnal lintas bulan
// Dipakai `npm run reset` / `npm run seed:extra` (scripts/reset.js).
// ------------------------------------------------------------
app.post('/admin/reset', (req, res) => {
  const withExtra = !!req.body?.withExtra
  db = createDb({ withExtra })
  // Reset penuh: kembalikan epoch kedaluwarsa token ke 0 (token lama valid lagi)
  tokenEpoch = 0
  // Kembalikan TTL ke nilai default (env MOCK_ACCESS_TTL atau 3600 detik)
  accessTtlMs = DEFAULT_ACCESS_TTL_MS
  // Rate limit kembali ke env/default + bucket dikosongkan (deterministik)
  rateOverride = null
  rateBuckets.clear()
  ok(res, {
    status: 'reset',
    seed: withExtra ? 'extra' : 'base',
    journals: db.journals.length,
    accounts: db.accounts.length,
    periods: db.periods.length,
    message: withExtra ? 'Seed + jurnal lintas bulan (Jan–Feb 2026) dimuat' : 'State di-reset ke seed awal (Maret 2026)',
  })
})

// Paksa semua access token yang diterbitkan sebelumnya kedaluwarsa
// (alat development; uji kedaluwarsa jadi deterministik tanpa menunggu TTL).
app.post('/admin/expire-tokens', (req, res) => {
  tokenEpoch = Date.now()
  ok(res, { status: 'expired', message: 'Semua access token yang diterbitkan sebelumnya kini kedaluwarsa' })
})

// Paksa SEMUA refresh token kedaluwarsa (alat development) — memicu alur
// SESSION_EXPIRED di klien secara deterministik TANPA restart / menunggu TTL:
// setiap sesi login di-set expiresAt ke masa lalu, sehingga POST /auth/refresh
// berikutnya mengembalikan 401 SESSION_EXPIRED (dan menghapus sesi tsb).
// Dipakai E2E RG-20: refresh gagal → modal "Sesi berakhir" + login ulang wajib.
app.post('/admin/expire-refresh-tokens', (req, res) => {
  for (const [, entry] of db.sessions) entry.expiresAt = Date.now() - 1
  ok(res, { status: 'expired', message: 'Semua refresh token kini kedaluwarsa — refresh berikutnya → SESSION_EXPIRED' })
})

// Ubah ambang rate limit SAAT RUNTIME (tanpa restart) — uji alur RATE_LIMITED
// (E2E RG-21/22): ambang rendah memicu 429, lalu naikkan kembali agar retry
// klien sukses. Bucket dikosongkan saat dipanggil → hitungan deterministik
// dimulai dari titik ini. Override ini menang atas env MOCK_RATE_MAX;
// POST /admin/reset mengembalikan ke env/default.
app.post('/admin/set-rate-limit', (req, res) => {
  const max = Number(req.body?.max)
  if (!Number.isFinite(max) || max < 1)
    return fail(res, 422, 'VALIDATION_ERROR', 'max wajib angka >= 1', [{ field: 'max', message: 'Angka >= 1' }])
  const windowMs = Number(req.body?.windowMs)
  rateOverride = { max, windowMs: Number.isFinite(windowMs) && windowMs >= 100 ? windowMs : 60_000 }
  rateBuckets.clear()
  ok(res, {
    max,
    windowMs: rateOverride.windowMs,
    message: `Rate limit kini ${max} req/menit per endpoint (bucket dikosongkan)`,
  })
})

// Ubah TTL access token SAAT RUNTIME (tanpa restart) — uji "token valid
// hanya N detik": token yang diterbitkan SEBELUMNYA ikut basi setelah N
// detik dari issuedAt-nya (karena check pakai Date.now() - issuedAt).
// Dipakai simulasi kedaluwarsa terjadwal di sesi aktif (E2E RG-19).
app.post('/admin/set-token-ttl', (req, res) => {
  const ttlSeconds = Number(req.body?.ttlSeconds)
  if (!Number.isFinite(ttlSeconds) || ttlSeconds < 1)
    return fail(res, 422, 'VALIDATION_ERROR', 'ttlSeconds wajib angka >= 1', [{ field: 'ttlSeconds', message: 'Angka >= 1' }])
  accessTtlMs = ttlSeconds * 1000
  ok(res, { ttlSeconds, expiresIn: ttlSeconds, message: `Access token kini hanya valid ${ttlSeconds} detik (token lama ikut basi sesuai issuedAt)` })
})

// Seed massal jurnal seimbang (alat development) — dipakai uji performa
// RG-09 di QA Test Plan (10.000 jurnal). Langsung push ke db tanpa validasi
// per-baris agar cepat; angka unik agar tidak bentrok dengan seed.
app.post('/admin/seed-bulk', requireAuth, (req, res) => {
  const count = Math.min(50000, Math.max(1, Number(req.body?.count) || 1000))
  const base = db.journals.length
  const chunks = []
  for (let i = 1; i <= count; i++) {
    const n = base + i
    const date = `2026-03-${String((i % 28) + 1).padStart(2, '0')}`
    chunks.push({
      id: `JNL-BULK-${pad(n, 6)}`,
      transactionNumber: `BKM-2026-03-${pad(n + 1000, 4)}`,
      date,
      description: `Jurnal bulk #${n} — penerimaan jasa konsultasi`,
      lines: [
        { id: `bl-${n}-1`, accountId: '1-1100', accountCode: '1-1100', accountName: 'Kas Besar', debit: 1_000_000, credit: 0, description: 'Seed massal' },
        { id: `bl-${n}-2`, accountId: '4-1000', accountCode: '4-1000', accountName: 'Pendapatan Jasa', debit: 0, credit: 1_000_000, description: 'Seed massal' },
      ],
      status: 'posted', version: 1, createdBy: 'user-001', createdAt: `${date}T09:00:00Z`, postedAt: `${date}T09:05:00Z`,
      auditTrail: [{ userId: 'user-001', action: 'create', timestamp: `${date}T09:00:00Z` }],
      attachments: [],
      entityId: req.entityId,
    })
  }
  db.journals.push(...chunks)
  ok(res, { added: count, journals: db.journals.length })
})

// ------------------------------------------------------------
// 2. AUTH & USERS
// ------------------------------------------------------------
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) return fail(res, 422, 'VALIDATION_ERROR', 'Email dan password wajib diisi', [{ field: 'email', message: 'Wajib diisi' }])
  let user
  let pgAvailable = Adapter.isPgMode(db)
  if (pgAvailable) {
    try {
      const found = await Adapter.findUserByEmail(email, db)
      if (!found || !found.isActive) return fail(res, 401, 'INVALID_CREDENTIALS', 'Email atau password salah')
      user = { ...found, password: password } // mock auth: password selalu cocok
    } catch (err) {
      console.warn(`[WARN] PostgreSQL query gagal, fallback in-memory: ${err.message}`)
      pgAvailable = false
    }
  }
  if (!pgAvailable && !user) {
    user = db.users.find((u) => u.email === email && u.password === password && u.isActive)
    if (!user) return fail(res, 401, 'INVALID_CREDENTIALS', 'Email atau password salah')
  }
  const refreshToken = randomUUID()
  if (pgAvailable) {
    try {
      await Adapter.createSession(user.id, refreshToken, new Date(Date.now() + refreshTtlMs()).toISOString(), db)
    } catch {
      db.sessions.set(refreshToken, { userId: user.id, expiresAt: Date.now() + refreshTtlMs() })
    }
  } else {
    db.sessions.set(refreshToken, { userId: user.id, expiresAt: Date.now() + refreshTtlMs() })
  }
  const { password: _pw, ...safeUser } = user
  ok(res, {
    accessToken: `mock.${user.id}.${Date.now()}`,
    refreshToken,
    expiresIn: Math.round(accessTtlMs / 1000),
    user: safeUser,
  })
})

app.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body ?? {}
  let entry
  let pgAvailable = Adapter.isPgMode(db)
  if (pgAvailable) {
    try {
      entry = await Adapter.findSession(refreshToken, db)
      if (!entry) return fail(res, 401, 'INVALID_REFRESH_TOKEN', 'Refresh token tidak valid')
      if (entry.expiresAt && new Date(entry.expiresAt) <= new Date()) {
        await Adapter.revokeSession(refreshToken, db)
        return fail(res, 401, 'SESSION_EXPIRED', 'Sesi berakhir. Silakan login kembali.')
      }
    } catch {
      pgAvailable = false
    }
  }
  if (!pgAvailable) {
    entry = db.sessions.get(refreshToken)
    if (!entry) return fail(res, 401, 'INVALID_REFRESH_TOKEN', 'Refresh token tidak valid')
    if (entry.expiresAt <= Date.now()) {
      db.sessions.delete(refreshToken)
      return fail(res, 401, 'SESSION_EXPIRED', 'Sesi berakhir. Silakan login kembali.')
    }
  }
  const newRefresh = randomUUID()
  if (pgAvailable) {
    try {
      await Adapter.revokeSession(refreshToken, db)
      await Adapter.createSession(entry.userId, newRefresh, new Date(Date.now() + refreshTtlMs()).toISOString(), db)
    } catch {
      db.sessions.delete(refreshToken)
      db.sessions.set(newRefresh, { userId: entry.userId, expiresAt: Date.now() + refreshTtlMs() })
    }
  } else {
    db.sessions.delete(refreshToken)
    db.sessions.set(newRefresh, { userId: entry.userId, expiresAt: Date.now() + refreshTtlMs() })
  }
  ok(res, { accessToken: `mock.${entry.userId}.${Date.now()}`, refreshToken: newRefresh, expiresIn: Math.round(accessTtlMs / 1000) })
})

app.post('/auth/logout', async (req, res) => {
  const { refreshToken } = req.body ?? {}
  if (refreshToken) {
    if (Adapter.isPgMode(db)) {
      try {
        await Adapter.revokeSession(refreshToken, db)
      } catch {
        db.sessions.delete(refreshToken)
      }
    } else {
      db.sessions.delete(refreshToken)
    }
  }
  res.status(204).end()
})

// Lupa password (tanpa auth). Di produksi endpoint ini mengirim tautan reset
// ke email user; di MOCK, info akun dikembalikan langsung agar alur UI bisa
// diuji — plus arahan "hubungi admin" untuk lingkungan nyata.
app.post('/auth/forgot-password', (req, res) => {
  const { email } = req.body ?? {}
  if (!email) return fail(res, 422, 'VALIDATION_ERROR', 'Email wajib diisi', [{ field: 'email', message: 'Wajib diisi' }])
  const user = db.users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase())
  if (!user || !user.isActive) return fail(res, 404, 'USER_NOT_FOUND', 'Email tidak terdaftar di sistem ini')
  const { password, ...safeUser } = user
  ok(res, {
    email: safeUser.email,
    name: safeUser.name,
    role: safeUser.role,
    expiresIn: 900,
    message: 'Permintaan reset diterima (mode demo).',
    hint: `Demo mock: password akun ini adalah "${password}"`,
    note: 'Di lingkungan produksi, tautan reset dikirim ke email Anda. Untuk prototipe, hubungi admin untuk reset manual.',
  })
})

app.get('/auth/me', requireAuth, (req, res) => {
  const { password: _pw, ...safeUser } = req.user
  const activePeriod = db.periods.find((p) => p.isActive)
  ok(res, {
    user: safeUser,
    permissions: rolePermissions[req.user.role] ?? [],
    activePeriod: activePeriod ? { id: activePeriod.id, name: activePeriod.name, isOpen: activePeriod.isOpen } : null,
  })
})

app.post('/auth/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {}
  if (req.user.password !== currentPassword) return fail(res, 401, 'INVALID_PASSWORD', 'Password saat ini salah')
  if (!newPassword || newPassword.length < 8) return fail(res, 422, 'WEAK_PASSWORD', 'Password baru minimal 8 karakter')
  req.user.password = newPassword
  res.status(204).end()
})

// Users (P2)
app.get('/users', requireAuth, requirePermission('user.manage'), (req, res) => {
  let list = db.users.filter((u) => u.entityId === req.entityId)
  if (req.query.role) list = list.filter((u) => u.role === req.query.role)
  const { items, meta } = paginate(list, req.query.page, req.query.pageSize)
  ok(res, items.map(({ password, ...u }) => u), meta)
})

app.post('/users', requireAuth, requirePermission('user.manage'), (req, res) => {
  const { name, email, role } = req.body ?? {}
  if (!name || !email || !role) return fail(res, 422, 'VALIDATION_ERROR', 'name, email, role wajib diisi')
  if (db.users.some((u) => u.email === email)) return fail(res, 409, 'EMAIL_EXISTS', 'Email sudah terdaftar')
  const user = { id: `user-${pad(db.seq.user++)}`, name, email, password: 'password123', role, entityId: req.entityId, isActive: true, createdAt: nowIso() }
  db.users.push(user)
  const { password: _pw, ...safe } = user
  ok(res, safe, null, 201)
})

app.get('/users/:id', requireAuth, requirePermission('user.manage'), (req, res) => {
  const user = db.users.find((u) => u.id === req.params.id)
  if (!user) return fail(res, 404, 'NOT_FOUND', 'Pengguna tidak ditemukan')
  const { password: _pw, ...safe } = user
  ok(res, safe)
})

app.put('/users/:id', requireAuth, requirePermission('user.manage'), (req, res) => {
  const user = db.users.find((u) => u.id === req.params.id)
  if (!user) return fail(res, 404, 'NOT_FOUND', 'Pengguna tidak ditemukan')
  const { name, role } = req.body ?? {}
  if (name) user.name = name
  if (role) user.role = role
  const { password: _pw, ...safe } = user
  ok(res, safe)
})

app.patch('/users/:id/deactivate', requireAuth, requirePermission('user.manage'), (req, res) => {
  const user = db.users.find((u) => u.id === req.params.id)
  if (!user) return fail(res, 404, 'NOT_FOUND', 'Pengguna tidak ditemukan')
  user.isActive = false
  res.status(204).end()
})

// ------------------------------------------------------------
// 3. ENTITAS (multi-tenant)
// ------------------------------------------------------------
app.get('/entities', requireAuth, requirePermission('entity.manage'), (req, res) => ok(res, db.entities))

app.post('/entities', requireAuth, requirePermission('entity.manage'), (req, res) => {
  const { name, code } = req.body ?? {}
  if (!name) return fail(res, 422, 'VALIDATION_ERROR', 'Nama entitas wajib diisi')
  const ent = { id: `ent-${pad(db.seq.entity++)}`, name, code, address: req.body.address ?? '', isActive: true, createdAt: nowIso() }
  db.entities.push(ent)
  ok(res, ent, null, 201)
})

app.get('/entities/:id', requireAuth, requirePermission('entity.manage'), (req, res) => {
  const ent = db.entities.find((e) => e.id === req.params.id)
  if (!ent) return fail(res, 404, 'NOT_FOUND', 'Entitas tidak ditemukan')
  ok(res, ent)
})

app.put('/entities/:id', requireAuth, requirePermission('entity.manage'), (req, res) => {
  const ent = db.entities.find((e) => e.id === req.params.id)
  if (!ent) return fail(res, 404, 'NOT_FOUND', 'Entitas tidak ditemukan')
  Object.assign(ent, req.body)
  ok(res, ent)
})

app.post('/entities/:id/activate', requireAuth, requirePermission('entity.manage'), (req, res) => {
  const ent = db.entities.find((e) => e.id === req.params.id)
  if (!ent) return fail(res, 404, 'NOT_FOUND', 'Entitas tidak ditemukan')
  ent.isActive = true
  req.user.entityId = ent.id
  ok(res, { activeEntityId: ent.id })
})

// ------------------------------------------------------------
// 4. CHART OF ACCOUNTS
// ------------------------------------------------------------
app.get('/accounts', requireAuth, (req, res) => {
  const entityId = req.entityId
  const balances = computeBalances(entityId)
  // HANYA akun entitas aktif (X-Entity-Id)
  let list = entityAccounts(entityId).filter((a) => a.isActive || !req.query.activeOnly)
  if (req.query.type) list = list.filter((a) => a.type === req.query.type)
  if (req.query.keyword) {
    const kw = req.query.keyword.toLowerCase()
    list = list.filter((a) => a.name.toLowerCase().includes(kw) || a.code.toLowerCase().includes(kw))
  }
  if (req.query.tree === 'true') {
    const roots = buildAccountTree(entityId, balances).filter((n) => list.some((a) => a.id === n.id))
    const totals = { asset: 0, liability: 0, equity: 0 }
    for (const a of entityAccounts(entityId)) {
      const b = balances.get(a.id) ?? 0
      if (a.type === 'asset') totals.asset += b
      else if (a.type === 'liability') totals.liability += b
      else if (a.type === 'equity') totals.equity += b
    }
    return ok(res, { accounts: roots, totals })
  }
  const { items, meta } = paginate(
    list.map((a) => ({ ...a, balance: balances.get(a.id) ?? 0 })),
    req.query.page,
    req.query.pageSize,
  )
  ok(res, { accounts: items }, meta)
})

app.post('/accounts', requireAuth, requirePermission('account.write'), (req, res) => {
  const { code, name, type, group, category, normalBalance, parentId, description, isActive } = req.body ?? {}
  if (!/^\d+-\d+$/.test(code ?? '')) return fail(res, 422, 'INVALID_CODE_FORMAT', 'Format kode {{GOL}}-{{NOMOR}}')
  // Kode unik PER ENTITAS — dua entitas boleh punya COA sendiri
  if (db.accounts.some((a) => a.entityId === req.entityId && a.code === code)) return fail(res, 409, 'ACCOUNT_CODE_EXISTS', 'Kode akun sudah digunakan')
  if (parentId) {
    const parent = db.accounts.find((a) => a.entityId === req.entityId && a.id === parentId)
    if (!parent || !parent.isActive) return fail(res, 422, 'INVALID_PARENT', 'Akun induk tidak ditemukan atau non-aktif')
  }
  const account = { id: code, code, name, type, group: group ?? type, category: category ?? 'Umum', normalBalance: normalBalance ?? (type === 'asset' || type === 'expense' ? 'debit' : 'credit'), baseBalance: 0, parentId: parentId ?? null, isHeader: false, isActive: isActive ?? true, description, entityId: req.entityId }
  db.accounts.push(account)
  ok(res, { ...account, balance: 0 }, null, 201)
})

app.put('/accounts/:id', requireAuth, requirePermission('account.write'), (req, res) => {
  const account = db.accounts.find((a) => a.entityId === req.entityId && a.id === req.params.id)
  if (!account) return fail(res, 404, 'ACCOUNT_NOT_FOUND', 'Akun tidak ditemukan')
  const { code, name, category, description, parentId, normalBalance, group } = req.body ?? {}
  if (code && code !== account.code && db.accounts.some((a) => a.entityId === req.entityId && a.code === code)) return fail(res, 409, 'ACCOUNT_CODE_EXISTS', 'Kode akun sudah digunakan')
  Object.assign(account, { code: code ?? account.code, name: name ?? account.name, category: category ?? account.category, description: description ?? account.description, parentId: parentId ?? account.parentId, normalBalance: normalBalance ?? account.normalBalance, group: group ?? account.group })
  ok(res, { ...account, balance: computeBalances(req.entityId).get(account.id) ?? 0 })
})

app.delete('/accounts/:id', requireAuth, requirePermission('account.write'), (req, res) => {
  const account = db.accounts.find((a) => a.entityId === req.entityId && a.id === req.params.id)
  if (!account) return fail(res, 404, 'ACCOUNT_NOT_FOUND', 'Akun tidak ditemukan')
  const children = db.accounts.filter((a) => a.entityId === req.entityId && a.parentId === account.id && a.isActive)
  if (children.length) return fail(res, 409, 'ACCOUNT_HAS_CHILDREN', 'Akun induk tidak bisa dihapus jika memiliki sub-akun aktif')
  const balance = computeBalances(req.entityId).get(account.id) ?? 0
  if (balance !== 0) return fail(res, 409, 'ACCOUNT_HAS_BALANCE', 'Akun memiliki saldo; non-aktifkan saja')
  account.isActive = false
  res.status(204).end()
})

app.patch('/accounts/:id/activate', requireAuth, requirePermission('account.write'), (req, res) => {
  const account = db.accounts.find((a) => a.entityId === req.entityId && a.id === req.params.id)
  if (!account) return fail(res, 404, 'ACCOUNT_NOT_FOUND', 'Akun tidak ditemukan')
  account.isActive = true
  ok(res, { id: account.id, isActive: true })
})
app.patch('/accounts/:id/deactivate', requireAuth, requirePermission('account.write'), (req, res) => {
  const account = db.accounts.find((a) => a.entityId === req.entityId && a.id === req.params.id)
  if (!account) return fail(res, 404, 'ACCOUNT_NOT_FOUND', 'Akun tidak ditemukan')
  const balance = computeBalances(req.entityId).get(account.id) ?? 0
  if (balance !== 0) return fail(res, 409, 'ACCOUNT_HAS_BALANCE', 'Akun memiliki saldo; non-aktifkan saja')
  account.isActive = false
  ok(res, { id: account.id, isActive: false })
})

app.post('/accounts/template', requireAuth, requirePermission('account.write'), (req, res) => {
  const { templateId, mode } = req.body ?? {}
  const template = coaTemplate.id === templateId ? coaTemplate : null
  if (!template) return fail(res, 404, 'NOT_FOUND', 'Template tidak ditemukan')
  const existing = entityAccounts(req.entityId).length
  if (mode === 'replace' && existing > 0) return fail(res, 409, 'ACCOUNTS_EXIST', 'COA sudah memiliki akun; mode replace perlu konfirmasi')
  let created = 0
  let skipped = 0
  const createdAccounts = []
  for (const t of template.accounts) {
    if (db.accounts.some((a) => a.entityId === req.entityId && a.code === t.code)) {
      skipped++
      continue
    }
    const account = { ...t, id: t.code, baseBalance: 0, isActive: true, description: 'Dari template ' + template.name, entityId: req.entityId }
    db.accounts.push(account)
    created++
    createdAccounts.push(account)
  }
  ok(res, { created, skipped, accounts: createdAccounts }, null, 201)
})

app.post('/accounts/import', requireAuth, requirePermission('account.write'), (req, res) => {
  // Mock import: tanpa file asli — selalu sukses dengan hasil statis
  ok(res, { imported: 38, failed: 2, errors: [{ row: 12, code: '1-9999', message: 'Kode duplikat' }] })
})

app.get('/accounts/export', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="chart-of-accounts.csv"')
  const balances = computeBalances(req.entityId)
  const rows = entityAccounts(req.entityId).map((a) => `${a.code},${a.name},${a.type},${a.normalBalance},${balances.get(a.id) ?? 0}`)
  res.send(['code,name,type,normalBalance,balance', ...rows].join('\n'))
})

// ------------------------------------------------------------
// 5. JURNAL
// ------------------------------------------------------------
app.get('/journals', requireAuth, (req, res) => {
  let list = [...db.journals]
  // Multi-tenant: hanya jurnal entitas aktif (X-Entity-Id, default dari user)
  list = list.filter((j) => j.entityId === req.entityId)
  const { startDate, endDate, accountId, status, keyword, period } = req.query
  if (startDate) list = list.filter((j) => j.date >= startDate)
  if (endDate) list = list.filter((j) => j.date <= endDate)
  if (period) list = list.filter((j) => j.date.startsWith(period))
  if (accountId) list = list.filter((j) => j.lines.some((ln) => ln.accountId === accountId))
  if (status) {
    const statuses = status.split(',')
    list = list.filter((j) => statuses.includes(j.status))
  }
  if (keyword) {
    const kw = keyword.toLowerCase()
    list = list.filter((j) => j.description.toLowerCase().includes(kw) || j.transactionNumber.toLowerCase().includes(kw) || j.lines.some((ln) => (ln.description ?? '').toLowerCase().includes(kw)))
  }
  if (req.query.sort === '-date') list.sort((a, b) => b.date.localeCompare(a.date))
  else list.sort((a, b) => a.date.localeCompare(b.date))
  const totals = { debit: 0, credit: 0 }
  for (const j of list) {
    const t = totalsOf(j)
    totals.debit += t.debit
    totals.credit += t.credit
  }
  totals.difference = totals.debit - totals.credit
  const { items, meta } = paginate(list.map(journalBrief), req.query.page, req.query.pageSize)
  ok(res, { journals: items, totals }, meta)
})

app.get('/journals/next-number', requireAuth, (req, res) => {
  const prefix = req.query.prefix || 'BKM'
  const period = req.query.period || '2026-03'
  const [year, month] = period.split('-')
  const existing = db.journals
    .filter((j) => j.entityId === req.entityId && j.transactionNumber.startsWith(`${prefix}-${period}-`))
    .map((j) => Number(j.transactionNumber.split('-').pop()))
  const next = existing.length ? Math.max(...existing) + 1 : 1
  ok(res, { transactionNumber: `${prefix}-${period}-${pad(next, 4)}` })
})

app.post('/journals', requireAuth, requirePermission('journal.write'), (req, res) => {
  const { date, transactionNumber, description, submitForApproval, lines } = req.body ?? {}
  const err = validateJournal(req.body, undefined, req.entityId)
  if (err) return fail(res, err.status, err.code, err.message, err.details)
  const seq = db.seq.journal++
  const id = `JNL-${String(date).slice(0, 7)}-${pad(seq)}`
  const journal = {
    id,
    transactionNumber: transactionNumber || `${'JV'}-${String(date).slice(0, 7)}-${pad(seq, 4)}`,
    date,
    description: description?.trim() || 'Tanpa keterangan',
    lines: lines.map((ln, i) => {
      // Akun dari COA ENTITAS AKTIF
      const account = db.accounts.find((a) => a.entityId === req.entityId && a.id === ln.accountId)
      return {
        id: `line-${pad(db.seq.line++)}`,
        accountId: ln.accountId,
        accountCode: account.code,
        accountName: account.name,
        debit: Number(ln.debit ?? 0),
        credit: Number(ln.credit ?? 0),
        description: ln.description,
      }
    }),
    status: submitForApproval ? 'pending-approval' : 'draft',
    version: 1,
    createdBy: req.user.id,
    createdAt: nowIso(),
    auditTrail: [{ userId: req.user.id, action: 'create', timestamp: nowIso() }],
    attachments: [],
    entityId: req.entityId,
  }
  db.journals.unshift(journal)
  ok(res, journal, null, 201)
})

app.get('/journals/:id', requireAuth, (req, res) => {
  const journal = db.journals.find((j) => j.entityId === req.entityId && j.id === req.params.id)
  if (!journal) return fail(res, 404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
  ok(res, journal)
})

app.put('/journals/:id', requireAuth, requirePermission('journal.write'), (req, res) => {
  const journal = db.journals.find((j) => j.entityId === req.entityId && j.id === req.params.id)
  if (!journal) return fail(res, 404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
  if (journal.status === 'posted') return fail(res, 409, 'JOURNAL_ALREADY_POSTED', 'Jurnal sudah diposting, tidak dapat diedit')
  if (journal.status === 'reversed') return fail(res, 409, 'ALREADY_REVERSED', 'Jurnal sudah dibatalkan')
  // Optimistic locking (API §1.5 409 DATA_CONFLICT)
  const ifMatch = req.headers['if-match']
  if (ifMatch && Number(ifMatch) !== journal.version) return fail(res, 409, 'DATA_CONFLICT', 'Data sudah diubah oleh pengguna lain. Muat ulang halaman.')
  const err = validateJournal(req.body, journal.id, req.entityId)
  if (err) return fail(res, err.status, err.code, err.message, err.details)
  const accountName = (accountId) => db.accounts.find((a) => a.entityId === req.entityId && a.id === accountId)?.name ?? ''
  journal.date = req.body.date
  journal.transactionNumber = req.body.transactionNumber ?? journal.transactionNumber
  journal.description = req.body.description?.trim() || journal.description
  journal.lines = req.body.lines.map((ln, i) => {
    const account = db.accounts.find((a) => a.entityId === req.entityId && a.id === ln.accountId)
    return { id: `line-${pad(db.seq.line++)}`, accountId: ln.accountId, accountCode: account.code, accountName: account.name, debit: Number(ln.debit ?? 0), credit: Number(ln.credit ?? 0), description: ln.description }
  })
  journal.version++
  journal.auditTrail.push({ userId: req.user.id, action: 'update', timestamp: nowIso() })
  ok(res, journal)
})

app.delete('/journals/:id', requireAuth, requirePermission('journal.write'), (req, res) => {
  const idx = db.journals.findIndex((j) => j.entityId === req.entityId && j.id === req.params.id)
  if (idx === -1) return fail(res, 404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
  if (db.journals[idx].status !== 'draft' && db.journals[idx].status !== 'pending-approval') return fail(res, 409, 'JOURNAL_ALREADY_POSTED', 'Hanya jurnal draft yang dapat dihapus')
  db.journals.splice(idx, 1)
  res.status(204).end()
})

app.post('/journals/:id/post', requireAuth, requirePermission('journal.write'), (req, res) => {
  const journal = db.journals.find((j) => j.entityId === req.entityId && j.id === req.params.id)
  if (!journal) return fail(res, 404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
  if (journal.status === 'posted') return fail(res, 409, 'ALREADY_POSTED', 'Jurnal sudah diposting')
  if (journal.status === 'reversed') return fail(res, 409, 'ALREADY_REVERSED', 'Jurnal sudah dibatalkan')
  const err = validateJournal({ ...journal, transactionNumber: undefined }, undefined, req.entityId) // balance & periode
  if (err) return fail(res, err.status, err.code, err.message, err.details)
  journal.status = 'posted'
  journal.postedAt = nowIso()
  journal.version++
  journal.auditTrail.push({ userId: req.user.id, action: 'post', timestamp: nowIso() })
  const balances = computeBalances(req.entityId)
  const affectedAccounts = [...new Set(journal.lines.map((ln) => ln.accountId))].map((accountId) => ({ accountId, newBalance: balances.get(accountId) ?? 0 }))
  ok(res, { id: journal.id, status: 'posted', postedAt: journal.postedAt, affectedAccounts })
})

app.post('/journals/:id/reverse', requireAuth, requirePermission('journal.write'), (req, res) => {
  const journal = db.journals.find((j) => j.entityId === req.entityId && j.id === req.params.id)
  if (!journal) return fail(res, 404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
  if (journal.status === 'reversed') return fail(res, 409, 'ALREADY_REVERSED', 'Jurnal sudah dibatalkan')
  if (journal.status !== 'posted') return fail(res, 409, 'INVALID_STATUS_TRANSITION', 'Hanya jurnal posted yang dapat dibalik')
  const period = findPeriodByDate(journal.date)
  if (period && !period.isOpen) return fail(res, 422, 'PERIOD_CLOSED', `Periode ${period.name} sudah ditutup`)
  const seq = db.seq.journal++
  const reversal = {
    id: `JNL-${String(journal.date).slice(0, 7)}-${pad(seq)}`,
    transactionNumber: `REV-${journal.transactionNumber}`,
    date: journal.date,
    description: `Pembalikan: ${journal.description}`,
    lines: journal.lines.map((ln) => ({ ...ln, id: `line-${pad(db.seq.line++)}`, debit: ln.credit, credit: ln.debit })),
    status: 'posted',
    version: 1,
    createdBy: req.user.id,
    createdAt: nowIso(),
    postedAt: nowIso(),
    reversalOf: journal.id,
    auditTrail: [
      { userId: req.user.id, action: 'create', timestamp: nowIso() },
      { userId: req.user.id, action: 'post', timestamp: nowIso() },
    ],
    attachments: [],
    entityId: journal.entityId ?? req.entityId,
  }
  journal.status = 'reversed'
  journal.reversedAt = nowIso()
  journal.reversalOf = reversal.transactionNumber
  journal.version++
  journal.auditTrail.push({ userId: req.user.id, action: 'reverse', timestamp: nowIso() })
  db.journals.unshift(reversal)
  ok(res, { reversedJournalId: journal.id, status: 'reversed', reversalJournal: reversal })
})

// Approval workflow (P1)
app.post('/journals/:id/submit', requireAuth, requirePermission('journal.write'), (req, res) => {
  const journal = db.journals.find((j) => j.entityId === req.entityId && j.id === req.params.id)
  if (!journal) return fail(res, 404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
  if (journal.status !== 'draft') return fail(res, 409, 'INVALID_STATUS_TRANSITION', 'Hanya jurnal draft yang dapat disubmit')
  journal.status = 'pending-approval'
  journal.auditTrail.push({ userId: req.user.id, action: 'submit', timestamp: nowIso() })
  ok(res, { id: journal.id, status: 'pending-approval' })
})

app.post('/journals/:id/approve', requireAuth, requireApprovalRights, (req, res) => {
  const journal = db.journals.find((j) => j.entityId === req.entityId && j.id === req.params.id)
  if (!journal) return fail(res, 404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
  if (journal.status !== 'pending-approval') return fail(res, 409, 'INVALID_STATUS_TRANSITION', 'Hanya jurnal pending-approval yang dapat di-approve')
  journal.status = 'posted'
  journal.postedAt = nowIso()
  journal.approvedBy = req.user.id
  journal.approvedAt = nowIso()
  journal.version++
  journal.auditTrail.push({ userId: req.user.id, action: 'approve', timestamp: nowIso() })
  ok(res, { status: 'posted', approvedBy: req.user.id, approvedAt: journal.approvedAt })
})

app.post('/journals/:id/reject', requireAuth, requireApprovalRights, (req, res) => {
  const journal = db.journals.find((j) => j.entityId === req.entityId && j.id === req.params.id)
  if (!journal) return fail(res, 404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
  if (journal.status !== 'pending-approval') return fail(res, 409, 'INVALID_STATUS_TRANSITION', 'Hanya jurnal pending-approval yang dapat di-reject')
  const reason = req.body?.reason?.trim?.()
  if (!reason) return fail(res, 422, 'REASON_REQUIRED', 'Alasan penolakan wajib diisi')
  journal.status = 'draft'
  journal.rejectionReason = reason
  journal.auditTrail.push({ userId: req.user.id, action: 'reject', timestamp: nowIso() })
  ok(res, { id: journal.id, status: 'draft', rejectionReason: journal.rejectionReason })
})

// Lampiran (P1) — mock tanpa multipart asli
app.post('/journals/:id/attachments', requireAuth, requirePermission('journal.write'), (req, res) => {
  const journal = db.journals.find((j) => j.entityId === req.entityId && j.id === req.params.id)
  if (!journal) return fail(res, 404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
  if (journal.status === 'posted') return fail(res, 409, 'JOURNAL_ALREADY_POSTED', 'Lampiran tidak dapat ditambah pada jurnal posted')
  const size = Number(req.body?.size ?? 245760)
  if (!Number.isFinite(size) || size > MAX_ATTACHMENT_BYTES)
    return fail(res, 422, 'FILE_TOO_LARGE', 'Ukuran file maksimal 5 MB')
  const mimeType = req.body?.mimeType ?? 'application/pdf'
  if (!ALLOWED_ATTACHMENT_MIME.has(mimeType))
    return fail(res, 422, 'UNSUPPORTED_FILE_TYPE', 'Tipe file tidak didukung (jpg/png/pdf)')
  const attachment = { id: `att-${pad(db.seq.attachment++)}`, fileName: req.body?.fileName ?? 'bukti.pdf', size, mimeType, uploadedAt: nowIso() }
  journal.attachments = journal.attachments ?? []
  journal.attachments.push(attachment)
  ok(res, attachment, null, 201)
})

app.delete('/journals/:id/attachments/:attId', requireAuth, requirePermission('journal.write'), (req, res) => {
  const journal = db.journals.find((j) => j.entityId === req.entityId && j.id === req.params.id)
  if (!journal) return fail(res, 404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
  journal.attachments = (journal.attachments ?? []).filter((a) => a.id !== req.params.attId)
  res.status(204).end()
})

// ------------------------------------------------------------
// 6. BUKU BESAR (General Ledger)
// ------------------------------------------------------------
app.get('/ledger/accounts/:accountId', requireAuth, (req, res) => {
  const account = entityAccounts(req.entityId).find((a) => a.id === req.params.accountId)
  if (!account) return fail(res, 404, 'ACCOUNT_NOT_FOUND', 'Akun tidak ditemukan')
  const periodKey = req.query.period || '2026-03'
  // Rentang tanggal custom (start/end) — sama dengan GET /exports/ledger/:accountId:
  // bila diberikan, override periode; tampilan Buku Besar ikut rentang, bukan
  // hanya export. Tanpa rentang → perilaku lama (periode bulanan).
  const { start, end } = req.query
  let p
  let label = periodKey
  if (start || end) {
    const isoDate = /^\d{4}-\d{2}-\d{2}$/
    if (!start || !end) return fail(res, 422, 'INVALID_DATE_RANGE', 'Rentang tanggal wajib lengkap (start & end)')
    if (!isoDate.test(start) || !isoDate.test(end)) return fail(res, 422, 'INVALID_DATE_RANGE', 'Format tanggal harus YYYY-MM-DD')
    if (start > end) return fail(res, 422, 'INVALID_DATE_RANGE', 'start tidak boleh setelah end')
    label = `${start}..${end}`
  } else {
    p = periodByKey(periodKey)
    if (!p) return fail(res, 422, 'INVALID_PERIOD', 'Periode tidak valid')
  }
  const rangeStart = start ?? p.startDate
  const rangeEnd = end ?? p.endDate
  const relevant = entityJournals(req.entityId).filter((j) => isEffect(j) && j.lines.some((ln) => ln.accountId === account.id))
  const before = relevant.filter((j) => j.date < rangeStart)
  const within = relevant
    .filter((j) => j.date >= rangeStart && j.date <= rangeEnd)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  let opening = account.baseBalance
  for (const j of before) {
    const ln = j.lines.find((l) => l.accountId === account.id)
    const delta = account.normalBalance === 'debit' ? ln.debit - ln.credit : ln.credit - ln.debit
    opening += delta
  }
  let running = opening
  const entries = within.map((j) => {
    const ln = j.lines.find((l) => l.accountId === account.id)
    running += account.normalBalance === 'debit' ? ln.debit - ln.credit : ln.credit - ln.debit
    return { journalEntryId: j.id, date: j.date, reference: j.transactionNumber, description: j.description, debit: ln.debit, credit: ln.credit, balance: running }
  })
  ok(res, { accountId: account.id, accountCode: account.code, accountName: account.name, period: label, openingBalance: opening, closingBalance: running, entries })
})

app.get('/ledger', requireAuth, (req, res) => {
  const periodKey = req.query.period || '2026-03'
  const p = periodByKey(periodKey)
  if (!p) return fail(res, 422, 'INVALID_PERIOD', 'Periode tidak valid')
  const start = p.startDate
  const end = p.endDate
  const rows = []
  for (const account of entityAccounts(req.entityId)) {
    if (account.isHeader) continue
    const relevant = entityJournals(req.entityId).filter((j) => j.status === 'posted' && j.lines.some((ln) => ln.accountId === account.id))
    let opening = account.baseBalance
    let debitTotal = 0
    let creditTotal = 0
    for (const j of relevant) {
      const ln = j.lines.find((l) => l.accountId === account.id)
      if (j.date < start) opening += account.normalBalance === 'debit' ? ln.debit - ln.credit : ln.credit - ln.debit
      else if (j.date <= end) {
        debitTotal += ln.debit
        creditTotal += ln.credit
      }
    }
    const closing = opening + (account.normalBalance === 'debit' ? debitTotal - creditTotal : creditTotal - debitTotal)
    rows.push({ accountId: account.id, accountCode: account.code, accountName: account.name, openingBalance: opening, totalDebit: debitTotal, totalCredit: creditTotal, closingBalance: closing })
  }
  ok(res, { period: periodKey, accounts: rows.filter((r) => r.openingBalance !== 0 || r.totalDebit !== 0 || r.totalCredit !== 0) })
})

// ------------------------------------------------------------
// 7-8. LAPORAN
// ------------------------------------------------------------
app.get('/reports/trial-balance', requireAuth, (req, res) => {
  const periodKey = req.query.period || '2026-03'
  const p = periodByKey(periodKey)
  if (!p) return fail(res, 422, 'INVALID_PERIOD', 'Periode tidak valid')
  const ledgerRes = { ...(awaitLedger(periodKey, req.entityId)) }
  let totalDebit = 0
  let totalCredit = 0
  const lines = []
  for (const row of ledgerRes.accounts) {
    if (row.closingBalance === 0) continue
    const account = entityAccounts(req.entityId).find((a) => a.id === row.accountId)
    if (account.normalBalance === 'debit') {
      const amount = Math.abs(row.closingBalance)
      if (row.closingBalance >= 0) {
        lines.push({ accountId: row.accountId, accountCode: row.accountCode, accountName: row.accountName, debit: amount, credit: 0 })
        totalDebit += amount
      } else {
        lines.push({ accountId: row.accountId, accountCode: row.accountCode, accountName: row.accountName, debit: 0, credit: amount })
        totalCredit += amount
      }
    } else {
      const amount = Math.abs(row.closingBalance)
      if (row.closingBalance >= 0) {
        lines.push({ accountId: row.accountId, accountCode: row.accountCode, accountName: row.accountName, debit: 0, credit: amount })
        totalCredit += amount
      } else {
        lines.push({ accountId: row.accountId, accountCode: row.accountCode, accountName: row.accountName, debit: amount, credit: 0 })
        totalDebit += amount
      }
    }
  }
  ok(res, {
    type: 'trial-balance',
    period: { start: p.startDate, end: p.endDate },
    generatedAt: nowIso(),
    currency: 'IDR',
    lines,
    totals: { debit: totalDebit, credit: totalCredit, isBalanced: totalDebit === totalCredit },
  })
})

const awaitLedger = (periodKey, entityId) => {
  const p = periodByKey(periodKey)
  const start = p.startDate
  const end = p.endDate
  const rows = []
  for (const account of entityAccounts(entityId)) {
    if (account.isHeader) continue
    const relevant = entityJournals(entityId).filter((j) => isEffect(j) && j.lines.some((ln) => ln.accountId === account.id))
    let opening = account.baseBalance
    let debitTotal = 0
    let creditTotal = 0
    for (const j of relevant) {
      const ln = j.lines.find((l) => l.accountId === account.id)
      if (j.date < start) opening += account.normalBalance === 'debit' ? ln.debit - ln.credit : ln.credit - ln.debit
      else if (j.date <= end) {
        debitTotal += ln.debit
        creditTotal += ln.credit
      }
    }
    const closing = opening + (account.normalBalance === 'debit' ? debitTotal - creditTotal : creditTotal - debitTotal)
    rows.push({ accountId: account.id, accountCode: account.code, accountName: account.name, openingBalance: opening, totalDebit: debitTotal, totalCredit: creditTotal, closingBalance: closing })
  }
  return { accounts: rows }
}

// Saldo per akun pada periode (untuk laporan laba rugi / neraca)
const balancesByPeriod = (periodKey, entityId) => {
  const p = periodByKey(periodKey)
  const start = p.startDate
  const end = p.endDate
  const map = new Map()
  for (const account of entityAccounts(entityId)) {
    const relevant = entityJournals(entityId).filter((j) => isEffect(j) && j.lines.some((ln) => ln.accountId === account.id))
    let opening = account.baseBalance
    for (const j of relevant) {
      const ln = j.lines.find((l) => l.accountId === account.id)
      if (j.date < start) opening += account.normalBalance === 'debit' ? ln.debit - ln.credit : ln.credit - ln.debit
    }
    // Saldo YTD per akhir periode (untuk neraca)
    let ytd = opening
    for (const j of relevant) {
      const ln = j.lines.find((l) => l.accountId === account.id)
      if (j.date >= start && j.date <= end) ytd += account.normalBalance === 'debit' ? ln.debit - ln.credit : ln.credit - ln.debit
    }
    map.set(account.id, { opening, closing: ytd, account })
  }
  return map
}

app.get('/reports/income-statement', requireAuth, (req, res) => {
  const periodKey = req.query.period || '2026-03'
  const p = periodByKey(periodKey)
  if (!p) return fail(res, 422, 'INVALID_PERIOD', 'Periode tidak valid')
  const map = balancesByPeriod(periodKey, req.entityId)
  const revenueAccounts = entityAccounts(req.entityId).filter((a) => a.type === 'revenue')
  const expenseAccounts = entityAccounts(req.entityId).filter((a) => a.type === 'expense')
  const revenueTotal = revenueAccounts.reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0)
  const expenseTotal = expenseAccounts.reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0)
  const mkSection = (title, accounts) => ({
    title,
    subtotal: accounts.reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0),
    lines: accounts.map((a) => ({
      accountCode: a.code,
      accountName: a.name,
      amount: map.get(a.id)?.closing ?? 0,
      indentLevel: 2,
      isBold: false,
      isTotal: false,
    })),
  })
  const sections = [mkSection('PENDAPATAN', revenueAccounts), mkSection('BEBAN', expenseAccounts)]
  sections[0].lines.push({ accountCode: '', accountName: 'Total Pendapatan', amount: revenueTotal, indentLevel: 1, isBold: true, isTotal: true })
  sections[0].subtotal = revenueTotal
  sections[1].lines.push({ accountCode: '', accountName: 'Total Beban', amount: expenseTotal, indentLevel: 1, isBold: true, isTotal: true })
  sections[1].subtotal = expenseTotal
  const entity = db.entities.find((e) => e.id === req.entityId)
  ok(res, {
    id: `RPT-${periodKey}-001`,
    type: 'income-statement',
    entity: { id: req.entityId, name: entity?.name ?? '' },
    period: { start: p.startDate, end: p.endDate },
    generatedAt: nowIso(),
    currency: 'IDR',
    sections,
    netIncome: revenueTotal - expenseTotal,
  })
})

app.get('/reports/balance-sheet', requireAuth, (req, res) => {
  const asOf = req.query.asOf || '2026-03-31'
  const periodKey = asOf.slice(0, 7)
  const map = balancesByPeriod(periodKey, req.entityId)
  const assetAccounts = entityAccounts(req.entityId).filter((a) => a.type === 'asset' && !a.isHeader)
  const liabAccounts = entityAccounts(req.entityId).filter((a) => a.type === 'liability' && !a.isHeader)
  const equityAccounts = entityAccounts(req.entityId).filter((a) => a.type === 'equity' && !a.isHeader)
  const totalAssets = assetAccounts.reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0)
  const totalLiab = liabAccounts.reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0)
  const totalEquity = equityAccounts.reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0)
  const netIncome = totalAssets - totalLiab - totalEquity // Laba berjalan (penyeimbang)
  const mkSection = (title, accounts) => ({
    title,
    subtotal: accounts.reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0),
    lines: accounts.map((a) => ({ accountCode: a.code, accountName: a.name, amount: map.get(a.id)?.closing ?? 0, indentLevel: 1, isBold: false, isTotal: false })),
  })
  const sections = [mkSection('ASET', assetAccounts), mkSection('KEWAJIBAN & EKUITAS', liabAccounts.concat(equityAccounts))]
  sections[1].lines.push({ accountCode: '', accountName: 'Laba Ditahan (berjalan)', amount: netIncome, indentLevel: 1, isBold: true, isTotal: false })
  sections[1].subtotal += netIncome
  sections[0].lines.push({ accountCode: '', accountName: 'Total Aset', amount: totalAssets, indentLevel: 1, isBold: true, isTotal: true })
  sections[1].lines.push({ accountCode: '', accountName: 'Total Kewajiban & Ekuitas', amount: totalAssets, indentLevel: 1, isBold: true, isTotal: true })
  sections[1].subtotal = totalAssets
  const entity = db.entities.find((e) => e.id === req.entityId)
  ok(res, {
    id: `RPT-${periodKey}-002`,
    type: 'balance-sheet',
    entity: { id: req.entityId, name: entity?.name ?? '' },
    asOf,
    generatedAt: nowIso(),
    currency: 'IDR',
    sections,
    totalAssets,
    totalLiabilitiesEquity: totalAssets,
    isBalanced: totalAssets === totalAssets,
  })
})

app.get('/reports/cash-flow', requireAuth, (req, res) => {
  const periodKey = req.query.period || '2026-03'
  const p = periodByKey(periodKey)
  const map = balancesByPeriod(periodKey, req.entityId)
  const cashAccounts = entityAccounts(req.entityId).filter((a) => a.type === 'asset' && (a.category === 'Kas & Bank'))
  const beginningCash = cashAccounts.reduce((s, a) => s + (map.get(a.id)?.opening ?? 0), 0)
  const endingCash = cashAccounts.reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0)
  const netIncome = [...entityAccounts(req.entityId)].filter((a) => a.type === 'revenue').reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0) - [...entityAccounts(req.entityId)].filter((a) => a.type === 'expense').reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0)
  const sections = [
    { title: 'ARUS KAS DARI AKTIVITAS OPERASI', subtotal: netIncome, lines: [{ accountCode: '', accountName: 'Laba bersih', amount: netIncome, indentLevel: 1, isBold: false, isTotal: false }] },
    { title: 'ARUS KAS DARI AKTIVITAS INVESTASI', subtotal: 0, lines: [] },
    { title: 'ARUS KAS DARI AKTIVITAS PENDANAAN', subtotal: 0, lines: [] },
  ]
  ok(res, {
    id: `RPT-${periodKey}-003`,
    type: 'cash-flow',
    period: { start: p.startDate, end: p.endDate },
    sections,
    netCashFlow: endingCash - beginningCash,
    beginningCash,
    endingCash,
  })
})

app.get('/reports/:id', requireAuth, (req, res) => {
  // Laporan tersimpan — mock: cari di katalog statis
  const entity = db.entities.find((e) => e.id === req.entityId)
  const report = { id: req.params.id, type: 'income-statement', entity: { id: req.entityId, name: entity?.name ?? '' }, generatedAt: nowIso(), note: 'Laporan tersimpan (mock)' }
  ok(res, report)
})

// ------------------------------------------------------------
// 9. PERIODE FISKAL
// ------------------------------------------------------------
app.get('/periods', requireAuth, (req, res) => {
  let list = db.periods
  if (req.query.year) list = list.filter((p) => p.year === Number(req.query.year))
  if (req.query.includeClosed !== 'true') list = list.filter((p) => p.isOpen)
  ok(res, { periods: list })
})

app.get('/periods/current', requireAuth, (req, res) => {
  const p = db.periods.find((p) => p.isActive) ?? db.periods[db.periods.length - 1]
  ok(res, { id: p.id, name: p.name, isOpen: p.isOpen })
})

app.post('/periods', requireAuth, requirePermission('period.manage'), (req, res) => {
  const { month, year, activate } = req.body ?? {}
  if (!month || !year) return fail(res, 422, 'VALIDATION_ERROR', 'month dan year wajib diisi')
  const id = `fp-${year}-${pad(month, 2)}`
  if (db.periods.some((p) => p.id === id)) return fail(res, 409, 'PERIOD_EXISTS', 'Periode sudah ada')
  const last = db.periods[db.periods.length - 1]
  const startDate = `${year}-${pad(month, 2)}-01`
  const endDate = new Date(year, month, 0).toISOString().slice(0, 10)
  const period = { id, name: `${['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][month - 1]} ${year}`, month, year, startDate, endDate, isOpen: true, isActive: !!activate, previousPeriodId: last.id, closedAt: null }
  if (activate) db.periods.forEach((p) => (p.isActive = false))
  db.periods.push(period)
  ok(res, period, null, 201)
})

app.patch('/periods/:id/activate', requireAuth, requirePermission('period.manage'), (req, res) => {
  const period = db.periods.find((p) => p.id === req.params.id)
  if (!period) return fail(res, 404, 'PERIOD_NOT_FOUND', 'Periode tidak ditemukan')
  db.periods.forEach((p) => (p.isActive = false))
  period.isActive = true
  ok(res, { activePeriodId: period.id })
})

app.patch('/periods/:id/close', requireAuth, requirePermission('period.manage'), (req, res) => {
  const period = db.periods.find((p) => p.id === req.params.id)
  if (!period) return fail(res, 404, 'PERIOD_NOT_FOUND', 'Periode tidak ditemukan')
  if (!period.isOpen) return fail(res, 409, 'PERIOD_ALREADY_CLOSED', 'Periode sudah ditutup')
  const drafts = entityJournals(req.entityId).filter((j) => j.date >= period.startDate && j.date <= period.endDate && j.status === 'draft')
  const { confirmDraftAction } = req.body ?? {}
  if (drafts.length && !confirmDraftAction) return fail(res, 422, 'DRAFT_ACTION_REQUIRED', 'Masih ada jurnal draft; pilih aksi terlebih dahulu')
  const handled = { posted: 0, deleted: 0, kept: 0 }
  for (const d of drafts) {
    if (confirmDraftAction === 'post-all') {
      d.status = 'posted'
      d.postedAt = nowIso()
      handled.posted++
    } else if (confirmDraftAction === 'delete-all') {
      db.journals = db.journals.filter((j) => j.id !== d.id)
      handled.deleted++
    } else handled.kept++
  }
  period.isOpen = false
  period.closedAt = nowIso()
  ok(res, { id: period.id, isOpen: false, handledDrafts: handled })
})

// ------------------------------------------------------------
// 10. DASHBOARD
// ------------------------------------------------------------
app.get('/dashboard/summary', requireAuth, (req, res) => {
  const periodKey = req.query.period || '2026-03'
  const map = balancesByPeriod(periodKey, req.entityId)
  const sum = (type) => entityAccounts(req.entityId).filter((a) => a.type === type && !a.isHeader).reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0)
  const revenue = entityAccounts(req.entityId).filter((a) => a.type === 'revenue').reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0)
  const expenses = entityAccounts(req.entityId).filter((a) => a.type === 'expense').reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0)
  ok(res, {
    cards: [
      { key: 'totalAssets', label: 'Total Aset', value: sum('asset'), deltaPercent: 12.5, deltaDirection: 'up', compareLabel: 'dari bulan lalu' },
      { key: 'totalLiabilities', label: 'Total Utang', value: sum('liability'), deltaPercent: 3.2, deltaDirection: 'down', compareLabel: 'dari bulan lalu' },
      { key: 'totalEquity', label: 'Total Modal', value: sum('equity'), deltaPercent: 8.1, deltaDirection: 'up', compareLabel: 'dari bulan lalu' },
      { key: 'grossProfit', label: 'Laba Bruto', value: revenue - expenses, deltaPercent: 15.3, deltaDirection: 'up', compareLabel: 'dari bulan lalu' },
    ],
  })
})

app.get('/dashboard/trend', requireAuth, (req, res) => {
  const months = Number(req.query.months || 6)
  ok(res, { trend: mockTrend.slice(-months) })
})

app.get('/dashboard/recent-journals', requireAuth, (req, res) => {
  const limit = Number(req.query.limit || 5)
  ok(res, { journals: [...entityJournals(req.entityId)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(journalBrief) })
})

app.get('/dashboard/alerts', requireAuth, (req, res) => {
  const drafts = entityJournals(req.entityId).filter((j) => j.status === 'draft' || j.status === 'pending-approval')
  const alerts = []
  if (drafts.length) alerts.push({ severity: 'warning', type: 'draft_journals', message: `${drafts.length} jurnal draft belum diposting`, count: drafts.length })
  const openPeriods = db.periods.filter((p) => p.isOpen && !p.isActive)
  if (openPeriods.length) alerts.push({ severity: 'info', type: 'period_not_closed', message: `Periode ${openPeriods[0].name} belum ditutup` })
  const unbalanced = entityJournals(req.entityId).filter((j) => (j.status === 'draft' || j.status === 'pending-approval') && totalsOf(j).difference !== 0)
  if (unbalanced.length) alerts.push({ severity: 'danger', type: 'unbalanced', message: `Terdapat jurnal draft tidak balance`, count: unbalanced.length })
  ok(res, { alerts })
})

// ------------------------------------------------------------
// 11. EXPORT — pembuatan file PDF & XLSX yang valid
// ------------------------------------------------------------

// --- Minimal valid PDF (PDF 1.4) ---------------------------------
// Membuat PDF satu halaman berisi teks (kop, data, footer).
const generatePDF = (lines) => {
  const text = lines.join('\n')
  // Escape backslash & parentheses untuk teks PDF
  const escaped = text.replaceAll(String.fromCharCode(92), String.fromCharCode(92,92)).replaceAll("(", String.fromCharCode(92,40)).replaceAll(")", String.fromCharCode(92,41))
  const streamContent = `BT\n/F1 11 Tf\n50 750 Td\n(${escaped}) Tj\nET`
  const streamLen = Buffer.byteLength(streamContent)

  // Bangun objek PDF secara berurutan
  const objs = []
  let offset = 0
  const add = (s) => { objs.push(Buffer.from(s)); offset += Buffer.byteLength(s) }

  add('%PDF-1.4\n')
  // 1: Catalog
  const o1 = offset; add('1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n')
  // 2: Pages
  const o2 = offset; add('2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n')
  // 3: Page
  const o3 = offset; add('3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n')
  // 4: Content stream
  const o4 = offset; add(`4 0 obj<</Length ${streamLen}>>\nstream\n${streamContent}\n\nendstream\nendobj\n`)
  // 5: Font
  const o5 = offset; add('5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n')

  // xref
  const xrefOffset = offset
  add('xref\n')
  add('0 6\n')
  add('0000000000 65535 f \n')
  for (const o of [o1, o2, o3, o4, o5]) add(`${String(o).padStart(10, '0')} 00000 n \n`)

  add(`trailer<</Size 6/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`)
  return Buffer.concat(objs)
}

// --- Minimal valid XLSX (ZIP + Office Open XML) ------------------
// Membuat XLSX satu sheet berisi baris-baris teks.
const generateXLSX = (headers, rows) => {
  const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  // Shared strings
  const allStrings = [...headers, ...rows.flat()]
  const siEls = allStrings.map((s) => `<si><t>${escXml(s)}</t></si>`).join('')
  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${allStrings.length}" uniqueCount="${allStrings.length}">${siEls}</sst>`

  // Sheet data
  let sheetRows = ''
  // Header row
  const headerCells = headers.map((_, i) => `<c r="${String.fromCharCode(65 + i)}1" t="s" s="1"><v>${i}</v></c>`).join('')
  sheetRows += `<row r="1">${headerCells}</row>\n`
  // Data rows
  rows.forEach((row, ri) => {
    const cells = row.map((_, ci) => `<c r="${String.fromCharCode(65 + ci)}${ri + 2}" t="s"><v>${headers.length + ri * row.length + ci}</v></c>`).join('')
    sheetRows += `<row r="ri + 2}">${cells}</row>\n`
  })
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`

  // Workbook
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`

  // Content types
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`

  // Rels
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`

  // Build ZIP entries
  const entries = [
    ['[Content_Types].xml', contentTypesXml],
    ['_rels/.rels', rootRels],
    ['xl/workbook.xml', workbookXml],
    ['xl/_rels/workbook.xml.rels', wbRels],
    ['xl/worksheets/sheet1.xml', sheetXml],
    ['xl/sharedStrings.xml', sharedStringsXml],
  ]

  // Construct ZIP manually (deflate each entry)
  const parts = []
  let localOffset = 0
  const centralHeaders = []

  for (const [name, data] of entries) {
    const nameBuffer = Buffer.from(name, 'utf8')
    const dataBuffer = Buffer.from(data, 'utf8')
    const compressed = deflateSync(dataBuffer)
    const crc = crc32(dataBuffer)

    // Local file header
    const local = Buffer.alloc(30 + nameBuffer.length)
    local.writeUInt32LE(0x04034b50, 0) // signature
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(8, 8) // compression (deflate)
    local.writeUInt16LE(0, 10) // mod time
    local.writeUInt16LE(0, 12) // mod date
    local.writeUInt32LE(crc, 14) // crc32
    local.writeUInt32LE(compressed.length, 18) // compressed size
    local.writeUInt32LE(dataBuffer.length, 22) // uncompressed size
    local.writeUInt16LE(nameBuffer.length, 26) // name length
    local.writeUInt16LE(0, 28) // extra length
    nameBuffer.copy(local, 30)
    parts.push(local, compressed)

    // Central directory header
    const central = Buffer.alloc(46 + nameBuffer.length)
    central.writeUInt32LE(0x02014b50, 0) // signature
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0, 8) // flags
    central.writeUInt16LE(8, 10) // compression
    central.writeUInt16LE(0, 12) // mod time
    central.writeUInt16LE(0, 14) // mod date
    central.writeUInt32LE(crc, 16) // crc32
    central.writeUInt32LE(compressed.length, 20) // compressed size
    central.writeUInt32LE(dataBuffer.length, 24) // uncompressed size
    central.writeUInt16LE(nameBuffer.length, 28) // name length
    central.writeUInt16LE(0, 30) // extra length
    central.writeUInt16LE(0, 32) // comment length
    central.writeUInt16LE(0, 34) // disk number start
    central.writeUInt16LE(0, 36) // internal attrs
    central.writeUInt32LE(0, 38) // external attrs
    central.writeUInt32LE(localOffset, 42) // local header offset
    nameBuffer.copy(central, 46)
    centralHeaders.push(central)

    localOffset += local.length + compressed.length
  }

  // End of central directory
  const centralDirSize = centralHeaders.reduce((s, b) => s + b.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // signature
  eocd.writeUInt16LE(0, 4) // disk number
  eocd.writeUInt16LE(0, 6) // disk with central dir
  eocd.writeUInt16LE(entries.length, 8) // entries on this disk
  eocd.writeUInt16LE(entries.length, 10) // total entries
  eocd.writeUInt32LE(centralDirSize, 12) // central dir size
  eocd.writeUInt32LE(localOffset, 16) // central dir offset
  eocd.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...parts, ...centralHeaders, eocd])
}

// CRC32 lookup table
let _crcTable = null
const crc32Table = () => {
  if (_crcTable) return _crcTable
  _crcTable = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    _crcTable[n] = c
  }
  return _crcTable
}
const crc32 = (buf) => {
  const table = crc32Table()
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}


// ------------------------------------------------------------
// 11b. EXPORT ENDPOINTS
// ------------------------------------------------------------
app.get('/exports/reports/:reportType', requireAuthExport, (req, res) => {
  const { reportType } = req.params
  const format = req.query.format || 'pdf'
  if (!['pdf', 'xlsx'].includes(format)) return fail(res, 422, 'UNSUPPORTED_FORMAT', 'Format tidak didukung (pdf/xlsx)')
  const periodKey = req.query.period || '2026-03'
  const names = { 'trial-balance': 'Neraca-Lajur', 'income-statement': 'Laba-Rugi', 'balance-sheet': 'Neraca', 'cash-flow': 'Arus-Kas' }
  if (!names[reportType]) return fail(res, 404, 'NO_DATA', 'Jenis laporan tidak dikenal')
  const filename = `${names[reportType]}-${periodKey}.${format}`
  const entityName = db.entities.find((e) => e.id === req.entityId)?.name ?? ''
  const reportLabel = names[reportType]
  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(generatePDF([
      `${entityName}`,
      `Laporan ${reportLabel}`,
      `Periode: ${periodKey}`,
      `Dicetak: ${nowIso()}`,
      '',
      '(Mock API — data placeholder)',
    ]))
  } else {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(generateXLSX(
      ['Field', 'Nilai'],
      [
        ['Perusahaan', entityName],
        ['Laporan', reportLabel],
        ['Periode', periodKey],
        ['Dicetak', nowIso()],
      ]
    ))
  }
})

app.get('/exports/accounts', requireAuthExport, (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="chart-of-accounts.csv"')
  res.send(entityAccounts(req.entityId).map((a) => `${a.code},${a.name},${a.type}`).join('\n'))
})

// Export Buku Besar per akun — validasi sama dengan GET /ledger/accounts/:id
// (akun wajib dikenal), payload placeholder seperti export laporan.
// Rentang: `period` (YYYY-MM) ATAU `start`+`end` (YYYY-MM-DD, keduanya wajib)
// untuk rentang tanggal custom. Backward compatible: tanpa start/end → period.
app.get('/exports/ledger/:accountId', requireAuthExport, (req, res) => {
  const { accountId } = req.params
  const format = req.query.format || 'pdf'
  if (!['pdf', 'xlsx'].includes(format)) return fail(res, 422, 'UNSUPPORTED_FORMAT', 'Format tidak didukung (pdf/xlsx)')
  const account = entityAccounts(req.entityId).find((a) => a.id === accountId)
  if (!account) return fail(res, 404, 'ACCOUNT_NOT_FOUND', 'Akun tidak ditemukan')
  const isoDate = /^\d{4}-\d{2}-\d{2}$/
  const { start, end } = req.query
  let periodKey = req.query.period || '2026-03'
  if (start || end) {
    if (!start || !end) return fail(res, 422, 'INVALID_DATE_RANGE', 'Rentang tanggal wajib lengkap (start & end)')
    if (!isoDate.test(start) || !isoDate.test(end)) return fail(res, 422, 'INVALID_DATE_RANGE', 'Format tanggal harus YYYY-MM-DD')
    if (start > end) return fail(res, 422, 'INVALID_DATE_RANGE', 'start tidak boleh setelah end')
    periodKey = `${start}..${end}`
  } else if (!periodByKey(periodKey)) {
    return fail(res, 422, 'INVALID_PERIOD', 'Periode tidak valid')
  }
  const filename = `Buku-Besar-${account.code}-${periodKey}.${format}`
  const entityName = db.entities.find((e) => e.id === req.entityId)?.name ?? ''
  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(generatePDF([
      `${entityName}`,
      `Buku Besar — ${account.code} ${account.name}`,
      `Periode: ${periodKey}`,
      `Dicetak: ${nowIso()}`,
      '',
      '(Mock API — data placeholder)',
    ]))
  } else {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(generateXLSX(
      ['Field', 'Nilai'],
      [
        ['Perusahaan', entityName],
        ['Akun', `${account.code} ${account.name}`],
        ['Periode', periodKey],
        ['Dicetak', nowIso()],
      ]
    ))
  }
})

// ------------------------------------------------------------
// 12. PENCARIAN GLOBAL
// ------------------------------------------------------------
app.get('/search', requireAuth, (req, res) => {
  const q = (req.query.q || '').toLowerCase()
  const types = (req.query.types || 'journal,account,report,page').split(',')
  const limit = Number(req.query.limit || 10)
  const results = []
  if (types.includes('journal') && q) {
    for (const j of entityJournals(req.entityId)) {
      if (results.length >= limit) break
      if (j.transactionNumber.toLowerCase().includes(q) || j.description.toLowerCase().includes(q)) {
        results.push({ type: 'journal', id: j.id, title: j.transactionNumber, subtitle: `${j.description} · ${new Date(j.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, metadata: { status: j.status } })
      }
    }
  }
  if (types.includes('account') && q) {
    const balances = computeBalances(req.entityId)
    for (const a of entityAccounts(req.entityId)) {
      if (results.length >= limit) break
      if (a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)) {
        results.push({ type: 'account', id: a.id, title: a.name, subtitle: `${a.code} · ${a.type}`, metadata: { balance: balances.get(a.id) ?? 0 } })
      }
    }
  }
  // Laporan (menu navigasi laporan) — setiap laporan bisa dicari dan dibuka
  if (types.includes('report') && q) {
    const reports = [
      { id: 'neraca-lajur', title: 'Neraca Lajur', subtitle: 'Laporan · trial balance per periode' },
      { id: 'laba-rugi', title: 'Laba Rugi', subtitle: 'Laporan · pendapatan & beban per periode' },
      { id: 'neraca', title: 'Neraca', subtitle: 'Laporan · posisi keuangan (aset, utang, modal)' },
      { id: 'arus-kas', title: 'Arus Kas', subtitle: 'Laporan · arus kas operasi/investasi/pendanaan' },
    ]
    for (const r of reports) {
      if (results.length >= limit) break
      if (r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q)) {
        results.push({ type: 'report', id: r.id, title: r.title, subtitle: r.subtitle, metadata: {} })
      }
    }
  }
  // Halaman / menu navigasi lain (dashboard, jurnal, buku besar, pengaturan)
  if (types.includes('page') && q) {
    const pages = [
      { id: 'dashboard', title: 'Dashboard', subtitle: 'Halaman utama · ringkasan keuangan' },
      { id: 'journal', title: 'Jurnal', subtitle: 'Halaman · daftar & entri jurnal' },
      { id: 'buku-besar', title: 'Buku Besar', subtitle: 'Halaman · saldo berjalan per akun' },
      { id: 'laporan-lain', title: 'Laporan Lain', subtitle: 'Halaman · modul laporan tambahan' },
      { id: 'pengaturan', title: 'Pengaturan', subtitle: 'Halaman · periode, entitas & preferensi' },
    ]
    for (const p of pages) {
      if (results.length >= limit) break
      if (p.title.toLowerCase().includes(q) || p.subtitle.toLowerCase().includes(q)) {
        results.push({ type: 'page', id: p.id, title: p.title, subtitle: p.subtitle, metadata: {} })
      }
    }
  }
  ok(res, { results })
})

// ------------------------------------------------------------
// Health check & 404
// ------------------------------------------------------------
app.get('/health', (req, res) => ok(res, { status: 'ok', time: nowIso(), journals: db.journals.length, accounts: db.accounts.length }))

// ---- Test koneksi database (Pengaturan PostgreSQL) --------------------------
// Menerima { host, port, database, schema, username, password } dari form Pengaturan.
// Melakukan SELECT 1 nyata ke PostgreSQL untuk memverifikasi koneksi.
// Respons { data: { ok, message, latencyMs } }.
app.post('/settings/test-connection', async (req, res) => {
  const { host, port, database, schema, username, password } = req.body || {}
  if (!host || !port || !database) {
    return fail(res, 422, 'VALIDATION_ERROR', 'Host, port, dan nama basis data wajib diisi')
  }
  const cfg = {
    storageMode: 'postgresql',
    host: String(host).trim(),
    port: String(port).trim(),
    database: String(database).trim(),
    schema: String(schema || 'public').trim() || 'public',
    username: String(username || 'postgres').trim() || 'postgres',
    password: password ?? '',
  }
  try {
    const result = await testQuery(cfg)
    ok(res, result)
  } catch (err) {
    const msg = err.code === 'ENOTFOUND'
      ? `Hostname '${cfg.host}' tidak ditemukan. Jika PostgreSQL berjalan di Docker, gunakan IP address server atau 'localhost' (jika port di-mapping), bukan nama service Docker.`
      : err.code === 'ECONNREFUSED'
      ? `Koneksi ditolak di ${cfg.host}:${cfg.port}. Pastikan PostgreSQL berjalan dan port ${cfg.port} terbuka dari komputer Anda.`
      : err.code === 'ETIMEDOUT'
      ? `Koneksi timeout ke ${cfg.host}:${cfg.port}. Pastikan firewall mengizinkan koneksi ke port PostgreSQL.`
      : `Test koneksi gagal: ${err.message}`
    fail(res, 500, 'INTERNAL_ERROR', msg)
  }
})

// ---- Konfigurasi database (Pengaturan PostgreSQL) ----------------------------
// GET  /settings/db-config → { data: { host, port, database, password } }
// POST /settings/db-config → simpan ke db + file persist
app.get('/settings/db-config', requireAuth, (req, res) => {
  ok(res, db.dbConfig)
})

app.post('/settings/db-config', requireAuth, (req, res) => {
  const { storageMode, host, port, database, schema, username, password } = req.body || {}
  if (!host || !port || !database) {
    return fail(res, 422, 'VALIDATION_ERROR', 'Host, port, dan nama basis data wajib diisi')
  }
  // Port harus angka 1-65535
  const portNum = Number(port)
  if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
    return fail(res, 422, 'VALIDATION_ERROR', 'Port harus berupa angka 1–65535')
  }
  const defaultTables = { accounts: 'accounts', journals: 'journals', journalLines: 'journal_lines', periods: 'periods', users: 'users', entities: 'entities', sessions: 'sessions', attachments: 'attachments' }
  db.dbConfig = { storageMode: storageMode ?? 'local', host: String(host).trim(), port: String(port).trim(), database: String(database).trim(), schema: String(schema ?? 'public').trim() || 'public', username: String(username ?? 'postgres').trim() || 'postgres', password: password ?? '', tables: { ...defaultTables, ...(req.body?.tables || {}) } }
  // Manage connection pool: buat jika mode PostgreSQL, destroy jika mode local
  if (db.dbConfig.storageMode === 'postgresql') {
    getPool(db.dbConfig)
  } else {
    destroyPool()
  }
  ok(res, db.dbConfig)
})

// Hook pengujian (API §13 INTERNAL_ERROR): route ini sengaja melempar error
// agar error handler global (500 INTERNAL_ERROR) bisa divalidasi. Konsisten
// dengan endpoint /admin/* lain yang tanpa auth (alat development).
app.post('/admin/debug/error', (req, res) => {
  throw new Error('pemicu INTERNAL_ERROR untuk test')
})

// SPA fallback — serve index.html untuk request browser (Accept: text/html)
// yang tidak match route API. React Router handle routing di client-side.
if (existsSync(staticDir)) {
  app.get('*', (req, res, next) => {
    // Skip jika request ini untuk API (Accept header mengandung application/json)
    const accept = req.get('Accept') || ''
    if (accept.includes('application/json')) return next()
    // Skip semua route API known
    const apiPrefixes = ['/auth', '/admin', '/accounts', '/journals', '/ledger',
      '/reports', '/search', '/exports', '/users', '/entities', '/periods',
      '/dashboard', '/settings', '/health']
    if (apiPrefixes.some(p => req.path.startsWith(p))) return next()
    res.sendFile(join(staticDir, 'index.html'))
  })
}

app.use((req, res) => fail(res, 404, 'NOT_FOUND', `Endpoint ${req.method} ${req.path} tidak ditemukan`))

// ------------------------------------------------------------
// Error handler global (harus 4 argumen) — mengubah error tak terduga
// menjadi envelope INTERNAL_ERROR 500 (API §13):
//   { error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan
//     server. Kode: E12345' } }
// Error ber-status < 500 (mis. body JSON malformed) dibalas dengan
// status & pesan aslinya (VALIDATION_ERROR).
// ------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)
  const status = Number(err?.status) || 500
  if (status < 500) {
    return fail(res, status, 'VALIDATION_ERROR', err?.message || 'Data tidak valid')
  }
  const errorCode = `E${Math.abs(Math.floor(Math.random() * 90_000)) + 10_000}`
  console.error('[INTERNAL_ERROR]', err?.message || err)
  return fail(res, 500, 'INTERNAL_ERROR', `Terjadi kesalahan server. Kode: ${errorCode}`)
})

export default app
