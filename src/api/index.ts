// Endpoint typed — implementasi `API - Accounting.md` (mock server localhost:4000).
import { download, request, setAuth } from './client'
import type { Account, BalanceCardData, DbConfig, JournalEntry, JournalStatus, TrendPoint } from '../types'

export { ApiError, isNetworkError } from './client'
export type { ApiError as ApiErrorType } from './client'

// ---------- Tipe respons server ----------
export interface ApiJournalLine {
  id?: string
  accountId: string
  accountCode: string
  accountName: string
  debit: number
  credit: number
  description?: string
}

export interface ApiJournal {
  id: string
  transactionNumber: string
  date: string
  description: string
  lines: ApiJournalLine[]
  status: JournalStatus | 'pending-approval'
  createdBy: string
  createdAt: string
  postedAt?: string
  reversalOf?: string
  rejectionReason?: string
  source?: 'manual' | 'import'
}

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
}

export interface Entity {
  id: string
  name: string
  code: string
  isActive: boolean
}

export interface DashboardAlert {
  severity: 'warning' | 'info' | 'danger'
  type: string
  message: string
  count?: number
}

export interface LedgerAccount {
  accountId: string
  accountCode: string
  accountName: string
  period: string
  openingBalance: number
  closingBalance: number
  entries: {
    journalEntryId: string
    date: string
    reference: string
    description: string
    debit: number
    credit: number
    balance: number
  }[]
}

export interface IncomeStatement {
  sections: {
    title: string
    subtotal: number
    lines: { accountCode: string; accountName: string; amount: number; indentLevel: number; isBold: boolean; isTotal: boolean }[]
  }[]
  netIncome: number
  entity: { id: string; name: string }
  period: { start: string; end: string }
}

export interface TrialBalance {
  lines: { accountId?: string; accountCode: string; accountName: string; debit: number; credit: number }[]
  totals: { debit: number; credit: number; isBalanced: boolean }
  period: { start: string; end: string }
}

export interface BalanceSheet {
  asOf: string
  entity: { id: string; name: string }
  sections: {
    title: string
    subtotal: number
    lines: { accountCode: string; accountName: string; amount: number; indentLevel: number; isBold: boolean; isTotal: boolean }[]
  }[]
  totalAssets: number
  totalLiabilitiesEquity: number
  isBalanced: boolean
}

export interface CashFlow {
  id: string
  type: 'cash-flow'
  period: { start: string; end: string }
  sections: {
    title: string
    subtotal: number
    lines: { accountCode: string; accountName: string; amount: number; indentLevel: number; isBold: boolean; isTotal: boolean }[]
  }[]
  netCashFlow: number
  beginningCash: number
  endingCash: number
}

