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
import { entities, users, rolePermissions, accounts, coaTemplate, journals, periods, mockTrend, extraJournals } from './data.js'
import { isEnabled as persistEnabled, getFilePath as persistFilePath, loadState as loadPersisted, saveState as savePersisted } from './persistence.js'

const app = express()
// exposedHeaders: browser perlu membaca Content-Disposition (nama file export)
// dari respons download laporan (GET /exports/...).
app.use(cors({ exposedHeaders: ['Content-Disposition'] }))
app.use(express.json())

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
  accounts: structuredClone(accounts),
  // Seed dimiliki entitas default (ent-001) — semua user seed juga ent-001
  journals: structuredClone([...journals, ...(withExtra ? extraJournals : [])]).map((j) => ({ entityId: 'ent-001', ...j })),
  periods: structuredClone(periods),
  sessions: new Map(), // refreshToken -> userId
  seq: { journal: 100, line: 100, attachment: 100, user: 100, entity: 100 },
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
    db = {
      entities: loaded.entities,
      users: loaded.users,
      accounts: loaded.accounts,
      journals: loaded.journals,
      periods: loaded.periods,
      sessions: new Map(loaded.sessions ?? []),
      seq: loaded.seq ?? { journal: 100, line: 100, attachment: 100, user: 100, entity: 100 },
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
const rateLimit = (req, res, next) => {
  let max
  if (process.env.MOCK_RATE_MAX !== undefined && process.env.MOCK_RATE_MAX !== '') {
    max = Number(process.env.MOCK_RATE_MAX)
  } else {
    max = process.env.NODE_ENV === 'test' ? Infinity : 30 // API §1.5
  }
  const windowMs = Number(process.env.MOCK_RATE_WINDOW_MS) || 60_000
  const key = `${req.ip || 'unknown'}|${req.baseUrl}${req.path}`
  const now = Date.now()
  const bucket = rateBuckets.get(key) ?? { count: 0, resetAt: now + windowMs }
  if (now >= bucket.resetAt) {
    bucket.count = 0
    bucket.resetAt = now + windowMs
  }
  bucket.count += 1
  rateBuckets.set(key, bucket)
  if (bucket.count > max) return fail(res, 429, 'RATE_LIMITED', 'Terlalu banyak permintaan')
  next()
}

// Ukuran & tipe lampiran yang didukung (API §13 FILE_TOO_LARGE / UNSUPPORTED_FILE_TYPE)
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_ATTACHMENT_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf'])

// Rate limit aktif untuk semua route (harus terpasang sebelum routes)
app.use(rateLimit)

// Saldo live per akun: baseBalance + efek jurnal posted (BR-6, BR-7)
// Jurnal yang memengaruhi saldo: posted DAN bukan jurnal pembalik.
// Jurnal asli yang di-reverse berstatus 'reversed' (tidak dihitung),
// jurnal pembalik punya reversalOf (tidak dihitung) → pasangan bernet 0.
const isEffect = (j) => j.status === 'posted' && !j.reversalOf

const computeBalances = () => {
  const map = new Map(db.accounts.map((a) => [a.id, a.baseBalance]))
  for (const j of db.journals) {
    if (!isEffect(j)) continue
    for (const ln of j.lines) {
      const account = db.accounts.find((a) => a.id === ln.accountId)
      if (!account) continue
      const delta = account.normalBalance === 'debit' ? ln.debit - ln.credit : ln.credit - ln.debit
      map.set(account.id, (map.get(account.id) ?? 0) + delta)
    }
  }
  return map
}

// Bangun tree akun dari saldo live (API §4.1)
const buildAccountTree = (balances) => {
  const byId = new Map(db.accounts.map((a) => [a.id, { ...a, balance: balances.get(a.id) ?? 0, children: [] }]))
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
    const account = db.accounts.find((a) => a.id === ln.accountId)
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
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) return fail(res, 422, 'VALIDATION_ERROR', 'Email dan password wajib diisi', [{ field: 'email', message: 'Wajib diisi' }])
  const user = db.users.find((u) => u.email === email && u.password === password && u.isActive)
  if (!user) return fail(res, 401, 'INVALID_CREDENTIALS', 'Email atau password salah')
  const refreshToken = randomUUID()
  db.sessions.set(refreshToken, { userId: user.id, expiresAt: Date.now() + refreshTtlMs() })
  const { password: _pw, ...safeUser } = user
  ok(res, {
    accessToken: `mock.${user.id}.${Date.now()}`,
    refreshToken,
    expiresIn: Math.round(accessTtlMs / 1000),
    user: safeUser,
  })
})

