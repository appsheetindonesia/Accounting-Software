// @vitest-environment happy-dom
// Hanya file ini yang memakai DOM (renderHook). File test lain tetap di
// environment Node agar perilaku persist/localStorage mereka tidak berubah.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useApiFetch } from './useApiFetch'

afterEach(() => cleanup())

// Deferred promise — kendali penuh kapan loader selesai (untuk memeriksa
// state antara loading → selesai).
const deferred = <T,>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useApiFetch — loading state & fallback offline', () => {
  it('state awal: loading=true, data=null, offline=false selama loader belum selesai', async () => {
    const d = deferred<string>()
    const { result } = renderHook(() => useApiFetch('k1', true, () => d.promise, () => 'fb'))

    // Sebelum loader resolve: indikator loading aktif, belum ada data
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.offline).toBe(false)

    await act(async () => d.resolve('ok'))
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBe('ok')
    expect(result.current.offline).toBe(false)
  })

  it('refetch (key berubah): loading naik lagi, data lama tetap tampil, lalu data baru menggantikan', async () => {
    const responses = ['A', 'B']
    const loader = vi.fn(
      () => new Promise<string>((r) => setTimeout(() => r(responses.shift()!), 10)),
    )

    const { result, rerender } = renderHook(
      ({ k }) => useApiFetch(k, true, loader, () => 'fb'),
      { initialProps: { k: 'k1' } },
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBe('A')
    expect(loader).toHaveBeenCalledTimes(1)

    // Ganti key → refetch: loading langsung aktif kembali
    rerender({ k: 'k2' })
    expect(result.current.loading).toBe(true)
    // Data lama tidak di-reset selama fetch baru berjalan (tidak ada flash kosong)
    expect(result.current.data).toBe('A')

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBe('B')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('fallback offline: loader gagal → fallback() dipakai, offline=true, loading=false', async () => {
    const loader = vi.fn(() => Promise.reject(new TypeError('fetch failed')))
    const fallback = vi.fn(() => 'lokal')

    const { result } = renderHook(() => useApiFetch('k1', true, loader, fallback))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.offline).toBe(true)
    expect(result.current.data).toBe('lokal')
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('fallback offline juga terjadi saat ready berubah jadi true lalu fetch gagal', async () => {
    // ready=false dulu (guard), lalu true → fetch gagal → fallback
    const loader = vi.fn(() => Promise.reject(new TypeError('fetch failed')))
    const { result, rerender } = renderHook(
      ({ ready }) => useApiFetch('k1', ready, loader, () => 'lokal'),
      { initialProps: { ready: false } },
    )

    expect(loader).not.toHaveBeenCalled()

    rerender({ ready: true })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.offline).toBe(true)
    expect(result.current.data).toBe('lokal')
  })

  it('ready=false: loader TIDAK dipanggil (guard sebelum sesi siap)', () => {
    const loader = vi.fn(() => Promise.resolve('x'))

    const { result } = renderHook(() => useApiFetch('k1', false, loader, () => 'fb'))

    expect(loader).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(true)
  })

  it('race: respons loader lama TIDAK menimpa data key baru (guard alive)', async () => {
    const d = deferred<string>()
    const loader = vi
      .fn()
      .mockImplementationOnce(() => d.promise) // key k1 → lambat
      .mockImplementationOnce(() => Promise.resolve('B')) // key k2 → cepat

    const { result, rerender } = renderHook(
      ({ k }) => useApiFetch(k, true, loader, () => 'fb'),
      { initialProps: { k: 'k1' } },
    )

    // Pindah key sebelum fetch k1 selesai → fetch k2 lebih dulu selesai
    rerender({ k: 'k2' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBe('B')

    // Fetch k1 yang basi baru resolve sekarang — harus diabaikan (alive=false)
    await act(async () => d.resolve('A'))
    expect(result.current.data).toBe('B')
    expect(result.current.loading).toBe(false)
    expect(result.current.offline).toBe(false)
  })
})
