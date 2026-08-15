export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'

export type JournalStatus = 'draft' | 'pending-approval' | 'posted' | 'reversed'

export type PageKey =
  | 'dashboard'
  | 'journal'
  | 'buku-besar'
  | 'neraca-lajur'
  | 'laba-rugi'
  | 'neraca'
  | 'arus-kas'
  | 'laporan-lain'
  | 'pengaturan'

export interface Account {
  id: string
  code: string
  name: string
  type: AccountType
  category: string
  normalBalance: 'debit' | 'credit'
  baseBalance: number
  isActive: boolean
}

export interface JournalLine {
  id: string
  accountId: string
  accountCode: string
  accountName: string
  debit: number
  credit: number
  description?: string
}

export interface JournalEntry {
  id: string
  transactionNumber: string
  date: string // ISO date (YYYY-MM-DD)
  description: string
  lines: JournalLine[]
  status: JournalStatus
  createdBy: string
  createdAt: string
  postedAt?: string
  reversalOf?: string
}

export interface NewJournalInput {
  date: string
  transactionNumber: string
  description: string
  lines: { accountId: string; debit: number; credit: number; description?: string }[]
}

export interface TrendPoint {
  period: string
  label: string
  revenue: number
  expenses: number
  netIncome: number
}

export interface BalanceCardData {
  key: string
  label: string
  value: number
  deltaPercent: number
  deltaDirection: 'up' | 'down' | 'flat'
  compareLabel: string
}