export const api = {
  // 0. Health (tanpa auth) — dipakai polling koneksi (cek server hidup tiap 10 detik)
  health() {
    return request<{ status: string; time: string; journals: number; accounts: number }>('/health', { auth: false })
  },

  // 2. Auth
  login(credentials: { email: string; password: string }) {
    return request<{ accessToken: string; refreshToken: string; expiresIn: number; user: AuthUser; activePeriod?: { id: string; name: string; isOpen: boolean } | null }>('/auth/login', {
      method: 'POST',
      body: credentials,
      auth: false,
    }).then((data) => {
      // Klien menyimpan access + refresh token (refresh otomatis saat 401)
      setAuth(data.accessToken, undefined, data.refreshToken)
      return data
    })
  },
  logout(refreshToken: string) {
    return request<void>('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false })
  },
  forgotPassword(email: string) {
    // Tanpa auth. Mock API mengembalikan hint akun (mode demo) + arahan admin.
    return request<{
      email: string
      name: string
      role: string
      expiresIn: number
      message: string
      hint: string
      note: string
    }>('/auth/forgot-password', { method: 'POST', body: { email }, auth: false })
  },

  // 3. Entitas (multi-tenant) — daftar entitas untuk entity switcher di sidebar
  getEntities() {
    return request<Entity[]>('/entities')
  },

  // ---- Pengaturan Database PostgreSQL ----
  getDbConfig() {
    return request<DbConfig>('/settings/db-config')
  },
  saveDbConfig(config: DbConfig) {
    return request<DbConfig>('/settings/db-config', { method: 'POST', body: config })
  },

  // 4. Chart of Accounts
  getAccounts() {
    return request<{ accounts: Account[] }>('/accounts', { query: { pageSize: 200 } })
  },
  createAccount(input: {
    code: string
    name: string
    type: Account['type']
    group?: string
    category?: string
    normalBalance?: 'debit' | 'credit'
    parentId?: string | null
    description?: string
  }) {
    return request<Account & { balance: number }>('/accounts', { method: 'POST', body: input })
  },
  updateAccount(id: string, input: Partial<Pick<Account, 'code' | 'name' | 'type' | 'category' | 'description' | 'normalBalance' | 'group'>> & { parentId?: string | null }) {
    return request<Account & { balance: number }>(`/accounts/${id}`, { method: 'PUT', body: input })
  },
  deleteAccount(id: string) {
    return request<void>(`/accounts/${id}`, { method: 'DELETE' })
  },
  activateAccount(id: string) {
    return request<{ id: string; isActive: boolean }>(`/accounts/${id}/activate`, { method: 'PATCH' })
  },
  exportAccounts() {
    return request<string>('/accounts/export')
  },
  importAccounts(csv: string) {
    return request<{ imported: number; failed: number; errors: { row: number; code: string; message: string }[] }>('/accounts/import', { method: 'POST', body: { csv } })
  },

  // 5. Jurnal
  getJournals() {
    return request<{ journals: ApiJournal[]; totals: { debit: number; credit: number; difference: number } }>('/journals', { query: { pageSize: 200 } })
  },
  getNextNumber(prefix: string, period: string) {
    return request<{ transactionNumber: string }>('/journals/next-number', { query: { prefix, period } })
  },
  createJournal(input: {
    date: string
    transactionNumber?: string
    description: string
    submitForApproval?: boolean
    lines: { accountId: string; debit: number; credit: number; description?: string }[]
  }) {
    return request<ApiJournal>('/journals', { method: 'POST', body: input })
  },
  postJournal(id: string) {
    return request<{ id: string; status: 'posted'; postedAt: string; affectedAccounts: { accountId: string; newBalance: number }[] }>(`/journals/${id}/post`, { method: 'POST' })
  },
  reverseJournal(id: string) {
    return request<{ reversedJournalId: string; status: 'reversed'; reversalJournal: ApiJournal }>(`/journals/${id}/reverse`, { method: 'POST' })
  },
  submitJournal(id: string) {
    return request<{ id: string; status: 'pending-approval' }>(`/journals/${id}/submit`, { method: 'POST' })
  },
  approveJournal(id: string) {
    return request<{ status: 'posted'; approvedBy: string; approvedAt: string }>(`/journals/${id}/approve`, { method: 'POST' })
  },
  rejectJournal(id: string, reason?: string) {
    return request<{ id: string; status: 'draft'; rejectionReason: string }>(`/journals/${id}/reject`, {
      method: 'POST',
      body: reason ? { reason } : undefined,
    })
  },
  deleteJournal(id: string) {
    return request<void>(`/journals/${id}`, { method: 'DELETE' })
  },

  // 9. Periode fiskal
  //     Daftar lengkap (termasuk tertutup) untuk UI kelola periode di Pengaturan.
  getPeriods() {
    return request<{ periods: PeriodInfo[] }>('/periods', { query: { includeClosed: true } })
  },
  //     Tutup periode. Saat masih ada jurnal draft, server minta
  //     confirmDraftAction ('post-all' | 'delete-all' | 'keep') — tanpa itu →
  //     422 DRAFT_ACTION_REQUIRED (UI menampilkan dialog pilihan aksi).
  closePeriod(id: string, confirmDraftAction?: 'post-all' | 'delete-all' | 'keep') {
    return request<{ id: string; isOpen: false; handledDrafts: { posted: number; deleted: number; kept: number } }>(
      `/periods/${id}/close`,
      { method: 'PATCH', body: confirmDraftAction ? { confirmDraftAction } : undefined },
    )
  },
  openPeriod(id: string) {
    return request<{ id: string; isOpen: true }>(`/periods/${id}/open`, { method: 'PATCH' })
  },

  // 10. Dashboard
  getDashboardSummary() {
    return request<{ cards: BalanceCardData[] }>('/dashboard/summary')
  },
  getDashboardTrend() {
    return request<{ trend: TrendPoint[] }>('/dashboard/trend')
  },
  getDashboardRecent() {
    return request<{ journals: ApiJournal[] }>('/dashboard/recent-journals')
  },
  getDashboardAlerts() {
    return request<{ alerts: DashboardAlert[] }>('/dashboard/alerts')
  },

  // 6–7. Buku Besar & Laporan
  //     Rentang custom (start/end, YYYY-MM-DD) override periode bulanan —
  //     konsisten dengan export (GET /exports/ledger/:accountId).
  getLedger(accountId: string, period: string, range?: { start: string; end: string }) {
    return request<LedgerAccount>(`/ledger/accounts/${accountId}`, {
      query: range ? { start: range.start, end: range.end } : { period },
    })
  },
  getIncomeStatement(period: string) {
    return request<IncomeStatement>('/reports/income-statement', { query: { period } })
  },
  getTrialBalance(period: string) {
    return request<TrialBalance>('/reports/trial-balance', { query: { period } })
  },
  getBalanceSheet(asOf: string) {
    return request<BalanceSheet>('/reports/balance-sheet', { query: { asOf } })
  },
  getCashFlow(period: string) {
    return request<CashFlow>('/reports/cash-flow', { query: { period } })
  },

  // 11. Export laporan (PDF/XLSX) — unduhan file via navigasi browser.
  //     Nama file dihitung di sini (konsisten dengan penamaan server) untuk toast.
  exportReport(reportType: 'trial-balance' | 'income-statement' | 'balance-sheet' | 'cash-flow', format: 'pdf' | 'xlsx', period: string) {
    const names = { 'trial-balance': 'Neraca-Lajur', 'income-statement': 'Laba-Rugi', 'balance-sheet': 'Neraca', 'cash-flow': 'Arus-Kas' }
    const filename = `${names[reportType]}-${period}.${format}`
    return download(`/exports/reports/${reportType}`, { format, period }).then(() => filename)
  },
  // Export Buku Besar per akun (PDF/XLSX) — GET /exports/ledger/:accountId.
  // Nama file memakai kode akun, konsisten dengan penamaan server.
  // Rentang: default pakai `period` (YYYY-MM); bila `range` diberikan, gunakan
  // start/end custom (YYYY-MM-DD) — nama file memakai rentang tersebut.
  exportLedger(accountId: string, accountCode: string, format: 'pdf' | 'xlsx', period: string, range?: { start: string; end: string }) {
    const label = range ? `${range.start}..${range.end}` : period
    const filename = `Buku-Besar-${accountCode}-${label}.${format}`
    return download(`/exports/ledger/${accountId}`, range ? { format, ...range } : { format, period }).then(() => filename)
  },

  // 12. Pencarian global — GET /search (jurnal, akun, laporan, halaman).
  //     Dipakai input search di TopBar; hasil diklik → navigasi + fokus
  //     (detail jurnal, akun di Buku Besar, atau langsung ke halaman laporan).
  search(q: string) {
    return request<{ results: SearchResult[] }>('/search', { query: { q, types: 'journal,account,report,page' } })
  },

  // Admin (dev-only, tanpa auth) — reset state server ke seed awal (Maret 2026).
  // Dipakai tombol "Reset ke data demo" agar satu klik mereset lokal + server.
  resetServerData() {
    return request<{ status: string; seed: string; journals: number; message: string }>('/admin/reset', {
      method: 'POST',
      body: {},
    })
  },
}

// Periode fiskal (GET /periods?includeClosed=true) — status & data rentang.
export interface PeriodInfo {
  id: string
  name: string
  month: number
  year: number
  startDate: string
  endDate: string
  isOpen: boolean
  isActive: boolean
  closedAt: string | null
}

// Hasil pencarian global (GET /search) — jurnal, akun, laporan, atau halaman.
export interface SearchResult {
  type: 'journal' | 'account' | 'report' | 'page'
  id: string
  title: string
  subtitle: string
  metadata: { status?: string; balance?: number }
}

// Normalisasi jurnal server → tipe lokal (status pending-approval → draft di UI).
export const toJournalEntry = (j: ApiJournal): JournalEntry => ({
  id: j.id,
  transactionNumber: j.transactionNumber,
  date: j.date,
  description: j.description,
  lines: j.lines.map((l) => ({
    id: l.id ?? `${j.id}-${l.accountId}`,
    accountId: l.accountId,
    accountCode: l.accountCode,
    accountName: l.accountName,
    debit: Number(l.debit),
    credit: Number(l.credit),
    description: l.description,
  })),
  status: j.status,
  createdBy: j.createdBy,
  createdAt: j.createdAt,
  postedAt: j.postedAt,
  reversalOf: j.reversalOf,
  rejectionReason: j.rejectionReason,
  source: j.source,
})

// ---------- DB Status ----------
export interface DbStatusResponse {
  tables: Record<string, number>
  dbSize: string | null
  storageMode: string
  host: string
  database: string
  latencyMs: number
  uptimeSec: number
  memMB: number
  activeSessions: number
  recentJournals: Array<{ id: string; transactionNumber: string; description: string; status: string; createdAt: string }>
  pgVersion: string
}

export async function getDbStatus(): Promise<DbStatusResponse> {
  return request<DbStatusResponse>('/admin/db-status')
}

export interface SeedAllResponse {
  ok: boolean
  accounts: number
  journals: number
  periods: number
  users: number
  errors: Array<{ table: string; error: string; [key: string]: string }>
  error?: string
}

export async function seedAllToDb(): Promise<SeedAllResponse> {
  return request<SeedAllResponse>('/admin/seed-all', { method: 'POST' })
}
