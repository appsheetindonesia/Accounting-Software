import { describe, expect, it } from 'vitest'
import { computeBalanceSheet, computeLedger, computeIncomeStatement, computeTrialBalance, computeCashFlow, isEffectJournal } from './ledger'
import { mockAccounts, mockJournals } from '../data/mock'
import type { JournalEntry } from '../types'

// Baseline seed Maret 2026 (PT. Kreasi Inovasi Estetika):
// Kas Besar base 60jt → 60 + 25 (JNL-001) − 10 (JNL-002) − 3 (JNL-003) + 15 (JNL-004) = 87jt
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
  it('Kas Besar Maret: saldo awal 60jt, baris berjalan 85/75/72/84, saldo akhir 84jt', () => {
    const v = computeLedger(mockAccounts, mockJournals, '1-1100', MARCH)
    expect(v.opening).toBe(60_000_000)
    expect(v.rows.map((r) => r.reference)).toEqual([
      'BKM-2026-03-0001', // 05/03 +25 → 85
      'BKK-2026-03-0002', // 07/03 −10 → 75
      'BKK-2026-03-0003', // 10/03 −3 → 72
      'BKM-2026-03-0004', // 12/03 +12 (v2) → 84
    ])
    expect(v.rows.map((r) => r.balance)).toEqual([85_000_000, 75_000_000, 72_000_000, 84_000_000])
    expect(v.closing).toBe(84_000_000)
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
    expect(v.opening).toBe(2_000_000)
    expect(v.rows).toHaveLength(0)
    expect(v.closing).toBe(2_000_000)
  })

  it('urutan baris: tanggal naik, tie-break nomor bukti', () => {
    const v = computeLedger(mockAccounts, mockJournals, '1-1100', MARCH)
    const dates = v.rows.map((r) => r.date)
    expect([...dates].sort()).toEqual(dates) // sudah terurut
  })
})

describe('computeLedger — skenario reverse (net 0)', () => {
  it('reverse BKK-0002: original + pembalik diabaikan → Kas kembali 94jt (net 0)', () => {
    const before = computeLedger(mockAccounts, mockJournals, '1-1100', MARCH).closing // 84 (termasuk −10)
    const after = computeLedger(mockAccounts, reverseJournal(mockJournals, 'JNL-2026-03-002'), '1-1100', MARCH)
    expect(before).toBe(84_000_000)
    // BKK-0002 (kredit 10) dan pembaliknya (debit 10) keduanya tak dihitung:
    // 60 + 25 − 3 + 12 = 94 — efek transaksi dihilangkan total
    expect(after.closing).toBe(94_000_000)
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
    expect(v.opening).toBe(60_000_000)
    expect(v.rows).toHaveLength(0)
    expect(v.closing).toBe(60_000_000)
  })

  it('jurnal Januari masuk SALDO AWAL Maret (bukan baris), saldo berantai', () => {
    const withJan = [janJournal, ...mockJournals]
    const jan = computeLedger(mockAccounts, withJan, '1-1100', JANUARY)
    expect(jan.rows).toHaveLength(1)
    expect(jan.rows[0].balance).toBe(90_000_000) // 60 + 30
    expect(jan.closing).toBe(90_000_000)

    const mar = computeLedger(mockAccounts, withJan, '1-1100', MARCH)
    expect(mar.opening).toBe(90_000_000) // saldo awal Maret = saldo akhir Januari
    expect(mar.rows.map((r) => r.reference)).not.toContain('BKM-2026-01-0001')
    expect(mar.closing).toBe(114_000_000) // 90 + 25 − 10 − 3 + 12
  })

  it('periode Februari: jurnal Maret tidak dihitung (di luar periode)', () => {
    const v = computeLedger(mockAccounts, mockJournals, '1-1100', FEBRUARY)
    expect(v.rows).toHaveLength(0)
    expect(v.closing).toBe(60_000_000)
  })
})

describe('computeIncomeStatement — formula Laba Rugi', () => {
  it('Maret baseline: Pendapatan 155, Beban 111, Laba Bersih 44jt', () => {
    const v = computeIncomeStatement(mockAccounts, mockJournals, '2026-03-31')
    expect(v.revenueLines).toEqual([
      { accountId: '4-1000', code: '4-1000', name: 'Pendapatan Jasa', amount: 155_000_000 },
    ])
    expect(v.revenueTotal).toBe(155_000_000)
    // Beban Gaji 85 (40+45), Sewa 18 (8+10), Operasional 6 (3+3), Penyusutan 2
    expect(v.expenseLines.map((l) => l.amount)).toEqual([85_000_000, 18_000_000, 6_000_000, 2_000_000])
    expect(v.expenseTotal).toBe(111_000_000)
    expect(v.netIncome).toBe(44_000_000)
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
    expect(before.expenseTotal).toBe(111_000_000)
    expect(after.expenseLines.find((l) => l.accountId === '5-2000')!.amount).toBe(8_000_000) // 18 − 10
    expect(after.expenseTotal).toBe(101_000_000)
    expect(after.netIncome).toBe(54_000_000) // 155 − 101
  })

  it('jurnal Januari (periode tertutup) tetap masuk Laba Rugi s/d Maret', () => {
    const withJan = [janJournal, ...mockJournals]
    const mar = computeIncomeStatement(mockAccounts, withJan, '2026-03-31')
    expect(mar.revenueTotal).toBe(185_000_000) // 155 + 30
    expect(mar.netIncome).toBe(74_000_000) // 185 − 111
  })
})

