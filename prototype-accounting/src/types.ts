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
  | 'akun'
  | 'glossary'
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
  // Alasan penolakan saat Reject (workflow approval) — tampil di detail jurnal.
  rejectionReason?: string
  // Asal jurnal — field baru sejak format persist v2. Migrasi v1→v2
  // menambahkan nilai default 'manual' ke jurnal lama (lihat persist.ts).
  source?: 'manual' | 'import'
}

export interface NewJournalInput {
  date: string
  transactionNumber: string
  description: string
  lines: { accountId: string; debit: number; credit: number; description?: string }[]
}

// Operasi jurnal offline yang belum tersinkron ke server (antrian).
// Disimpan di localStorage (persist) agar tidak hilang saat reload, dan
// di-flush ke API otomatis begitu koneksi pulih.
//   create  → POST /journals (submitForApproval bila action='submit';
//              + POST /post bila action='post')
//   post/reverse/delete/submit/approve/reject → transisi status pada jurnal
// `ref` merujuk id jurnal (localId saat masih lokal, atau id server).
export type OfflineJournalOp =
  | { id: string; kind: 'create'; localId: string; input: NewJournalInput; action: 'draft' | 'submit' | 'post' }
  | { id: string; kind: 'post' | 'submit' | 'approve' | 'reverse' | 'delete'; ref: string }
  | { id: string; kind: 'reject'; ref: string; reason?: string }

// Input operasi tanpa id (untuk enqueue). Jangan pakai Omit langsung pada
// union: Omit<Union, 'id'> collapse ke {} karena member hanya berbagi key 'id'.
export type OfflineOpInput =
  | Omit<Extract<OfflineJournalOp, { kind: 'create' }>, 'id'>
  | Omit<Extract<OfflineJournalOp, { kind: 'post' | 'submit' | 'approve' | 'reverse' | 'delete' }>, 'id'>
  | Omit<Extract<OfflineJournalOp, { kind: 'reject' }>, 'id'>

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

// Konfigurasi koneksi database PostgreSQL (Pengaturan).
// Disimpan di localStorage (persist) — bukan di server.
// storageMode: 'postgresql' = data tersimpan di database PostgreSQL,
//              'local' = data tersimpan lokal di perangkat ini (localStorage).
export interface DbTables {
  accounts: string
  journals: string
  journalLines: string
  periods: string
  users: string
  entities: string
  sessions: string
  attachments: string
}

export const DEFAULT_DB_TABLES: DbTables = {
  accounts: 'accounts',
  journals: 'journals',
  journalLines: 'journal_lines',
  periods: 'periods',
  users: 'users',
  entities: 'entities',
  sessions: 'sessions',
  attachments: 'attachments',
}

// Konfigurasi koneksi database PostgreSQL (Pengaturan).
// Disimpan di localStorage (persist) — bukan di server.
// storageMode: 'postgresql' = data tersimpan di database PostgreSQL,
//              'local' = data tersimpan lokal di perangkat ini (localStorage).
export interface DbConfig {
  storageMode: 'postgresql' | 'local'
  host: string
  port: string
  database: string
  schema: string
  username: string
  password: string
  tables: DbTables
}
