import { describe, expect, it } from 'vitest'
import { RETRY_BASE_MS, RETRY_MAX_MS, nextRetryDelay } from './retry'

describe('nextRetryDelay — backoff eksponensial', () => {
  it('base 2s, digandakan tiap percobaan: 2→4→8→16s', () => {
    expect(nextRetryDelay(0)).toBe(2_000)
    expect(nextRetryDelay(1)).toBe(4_000)
    expect(nextRetryDelay(2)).toBe(8_000)
    expect(nextRetryDelay(3)).toBe(16_000)
  })

  it('di-cap pada RETRY_MAX_MS (30s) — tidak tumbuh tanpa batas', () => {
    expect(nextRetryDelay(4)).toBe(RETRY_MAX_MS)
    expect(nextRetryDelay(5)).toBe(RETRY_MAX_MS)
    expect(nextRetryDelay(50)).toBe(RETRY_MAX_MS)
  })

  it('attempt negatif diperlakukan sebagai 0 (base)', () => {
    expect(nextRetryDelay(-3)).toBe(RETRY_BASE_MS)
  })

  it('mendukung base & max kustom', () => {
    expect(nextRetryDelay(1, 1_000, 5_000)).toBe(2_000)
    expect(nextRetryDelay(3, 1_000, 5_000)).toBe(5_000) // 8s > 5s cap
  })
})
