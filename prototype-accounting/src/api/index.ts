// Endpoint typed — implementasi `API - Accounting.md` (mock server localhost:4000).
import { request, setAuth } from './client'
import type { Account, BalanceCardData, JournalEntry, JournalStatus, TrendPoint } from '../types'

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
}

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
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

export const api = {
  // 2. Auth
  login(credentials: { email: string; password: string }) {
    return request<{ accessToken: string; refreshToken: string; expiresIn: number; user: AuthUser; activePeriod?: { id: string; name: string; isOpen: boolean } | null }>('/auth/login', {
      method: 'POST',
      body: credentials,
      auth: false,
    }).then((data) => {
      setAuth(data.accessToken)
      return data
    })
  },

  // 4. Chart of Accounts
  getAccounts() {
    return request<{ accounts: Account[] }>('/accounts', { query: { pageSize: 200 } })
  },

  // 5. Jurnal
  getJournals() {
    return request<{ journals: ApiJournal[]; totals: { debit: number; credit: number; difference: number } }>('/journals', { query: { pageSize: 200 } })
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
  deleteJournal(id: string) {
    return request<void>(`/journals/${id}`, { method: 'DELETE' })
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
  getLedger(accountId: string, period: string) {
    return request<LedgerAccount>(`/ledger/accounts/${accountId}`, { query: { period } })
  },
  getIncomeStatement(period: string) {
    return request<IncomeStatement>('/reports/income-statement', { query: { period } })
  },
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
  status: j.status === 'pending-approval' ? 'draft' : j.status,
  createdBy: j.createdBy,
  createdAt: j.createdAt,
  postedAt: j.postedAt,
  reversalOf: j.reversalOf,
})
