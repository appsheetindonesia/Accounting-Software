import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request, setAuth, setSessionExpiredHandler, setTokensRefreshedHandler } from './client'

const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

const refreshCall = (calls: unknown[][]) => calls.find((c) => String(c[0]).includes('/auth/refresh'))

describe('request — refresh token otomatis saat 401', () => {
  beforeEach(() => {
    setAuth(null, null, null)
    setSessionExpiredHandler(null)
    setTokensRefreshedHandler(null)
    vi.unstubAllGlobals()
  })

  it('401 → POST /auth/refresh → retry berhasil dengan token baru', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(json(200, { data: { accessToken: 'mock.new.1', refreshToken: 'r2' } }))
      .mockResolvedValueOnce(json(200, { data: { ok: true } }))
    vi.stubGlobal('fetch', fetchMock)
    setAuth('mock.old.1', undefined, 'r1')

    const result = await request<{ ok: boolean }>('/journals')

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const refresh = refreshCall(fetchMock.mock.calls)!
    expect(JSON.parse((refresh[1] as RequestInit).body as string)).toEqual({ refreshToken: 'r1' })
  })

  it('handler tokensRefreshed dipanggil dengan token baru (store ikut update)', async () => {
    const onRefresh = vi.fn()
    setTokensRefreshedHandler(onRefresh)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(json(200, { data: { accessToken: 'mock.new.1', refreshToken: 'r2' } }))
      .mockResolvedValueOnce(json(200, { data: { ok: true } }))
    vi.stubGlobal('fetch', fetchMock)
    setAuth('mock.old.1', undefined, 'r1')

    await request<{ ok: boolean }>('/journals')

    expect(onRefresh).toHaveBeenCalledWith({ accessToken: 'mock.new.1', refreshToken: 'r2' })
  })

  it('refresh gagal (refresh token invalid) → handler sessionExpired & request menolak', async () => {
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(json(401, { error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token tidak valid' } }))
    vi.stubGlobal('fetch', fetchMock)
    setAuth('mock.old.1', undefined, 'r1')

    await expect(request('/journals')).rejects.toThrow()

    expect(expired).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2) // request + refresh, TANPA retry
  })

  it('401 tanpa refresh token → TIDAK memicu refresh, request menolak', async () => {
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    const fetchMock = vi.fn().mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
    vi.stubGlobal('fetch', fetchMock)
    setAuth('mock.old.1') // tanpa refresh token

    await expect(request('/journals')).rejects.toThrow()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(expired).not.toHaveBeenCalled()
  })

  it('dua request 401 paralel → refresh HANYA sekali (dedupe)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } })) // /a
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } })) // /b
      .mockResolvedValueOnce(json(200, { data: { accessToken: 'mock.new.1', refreshToken: 'r2' } })) // refresh
      .mockResolvedValueOnce(json(200, { data: 1 })) // retry /a
      .mockResolvedValueOnce(json(200, { data: 2 })) // retry /b
    vi.stubGlobal('fetch', fetchMock)
    setAuth('mock.old.1', undefined, 'r1')

    const [a, b] = await Promise.all([request<number>('/a'), request<number>('/b')])

    expect(a).toBe(1)
    expect(b).toBe(2)
    const refreshes = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/auth/refresh'))
    expect(refreshes).toHaveLength(1)
  })

  it('error non-401 (mis. 422) dilewati tanpa refresh', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(422, { error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid' } }))
    vi.stubGlobal('fetch', fetchMock)
    setAuth('mock.old.1', undefined, 'r1')

    await expect(request('/journals', { method: 'POST', body: {} })).rejects.toThrow('Data tidak valid')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('setAuth — membersihkan sesi lokal (logout / ganti entitas)', () => {
  beforeEach(() => {
    setAuth(null, null, null)
    vi.unstubAllGlobals()
  })

  it('setAuth(null, null, null) menghapus entityId → request berikutnya tanpa X-Entity-Id', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(200, { data: { ok: true } }))
    vi.stubGlobal('fetch', fetchMock)

    // Login dengan tenant ent-001
    setAuth('mock.user-001.1', 'ent-001', 'r1')
    await request('/journals')
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'X-Entity-Id': 'ent-001' })

    // Logout → entityId harus dibersihkan (bukan dipertahankan)
    setAuth(null, null, null)
    await expect(request('/journals')).rejects.toThrow() // tanpa token → 401
    const call = fetchMock.mock.calls[1][1] as RequestInit
    const headers = call.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
    expect(headers['X-Entity-Id']).toBeUndefined()
  })

  it('refresh token ikut dibersihkan saat logout → 401 TIDAK memicu refresh', async () => {
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    const fetchMock = vi.fn().mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
    vi.stubGlobal('fetch', fetchMock)

    setAuth('mock.old.1', 'ent-001', 'r1')
    setAuth(null, null, null) // logout: token & refresh dibersihkan

    await expect(request('/journals')).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1) // tanpa refresh
    expect(fetchMock.mock.calls[0][0]).not.toContain('/auth/refresh')
  })
})
