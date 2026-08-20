// Property-based test (fast-check) — invarian akuntansi yang harus berlaku
// untuk SEMUA jurnal acak yang valid (double-entry):
//
//   P1. Total debit = total kredit di setiap jurnal → Neraca Lajur selalu
//       seimbang (untuk 1 jurnal maupun kombinasi acak banyak jurnal).
//   P2. Reverse menghasilkan pasangan bernet 0: setelah reverse, saldo
//       SEMUA akun kembali persis ke baseline (tidak ada baris trial
//       balance yang berubah) — original (reversed) + jurnal pembalik
//       (reversalOf) keduanya diabaikan oleh isEffectJournal.
//
// Generator: jurnal double-entry acak — sejumlah baris debit & kredit
// dengan nominal positif, dinormalisasi agar total debit = total kredit.
import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { computeTrialBalance, isEffectJournal, type TrialBalanceView } from './ledger'
import { mockAccounts } from '../data/mock'
import type { Account, JournalEntry } from '../types'

const ACCOUNT_IDS = mockAccounts.map((a) => a.id)
const accountOf = (id: string): Account => mockAccounts.find((a) => a.id === id)!

// ------------------------------------------------------------
// Generator: jurnal double-entry acak
// ------------------------------------------------------------

// Bagi `total` menjadi `n` bagian bulat positif (jumlahnya persis = total).
const normalize = (parts: number[], total: number): number[] => {
  const sum = parts.reduce((a, b) => a + b, 0)
  if (sum === 0 || total === 0) return Array(parts.length).fill(0)
  const scaled = parts.map((p) => Math.floor((p * total) / sum))
  let diff = total - scaled.reduce((a, b) => a + b, 0)
  const out = [...scaled]
  for (let i = 0; diff > 0; i = (i + 1) % out.length) {
    out[i] += 1
    diff -= 1
  }
  return out
}

// pilih `n` indeks akun unik dari daftar akun
const distinctAccountIndices = (n: number) =>
  fc.uniqueArray(fc.nat({ max: ACCOUNT_IDS.length - 1 }), { minLength: n, maxLength: n })

const amounts = (total: number, n: number) =>
  fc.array(fc.integer({ min: 1, max: total || 1 }), { minLength: n, maxLength: n }).map((parts) => normalize(parts, total))

const journalArb = fc
  .tuple(
    fc.integer({ min: 1_000, max: 100_000_000 }), // total nominal
    fc.integer({ min: 1, max: 3 }), // jumlah baris debit
    fc.integer({ min: 1, max: 3 }), // jumlah baris kredit
  )
  .chain(([total, nd, nc]) =>
    fc.tuple(
      fc.constant(total),
      fc.constant(nd),
      fc.constant(nc),
      amounts(total, nd),
      amounts(total, nc),
      distinctAccountIndices(nd),
      distinctAccountIndices(nc),
    ),
  )
  .map(([total, nd, nc, debitAmounts, creditAmounts, debitIdx, creditIdx]) => {
    const mkLine = (accountId: string, debit: number, credit: number, i: number): JournalEntry['lines'][number] => {
      const a = accountOf(accountId)
      return { id: `pl-${i}`, accountId, accountCode: a.code, accountName: a.name, debit, credit, description: 'property test' }
    }
    const lines: JournalEntry['lines'][number][] = [
      ...debitIdx.map((idx, i) => mkLine(ACCOUNT_IDS[idx], debitAmounts[i], 0, i)),
      ...creditIdx.map((idx, i) => mkLine(ACCOUNT_IDS[idx], 0, creditAmounts[i], debitIdx.length + i)),
    ]
    const journal: JournalEntry = {
      id: `PL-${total}-${nd}-${nc}-${lines.length}`,
      transactionNumber: `PT-2026-03-${lines.length}${total % 97}`,
      date: '2026-03-15',
      description: 'Jurnal acak property test',
      lines,
      status: 'posted',
      createdBy: 'Rina',
      createdAt: '2026-03-15T08:00:00Z',
      postedAt: '2026-03-15T08:01:00Z',
    }
    return { journal, total }
  })
  // Jurnal no-op (debit & kredit di akun SAMA → netto 0) tidak menarik untuk
  // membuktikan invarian — pastikan sisi debit & kredit memakai akun berbeda.
  .filter(({ journal }) => {
    const debitIds = new Set(journal.lines.filter((l) => l.debit > 0).map((l) => l.accountId))
    const creditIds = new Set(journal.lines.filter((l) => l.credit > 0).map((l) => l.accountId))
    return [...debitIds].every((id) => !creditIds.has(id))
  })

const sumDebit = (j: JournalEntry) => j.lines.reduce((s, l) => s + l.debit, 0)
const sumCredit = (j: JournalEntry) => j.lines.reduce((s, l) => s + l.credit, 0)

// Saldo per akun: baris trial balance → peta accountCode → {debit, credit}
const linesOf = (tb: TrialBalanceView) =>
  Object.fromEntries(tb.lines.map((l) => [l.accountCode, { debit: l.debit, credit: l.credit }]))

