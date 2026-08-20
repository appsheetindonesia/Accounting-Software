import { describe, expect, it } from 'vitest'
import { computeLineTotals, toNumber } from './accounting'

describe('toNumber — parsing input nominal', () => {
  it('mengubah angka polos', () => {
    expect(toNumber('1250000')).toBe(1_250_000)
    expect(toNumber('0')).toBe(0)
  })

  it('mengabaikan titik ribuan, koma, dan spasi', () => {
    expect(toNumber('1.250.000')).toBe(1_250_000)
    expect(toNumber('1,250,000')).toBe(1_250_000)
    expect(toNumber('1 250 000')).toBe(1_250_000)
  })

  it('mengabaikan prefiks mata uang', () => {
    expect(toNumber('Rp 1.250.000')).toBe(1_250_000)
  })

  it('mengembalikan 0 untuk input kosong atau non-angka', () => {
    expect(toNumber('')).toBe(0)
    expect(toNumber('abc')).toBe(0)
  })
})

describe('computeLineTotals — auto-balance (BR-4: debit = kredit)', () => {
  const balanced = [
    { debit: '10.000.000', credit: '' },
    { debit: '', credit: '10.000.000' },
  ]

  it('mendeteksi jurnal seimbang', () => {
    const t = computeLineTotals(balanced)
    expect(t.debit).toBe(10_000_000)
    expect(t.credit).toBe(10_000_000)
    expect(t.difference).toBe(0)
    expect(t.isBalanced).toBe(true)
  })

  it('mendeteksi jurnal tidak seimbang dan menghitung selisih', () => {
    const t = computeLineTotals([
      { debit: '10.000.000', credit: '' },
      { debit: '', credit: '7.500.000' },
    ])
    expect(t.isBalanced).toBe(false)
    expect(t.difference).toBe(2_500_000)
  })

  it('jurnal multi-baris dijumlahkan', () => {
    const t = computeLineTotals([
      { debit: '5.000.000', credit: '' },
      { debit: '5.000.000', credit: '' },
      { debit: '', credit: '10.000.000' },
    ])
    expect(t.debit).toBe(10_000_000)
    expect(t.isBalanced).toBe(true)
  })

  it('total nol dianggap TIDAK seimbang (butuh nominal > 0)', () => {
    const t = computeLineTotals([
      { debit: '', credit: '' },
      { debit: '', credit: '' },
    ])
    expect(t.debit).toBe(0)
    expect(t.credit).toBe(0)
    expect(t.isBalanced).toBe(false)
  })
})