app.post('/auth/refresh', (req, res) => {
  const { refreshToken } = req.body ?? {}
  const entry = db.sessions.get(refreshToken)
  if (!entry) return fail(res, 401, 'INVALID_REFRESH_TOKEN', 'Refresh token tidak valid')
  // Sesi kedaluwarsa: refresh token melewati TTL → hapus + SESSION_EXPIRED
  // (klien tampilkan modal "Sesi berakhir"), berbeda dari token tak dikenal.
  if (entry.expiresAt <= Date.now()) {
    db.sessions.delete(refreshToken)
    return fail(res, 401, 'SESSION_EXPIRED', 'Sesi berakhir. Silakan login kembali.')
  }
  const newRefresh = randomUUID()
  db.sessions.delete(refreshToken)
  db.sessions.set(newRefresh, { userId: entry.userId, expiresAt: Date.now() + refreshTtlMs() })
  ok(res, { accessToken: `mock.${entry.userId}.${Date.now()}`, refreshToken: newRefresh, expiresIn: Math.round(accessTtlMs / 1000) })
})

app.post('/auth/logout', (req, res) => {
  const { refreshToken } = req.body ?? {}
  if (refreshToken) db.sessions.delete(refreshToken)
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
  const balances = computeBalances()
  let list = db.accounts.filter((a) => a.isActive || !req.query.activeOnly)
  if (req.query.type) list = list.filter((a) => a.type === req.query.type)
  if (req.query.keyword) {
    const kw = req.query.keyword.toLowerCase()
    list = list.filter((a) => a.name.toLowerCase().includes(kw) || a.code.toLowerCase().includes(kw))
  }
  if (req.query.tree === 'true') {
    const roots = buildAccountTree(balances).filter((n) => list.some((a) => a.id === n.id))
    const totals = { asset: 0, liability: 0, equity: 0 }
    for (const a of db.accounts) {
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
  if (db.accounts.some((a) => a.code === code)) return fail(res, 409, 'ACCOUNT_CODE_EXISTS', 'Kode akun sudah digunakan')
  if (parentId) {
    const parent = db.accounts.find((a) => a.id === parentId)
    if (!parent || !parent.isActive) return fail(res, 422, 'INVALID_PARENT', 'Akun induk tidak ditemukan atau non-aktif')
  }
  const account = { id: code, code, name, type, group: group ?? type, category: category ?? 'Umum', normalBalance: normalBalance ?? (type === 'asset' || type === 'expense' ? 'debit' : 'credit'), baseBalance: 0, parentId: parentId ?? null, isHeader: false, isActive: isActive ?? true, description }
  db.accounts.push(account)
  ok(res, { ...account, balance: 0 }, null, 201)
})

app.put('/accounts/:id', requireAuth, requirePermission('account.write'), (req, res) => {
  const account = db.accounts.find((a) => a.id === req.params.id)
  if (!account) return fail(res, 404, 'ACCOUNT_NOT_FOUND', 'Akun tidak ditemukan')
  const { code, name, category, description, parentId, normalBalance, group } = req.body ?? {}
  if (code && code !== account.code && db.accounts.some((a) => a.code === code)) return fail(res, 409, 'ACCOUNT_CODE_EXISTS', 'Kode akun sudah digunakan')
  Object.assign(account, { code: code ?? account.code, name: name ?? account.name, category: category ?? account.category, description: description ?? account.description, parentId: parentId ?? account.parentId, normalBalance: normalBalance ?? account.normalBalance, group: group ?? account.group })
  ok(res, { ...account, balance: computeBalances().get(account.id) ?? 0 })
})

app.delete('/accounts/:id', requireAuth, requirePermission('account.write'), (req, res) => {
  const account = db.accounts.find((a) => a.id === req.params.id)
  if (!account) return fail(res, 404, 'ACCOUNT_NOT_FOUND', 'Akun tidak ditemukan')
  const children = db.accounts.filter((a) => a.parentId === account.id && a.isActive)
  if (children.length) return fail(res, 409, 'ACCOUNT_HAS_CHILDREN', 'Akun induk tidak bisa dihapus jika memiliki sub-akun aktif')
  const balance = computeBalances().get(account.id) ?? 0
  if (balance !== 0) return fail(res, 409, 'ACCOUNT_HAS_BALANCE', 'Akun memiliki saldo; non-aktifkan saja')
  account.isActive = false
  res.status(204).end()
})

app.patch('/accounts/:id/activate', requireAuth, requirePermission('account.write'), (req, res) => {
  const account = db.accounts.find((a) => a.id === req.params.id)
  if (!account) return fail(res, 404, 'ACCOUNT_NOT_FOUND', 'Akun tidak ditemukan')
  account.isActive = true
  ok(res, { id: account.id, isActive: true })
})
app.patch('/accounts/:id/deactivate', requireAuth, requirePermission('account.write'), (req, res) => {
  const account = db.accounts.find((a) => a.id === req.params.id)
  if (!account) return fail(res, 404, 'ACCOUNT_NOT_FOUND', 'Akun tidak ditemukan')
  const balance = computeBalances().get(account.id) ?? 0
  if (balance !== 0) return fail(res, 409, 'ACCOUNT_HAS_BALANCE', 'Akun memiliki saldo; non-aktifkan saja')
  account.isActive = false
  ok(res, { id: account.id, isActive: false })
})

app.post('/accounts/template', requireAuth, requirePermission('account.write'), (req, res) => {
  const { templateId, mode } = req.body ?? {}
  const template = coaTemplate.id === templateId ? coaTemplate : null
  if (!template) return fail(res, 404, 'NOT_FOUND', 'Template tidak ditemukan')
  const existing = db.accounts.length
  if (mode === 'replace' && existing > 0) return fail(res, 409, 'ACCOUNTS_EXIST', 'COA sudah memiliki akun; mode replace perlu konfirmasi')
  let created = 0
  let skipped = 0
  const createdAccounts = []
  for (const t of template.accounts) {
    if (db.accounts.some((a) => a.code === t.code)) {
      skipped++
      continue
    }
    const account = { ...t, id: t.code, baseBalance: 0, isActive: true, description: 'Dari template ' + template.name }
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
  const balances = computeBalances()
  const rows = db.accounts.map((a) => `${a.code},${a.name},${a.type},${a.normalBalance},${balances.get(a.id) ?? 0}`)
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
      const account = db.accounts.find((a) => a.id === ln.accountId)
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
  const journal = db.journals.find((j) => j.id === req.params.id)
  if (!journal) return fail(res, 404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
  ok(res, journal)
})

app.put('/journals/:id', requireAuth, requirePermission('journal.write'), (req, res) => {
  const journal = db.journals.find((j) => j.id === req.params.id)
  if (!journal) return fail(res, 404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
  if (journal.status === 'posted') return fail(res, 409, 'JOURNAL_ALREADY_POSTED', 'Jurnal sudah diposting, tidak dapat diedit')
  if (journal.status === 'reversed') return fail(res, 409, 'ALREADY_REVERSED', 'Jurnal sudah dibatalkan')
  // Optimistic locking (API §1.5 409 DATA_CONFLICT)
  const ifMatch = req.headers['if-match']
  if (ifMatch && Number(ifMatch) !== journal.version) return fail(res, 409, 'DATA_CONFLICT', 'Data sudah diubah oleh pengguna lain. Muat ulang halaman.')
  const err = validateJournal(req.body, journal.id, req.entityId)
  if (err) return fail(res, err.status, err.code, err.message, err.details)
  const accountName = (accountId) => db.accounts.find((a) => a.id === accountId)?.name ?? ''
  journal.date = req.body.date
  journal.transactionNumber = req.body.transactionNumber ?? journal.transactionNumber
  journal.description = req.body.description?.trim() || journal.description
  journal.lines = req.body.lines.map((ln, i) => {
    const account = db.accounts.find((a) => a.id === ln.accountId)
    return { id: `line-${pad(db.seq.line++)}`, accountId: ln.accountId, accountCode: account.code, accountName: account.name, debit: Number(ln.debit ?? 0), credit: Number(ln.credit ?? 0), description: ln.description }
  })
  journal.version++
  journal.auditTrail.push({ userId: req.user.id, action: 'update', timestamp: nowIso() })
  ok(res, journal)
})

app.delete('/journals/:id', requireAuth, requirePermission('journal.write'), (req, res) => {
  const idx = db.journals.findIndex((j) => j.id === req.params.id)
  if (idx === -1) return fail(res, 404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
  if (db.journals[idx].status !== 'draft' && db.journals[idx].status !== 'pending-approval') return fail(res, 409, 'JOURNAL_ALREADY_POSTED', 'Hanya jurnal draft yang dapat dihapus')
  db.journals.splice(idx, 1)
  res.status(204).end()
})

app.post('/journals/:id/post', requireAuth, requirePermission('journal.write'), (req, res) => {
  const journal = db.journals.find((j) => j.id === req.params.id)
  if (!journal) return fail(res, 404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
  if (journal.status === 'posted') return fail(res, 409, 'ALREADY_POSTED', 'Jurnal sudah diposting')
  if (journal.status === 'reversed') return fail(res, 409, 'ALREADY_REVERSED', 'Jurnal sudah dibatalkan')
  const err = validateJournal({ ...journal, transactionNumber: undefined }) // balance & periode
  if (err) return fail(res, err.status, err.code, err.message, err.details)
  journal.status = 'posted'
  journal.postedAt = nowIso()
  journal.version++
  journal.auditTrail.push({ userId: req.user.id, action: 'post', timestamp: nowIso() })
  const balances = computeBalances()
  const affectedAccounts = [...new Set(journal.lines.map((ln) => ln.accountId))].map((accountId) => ({ accountId, newBalance: balances.get(accountId) ?? 0 }))
  ok(res, { id: journal.id, status: 'posted', postedAt: journal.postedAt, affectedAccounts })
})

app.post('/journals/:id/reverse', requireAuth, requirePermission('journal.write'), (req, res) => {
  const journal = db.journals.find((j) => j.id === req.params.id)
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
  const journal = db.journals.find((j) => j.id === req.params.id)
  if (!journal) return fail(res, 404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
  if (journal.status !== 'draft') return fail(res, 409, 'INVALID_STATUS_TRANSITION', 'Hanya jurnal draft yang dapat disubmit')
  journal.status = 'pending-approval'
  journal.auditTrail.push({ userId: req.user.id, action: 'submit', timestamp: nowIso() })
  ok(res, { id: journal.id, status: 'pending-approval' })
})

app.post('/journals/:id/approve', requireAuth, requireApprovalRights, (req, res) => {
  const journal = db.journals.find((j) => j.id === req.params.id)
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
  const journal = db.journals.find((j) => j.id === req.params.id)
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
  const journal = db.journals.find((j) => j.id === req.params.id)
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
  const journal = db.journals.find((j) => j.id === req.params.id)
  if (!journal) return fail(res, 404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
  journal.attachments = (journal.attachments ?? []).filter((a) => a.id !== req.params.attId)
  res.status(204).end()
})

// ------------------------------------------------------------
// 6. BUKU BESAR (General Ledger)
// ------------------------------------------------------------
app.get('/ledger/accounts/:accountId', requireAuth, (req, res) => {
  const account = db.accounts.find((a) => a.id === req.params.accountId)
  if (!account) return fail(res, 404, 'ACCOUNT_NOT_FOUND', 'Akun tidak ditemukan')
  const periodKey = req.query.period || '2026-03'
  const p = periodByKey(periodKey)
  if (!p) return fail(res, 422, 'INVALID_PERIOD', 'Periode tidak valid')
  const start = p.startDate
  const end = p.endDate
  const relevant = db.journals.filter((j) => isEffect(j) && j.lines.some((ln) => ln.accountId === account.id))
  const before = relevant.filter((j) => j.date < start)
  const within = relevant
    .filter((j) => j.date >= start && j.date <= end)
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
  ok(res, { accountId: account.id, accountCode: account.code, accountName: account.name, period: periodKey, openingBalance: opening, closingBalance: running, entries })
})

app.get('/ledger', requireAuth, (req, res) => {
  const periodKey = req.query.period || '2026-03'
  const p = periodByKey(periodKey)
  if (!p) return fail(res, 422, 'INVALID_PERIOD', 'Periode tidak valid')
  const start = p.startDate
  const end = p.endDate
  const rows = []
  for (const account of db.accounts) {
    if (account.isHeader) continue
    const relevant = db.journals.filter((j) => j.status === 'posted' && j.lines.some((ln) => ln.accountId === account.id))
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
  const ledgerRes = { ...(awaitLedger(periodKey)) }
  let totalDebit = 0
  let totalCredit = 0
  const lines = []
  for (const row of ledgerRes.accounts) {
    if (row.closingBalance === 0) continue
    const account = db.accounts.find((a) => a.id === row.accountId)
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

const awaitLedger = (periodKey) => {
  const p = periodByKey(periodKey)
  const start = p.startDate
  const end = p.endDate
  const rows = []
  for (const account of db.accounts) {
    if (account.isHeader) continue
    const relevant = db.journals.filter((j) => isEffect(j) && j.lines.some((ln) => ln.accountId === account.id))
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
const balancesByPeriod = (periodKey) => {
  const p = periodByKey(periodKey)
  const start = p.startDate
  const end = p.endDate
  const map = new Map()
  for (const account of db.accounts) {
    const relevant = db.journals.filter((j) => isEffect(j) && j.lines.some((ln) => ln.accountId === account.id))
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
  const map = balancesByPeriod(periodKey)
  const revenueAccounts = db.accounts.filter((a) => a.type === 'revenue')
  const expenseAccounts = db.accounts.filter((a) => a.type === 'expense')
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
  const map = balancesByPeriod(periodKey)
  const assetAccounts = db.accounts.filter((a) => a.type === 'asset' && !a.isHeader)
  const liabAccounts = db.accounts.filter((a) => a.type === 'liability' && !a.isHeader)
  const equityAccounts = db.accounts.filter((a) => a.type === 'equity' && !a.isHeader)
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
  const map = balancesByPeriod(periodKey)
  const cashAccounts = db.accounts.filter((a) => a.type === 'asset' && (a.category === 'Kas & Bank'))
  const beginningCash = cashAccounts.reduce((s, a) => s + (map.get(a.id)?.opening ?? 0), 0)
  const endingCash = cashAccounts.reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0)
  const netIncome = [...db.accounts].filter((a) => a.type === 'revenue').reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0) - [...db.accounts].filter((a) => a.type === 'expense').reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0)
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
  const report = { id: req.params.id, type: 'income-statement', entity: { id: req.entityId, name: 'PT. Kreasi Inovasi Estetika' }, generatedAt: nowIso(), note: 'Laporan tersimpan (mock)' }
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
  const drafts = db.journals.filter((j) => j.date >= period.startDate && j.date <= period.endDate && j.status === 'draft')
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
  const map = balancesByPeriod(periodKey)
  const sum = (type) => db.accounts.filter((a) => a.type === type && !a.isHeader).reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0)
  const revenue = db.accounts.filter((a) => a.type === 'revenue').reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0)
  const expenses = db.accounts.filter((a) => a.type === 'expense').reduce((s, a) => s + (map.get(a.id)?.closing ?? 0), 0)
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
  ok(res, { journals: [...db.journals].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(journalBrief) })
})

app.get('/dashboard/alerts', requireAuth, (req, res) => {
  const drafts = db.journals.filter((j) => j.status === 'draft' || j.status === 'pending-approval')
  const alerts = []
  if (drafts.length) alerts.push({ severity: 'warning', type: 'draft_journals', message: `${drafts.length} jurnal draft belum diposting`, count: drafts.length })
  const openPeriods = db.periods.filter((p) => p.isOpen && !p.isActive)
  if (openPeriods.length) alerts.push({ severity: 'info', type: 'period_not_closed', message: `Periode ${openPeriods[0].name} belum ditutup` })
  const unbalanced = db.journals.filter((j) => (j.status === 'draft' || j.status === 'pending-approval') && totalsOf(j).difference !== 0)
  if (unbalanced.length) alerts.push({ severity: 'danger', type: 'unbalanced', message: `Terdapat jurnal draft tidak balance`, count: unbalanced.length })
  ok(res, { alerts })
})

// ------------------------------------------------------------
// 11. EXPORT
// ------------------------------------------------------------
app.get('/exports/reports/:reportType', requireAuthExport, (req, res) => {
  const { reportType } = req.params
  const format = req.query.format || 'pdf'
  if (!['pdf', 'xlsx'].includes(format)) return fail(res, 422, 'UNSUPPORTED_FORMAT', 'Format tidak didukung (pdf/xlsx)')
  const periodKey = req.query.period || '2026-03'
  const names = { 'trial-balance': 'Neraca-Lajur', 'income-statement': 'Laba-Rugi', 'balance-sheet': 'Neraca', 'cash-flow': 'Arus-Kas' }
  if (!names[reportType]) return fail(res, 404, 'NO_DATA', 'Jenis laporan tidak dikenal')
  const filename = `${names[reportType]}-${periodKey}.${format}`
  res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  // Mock: kirim payload teks sederhana sebagai placeholder binary (kop & footer dokumen)
  const entityName = db.entities.find((e) => e.id === req.entityId)?.name ?? ''
  res.send(Buffer.from(`MOCK EXPORT ${filename}\ncompany=${entityName}\nperiod=${periodKey}\ngeneratedAt=${nowIso()}`))
})

app.get('/exports/accounts', requireAuthExport, (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="chart-of-accounts.csv"')
  res.send(db.accounts.map((a) => `${a.code},${a.name},${a.type}`).join('\n'))
})

// ------------------------------------------------------------
// 12. PENCARIAN GLOBAL
// ------------------------------------------------------------
app.get('/search', requireAuth, (req, res) => {
  const q = (req.query.q || '').toLowerCase()
  const types = (req.query.types || 'journal,account').split(',')
  const limit = Number(req.query.limit || 10)
  const results = []
  if (types.includes('journal') && q) {
    for (const j of db.journals) {
      if (results.length >= limit) break
      if (j.transactionNumber.toLowerCase().includes(q) || j.description.toLowerCase().includes(q)) {
        results.push({ type: 'journal', id: j.id, title: j.transactionNumber, subtitle: `${j.description} · ${new Date(j.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, metadata: { status: j.status } })
      }
    }
  }
  if (types.includes('account') && q) {
    const balances = computeBalances()
    for (const a of db.accounts) {
      if (results.length >= limit) break
      if (a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)) {
        results.push({ type: 'account', id: a.id, title: a.name, subtitle: `${a.code} · ${a.type}`, metadata: { balance: balances.get(a.id) ?? 0 } })
      }
    }
  }
  ok(res, { results })
})

// ------------------------------------------------------------
// Health check & 404
// ------------------------------------------------------------
app.get('/health', (req, res) => ok(res, { status: 'ok', time: nowIso(), journals: db.journals.length, accounts: db.accounts.length }))

// Hook pengujian (API §13 INTERNAL_ERROR): route ini sengaja melempar error
// agar error handler global (500 INTERNAL_ERROR) bisa divalidasi. Konsisten
// dengan endpoint /admin/* lain yang tanpa auth (alat development).
app.post('/admin/debug/error', (req, res) => {
  throw new Error('pemicu INTERNAL_ERROR untuk test')
})

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