// Reverse (meniru store): original → 'reversed'; jurnal pembalik baru dengan
// debit/kredit ditukar, status posted, reversalOf terisi.
const reverseAll = (journals: JournalEntry[]): JournalEntry[] => {
  const out: JournalEntry[] = []
  for (const j of journals) {
    if (j.status !== 'posted' || j.reversalOf) {
      out.push(j)
      continue
    }
    const reversal: JournalEntry = {
      id: `REV-${j.id}`,
      transactionNumber: `REV-${j.transactionNumber}`,
      date: j.date,
      description: `Pembalikan: ${j.description}`,
      lines: j.lines.map((ln) => ({ ...ln, id: `r-${ln.id}`, debit: ln.credit, credit: ln.debit })),
      status: 'posted',
      createdBy: 'Rina',
      createdAt: j.createdAt,
      postedAt: j.postedAt,
      reversalOf: j.transactionNumber,
    }
    out.push({ ...j, status: 'reversed', reversalOf: reversal.transactionNumber }, reversal)
  }
  return out
}

const PERIOD_END = '2026-03-31'

// ------------------------------------------------------------
describe('P1 — total debit = total kredit selalu (double-entry)', () => {
  it('setiap jurnal acak: sum debit = sum kredit', () => {
    fc.assert(
      fc.property(journalArb, ({ journal }) => {
        expect(sumDebit(journal)).toBe(sumCredit(journal))
      }),
      { numRuns: 200 },
    )
  })

  it('satu jurnal acak diposting → Neraca Lajur seimbang (debit = kredit)', () => {
    fc.assert(
      fc.property(journalArb, ({ journal }) => {
        const tb = computeTrialBalance(mockAccounts, [journal], PERIOD_END)
        expect(tb.debit).toBe(tb.credit)
        expect(tb.balanced).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('kombinasi acak 1..5 jurnal → Neraca Lajur SELALU seimbang', () => {
    fc.assert(
      fc.property(fc.array(journalArb, { minLength: 1, maxLength: 5 }), (entries) => {
        const journals = entries.map((e) => e.journal)
        // Setiap jurnal harus seimbang (prasyarat generator)
        for (const j of journals) expect(sumDebit(j)).toBe(sumCredit(j))
        // Saldo live gabungan tetap seimbang
        const tb = computeTrialBalance(mockAccounts, journals, PERIOD_END)
        expect(tb.debit).toBe(tb.credit)
        expect(tb.balanced).toBe(true)
      }),
      { numRuns: 100 },
    )
  })
})

// ------------------------------------------------------------
describe('P2 — reverse pasangan bernet 0', () => {
  it('reverse jurnal acak → saldo SEMUA akun kembali persis ke baseline', () => {
    fc.assert(
      fc.property(journalArb, ({ journal }) => {
        // baseline: tanpa jurnal
        const base = computeTrialBalance(mockAccounts, [], PERIOD_END)
        // dengan jurnal (posted) → masuk saldo
        const withJournal = computeTrialBalance(mockAccounts, [journal], PERIOD_END)
        // setelah reverse: original (reversed) + pembalik (reversalOf)
        const afterReverse = computeTrialBalance(mockAccounts, reverseAll([journal]), PERIOD_END)

        // Jurnal yang diposting pasti mengubah saldo setidaknya satu akun
        expect(linesOf(withJournal)).not.toEqual(linesOf(base))

        // Setelah reverse, peta saldo per akun IDENTIK dengan baseline
        expect(linesOf(afterReverse)).toEqual(linesOf(base))
        // dan total pun sama
        expect(afterReverse.debit).toBe(base.debit)
        expect(afterReverse.credit).toBe(base.credit)
      }),
      { numRuns: 100 },
    )
  })

  it('original (reversed) & jurnal pembalik (reversalOf) TIDAK memengaruhi saldo', () => {
    fc.assert(
      fc.property(journalArb, ({ journal }) => {
        const reversed = reverseAll([journal])
        const original = reversed.find((j) => j.id === journal.id)!
        const reversal = reversed.find((j) => j.id === `REV-${journal.id}`)!
        expect(original.status).toBe('reversed')
        expect(isEffectJournal(original)).toBe(false)
        expect(isEffectJournal(reversal)).toBe(false) // posted TAPI reversalOf
        expect(reversal.reversalOf).toBe(original.transactionNumber)
      }),
      { numRuns: 100 },
    )
  })

  it('jurnal acak murni (tanpa reverse) tetap masuk saldo — kontrol', () => {
    fc.assert(
      fc.property(journalArb, ({ journal }) => {
        expect(isEffectJournal(journal)).toBe(true)
        const base = computeTrialBalance(mockAccounts, [], PERIOD_END)
        const withJournal = computeTrialBalance(mockAccounts, [journal], PERIOD_END)
        // Jurnal mengubah saldo setidaknya satu akun (kontrol: bukan no-op)
        expect(linesOf(withJournal)).not.toEqual(linesOf(base))
      }),
      { numRuns: 50 },
    )
  })
})
