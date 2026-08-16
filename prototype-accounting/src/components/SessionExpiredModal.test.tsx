// @vitest-environment happy-dom
// Test modal "Sesi berakhir": muncul saat sessionExpired = true (refresh gagal),
// menampilkan judul/pesan, dan tombol/overlay menutup modal.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useStore } from '../store/useStore'
import SessionExpiredModal from './SessionExpiredModal'

beforeEach(() => {
  useStore.setState({ sessionExpired: false, accessToken: null })
})

afterEach(() => {
  useStore.setState({ sessionExpired: false })
  cleanup()
})

describe('SessionExpiredModal — refresh gagal → pemberitahuan eksplisit', () => {
  it('TIDAK dirender saat sesi normal (sessionExpired = false)', () => {
    render(<SessionExpiredModal />)
    expect(screen.queryByRole('dialog', { name: 'Sesi berakhir' })).toBeNull()
  })

  it('muncul saat sessionExpired = true dengan judul + pesan', () => {
    useStore.setState({ sessionExpired: true })
    render(<SessionExpiredModal />)

    const dialog = screen.getByRole('dialog', { name: 'Sesi berakhir' })
    expect(dialog).toBeTruthy()
    expect(screen.getByText('Sesi Berakhir')).toBeTruthy()
    expect(screen.getByText(/Anda telah keluar otomatis/)).toBeTruthy()
    expect(screen.getByText(/refresh token kedaluwarsa atau tidak valid/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Masuk kembali' })).toBeTruthy()
  })

  it('tombol \"Masuk kembali\" menutup modal (sessionExpired → false)', () => {
    useStore.setState({ sessionExpired: true })
    render(<SessionExpiredModal />)

    fireEvent.click(screen.getByRole('button', { name: 'Masuk kembali' }))

    expect(useStore.getState().sessionExpired).toBe(false)
    expect(screen.queryByRole('dialog', { name: 'Sesi berakhir' })).toBeNull()
  })

  it('klik overlay juga menutup modal', () => {
    useStore.setState({ sessionExpired: true })
    render(<SessionExpiredModal />)

    fireEvent.click(screen.getByRole('dialog', { name: 'Sesi berakhir' }))

    expect(useStore.getState().sessionExpired).toBe(false)
  })
})
