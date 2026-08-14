// Logika akuntansi murni (tanpa UI) — diuji dengan Vitest.
// Diambil dari JournalEntryModal agar bisa di-unit-test.

// Ubah input "1.250.000" / "1,250,000" / "1250000" menjadi angka.
// Semua karakter non-digit dibuang (Rp, spasi, titik, koma).
export const toNumber = (raw: string): number => {
  const digits = raw.replace(/\D/g, '')
  return digits ? Number(digits) : 0
}

export interface LineAmountInput {
  debit: string
  credit: string
}

export interface LineTotals {
  debit: number
  credit: number
  difference: number
  isBalanced: boolean
}

// Hitung total debit/kredit + status seimbang (BR-4: debit = kredit, > 0).
export const computeLineTotals = (lines: LineAmountInput[]): LineTotals => {
  let debit = 0
  let credit = 0
  for (const l of lines) {
    debit += toNumber(l.debit)
    credit += toNumber(l.credit)
  }
  return { debit, credit, difference: debit - credit, isBalanced: debit > 0 && debit === credit }
}
