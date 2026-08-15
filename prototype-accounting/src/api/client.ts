// Klien fetch dasar — envelope & error mengikuti `API - Accounting.md`.
// Error envelope: { error: { code, message, details? } }, sukses: { data, meta? }.
//
// Refresh token: saat respons 401 (access token kedaluwarsa) dan ada refresh
// token, klien otomatis memanggil POST /auth/refresh, mengganti token, lalu
// mengulang request asli (sekali). Refresh paralel di-dedupe jadi satu panggilan.

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

  const res = await fetch(`${BASE_URL}${path}${qs}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

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
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? `HTTP ${res.status}`)
  }
  return json.data
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return doRequest<T>(path, opts, true)
}