describe('computeBalanceSheet — identitas Aset = Kewajiban + Ekuitas', () => {
  it('Maret baseline: Aset 557 = Utang 150 + Modal 363 + Laba 44, balanced', () => {
    const v = computeBalanceSheet(mockAccounts, mockJournals, '2026-03-31')
    expect(v.totalAssets).toBe(557_000_000)
    expect(v.totalLiabilitiesEquity).toBe(557_000_000)
    expect(v.balanced).toBe(true)
    expect(v.difference).toBe(0)
    expect(v.netIncome).toBe(44_000_000)

    // Komposisi baris: aset 4 akun + laba ditahan di section K&E
    expect(v.sections[0].title).toBe('ASET')
    expect(v.sections[0].lines).toHaveLength(4) // Kas, Bank, Piutang, Perlengkapan
    expect(v.sections[1].lines.at(-1)!.name).toBe('Laba Ditahan (berjalan)')
    expect(v.sections[1].lines.at(-1)!.amount).toBe(44_000_000)
    // Utang Usaha = 105 base + 45 (JNL-005) = 150
    const utang = v.sections[1].lines.find((l) => l.code === '2-1000')!
    expect(utang.amount).toBe(150_000_000)
  })

  it('reverse BKM-0001 (pendapatan 25): Laba turun ke 19jt, tetap seimbang', () => {
    const v = computeBalanceSheet(mockAccounts, reverseJournal(mockJournals, 'JNL-2026-03-001'), '2026-03-31')
    expect(v.netIncome).toBe(19_000_000) // 44 − 25
    expect(v.totalAssets).toBe(532_000_000) // 557 − 25 (Kas turun)
    expect(v.totalLiabilitiesEquity).toBe(532_000_000)
    expect(v.balanced).toBe(true)
  })

  it('reverse BKK-0002 (beban sewa 10): Laba naik ke 54jt, tetap seimbang', () => {
    const v = computeBalanceSheet(mockAccounts, reverseJournal(mockJournals, 'JNL-2026-03-002'), '2026-03-31')
    expect(v.netIncome).toBe(54_000_000) // 44 + 10
    expect(v.totalAssets).toBe(567_000_000) // 557 + 10 (Kas tidak berkurang)
    expect(v.balanced).toBe(true)
  })

  it('draft & reversed TIDAK mengubah keseimbangan (identitas tetap)', () => {
    const v = computeBalanceSheet(mockAccounts, mockJournals, '2026-03-31')
    // Seed sudah berisi 2 draft (JNL-006/007) + 1 reversed (JNL-008) —
    // identitas tetap 557=557 (hanya jurnal posted yang dihitung)
    expect(v.totalAssets).toBe(557_000_000)
    expect(v.balanced).toBe(true)
  })

  it('periode tertutup Januari (tanpa jurnal Jan): Aset = base 545, tetap seimbang', () => {
    const v = computeBalanceSheet(mockAccounts, mockJournals, '2026-01-31')
    expect(v.totalAssets).toBe(545_000_000) // 60+380+100+5
    expect(v.netIncome).toBe(130_000_000 - 53_000_000) // Pendapatan base − Beban base
    expect(v.balanced).toBe(true)
  })

  it('jurnal Januari (periode tertutup) masuk ke neraca Maret: Aset 587, tetap seimbang', () => {
    const withJan = [janJournal, ...mockJournals]
    const v = computeBalanceSheet(mockAccounts, withJan, '2026-03-31')
    expect(v.totalAssets).toBe(587_000_000) // 557 + 30 (Kas +30)
    expect(v.netIncome).toBe(74_000_000) // 44 + 30
    expect(v.balanced).toBe(true)
  })
})

