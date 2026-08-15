import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatSyncAgo } from './format'

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
