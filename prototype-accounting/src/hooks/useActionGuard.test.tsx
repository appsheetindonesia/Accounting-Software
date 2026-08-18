// @vitest-environment happy-dom
// Guard aksi anti double-click SINKRON (ref): start() mengembalikan true hanya
// untuk panggilan pertama selama guard aktif — klik kedua dalam frame yang
// sama (sebelum re-render, saat state React masih di-batch) ditolak. end()
// melepas guard (dipanggil di finally). Varian per-id tidak saling memblokir
// antar id, tapi menolak klik ganda pada id yang sama.
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useActionGuard, useIdActionGuard } from './useActionGuard'

describe('useActionGuard — guard boolean', () => {
  it('start pertama true; start kedua saat guard aktif → false; end → start lagi true', () => {
    const { result } = renderHook(() => useActionGuard())

    expect(result.current.start()).toBe(true)
    expect(result.current.start()).toBe(false) // masih dalam frame yang sama (guard aktif)
    result.current.end() // finally
    expect(result.current.start()).toBe(true) // pulih setelah end
    result.current.end()
  })

  it('start → end → start berulang kali tetap aman (guard lepas tiap selesai)', () => {
    const { result } = renderHook(() => useActionGuard())
    for (let i = 0; i < 3; i++) {
      expect(result.current.start()).toBe(true)
      result.current.end()
    }
  })

})

describe('useIdActionGuard — guard per-id', () => {
  it('id berbeda TIDAK saling memblokir; id yang sama ditolak saat masih aktif', () => {
    const { result } = renderHook(() => useIdActionGuard())

    expect(result.current.start('a')).toBe(true)
    expect(result.current.start('b')).toBe(true) // item lain bebas diklik
    expect(result.current.start('a')).toBe(false) // klik ganda item yang sama ditolak
    result.current.end('a')
    expect(result.current.start('a')).toBe(true) // pulih setelah end
    result.current.end('a')
    result.current.end('b')
  })

  it('end untuk id yang tidak aktif tidak mengganggu id lain', () => {
    const { result } = renderHook(() => useIdActionGuard())

    expect(result.current.start('x')).toBe(true)
    result.current.end('y') // end id lain — tidak relevan
    expect(result.current.start('x')).toBe(false) // x masih aktif
    result.current.end('x')
    expect(result.current.start('x')).toBe(true)
    result.current.end('x')
  })
})
