// Logika murni Buku Besar & Laba Rugi (tanpa UI/API) — diuji dengan Vitest.
// Diekstrak dari LedgerPage & IncomeStatementPage agar bisa di-unit-test.
import type { Account, JournalEntry } from '../types'

// Jurnal yang memengaruhi saldo: posted DAN bukan jurnal pembalik.
// Jurnal asli yang di-reverse berstatus 'reversed' (tidak dihitung),
// jurnal pembalik punya reversalOf (tidak dihitung) → pasangan bernet 0.
export const isEffectJournal = (j: JournalEntry) => j.status === 'posted' && !j.reversalOf

export interface LedgerRow {
  reference: string
  date: string
  description: string
  debit: number
  credit: number
  balance: number
}

export interface LedgerView {
  opening: number
  rows: LedgerRow[]
  closing: number
}

export interface LedgerPeriod {
  start: string // YYYY-MM-DD (inclusive)
  end: string // YYYY-MM-DD (inclusive)
}

const lineOf = (j: JournalEntry, accountId: string) => j.lines.find((ln) => ln.accountId === accountId)

// Saldo berjalan per akun dalam satu periode (BR-6/BR-7):
// - saldo awal = baseBalance + efek jurnal posted SEBELUM periode
// - baris = jurnal posted DALAM periode, urut tanggal (lalu nomor bukti)
// - tiap baris memakai running balance; saldo akhir = saldo baris terakhir
export const computeLedger = (
  accounts: Account[],
  journals: JournalEntry[],
  accountId: string,
  period: LedgerPeriod,
): LedgerView => {
  const account = accounts.find((a) => a.id === accountId)
  if (!account) return { opening: 0, rows: [], closing: 0 }

  const delta = (ln: NonNullable<ReturnType<typeof lineOf>>) =>
    account.normalBalance === 'debit' ? ln.debit - ln.credit : ln.credit - ln.debit

  const relevant = journals.filter((j) => isEffectJournal(j) && lineOf(j, account.id))

  let opening = account.baseBalance
  for (const j of relevant) {
    if (j.date < period.start) opening += delta(lineOf(j, account.id)!)
  }

  const within = relevant
    .filter((j) => j.date >= period.start && j.date <= period.end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.transactionNumber.localeCompare(b.transactionNumber))

  let running = opening
  const rows: LedgerRow[] = within.map((j) => {
    const ln = lineOf(j, account.id)!
    running += delta(ln)
    return {
      reference: j.transactionNumber,
      date: j.date,
      description: ln.description || j.description,
      debit: ln.debit,
      credit: ln.credit,
      balance: running,
    }
  })
  return { opening, rows, closing: running }
}

export interface ReportLine {
  accountId: string
  code: string
  name: string
  amount: number
}

export interface IncomeStatementView {
  revenueLines: ReportLine[]
  expenseLines: ReportLine[]
  revenueTotal: number
  expenseTotal: number
  netIncome: number
}

// Laba Rugi s/d periodEnd (inclusive): saldo tiap akun pendapatan/beban dari
// baseBalance + efek jurnal posted yang tanggalnya tidak melewati akhir periode.
// Laba bersih = total pendapatan − total beban.
export const computeIncomeStatement = (
  accounts: Account[],
  journals: JournalEntry[],
  periodEnd: string,
): IncomeStatementView => {
  const closing = new Map<string, number>()
  for (const a of accounts) closing.set(a.id, a.baseBalance)
  for (const j of journals) {
    if (!isEffectJournal(j) || j.date > periodEnd) continue
    for (const ln of j.lines) {
      const account = accounts.find((a) => a.id === ln.accountId)
      if (!account) continue
      const d = account.normalBalance === 'debit' ? ln.debit - ln.credit : ln.credit - ln.debit
      closing.set(account.id, (closing.get(account.id) ?? 0) + d)
    }
  }
  const toLines = (type: Account['type']): ReportLine[] =>
    accounts
      .filter((a) => a.type === type)
      .map((a) => ({ accountId: a.id, code: a.code, name: a.name, amount: closing.get(a.id) ?? 0 }))
      .filter((l) => l.amount !== 0)
  const revenueLines = toLines('revenue')
  const expenseLines = toLines('expense')
  const revenueTotal = revenueLines.reduce((s, l) => s + l.amount, 0)
  const expenseTotal = expenseLines.reduce((s, l) => s + l.amount, 0)
  return { revenueLines, expenseLines, revenueTotal, expenseTotal, netIncome: revenueTotal - expenseTotal }
}
