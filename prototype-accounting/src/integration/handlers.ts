// MSW handlers — meniru mock API (Express) hanya di level HTTP, tanpa server nyata.
// Envelope & kode error mengikuti `API - Accounting.md` + mock-api/src/server.js.
import { http, HttpResponse } from 'msw'
import { mockAccounts, mockJournals } from '../data/mock'
import { isEffectJournal } from '../lib/ledger'
import type { Account, JournalEntry } from '../types'

const nowIso = () => new Date().toISOString()

interface DbUser {
  id: string
  name: string
  email: string
  password: string
  role: string
  entityId: string
  isActive: boolean
}

interface Entity {
  id: string
  name: string
  code: string
  isActive: boolean
}

// Server mengizinkan status 'pending-approval' (tidak ada di tipe lokal)
type JournalRecord = Omit<JournalEntry, 'status'> & {
  status: JournalEntry['status'] | 'pending-approval'
  approvedBy?: string
  approvedAt?: string
  rejectionReason?: string
}

interface Period {
  id: string
  name: string
  month: number
  year: number
  startDate: string
  endDate: string
  isOpen: boolean
  isActive: boolean
}

// Akun & jurnal disimpan dengan penanda entitas (multi-tenant) — mirror
// mock-api/src/server.js (db.journals di-stamp entityId saat boot; header
// X-Entity-Id menentukan tenant yang dilayani, default dari profil user).
type DbAccount = Account & { entityId: string }
type DbJournal = JournalRecord & { entityId: string }

interface Db {
  users: DbUser[]
  entities: Entity[]
  accounts: DbAccount[]
  journals: DbJournal[]
  periods: Period[]
  seqJournal: number
  sessions: Map<string, string> // refreshToken → userId
}

// ---- Data entitas kedua (CV Karya Mandiri) — kecil tapi bisa dibedakan, untuk
// membuktikan isolasi server-side: ganti X-Entity-Id → server mengembalikan
// data yang BENAR-BENAR berbeda (nama akun & deskripsi jurnal), bukan sekadar
// salinan ent-001. Perhatikan id jurnal SAMA dengan seed (JNL-2026-03-001) —
// ini sengaja: bukti bahwa id per entitas tidak bentrok & tidak bocor lintas
// tenant ketika filter server salah.
const ent2Accounts: Account[] = [
  { id: '1-1100', code: '1-1100', name: 'Kas CV Karya Mandiri', type: 'asset', category: 'Kas & Bank', normalBalance: 'debit', baseBalance: 25_000_000, isActive: true },
  { id: '4-1000', code: '4-1000', name: 'Pendapatan Jasa CV', type: 'revenue', category: 'Pendapatan', normalBalance: 'credit', baseBalance: 10_000_000, isActive: true },
  { id: '5-1000', code: '5-1000', name: 'Beban Gaji CV', type: 'expense', category: 'Beban Operasional', normalBalance: 'debit', baseBalance: 5_000_000, isActive: true },
]

const ent2Line = (id: string, accountId: string, debit: number, credit: number, description?: string): JournalEntry['lines'][number] => {
  const account = ent2Accounts.find((a) => a.id === accountId)!
  return {
    id,
    accountId,
    accountCode: account.code,
    accountName: account.name,
    debit,
    credit,
    description,
  }
}

const ent2Journals: JournalEntry[] = [
  {
    id: 'JNL-2026-03-001',
    transactionNumber: 'BKM-2026-03-0001',
    date: '2026-03-06',
    description: 'Penerimaan jasa CV Karya Mandiri (ent-002)',
    lines: [
      ent2Line('e2-1', '1-1100', 8_000_000, 0, 'Penerimaan tunai'),
      ent2Line('e2-2', '4-1000', 0, 8_000_000, 'Pendapatan jasa'),
    ],
    status: 'posted',
    source: 'manual',
    createdBy: 'Rina',
    createdAt: '2026-03-06T09:00:00Z',
    postedAt: '2026-03-06T09:02:00Z',
  },
  {
    id: 'JNL-2026-03-002',
    transactionNumber: 'BKK-2026-03-0002',
    date: '2026-03-11',
    description: 'Pembayaran gaji CV Karya Mandiri (ent-002)',
    lines: [
      ent2Line('e2-3', '5-1000', 3_000_000, 0, 'Gaji karyawan'),
      ent2Line('e2-4', '1-1100', 0, 3_000_000, 'Pembayaran tunai'),
    ],
    status: 'posted',
    source: 'manual',
    createdBy: 'Rina',
    createdAt: '2026-03-11T10:00:00Z',
    postedAt: '2026-03-11T10:02:00Z',
  },
]

