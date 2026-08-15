import { describe, expect, it } from 'vitest'
import { computeLedger, computeIncomeStatement, isEffectJournal } from './ledger'
import { mockAccounts, mockJournals } from '../data/mock'
import type { JournalEntry } from '../types'

// Baseline seed Maret 2026 (PT Maju Jaya):
// Kas Besar base 50jt → 50 + 25 (JNL-001) − 10 (JNL-002) − 3 (JNL-003) + 15 (JNL-004) = 77jt
// Pendapatan Jasa base 130jt → 130 + 25 = 155jt
const MARCH = { start: '2026-03-01', end: '2026-03-31' }
const FEBRUARY = { start: '2026-02-01', end: '2026-02-28' }
const JANUARY = { start: '2026-01-01', end: '2026-01-31' }

// Jurnal sintetis Januari 2026 (periode tertutup) untuk menguji saldo awal berantai
const janJournal: JournalEntry = {
  id: 'JNL-2026-01-001',
  transactionNumber: 'BKM-2026-01-0001',
  date: '2026-01-15',
  description: 'Penerimaan kas Januari',
  lines: [
    { id: 'j1-1', accountId: '1-1100', accountCode: '1-1100', accountName: 'Kas Besar', debit: 30_000_000, credit: 0, description: 'Tunai' },
    { id: 'j1-2', accountId: '4-1000', accountCode: '4-1000', accountName: 'Pendapatan Jasa', debit: 0, credit: 30_000_000, description: 'Pendapatan' },
  ],
  status: 'posted',
  createdBy: 'Rina',
  createdAt: '2026-01-15T08:00:00Z',
  postedAt: '2026-01-15T08:01:00Z',
}

// Simulasi reverse (meniru store): original → 'reversed' + reversalOf;
// jurnal pembalik baru: debit/kredit ditukar, status posted, reversalOf terisi.
const reverseJournal = (journals: JournalEntry[], id: string): JournalEntry[] => {
  const original = journals.find((j) => j.id === id)
  if (!original || original.status !== 'posted') return journals
  const reversal: JournalEntry = {
    id: `REV-${original.id}`,
    transactionNumber: `REV-${original.transactionNumber}`,
    date: '2026-03-31',
    description: `Pembalikan: ${original.description}`,
    lines: original.lines.map((ln) => ({ ...ln, id: `r-${ln.id}`, debit: ln.credit, credit: ln.debit })),
    status: 'posted',
    createdBy: 'Rina',
    createdAt: '2026-03-31T23:59:00Z',
    postedAt: '2026-03-31T23:59:00Z',
    reversalOf: original.transactionNumber,
  }
  return [
    reversal,
    ...journals.map((j) => (j.id === id ? { ...j, status: 'reversed' as const, reversalOf: reversal.transactionNumber } : j)),
  ]
}

describe('isEffectJournal — jurnal yang memengaruhi saldo', () => {
  it('posted tanpa reversalOf memengaruhi saldo', () => {
    expect(isEffectJournal(mockJournals[0])).toBe(true) // JNL-001 posted
  })

  it('draft TIDAK memengaruhi saldo', () => {
    expect(isEffectJournal(mockJournals[5])).toBe(false) // JNL-006 draft
  })

  it('reversed TIDAK memengaruhi saldo', () => {
    expect(isEffectJournal(mockJournals[7])).toBe(false) // JNL-008 reversed
  })

  it('jurnal pembalik (posted + reversalOf) TIDAK memengaruhi saldo', () => {
    expect(isEffectJournal({ ...mockJournals[0], status: 'posted', reversalOf: 'REV-X' })).toBe(false)
  })
})

