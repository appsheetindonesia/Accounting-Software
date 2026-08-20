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

// Saldo YTD per akun s/d periodEnd (inclusive): baseBalance + efek jurnal
// posted yang tanggalnya tidak melewati akhir periode. Dipakai Buku Besar,
// Laba Rugi, Neraca, dan Neraca Lajur (identitas akuntansi sama).
const closingBalances = (accounts: Account[], journals: JournalEntry[], periodEnd: string) => {
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
  return closing
}

// Laba Rugi s/d periodEnd (inclusive): saldo tiap akun pendapatan/beban dari
// baseBalance + efek jurnal posted yang tanggalnya tidak melewati akhir periode.
// Laba bersih = total pendapatan − total beban.
export const computeIncomeStatement = (
  accounts: Account[],
  journals: JournalEntry[],
  periodEnd: string,
): IncomeStatementView => {
  const closing = closingBalances(accounts, journals, periodEnd)
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

// ------------------------------------------------------------
// Neraca (Balance Sheet) & Neraca Lajur (Trial Balance)
// ------------------------------------------------------------
export interface BalanceSheetLine {
  code: string
  name: string
  amount: number
  isBold?: boolean
}

export interface BalanceSheetView {
  sections: { title: string; lines: BalanceSheetLine[]; total: number }[]
  totalAssets: number
  totalLiabilitiesEquity: number
  balanced: boolean
  difference: number
  netIncome: number
}

// Neraca s/d periodEnd: Aset = Kewajiban + Modal + Laba berjalan (identitas
// akuntansi). Laba berjalan dihitung dari pendapatan − beban periode berjalan.
export const computeBalanceSheet = (
  accounts: Account[],
  journals: JournalEntry[],
  periodEnd: string,
): BalanceSheetView => {
  const closing = closingBalances(accounts, journals, periodEnd)
  const sumOf = (type: Account['type']) =>
    accounts.filter((a) => a.type === type).reduce((s, a) => s + (closing.get(a.id) ?? 0), 0)
  const totalAssets = sumOf('asset')
  const totalLiabilities = sumOf('liability')
  const totalEquity = sumOf('equity')
  const netIncome = sumOf('revenue') - sumOf('expense')
  const totalLiabilitiesEquity = totalLiabilities + totalEquity + netIncome
  const balanced = totalAssets === totalLiabilitiesEquity

  const assetLines: BalanceSheetLine[] = accounts
    .filter((a) => a.type === 'asset' && (closing.get(a.id) ?? 0) !== 0)
    .map((a) => ({ code: a.code, name: a.name, amount: closing.get(a.id) ?? 0 }))
  const liabEquityLines: BalanceSheetLine[] = accounts
    .filter((a) => (a.type === 'liability' || a.type === 'equity') && (closing.get(a.id) ?? 0) !== 0)
    .map((a) => ({ code: a.code, name: a.name, amount: closing.get(a.id) ?? 0 }))

  return {
    sections: [
      { title: 'ASET', lines: assetLines, total: totalAssets },
      {
        title: 'KEWAJIBAN & EKUITAS',
        lines: [...liabEquityLines, { code: '', name: 'Laba Ditahan (berjalan)', amount: netIncome, isBold: true }],
        total: totalLiabilitiesEquity,
      },
    ],
    totalAssets,
    totalLiabilitiesEquity,
    balanced,
    difference: totalAssets - totalLiabilitiesEquity,
    netIncome,
  }
}

// ------------------------------------------------------------
// Arus Kas (Cash Flow)
// ------------------------------------------------------------
export interface CashFlowLine {
  accountCode: string
  accountName: string
  amount: number
  indentLevel: number
  isBold: boolean
  isTotal: boolean
}

export interface CashFlowSection {
  title: string
  subtotal: number
  lines: CashFlowLine[]
}

export interface CashFlowView {
  sections: CashFlowSection[]
  netCashFlow: number
  beginningCash: number
  endingCash: number
}

// Arus kas s/d periodEnd (metode tidak langsung, konsisten dengan mock API
// GET /reports/cash-flow):
// - saldo awal kas = efek jurnal posted s/d sehari SEBELUM start periode
// - saldo akhir kas = efek jurnal posted s/d periodEnd (inclusive)
//   (akun Kas & Bank: type asset, kategori 'Kas & Bank')
// - arus kas bersih = selisih saldo akhir − awal; aktivitas operasi memakai
//   laba bersih sebagai baris awal (investasi/pendanaan kosong di seed).
const dayBefore = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export const computeCashFlow = (
  accounts: Account[],
  journals: JournalEntry[],
  periodStart: string,
  periodEnd: string,
): CashFlowView => {
  const cashAccounts = accounts.filter((a) => a.type === 'asset' && a.category === 'Kas & Bank')
  const sumCash = (asOf: string) => {
    const closing = closingBalances(accounts, journals, asOf)
    return cashAccounts.reduce((s, a) => s + (closing.get(a.id) ?? 0), 0)
  }
  const beginningCash = sumCash(dayBefore(periodStart))
  const endingCash = sumCash(periodEnd)
  const closingEnd = closingBalances(accounts, journals, periodEnd)
  const sumOf = (type: Account['type']) =>
    accounts.filter((a) => a.type === type).reduce((s, a) => s + (closingEnd.get(a.id) ?? 0), 0)
  const netIncome = sumOf('revenue') - sumOf('expense')
  return {
    sections: [
      {
        title: 'ARUS KAS DARI AKTIVITAS OPERASI',
        subtotal: netIncome,
        lines: [
          { accountCode: '', accountName: 'Laba bersih', amount: netIncome, indentLevel: 1, isBold: false, isTotal: false },
        ],
      },
      { title: 'ARUS KAS DARI AKTIVITAS INVESTASI', subtotal: 0, lines: [] },
      { title: 'ARUS KAS DARI AKTIVITAS PENDANAAN', subtotal: 0, lines: [] },
    ],
    netCashFlow: endingCash - beginningCash,
    beginningCash,
    endingCash,
  }
}

export interface TrialBalanceLine {
  accountCode: string
  accountName: string
  debit: number
  credit: number
}

export interface TrialBalanceView {
  lines: TrialBalanceLine[]
  debit: number
  credit: number
  balanced: boolean
}

// Neraca Lajur s/d periodEnd: saldo YTD tiap akun ditempatkan ke sisi saldo
// normalnya; akun tanpa saldo dihilangkan. Debit harus = kredit.
export const computeTrialBalance = (
  accounts: Account[],
  journals: JournalEntry[],
  periodEnd: string,
): TrialBalanceView => {
  const closing = closingBalances(accounts, journals, periodEnd)
  const lines: TrialBalanceLine[] = []
  let debit = 0
  let credit = 0
  for (const a of accounts) {
    const amount = closing.get(a.id) ?? 0
    if (amount === 0) continue // akun tanpa saldo (termasuk header grup) tidak muncul
    if (a.normalBalance === 'debit') {
      if (amount >= 0) {
        lines.push({ accountCode: a.code, accountName: a.name, debit: amount, credit: 0 })
        debit += amount
      } else {
        lines.push({ accountCode: a.code, accountName: a.name, debit: 0, credit: Math.abs(amount) })
        credit += Math.abs(amount)
      }
    } else {
      if (amount >= 0) {
        lines.push({ accountCode: a.code, accountName: a.name, debit: 0, credit: amount })
        credit += amount
      } else {
        lines.push({ accountCode: a.code, accountName: a.name, debit: Math.abs(amount), credit: 0 })
        debit += Math.abs(amount)
      }
    }
  }
  return { lines, debit, credit, balanced: debit === credit }
}
