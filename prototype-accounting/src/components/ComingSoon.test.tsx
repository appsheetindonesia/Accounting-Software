// @vitest-environment happy-dom
// Placeholder (Laporan Lain) harus mengikuti pola loading konsisten: saat
// aplikasi masih menyinkronkan data pertama kali (apiStatus 'connecting' &
// belum pernah sinkron), menu menampilkan skeleton — bukan konten statis.
// Memakai helper bersama (src/test/helpers) untuk state store + render;
// cleanup DOM otomatis via setup global (src/test/setup.ts).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { useStore } from '../store/useStore'
import { renderWithStore, resetStoreState } from '../test/helpers'
import ComingSoon from './ComingSoon'

beforeEach(() => {
  useStore.setState({ page: 'laporan-lain' })
})

afterEach(() => {
  resetStoreState()
})

describe('ComingSoon — indikator loading konsisten', () => {
  it('saat connecting (belum pernah sinkron) → skeleton tampil, bukan konten statis', () => {
    renderWithStore(<ComingSoon />, { apiStatus: 'connecting', lastSyncedAt: null })

    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.queryByText(/belum diimplementasikan/)).toBeNull()
  })

  it('setelah sinkron (online) → placeholder normal dengan label modul', () => {
    renderWithStore(<ComingSoon />)

    expect(screen.queryAllByText(/belum diimplementasikan/).length).toBeGreaterThan(0)
    expect(document.querySelectorAll('.animate-pulse').length).toBe(0)
  })
})