describe('computeLedger — saldo berjalan Buku Besar (BR-6/BR-7)', () => {
  it('Kas Besar Maret: saldo awal 50jt, baris berjalan 75/65/62/77, saldo akhir 77jt', () => {
    const v = computeLedger(mockAccounts, mockJournals, '1-1100', MARCH)
    expect(v.opening).toBe(50_000_000)
    expect(v.rows.map((r) => r.reference)).toEqual([
      'BKM-2026-03-0001', // 05/03 +25 → 75
      'BKK-2026-03-0002', // 07/03 −10 → 65
      'BKK-2026-03-0003', // 10/03 −3 → 62
      'BKM-2026-03-0004', // 12/03 +15 → 77
    ])
    expect(v.rows.map((r) => r.balance)).toEqual([75_000_000, 65_000_000, 62_000_000, 77_000_000])
    expect(v.closing).toBe(77_000_000)
  })

  it('akun kredit (Pendapatan): delta = kredit − debit, closing 155jt', () => {
    const v = computeLedger(mockAccounts, mockJournals, '4-1000', MARCH)
    expect(v.opening).toBe(130_000_000)
    expect(v.rows[0].credit).toBe(25_000_000)
    expect(v.rows[0].balance).toBe(155_000_000)
    expect(v.closing).toBe(155_000_000)
  })

  it('draft (JNL-006/007) & reversed (JNL-008) TIDAK muncul sebagai baris', () => {
    const v = computeLedger(mockAccounts, mockJournals, '1-1100', MARCH)
    const refs = v.rows.map((r) => r.reference)
    expect(refs).not.toContain('BKK-2026-03-0006')
    expect(refs).not.toContain('JV-2026-03-0007')
    expect(refs).not.toContain('BKM-2026-03-0008')
  })

  it('akun tanpa transaksi: saldo awal = saldo akhir = baseBalance, baris kosong', () => {
    const v = computeLedger(mockAccounts, mockJournals, '5-4000', MARCH) // Beban Penyusutan
    expect(v.opening).toBe(1_500_000)
    expect(v.rows).toHaveLength(0)
    expect(v.closing).toBe(1_500_000)
  })

  it('urutan baris: tanggal naik, tie-break nomor bukti', () => {
    const v = computeLedger(mockAccounts, mockJournals, '1-1100', MARCH)
    const dates = v.rows.map((r) => r.date)
    expect([...dates].sort()).toEqual(dates) // sudah terurut
  })
})

describe('computeLedger — skenario reverse (net 0)', () => {
  it('reverse BKK-0002: original + pembalik diabaikan → Kas kembali 87jt (net 0)', () => {
    const before = computeLedger(mockAccounts, mockJournals, '1-1100', MARCH).closing // 77 (termasuk −10)
    const after = computeLedger(mockAccounts, reverseJournal(mockJournals, 'JNL-2026-03-002'), '1-1100', MARCH)
    expect(before).toBe(77_000_000)
    // BKK-0002 (kredit 10) dan pembaliknya (debit 10) keduanya tak dihitung:
    // 50 + 25 − 3 + 15 = 87 — efek transaksi dihilangkan total
    expect(after.closing).toBe(87_000_000)
    expect(after.rows.map((r) => r.reference)).not.toContain('BKK-2026-03-0002')
    expect(after.rows.map((r) => r.reference)).not.toContain('REV-BKK-2026-03-0002')
  })

  it('reverse BKM-0001 (pendapatan): Pendapatan kembali ke base 130jt', () => {
    const after = computeLedger(mockAccounts, reverseJournal(mockJournals, 'JNL-2026-03-001'), '4-1000', MARCH)
    expect(after.closing).toBe(130_000_000) // 155 − 25
  })
})