const createDb = (): Db => ({
  users: [
    { id: 'user-001', name: 'Rina', email: 'rina@estetikakreasi.co.id', password: 'password123', role: 'admin', entityId: 'ent-001', isActive: true },
    { id: 'user-002', name: 'Dimas', email: 'dimas@estetikakreasi.co.id', password: 'password123', role: 'accountant', entityId: 'ent-001', isActive: true },
  ],
  entities: [
    { id: 'ent-001', name: 'PT. Kreasi Inovasi Estetika', code: 'KI-001', isActive: true },
    { id: 'ent-002', name: 'CV Karya Mandiri', code: 'KM-002', isActive: true },
  ],
  accounts: [
    ...structuredClone(mockAccounts).map((a) => ({ ...a, entityId: 'ent-001' })),
    ...structuredClone(ent2Accounts).map((a) => ({ ...a, entityId: 'ent-002' })),
  ],
  journals: [
    ...structuredClone(mockJournals).map((j) => ({ ...j, entityId: 'ent-001' })),
    ...structuredClone(ent2Journals).map((j) => ({ ...j, entityId: 'ent-002' })),
  ],
  // Periode fiskal — mirror mock-api/src/data.js: Januari & Februari 2026 DITUTUP, Maret terbuka
  periods: [
    { id: 'fp-2026-01', name: 'Januari 2026', month: 1, year: 2026, startDate: '2026-01-01', endDate: '2026-01-31', isOpen: false, isActive: false },
    { id: 'fp-2026-02', name: 'Februari 2026', month: 2, year: 2026, startDate: '2026-02-01', endDate: '2026-02-28', isOpen: false, isActive: false },
    { id: 'fp-2026-03', name: 'Maret 2026', month: 3, year: 2026, startDate: '2026-03-01', endDate: '2026-03-31', isOpen: true, isActive: true },
  ],
  // Mulai dari 100 (mirror mock-api seq.journal) — seed v2 punya id JNL-2026-03-010
  // (009 dilewati), jadi mulai dari length+1 (=10) akan BENTROK dengan seed.
  seqJournal: 100,
  sessions: new Map(),
})

let db = createDb()
export const resetDb = () => {
  db = createDb()
}

// ---- helpers envelope (mock-api/server.js: ok/fail) ----
const ok = (data: unknown, status = 200) => HttpResponse.json({ data }, { status })
const fail = (status: number, code: string, message: string, details?: unknown) =>
  HttpResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status })

// ---- auth guard (mock-api/server.js: requireAuth) ----
const currentUser = (request: Request): DbUser | null => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? ''
  if (!token.startsWith('mock.')) return null
  const userId = token.split('.')[1]
  return db.users.find((u) => u.id === userId && u.isActive !== false) ?? null
}

// ---- permission (mock-api/src/data.js: rolePermissions + requirePermission) ----
const rolePermissions: Record<string, string[]> = {
  admin: ['account.write', 'journal.write', 'journal.approve', 'report.read', 'period.manage', 'user.manage', 'entity.manage', 'export.read'],
  accountant: ['account.write', 'journal.write', 'report.read', 'export.read'],
  viewer: ['report.read', 'export.read'],
}
const hasPermission = (user: DbUser, ...perms: string[]) =>
  (rolePermissions[user.role] ?? []).some((p) => perms.includes(p))

