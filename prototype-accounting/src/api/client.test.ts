import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request, setAuth, setSessionExpiredHandler, setTokensRefreshedHandler } from './client'

const json = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null }, // tanpa Retry-After → jeda default 800ms
  }) as unknown as Response

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

describe('request — retry 429 RATE_LIMITED (API §1.5)', () => {
  beforeEach(() => {
    setAuth(null, null, null)
    setSessionExpiredHandler(null)
    setTokensRefreshedHandler(null)
    vi.unstubAllGlobals()
  })

  it('429 → retry otomatis setelah jeda → request berhasil (tanpa error)', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(json(429, { error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan' } }))
        .mockResolvedValueOnce(json(200, { data: { ok: true } }))
      vi.stubGlobal('fetch', fetchMock)
      setAuth('mock.user-001.1', undefined, 'r1')

      const pending = request<{ ok: boolean }>('/journals')
      await vi.advanceTimersByTimeAsync(1000) // lewati jeda 800ms
      const result = await pending

      expect(result).toEqual({ ok: true })
      expect(fetchMock).toHaveBeenCalledTimes(2) // 429 + retry
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('429 berulang (3x) → ApiError RATE_LIMITED dengan pesan "Terlalu banyak permintaan"', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(json(429, { error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan' } }))
        .mockResolvedValueOnce(json(429, { error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan' } }))
        .mockResolvedValueOnce(json(429, { error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan' } }))
      vi.stubGlobal('fetch', fetchMock)
      setAuth('mock.user-001.1', undefined, 'r1')

      const pending = request('/journals')
      // Handler rejection dipasang SEGERA (hindari unhandled rejection saat
      // fake timers dimajukan), lalu tunggu jeda retry.
      const settled = pending.then(
        () => {
          throw new Error('request seharusnya gagal (429)')
        },
        (e: unknown) => e,
      )
      await vi.advanceTimersByTimeAsync(2000) // 2 × jeda 800ms

      const err = await settled
      expect(err).toMatchObject({ status: 429, code: 'RATE_LIMITED' })
      expect((err as Error).message).toContain('Terlalu banyak permintaan')
      expect(fetchMock).toHaveBeenCalledTimes(3) // 1 asli + 2 retry
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('429 TIDAK memicu refresh token & TIDAK memanggil handler sesi', async () => {
    vi.useFakeTimers()
    try {
      const expired = vi.fn()
      setSessionExpiredHandler(expired)
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(json(429, { error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan' } }))
        .mockResolvedValueOnce(json(200, { data: { ok: true } }))
      vi.stubGlobal('fetch', fetchMock)
      setAuth('mock.user-001.1', undefined, 'r1')

      const pending = request('/journals')
      await vi.advanceTimersByTimeAsync(1000)
      await pending

      const refreshes = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/auth/refresh'))
      expect(refreshes).toHaveLength(0)
      expect(expired).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('menghormati header Retry-After: jeda = detik yang diminta server (bukan 800ms default)', async () => {
    vi.useFakeTimers()
    try {
      // Respons 429 membawa Retry-After: 2 (detik)
      const withRetryAfter = (status: number, body: unknown, retryAfter: string) =>
        ({
          ok: status >= 200 && status < 300,
          status,
          json: async () => body,
          headers: { get: (h: string) => (h === 'retry-after' ? retryAfter : null) },
        }) as Response
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(withRetryAfter(429, { error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan' } }, '2'))
        .mockResolvedValueOnce(json(200, { data: { ok: true } }))
      vi.stubGlobal('fetch', fetchMock)
      setAuth('mock.user-001.1', undefined, 'r1')

      const pending = request<{ ok: boolean }>('/journals')
      // Belum genap 2 detik (1.999ms) → retry BELUM terjadi (default 800ms
      // TIDAK dipakai — Retry-After server yang menang)
      await vi.advanceTimersByTimeAsync(1999)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      // Genap 2000ms → retry berjalan
      await vi.advanceTimersByTimeAsync(1)
      const result = await pending

      expect(result).toEqual({ ok: true })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('Retry-After yang sangat panjang DIBATASI cap (5 detik) agar UI tidak menggantung', async () => {
    vi.useFakeTimers()
    try {
      const withRetryAfter = (status: number, body: unknown, retryAfter: string) =>
        ({
          ok: status >= 200 && status < 300,
          status,
          json: async () => body,
          headers: { get: (h: string) => (h === 'retry-after' ? retryAfter : null) },
        }) as Response
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(withRetryAfter(429, { error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan' } }, '99'))
        .mockResolvedValueOnce(json(200, { data: { ok: true } }))
      vi.stubGlobal('fetch', fetchMock)
      setAuth('mock.user-001.1', undefined, 'r1')

      const pending = request<{ ok: boolean }>('/journals')
      // 4.999ms — masih di bawah cap 5.000ms → retry belum terjadi
      await vi.advanceTimersByTimeAsync(4999)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      // 5.000ms (cap) → retry berjalan, TANPA menunggu 99 detik penuh
      await vi.advanceTimersByTimeAsync(1)
      await pending

      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
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