describe('computeLedger — periode tertutup / berantai antar bulan', () => {
  it('periode Januari tertutup tanpa jurnal Jan: saldo awal = akhir = base', () => {
    const v = computeLedger(mockAccounts, mockJournals, '1-1100', JANUARY)
    expect(v.opening).toBe(50_000_000)
    expect(v.rows).toHaveLength(0)
    expect(v.closing).toBe(50_000_000)
  })

  it('jurnal Januari masuk SALDO AWAL Maret (bukan baris), saldo berantai', () => {
    const withJan = [janJournal, ...mockJournals]
    const jan = computeLedger(mockAccounts, withJan, '1-1100', JANUARY)
    expect(jan.rows).toHaveLength(1)
    expect(jan.rows[0].balance).toBe(80_000_000) // 50 + 30
    expect(jan.closing).toBe(80_000_000)

    const mar = computeLedger(mockAccounts, withJan, '1-1100', MARCH)
    expect(mar.opening).toBe(80_000_000) // saldo awal Maret = saldo akhir Januari
    expect(mar.rows.map((r) => r.reference)).not.toContain('BKM-2026-01-0001')
    expect(mar.closing).toBe(107_000_000) // 80 + 25 − 10 − 3 + 15
  })

  it('periode Februari: jurnal Maret tidak dihitung (di luar periode)', () => {
    const v = computeLedger(mockAccounts, mockJournals, '1-1100', FEBRUARY)
    expect(v.rows).toHaveLength(0)
    expect(v.closing).toBe(50_000_000)
  })
})

describe('computeIncomeStatement — formula Laba Rugi', () => {
  it('Maret baseline: Pendapatan 155, Beban 110,5, Laba Bersih 44,5jt', () => {
    const v = computeIncomeStatement(mockAccounts, mockJournals, '2026-03-31')
    expect(v.revenueLines).toEqual([
      { accountId: '4-1000', code: '4-1000', name: 'Pendapatan Jasa', amount: 155_000_000 },
    ])
    expect(v.revenueTotal).toBe(155_000_000)
    // Beban Gaji 85 (40+45), Sewa 18 (8+10), Operasional 6 (3+3), Penyusutan 1,5
    expect(v.expenseLines.map((l) => l.amount)).toEqual([85_000_000, 18_000_000, 6_000_000, 1_500_000])
    expect(v.expenseTotal).toBe(110_500_000)
    expect(v.netIncome).toBe(44_500_000)
  })

  it('draft & reversed tidak dihitung (Beban Operasional 6jt, bukan 11,5jt)', () => {
    const v = computeIncomeStatement(mockAccounts, mockJournals, '2026-03-31')
    const op = v.expenseLines.find((l) => l.accountId === '5-3000')!
    expect(op.amount).toBe(6_000_000) // JNL-006 (5jt) & JNL-007 (2,5jt) draft diabaikan
    expect(v.revenueTotal).toBe(155_000_000) // JNL-008 reversed (2jt) tidak menambah
  })

  it('jurnal setelah akhir periode tidak dihitung (cutoff)', () => {
    const withLate = [...mockJournals, { ...janJournal, id: 'JNL-2026-03-099', transactionNumber: 'BKM-2026-03-0099', date: '2026-04-01' }]
    const feb = computeIncomeStatement(mockAccounts, withLate, '2026-02-28')
    expect(feb.revenueTotal).toBe(130_000_000) // base saja, jurnal Maret/April tak ikut
    const mar = computeIncomeStatement(mockAccounts, withLate, '2026-03-31')
    expect(mar.revenueTotal).toBe(155_000_000) // April (1/4) melewati 31/3 → diabaikan
  })

  it('reverse BKK-0002: Beban Sewa kembali ke base 8jt, net 0 di Laba Rugi', () => {
    const before = computeIncomeStatement(mockAccounts, mockJournals, '2026-03-31')
    const after = computeIncomeStatement(mockAccounts, reverseJournal(mockJournals, 'JNL-2026-03-002'), '2026-03-31')
    expect(before.expenseTotal).toBe(110_500_000)
    expect(after.expenseLines.find((l) => l.accountId === '5-2000')!.amount).toBe(8_000_000) // 18 − 10
    expect(after.expenseTotal).toBe(100_500_000)
    expect(after.netIncome).toBe(54_500_000) // 155 − 100,5
  })

  it('jurnal Januari (periode tertutup) tetap masuk Laba Rugi s/d Maret', () => {
    const withJan = [janJournal, ...mockJournals]
    const mar = computeIncomeStatement(mockAccounts, withJan, '2026-03-31')
    expect(mar.revenueTotal).toBe(185_000_000) // 155 + 30
    expect(mar.netIncome).toBe(74_500_000) // 185 − 110,5
  })
})