// ---- multi-tenant: header X-Entity-Id (mirror mock-api requireAuth) ----
// Entitas yang dilayani = header request; default dari profil user (ent-001)
// bila header tidak dikirim (mis. request lama tanpa header).
const currentEntityId = (request: Request, user: DbUser): string =>
  request.headers.get('x-entity-id') || user.entityId

const entityAccounts = (entityId: string): DbAccount[] =>
  db.accounts.filter((a) => a.entityId === entityId)

const entityJournals = (entityId: string): DbJournal[] =>
  db.journals.filter((j) => j.entityId === entityId)

// ---- saldo akun: base + efek jurnal posted (bukan reversal), PER ENTITAS ----
const computeBalances = (entityId: string): Map<string, number> => {
  const accounts = entityAccounts(entityId)
  const map = new Map(accounts.map((a) => [a.id, a.baseBalance]))
  for (const j of entityJournals(entityId)) {
    if (!isEffectJournal(j as JournalEntry)) continue // aman: pending-approval ≠ posted
    for (const ln of j.lines) {
      const account = accounts.find((a) => a.id === ln.accountId)
      if (!account) continue
      const delta = account.normalBalance === 'debit' ? ln.debit - ln.credit : ln.credit - ln.debit
      map.set(account.id, (map.get(account.id) ?? 0) + delta)
    }
  }
  return map
}

// ---- validasi jurnal (mock-api/server.js: validateJournal, BR-4) — akun
// divalidasi terhadap chart of accounts ENTITAS AKTIF, bukan global. ----
const validateLines = (lines: { accountId?: string; debit?: number; credit?: number }[], entityId: string) => {
  const accounts = entityAccounts(entityId)
  if (!Array.isArray(lines) || lines.length === 0)
    return { code: 'JOURNAL_NO_LINES', message: 'Jurnal harus memiliki minimal 1 debit dan 1 kredit' }
  let debit = 0
  let credit = 0
  for (const ln of lines) {
    if (!ln.accountId) return { code: 'LINE_NO_ACCOUNT', message: 'Akun wajib dipilih' }
    const account = accounts.find((a) => a.id === ln.accountId)
    if (!account || account.isActive === false)
      return { code: 'LINE_NO_ACCOUNT', message: 'Akun tidak aktif atau sudah dihapus' }
    debit += Number(ln.debit ?? 0)
    credit += Number(ln.credit ?? 0)
  }
  if (debit !== credit || debit <= 0)
    return { code: 'JOURNAL_UNBALANCED', message: `Total debit dan kredit harus sama. Debit ${debit}, Kredit ${credit}` }
  return null
}

// ---- periode fiskal (mock-api/server.js: findPeriodByDate, BR-6) ----
const findPeriodByDate = (dateStr: string) => {
  const d = new Date(dateStr)
  return db.periods.find((p) => {
    const s = new Date(p.startDate)
    const e = new Date(p.endDate)
    return d >= s && d <= e
  })
}
const closedPeriodErr = (period: Period) => fail(422, 'PERIOD_CLOSED', `Periode ${period.name} sudah ditutup`)

// Cari periode dari key 'fp-2026-03' ATAU '2026-03' (mirror periodByKey server)
const periodByKey = (key: string) =>
  db.periods.find((p) => p.id === key) ?? db.periods.find((p) => `${p.year}-${String(p.month).padStart(2, '0')}` === key)

const pad = (n: number, len = 4) => String(n).padStart(len, '0')
const pad3 = (n: number) => String(n).padStart(3, '0')

