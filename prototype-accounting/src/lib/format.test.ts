import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatPeriodLabel, formatSyncAgo } from './format'

describe('formatPeriodLabel — label periode dari id YYYY-MM', () => {
  it('format valid → nama bulan + tahun', () => {
    expect(formatPeriodLabel('2026-03')).toBe('Maret 2026')
    expect(formatPeriodLabel('2026-01')).toBe('Januari 2026')
    expect(formatPeriodLabel('2026-12')).toBe('Desember 2026')
  })

  it('id korup (state persist lama, mis. \'0\') → TIDAK menghasilkan "undefined", kembalikan id apa adanya', () => {
    // Anomali yang pernah dilaporkan: '0'.split('-') → [0, NaN] → MONTHS_ID[NaN]
    // = undefined → "undefined 0" di subtitle halaman Jurnal.
    expect(formatPeriodLabel('0')).toBe('0')
    expect(formatPeriodLabel('')).toBe('')
  })

  it('id bentuk API (fp-YYYY-MM) / salah format → fallback id asli, tanpa crash', () => {
    expect(formatPeriodLabel('fp-2026-03')).toBe('fp-2026-03')
    expect(formatPeriodLabel('2026')).toBe('2026')
    expect(formatPeriodLabel('2026-13')).toBe('2026-13') // bulan 13 tidak valid
    expect(formatPeriodLabel('bukan-periode')).toBe('bukan-periode')
  })
})

describe('formatSyncAgo — indikator "sinkron terakhir"', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-15T04:10:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('null / undefined → "belum pernah tersinkron"', () => {
    expect(formatSyncAgo(null)).toBe('belum pernah tersinkron')
    expect(formatSyncAgo(undefined)).toBe('belum pernah tersinkron')
  })

  it('kurang dari 1 menit → "baru saja"', () => {
    expect(formatSyncAgo('2026-08-15T04:09:30Z')).toBe('baru saja')
  })

  it('menit → "10 menit lalu"', () => {
    expect(formatSyncAgo('2026-08-15T04:00:00Z')).toBe('10 menit lalu')
  })

  it('jam → "2 jam lalu"', () => {
    expect(formatSyncAgo('2026-08-15T02:00:00Z')).toBe('2 jam lalu')
  })

  it('hari → "3 hari lalu"', () => {
    expect(formatSyncAgo('2026-08-12T04:00:00Z')).toBe('3 hari lalu')
  })

  it('timestamp di masa depan (clock skew) → "baru saja"', () => {
    expect(formatSyncAgo('2026-08-15T04:11:00Z')).toBe('baru saja')
  })

  it('string invalid → "baru saja" (tidak crash)', () => {
    expect(formatSyncAgo('bukan-tanggal')).toBe('baru saja')
  })
})
