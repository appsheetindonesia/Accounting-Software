// Klien fetch dasar — envelope & error mengikuti `API - Accounting.md`.
// Error envelope: { error: { code, message, details? } }, sukses: { data, meta? }.
//
// Refresh token: saat respons 401 (access token kedaluwarsa) dan ada refresh
// token, klien otomatis memanggil POST /auth/refresh, mengganti token, lalu
// mengulang request asli (sekali). Refresh paralel di-dedupe jadi satu panggilan.
// Rate limit (API §1.5): respons 429 RATE_LIMITED di-retry otomatis (maks 2x,
// jeda 800ms / hormati Retry-After); bila tetap 429 → ApiError RATE_LIMITED
// dengan pesan "Terlalu banyak permintaan" yang jelas.

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

// Gagal jaringan (server mati / offline) — bedakan dari penolakan server (ApiError).
export const isNetworkError = (e: unknown): boolean => e instanceof TypeError

const BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

let accessToken: string | null = null
let refreshToken: string | null = null
let entityId: string | null = null

// Callback ke store: sesi tidak bisa di-refresh lagi → harus login ulang.
let sessionExpiredHandler: (() => void) | null = null
// Callback ke store: token berhasil di-refresh (store ikut update + persist).
let tokensRefreshedHandler: ((t: { accessToken: string; refreshToken: string }) => void) | null = null

export const setAuth = (token: string | null, entity?: string | null, refresh?: string | null) => {
  accessToken = token
  // entity: undefined = pertahankan, null = reset (logout/ganti sesi).
  // Dengan `entity ?? entityId`, entityId tidak pernah bisa dibersihkan —
  // sesi user berikutnya akan membocorkan entity tenant lama.
  if (entity !== undefined) entityId = entity
  if (refresh !== undefined) refreshToken = refresh
}

export const setRefreshToken = (token: string | null) => {
  refreshToken = token
}

export const setSessionExpiredHandler = (fn: (() => void) | null) => {
  sessionExpiredHandler = fn
}

export const setTokensRefreshedHandler = (fn: ((t: { accessToken: string; refreshToken: string }) => void) | null) => {
  tokensRefreshedHandler = fn
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  auth?: boolean
}

// 429 RATE_LIMITED: jumlah retry & jeda antar percobaan (API §1.5).
const RATE_LIMIT_RETRIES = 2
const RATE_LIMIT_DELAY_MS = 800
// Batas atas jeda dari header Retry-After — hormati server, tapi jangan sampai
// UI terasa menggantung (mis. window rate limit 60 detik → tetap retry setelah
// 5 detik, bukan menunggu penuh).
const RATE_LIMIT_MAX_DELAY_MS = 5000
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Dedupe: satu refresh untuk banyak request 401 yang datang bersamaan
let refreshPromise: Promise<boolean> | null = null

const tryRefresh = (): Promise<boolean> => {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

const doRefresh = async (): Promise<boolean> => {
  const rt = refreshToken
  if (!rt) return false
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    })
    const json = (await res.json().catch(() => null)) as { data?: { accessToken: string; refreshToken: string } } | null
    if (!res.ok || !json?.data?.accessToken) return false
    accessToken = json.data.accessToken
    refreshToken = json.data.refreshToken
    tokensRefreshedHandler?.({ accessToken, refreshToken })
    return true
  } catch {
    return false
  }
}

const doRequest = async <T>(path: string, opts: RequestOptions, allowRefresh: boolean): Promise<T> => {
  const { method = 'GET', body, query, auth = true } = opts

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (auth && entityId) headers['X-Entity-Id'] = entityId

  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== '') params.set(k, String(v))
  }
  const qs = params.toString() ? `?${params.toString()}` : ''

  const attempt = () =>
    fetch(`${BASE_URL}${path}${qs}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  let res = await attempt()

  // 429 RATE_LIMITED → retry otomatis dengan jeda (hormati header Retry-After
  // dari server, dibatasi cap RATE_LIMIT_MAX_DELAY_MS; default 800ms bila server
  // tidak mengirimnya). Maksimal RATE_LIMIT_RETRIES percobaan ulang; bila masih
  // 429 → jatuh ke ApiError RATE_LIMITED di bawah.
  for (let retry = 0; res.status === 429 && retry < RATE_LIMIT_RETRIES; retry++) {
    const retryAfter = Number(res.headers?.get?.('retry-after'))
    const rawDelay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : RATE_LIMIT_DELAY_MS
    const delay = Math.min(rawDelay, RATE_LIMIT_MAX_DELAY_MS)
    await sleep(delay)
    res = await attempt()
  }

  // Access token kedaluwarsa → refresh sekali, lalu ulangi request asli.
  // (Jangan refresh endpoint auth itu sendiri atau request tanpa token.)
  if (res.status === 401 && auth && allowRefresh && refreshToken) {
    const refreshed = await tryRefresh()
    if (refreshed) return doRequest<T>(path, opts, false)
    // Refresh gagal (refresh token invalid/kedaluwarsa) → sesi berakhir
    sessionExpiredHandler?.()
  }

  if (res.status === 204) return undefined as T

  const json = (await res.json().catch(() => null)) as
    | { data: T; error?: never }
    | { data?: never; error: { code?: string; message?: string; details?: unknown } }
    | null

  if (!res.ok || !json || json.error) {
    const err = json?.error
    const code = err?.code ?? 'HTTP_ERROR'
    // 429 setelah retry habis → pesan konsisten ("Terlalu banyak permintaan"),
    // bukan sekadar "HTTP 429" — store menampilkannya sebagai toast error.
    const message =
      res.status === 429
        ? 'Terlalu banyak permintaan. Silakan coba lagi beberapa saat lagi.'
        : (err?.message ?? `HTTP ${res.status}`)
    throw new ApiError(res.status, code, message)
  }
  return json.data
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return doRequest<T>(path, opts, true)
}

/**
 * Unduh file (export PDF/XLSX) dengan auth — berbasis NAVIGASI browser, bukan
 * fetch: Firefox menolak fetch() ke URL yang responsnya membawa
 * `Content-Disposition: attachment` (NetworkError), jadi blob-fetch hanya
 * berfungsi di Chromium. Anchor <a href> membuat browser menangani unduhan
 * secara native di semua browser. Token & entitas dikirim via query (`?token=`,
 * `?entity=`) karena navigasi tidak bisa membawa header — endpoint export di
 * mock API menerima keduanya (lihat requireAuthExport di server.js).
 */
export async function download(path: string, query: Record<string, string | number | boolean | undefined> = {}): Promise<void> {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') params.set(k, String(v))
  }
  if (accessToken) params.set('token', accessToken)
  if (entityId) params.set('entity', entityId)

  const a = document.createElement('a')
  a.href = `${BASE_URL}${path}?${params.toString()}`
  a.download = ''
  document.body.appendChild(a)
  a.click()
  a.remove()
}