export const handlers = [
  // 2. Auth
  http.post('*/auth/login', async ({ request }) => {
    const { email, password } = (await request.json()) as { email?: string; password?: string }
    if (!email || !password) return fail(422, 'VALIDATION_ERROR', 'Email dan password wajib diisi')
    const user = db.users.find((u) => u.email === email && u.password === password && u.isActive !== false)
    if (!user) return fail(401, 'INVALID_CREDENTIALS', 'Email atau password salah')
    const refreshToken = `rt-${user.id}-${Date.now()}`
    db.sessions.set(refreshToken, user.id)
    return ok({
      accessToken: `mock.${user.id}.${Date.now()}`,
      refreshToken,
      expiresIn: 86400,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    })
  }),

  http.post('*/auth/refresh', async ({ request }) => {
    const { refreshToken } = (await request.json()) as { refreshToken?: string }
    const userId = refreshToken ? db.sessions.get(refreshToken) : undefined
    if (!userId) return fail(401, 'INVALID_REFRESH_TOKEN', 'Refresh token tidak valid')
    const newRefresh = `rt-${userId}-${Date.now()}`
    db.sessions.delete(refreshToken!)
    db.sessions.set(newRefresh, userId)
    return ok({ accessToken: `mock.${userId}.${Date.now()}`, refreshToken: newRefresh, expiresIn: 86400 })
  }),

  http.post('*/auth/logout', async ({ request }) => {
    const { refreshToken } = (await request.json()) as { refreshToken?: string }
    if (refreshToken) db.sessions.delete(refreshToken)
    return new HttpResponse(null, { status: 204 })
  }),

  // 3. Entitas (multi-tenant) — daftar untuk entity switcher di sidebar
  http.get('*/entities', ({ request }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    return ok(db.entities)
  }),

  // 9. Periode fiskal — daftar (termasuk tertutup) untuk UI Pengaturan
  http.get('*/periods', ({ request }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    return ok({ periods: db.periods })
  }),

  // 10. Dashboard — kartu saldo dihitung dari akun & jurnal ENTITAS AKTIF
  //     (mirror mock-api /dashboard/summary). Tanpa ini, kartu di UI tidak
  //     berubah saat ganti entitas (fallback offline memakai data lokal).
  http.get('*/dashboard/summary', ({ request }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    const entityId = currentEntityId(request, user)
    const map = computeBalances(entityId)
    const accounts = entityAccounts(entityId)
    const sum = (type: string) => accounts.filter((a) => a.type === type).reduce((s, a) => s + (map.get(a.id) ?? 0), 0)
    const revenue = accounts.filter((a) => a.type === 'revenue').reduce((s, a) => s + (map.get(a.id) ?? 0), 0)
    const expenses = accounts.filter((a) => a.type === 'expense').reduce((s, a) => s + (map.get(a.id) ?? 0), 0)
    return ok({
      cards: [
        { key: 'totalAssets', label: 'Total Aset', value: sum('asset'), deltaPercent: 12.5, deltaDirection: 'up', compareLabel: 'dari bulan lalu' },
        { key: 'totalLiabilities', label: 'Total Utang', value: sum('liability'), deltaPercent: 3.2, deltaDirection: 'down', compareLabel: 'dari bulan lalu' },
        { key: 'totalEquity', label: 'Total Modal', value: sum('equity'), deltaPercent: 8.1, deltaDirection: 'up', compareLabel: 'dari bulan lalu' },
        { key: 'grossProfit', label: 'Laba Bruto', value: revenue - expenses, deltaPercent: 15.3, deltaDirection: 'up', compareLabel: 'dari bulan lalu' },
      ],
    })
  }),

  // 6. Laporan Laba Rugi — dihitung dari akun & jurnal ENTITAS AKTIF
  //     (mirror mock-api /reports/income-statement).
  http.get('*/reports/income-statement', ({ request }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    const entityId = currentEntityId(request, user)
    const url = new URL(request.url)
    const periodKey = url.searchParams.get('period') || '2026-03'
    const p = periodByKey(periodKey)
    if (!p) return fail(422, 'INVALID_PERIOD', 'Periode tidak valid')
    const map = computeBalances(entityId)
    const accounts = entityAccounts(entityId)
    const revenueAccounts = accounts.filter((a) => a.type === 'revenue')
    const expenseAccounts = accounts.filter((a) => a.type === 'expense')
    const revenueTotal = revenueAccounts.reduce((s, a) => s + (map.get(a.id) ?? 0), 0)
    const expenseTotal = expenseAccounts.reduce((s, a) => s + (map.get(a.id) ?? 0), 0)
    const mkSection = (title: string, list: DbAccount[]) => ({
      title,
      subtotal: list.reduce((s, a) => s + (map.get(a.id) ?? 0), 0),
      lines: list.map((a) => ({
        accountCode: a.code,
        accountName: a.name,
        amount: map.get(a.id) ?? 0,
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
    const entity = db.entities.find((e) => e.id === entityId)
    return ok({
      id: `RPT-${periodKey}-001`,
      type: 'income-statement',
      entity: { id: entityId, name: entity?.name ?? '' },
      period: { start: p.startDate, end: p.endDate },
      generatedAt: nowIso(),
      currency: 'IDR',
      sections,
      netIncome: revenueTotal - expenseTotal,
    })
  }),

  // 4. Chart of Accounts — HANYA akun entitas aktif (X-Entity-Id)
  http.get('*/accounts', ({ request }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    const entityId = currentEntityId(request, user)
    return ok({ accounts: entityAccounts(entityId) })
  }),

  // 5. Jurnal — HANYA jurnal entitas aktif (X-Entity-Id)
  http.get('*/journals', ({ request }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    const journals = entityJournals(currentEntityId(request, user))
    let debit = 0
    let credit = 0
    for (const j of journals) {
      for (const ln of j.lines) {
        debit += ln.debit
        credit += ln.credit
      }
    }
    return ok({ journals, totals: { debit, credit, difference: debit - credit } })
  }),

  http.get('*/journals/next-number', ({ request }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    const entityId = currentEntityId(request, user)
    const url = new URL(request.url)
    const prefix = url.searchParams.get('prefix') || 'BKM'
    const period = url.searchParams.get('period') || '2026-03'
    // Nomor urut berseri PER ENTITAS (mirror mock-api validateJournal) — dua
    // entitas boleh punya BKM-2026-03-0001 tanpa bentrok.
    const existing = entityJournals(entityId)
      .filter((j) => j.transactionNumber.startsWith(`${prefix}-${period}-`))
      .map((j) => Number(j.transactionNumber.split('-').pop()))
    const next = existing.length ? Math.max(...existing) + 1 : 1
    return ok({ transactionNumber: `${prefix}-${period}-${String(next).padStart(4, '0')}` })
  }),

  http.post('*/journals', async ({ request }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    const entityId = currentEntityId(request, user)
    const body = (await request.json()) as {
      date?: string
      transactionNumber?: string
      description?: string
      submitForApproval?: boolean
      lines?: { accountId?: string; debit?: number; credit?: number; description?: string }[]
    }
    const err = validateLines(body.lines ?? [], entityId)
    if (err) return fail(422, err.code, err.message)
    // Periode tertutup → 422 PERIOD_CLOSED (BR-6, mock-api validateJournal)
    if (body.date) {
      const period = findPeriodByDate(body.date)
      if (period && !period.isOpen) return closedPeriodErr(period)
    }
    const accounts = entityAccounts(entityId)
    const seq = db.seqJournal++
    const id = `JNL-${(body.date ?? '').slice(0, 7)}-${pad3(seq)}`
    const journal: JournalRecord = {
      id,
      transactionNumber: body.transactionNumber || `JV-${(body.date ?? '').slice(0, 7)}-${pad(seq)}`,
      date: body.date ?? '',
      description: body.description?.trim() || 'Tanpa keterangan',
      lines: (body.lines ?? []).map((ln, i) => {
        const account = accounts.find((a) => a.id === ln.accountId)!
        return {
          id: `line-${seq}-${i + 1}`,
          accountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          debit: Number(ln.debit ?? 0),
          credit: Number(ln.credit ?? 0),
          description: ln.description,
        }
      }),
      status: body.submitForApproval ? 'pending-approval' : 'draft',
      createdBy: user.id,
      createdAt: nowIso(),
    }
    db.journals.unshift({ ...journal, entityId })
    return ok(journal, 201)
  }),

  http.delete('*/journals/:id', ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    const journals = entityJournals(currentEntityId(request, user))
    const idx = journals.findIndex((j) => j.id === params.id)
    if (idx === -1) return fail(404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
    if (journals[idx].status !== 'draft')
      return fail(409, 'JOURNAL_ALREADY_POSTED', 'Hanya jurnal draft yang dapat dihapus')
    db.journals.splice(db.journals.indexOf(journals[idx]), 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('*/journals/:id/post', ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    if (!hasPermission(user, 'journal.write')) return fail(403, 'FORBIDDEN', 'Tidak memiliki akses')
    const entityId = currentEntityId(request, user)
    const journal = entityJournals(entityId).find((j) => j.id === params.id)
    if (!journal) return fail(404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
    if (journal.status === 'posted') return fail(409, 'ALREADY_POSTED', 'Jurnal sudah diposting')
    if (journal.status === 'reversed') return fail(409, 'ALREADY_REVERSED', 'Jurnal sudah dibatalkan')
    // Periode tertutup → 422 PERIOD_CLOSED (mock-api: validateJournal saat post)
    const period = findPeriodByDate(journal.date)
    if (period && !period.isOpen) return closedPeriodErr(period)
    journal.status = 'posted'
    journal.postedAt = nowIso()
    const balances = computeBalances(entityId)
    const affectedAccounts = [...new Set(journal.lines.map((ln) => ln.accountId))].map((accountId) => ({
      accountId,
      newBalance: balances.get(accountId) ?? 0,
    }))
    return ok({ id: journal.id, status: 'posted', postedAt: journal.postedAt, affectedAccounts })
  }),

  http.post('*/journals/:id/reverse', ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    if (!hasPermission(user, 'journal.write')) return fail(403, 'FORBIDDEN', 'Tidak memiliki akses')
    const entityId = currentEntityId(request, user)
    const journal = entityJournals(entityId).find((j) => j.id === params.id)
    if (!journal) return fail(404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
    if (journal.status === 'reversed') return fail(409, 'ALREADY_REVERSED', 'Jurnal sudah dibatalkan')
    if (journal.status !== 'posted') return fail(409, 'INVALID_STATUS_TRANSITION', 'Hanya jurnal posted yang dapat dibalik')
    // Periode tertutup → 422 PERIOD_CLOSED (mock-api: reverse)
    const period = findPeriodByDate(journal.date)
    if (period && !period.isOpen) return closedPeriodErr(period)
    const seq = db.seqJournal++
    const reversal: JournalRecord = {
      id: `JNL-${journal.date.slice(0, 7)}-${pad3(seq)}`,
      transactionNumber: `REV-${journal.transactionNumber}`,
      date: journal.date,
      description: `Pembalikan: ${journal.description}`,
      lines: journal.lines.map((ln) => ({ ...ln, id: `r-${ln.id}`, debit: ln.credit, credit: ln.debit })),
      status: 'posted',
      createdBy: user.id,
      createdAt: nowIso(),
      postedAt: nowIso(),
      reversalOf: journal.id,
    }
    journal.status = 'reversed'
    journal.reversalOf = reversal.transactionNumber
    db.journals.unshift({ ...reversal, entityId })
    return ok({ reversedJournalId: journal.id, status: 'reversed', reversalJournal: reversal })
  }),

  // Approval workflow (P1) — mirror mock-api/server.js (submit/approve/reject)
  http.post('*/journals/:id/submit', async ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    if (!hasPermission(user, 'journal.write')) return fail(403, 'FORBIDDEN', 'Tidak memiliki akses')
    const journal = entityJournals(currentEntityId(request, user)).find((j) => j.id === params.id)
    if (!journal) return fail(404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
    if (journal.status !== 'draft') return fail(409, 'INVALID_STATUS_TRANSITION', 'Hanya jurnal draft yang dapat disubmit')
    journal.status = 'pending-approval'
    return ok({ id: journal.id, status: 'pending-approval' })
  }),

  http.post('*/journals/:id/approve', async ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    // Mirror mock API: kegagalan izin approve → NO_APPROVAL_RIGHTS (API §13),
    // bukan FORBIDDEN generik — klien tampilkan pesan khusus "role tidak punya izin".
    if (!hasPermission(user, 'journal.approve')) return fail(403, 'NO_APPROVAL_RIGHTS', 'Role Anda tidak memiliki izin approve')
    const journal = entityJournals(currentEntityId(request, user)).find((j) => j.id === params.id)
    if (!journal) return fail(404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
    if (journal.status !== 'pending-approval')
      return fail(409, 'INVALID_STATUS_TRANSITION', 'Hanya jurnal pending-approval yang dapat di-approve')
    journal.status = 'posted'
    journal.postedAt = nowIso()
    return ok({ status: 'posted', approvedBy: user.id, approvedAt: journal.postedAt })
  }),

  http.post('*/journals/:id/reject', async ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    // Mirror mock API: kegagalan izin approve → NO_APPROVAL_RIGHTS (API §13)
    if (!hasPermission(user, 'journal.approve')) return fail(403, 'NO_APPROVAL_RIGHTS', 'Role Anda tidak memiliki izin approve')
    const journal = entityJournals(currentEntityId(request, user)).find((j) => j.id === params.id)
    if (!journal) return fail(404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
    if (journal.status !== 'pending-approval')
      return fail(409, 'INVALID_STATUS_TRANSITION', 'Hanya jurnal pending-approval yang dapat di-reject')
    const { reason } = (await request.json()) as { reason?: string }
    const trimmed = reason?.trim?.()
    if (!trimmed) return fail(422, 'REASON_REQUIRED', 'Alasan penolakan wajib diisi')
    journal.status = 'draft'
    journal.rejectionReason = trimmed
    return ok({ id: journal.id, status: 'draft', rejectionReason: journal.rejectionReason })
  }),

  // 9. Periode fiskal — buka/tutup periode (test double mock-api PATCH /periods/:id/close;
  // penanganan draft DRAFT_ACTION_REQUIRED disederhanakan di sini).
  http.patch('*/periods/:id/close', ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    const period = db.periods.find((p) => p.id === params.id)
    if (!period) return fail(404, 'PERIOD_NOT_FOUND', 'Periode tidak ditemukan')
    if (!period.isOpen) return fail(409, 'PERIOD_ALREADY_CLOSED', 'Periode sudah ditutup')
    period.isOpen = false
    return ok({ id: period.id, isOpen: false })
  }),

  http.patch('*/periods/:id/open', ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    const period = db.periods.find((p) => p.id === params.id)
    if (!period) return fail(404, 'PERIOD_NOT_FOUND', 'Periode tidak ditemukan')
    period.isOpen = true // idempotent — membuka periode yang sudah terbuka tidak error
    return ok({ id: period.id, isOpen: true })
  }),

  // ---- Pengaturan Database PostgreSQL ----
  http.get('*/settings/db-config', ({ request }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    return ok({ storageMode: 'local', host: 'localhost', port: '5432', database: 'accounting_db', schema: 'public', username: 'postgres', password: '', tables: { accounts: 'accounts', journals: 'journals', journalLines: 'journal_lines', periods: 'periods', users: 'users', entities: 'entities', sessions: 'sessions', attachments: 'attachments' } })
  }),
  http.post('*/settings/db-config', async ({ request }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    const body = (await request.json()) as { storageMode?: string; host?: string; port?: string; database?: string; schema?: string; username?: string; password?: string; tables?: Record<string, string> }
    if (!body.host || !body.port || !body.database)
      return fail(422, 'VALIDATION_ERROR', 'Host, port, dan nama basis data wajib diisi')
    const defaultTables = { accounts: 'accounts', journals: 'journals', journalLines: 'journal_lines', periods: 'periods', users: 'users', entities: 'entities', sessions: 'sessions', attachments: 'attachments' }
    return ok({ storageMode: body.storageMode ?? 'local', host: body.host.trim(), port: body.port.trim(), database: body.database.trim(), schema: (body.schema ?? 'public').trim() || 'public', username: (body.username ?? 'postgres').trim() || 'postgres', password: body.password ?? '', tables: { ...defaultTables, ...(body.tables ?? {}) } })
  }),
]
