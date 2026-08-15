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
  isActive: boolean
}

// Server mengizinkan status 'pending-approval' (tidak ada di tipe lokal)
type JournalRecord = Omit<JournalEntry, 'status'> & { status: JournalEntry['status'] | 'pending-approval' }

interface Db {
  users: DbUser[]
  accounts: Account[]
  journals: JournalRecord[]
  seqJournal: number
  sessions: Map<string, string> // refreshToken → userId
}

const createDb = (): Db => ({
  users: [
    { id: 'user-001', name: 'Rina', email: 'rina@bukuwarung.com', password: 'password123', role: 'admin', isActive: true },
    { id: 'user-002', name: 'Dimas', email: 'dimas@estetikakreasi.co.id', password: 'password123', role: 'accountant', isActive: true },
  ],
  accounts: structuredClone(mockAccounts),
  journals: structuredClone(mockJournals),
  seqJournal: mockJournals.length + 1,
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

// ---- saldo akun: base + efek jurnal posted (bukan reversal) ----
const computeBalances = (): Map<string, number> => {
  const map = new Map(db.accounts.map((a) => [a.id, a.baseBalance]))
  for (const j of db.journals) {
    if (!isEffectJournal(j as JournalEntry)) continue // aman: pending-approval ≠ posted
    for (const ln of j.lines) {
      const account = db.accounts.find((a) => a.id === ln.accountId)
      if (!account) continue
      const delta = account.normalBalance === 'debit' ? ln.debit - ln.credit : ln.credit - ln.debit
      map.set(account.id, (map.get(account.id) ?? 0) + delta)
    }
  }
  return map
}

// ---- validasi jurnal (mock-api/server.js: validateJournal, BR-4) ----
const validateLines = (lines: { accountId?: string; debit?: number; credit?: number }[]) => {
  if (!Array.isArray(lines) || lines.length === 0)
    return { code: 'JOURNAL_NO_LINES', message: 'Jurnal harus memiliki minimal 1 debit dan 1 kredit' }
  let debit = 0
  let credit = 0
  for (const ln of lines) {
    if (!ln.accountId) return { code: 'LINE_NO_ACCOUNT', message: 'Akun wajib dipilih' }
    const account = db.accounts.find((a) => a.id === ln.accountId)
    if (!account || account.isActive === false)
      return { code: 'LINE_NO_ACCOUNT', message: 'Akun tidak aktif atau sudah dihapus' }
    debit += Number(ln.debit ?? 0)
    credit += Number(ln.credit ?? 0)
  }
  if (debit !== credit || debit <= 0)
    return { code: 'JOURNAL_UNBALANCED', message: `Total debit dan kredit harus sama. Debit ${debit}, Kredit ${credit}` }
  return null
}

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

  // 4. Chart of Accounts
  http.get('*/accounts', ({ request }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    return ok({ accounts: db.accounts })
  }),

  // 5. Jurnal
  http.get('*/journals', ({ request }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    let debit = 0
    let credit = 0
    for (const j of db.journals) {
      for (const ln of j.lines) {
        debit += ln.debit
        credit += ln.credit
      }
    }
    return ok({ journals: db.journals, totals: { debit, credit, difference: debit - credit } })
  }),

  http.post('*/journals', async ({ request }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    const body = (await request.json()) as {
      date?: string
      transactionNumber?: string
      description?: string
      submitForApproval?: boolean
      lines?: { accountId?: string; debit?: number; credit?: number; description?: string }[]
    }
    const err = validateLines(body.lines ?? [])
    if (err) return fail(422, err.code, err.message)
    const seq = db.seqJournal++
    const id = `JNL-${(body.date ?? '').slice(0, 7)}-${pad3(seq)}`
    const journal: JournalRecord = {
      id,
      transactionNumber: body.transactionNumber || `JV-${(body.date ?? '').slice(0, 7)}-${pad(seq)}`,
      date: body.date ?? '',
      description: body.description?.trim() || 'Tanpa keterangan',
      lines: (body.lines ?? []).map((ln, i) => {
        const account = db.accounts.find((a) => a.id === ln.accountId)!
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
    db.journals.unshift(journal)
    return ok(journal, 201)
  }),

  http.delete('*/journals/:id', ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    const idx = db.journals.findIndex((j) => j.id === params.id)
    if (idx === -1) return fail(404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
    if (db.journals[idx].status !== 'draft')
      return fail(409, 'JOURNAL_ALREADY_POSTED', 'Hanya jurnal draft yang dapat dihapus')
    db.journals.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('*/journals/:id/post', ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    const journal = db.journals.find((j) => j.id === params.id)
    if (!journal) return fail(404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
    if (journal.status === 'posted') return fail(409, 'ALREADY_POSTED', 'Jurnal sudah diposting')
    if (journal.status === 'reversed') return fail(409, 'ALREADY_REVERSED', 'Jurnal sudah dibatalkan')
    journal.status = 'posted'
    journal.postedAt = nowIso()
    const balances = computeBalances()
    const affectedAccounts = [...new Set(journal.lines.map((ln) => ln.accountId))].map((accountId) => ({
      accountId,
      newBalance: balances.get(accountId) ?? 0,
    }))
    return ok({ id: journal.id, status: 'posted', postedAt: journal.postedAt, affectedAccounts })
  }),

  http.post('*/journals/:id/reverse', ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.')
    const journal = db.journals.find((j) => j.id === params.id)
    if (!journal) return fail(404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan')
    if (journal.status === 'reversed') return fail(409, 'ALREADY_REVERSED', 'Jurnal sudah dibatalkan')
    if (journal.status !== 'posted') return fail(409, 'INVALID_STATUS_TRANSITION', 'Hanya jurnal posted yang dapat dibalik')
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
    db.journals.unshift(reversal)
    return ok({ reversedJournalId: journal.id, status: 'reversed', reversalJournal: reversal })
  }),
]