describe('computeCashFlow — arus kas metode tidak langsung', () => {
  it('Maret baseline: saldo kas 440 → 464jt (net +24jt), operasi = laba bersih 44jt', () => {
    const v = computeCashFlow(mockAccounts, mockJournals, '2026-03-01', '2026-03-31')
    // Kas Besar 60 + Bank 380 + Kas Kecil 0 = 440; akhir: Kas 84 (60+25−10−3+12) + 380
    expect(v.beginningCash).toBe(440_000_000)
    expect(v.endingCash).toBe(464_000_000)
    expect(v.netCashFlow).toBe(24_000_000)
    // Operasi: Laba bersih 44jt (155 pendapatan − 111 beban); investasi/pendanaan kosong
    expect(v.sections[0].subtotal).toBe(44_000_000)
    expect(v.sections[0].lines[0]).toMatchObject({ accountName: 'Laba bersih', amount: 44_000_000 })
    expect(v.sections[1].subtotal).toBe(0)
    expect(v.sections[2].subtotal).toBe(0)
  })

  it('draft & reversed TIDAK mengubah arus kas (BKK-0006, JV-0007, BKM-0008 diabaikan)', () => {
    const v = computeCashFlow(mockAccounts, mockJournals, '2026-03-01', '2026-03-31')
    // Draft (5jt + 2,5jt) dan reversed (2jt) tidak masuk → kas tetap 464jt
    expect(v.endingCash).toBe(464_000_000)
    expect(v.netCashFlow).toBe(24_000_000)
  })

  it('Januari (tanpa jurnal Jan): kas tetap 440jt, net 0; laba bersih 77jt (base)', () => {
    const v = computeCashFlow(mockAccounts, mockJournals, '2026-01-01', '2026-01-31')
    expect(v.beginningCash).toBe(440_000_000)
    expect(v.endingCash).toBe(440_000_000)
    expect(v.netCashFlow).toBe(0)
    expect(v.sections[0].subtotal).toBe(77_000_000) // 130 − 53
  })

  it('jurnal Januari (periode tertutup) masuk saldo awal & akhir Maret (arus berantai)', () => {
    const withJan = [janJournal, ...mockJournals]
    const v = computeCashFlow(mockAccounts, withJan, '2026-03-01', '2026-03-31')
    expect(v.beginningCash).toBe(470_000_000) // 440 + 30 (Kas +30 di Januari)
    expect(v.endingCash).toBe(494_000_000) // 464 + 30
    expect(v.netCashFlow).toBe(24_000_000) // arus Maret tidak berubah
    expect(v.sections[0].subtotal).toBe(74_000_000) // 44 + 30
  })
})

describe('computeTrialBalance — Debit = Kredit', () => {
  it('Maret baseline: debit = kredit = 668jt, balanced', () => {
    const v = computeTrialBalance(mockAccounts, mockJournals, '2026-03-31')
    expect(v.debit).toBe(668_000_000)
    expect(v.credit).toBe(668_000_000)
    expect(v.balanced).toBe(true)
    // Akun tanpa saldo (semua seed bersaldo) → 11 baris akun
    expect(v.lines).toHaveLength(11)
    // Kas (debit 87) di sisi debit; Pendapatan (kredit 155) di sisi kredit
    expect(v.lines.find((l) => l.accountCode === '1-1100')).toMatchObject({ debit: 84_000_000, credit: 0 })
    expect(v.lines.find((l) => l.accountCode === '4-1000')).toMatchObject({ debit: 0, credit: 155_000_000 })
  })

  it('reverse BKM-0001: debit = kredit = 643jt, tetap balanced', () => {
    const v = computeTrialBalance(mockAccounts, reverseJournal(mockJournals, 'JNL-2026-03-001'), '2026-03-31')
    expect(v.balanced).toBe(true)
    expect(v.debit).toBe(643_000_000) // 668 − 25
    expect(v.credit).toBe(643_000_000)
  })

  it('draft & reversed diabaikan (TB tetap 668, bukan 675,5)', () => {
    const v = computeTrialBalance(mockAccounts, mockJournals, '2026-03-31')
    // JNL-006 (5jt) + JNL-007 (2,5jt) draft + JNL-008 (2jt) reversed TIDAK masuk
    expect(v.debit).toBe(668_000_000)
    expect(v.credit).toBe(668_000_000)
  })

  it('periode tertutup Januari: debit = kredit = 598jt (base saja)', () => {
    const v = computeTrialBalance(mockAccounts, mockJournals, '2026-01-31')
    expect(v.balanced).toBe(true)
    expect(v.debit).toBe(598_000_000) // Aset 545 + Beban 53
    expect(v.credit).toBe(598_000_000) // Utang 105 + Modal 363 + Pendapatan 130
  })

  it('jurnal Januari masuk TB Maret: 698 = 698, tetap balanced', () => {
    const withJan = [janJournal, ...mockJournals]
    const v = computeTrialBalance(mockAccounts, withJan, '2026-03-31')
    expect(v.balanced).toBe(true)
    expect(v.debit).toBe(698_000_000) // 668 + 30
    expect(v.credit).toBe(698_000_000)
  })
})
