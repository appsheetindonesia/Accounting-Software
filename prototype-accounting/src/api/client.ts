// Klien fetch dasar — envelope & error mengikuti `API - Accounting.md`.
// Error envelope: { error: { code, message, details? } }, sukses: { data, meta? }.

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
let entityId: string | null = null

export const setAuth = (token: string | null, entity?: string | null) => {
  accessToken = token
  entityId = entity ?? entityId
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  auth?: boolean
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
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
