// Retry otomatis dengan backoff eksponensial saat koneksi mock API mati.
// Dipakai App.tsx untuk mencoba `init()` ulang tanpa user menekan "Coba lagi":
// 2s → 4s → 8s → 16s → 30s (cap), dan reset ke 2s begitu koneksi pulih.

export const RETRY_BASE_MS = 2_000
export const RETRY_MAX_MS = 30_000

// Delay percobaan ke-`attempt` (0-indexed), dibatasi maksimum.
export const nextRetryDelay = (attempt: number, base = RETRY_BASE_MS, max = RETRY_MAX_MS): number =>
  Math.min(base * 2 ** Math.max(0, attempt), max)
