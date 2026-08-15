// @vitest-environment happy-dom
// Test notifikasi approval di TopBar: badge jumlah jurnal menunggu approval di
// tombol lonceng, dropdown daftarnya, klik item → navigasi ke Jurnal dengan
// fokus (detail terbuka), dan state kosong.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { mockAccounts, mockJournals } from '../data/mock'
import { useStore } from '../store/useStore'
import TopBar from './TopBar'

const admin = { id: 'user-001', name: 'Rina', email: 'rina@estetikakreasi.co.id', role: 'admin' }

// Dua jurnal menunggu approval (tidak ada di seed — dibuat untuk test)
const pendingA = {
  ...mockJournals[0],
  id: 'JNL-2026-03-012',
  transactionNumber: 'BKK-2026-03-0011',
  date: '2026-03-26',
  description: 'Pembelian ATK — menunggu approval',
  status: 'pending-approval' as const,
}
const pendingB = {
  ...mockJournals[1],
  id: 'JNL-2026-03-013',
  transactionNumber: 'BKM-2026-03-0012',
  date: '2026-03-27',
  description: 'Penerimaan jasa — menunggu approval',
  status: 'pending-approval' as const,
}

beforeEach(() => {
  useStore.setState({
    apiStatus: 'offline',
    user: admin,
    accounts: mockAccounts,
    journals: [pendingA, pendingB],
    page: 'dashboard',
    focusJournalId: null,
    focusAccountId: null,
    toast: null,
  })
})

afterEach(() => {
  useStore.setState({ apiStatus: 'idle', user: null, focusJournalId: null, focusAccountId: null })
  cleanup()
})

describe('TopBar — notifikasi jurnal menunggu approval', () => {
  it('badge menampilkan jumlah jurnal menunggu approval (2) dan label aksesibilitas memuat hitungan', () => {
    render(<TopBar />)

    const bell = screen.getByRole('button', { name: /Notifikasi — 2 jurnal menunggu approval/ })
    expect(bell).toBeTruthy()
    expect(screen.getAllByText('2').length).toBeGreaterThan(0) // badge lonceng + pill header
  })

  it('tanpa jurnal menunggu approval → badge TIDAK dirender', () => {
    useStore.setState({ journals: mockJournals }) // seed tanpa pending-approval
    render(<TopBar />)

    const bell = screen.getByRole('button', { name: /Notifikasi — 0 jurnal menunggu approval/ })
    expect(bell.querySelector('.bg-bad')).toBeNull()
  })

  it('klik lonceng → dropdown menampilkan daftar jurnal menunggu approval (no. bukti + deskripsi)', () => {
    render(<TopBar />)

    fireEvent.click(screen.getByRole('button', { name: /Notifikasi/ }))

    expect(screen.getByText('Menunggu Approval')).toBeTruthy()
    expect(screen.getByText('BKK-2026-03-0011')).toBeTruthy()
    expect(screen.getByText('Pembelian ATK — menunggu approval')).toBeTruthy()
    expect(screen.getByText('BKM-2026-03-0012')).toBeTruthy()
    expect(screen.getByText('Penerimaan jasa — menunggu approval')).toBeTruthy()
  })

  it('klik item daftar → navigasi ke halaman Jurnal + fokus jurnal tsb + dropdown tertutup', () => {
    render(<TopBar />)

    fireEvent.click(screen.getByRole('button', { name: /Notifikasi/ }))
    fireEvent.click(screen.getByText('BKK-2026-03-0011'))

    const s = useStore.getState()
    expect(s.page).toBe('journal')
    expect(s.focusJournalId).toBe('JNL-2026-03-012')
    // Dropdown tertutup kembali
    expect(screen.queryByText('Menunggu Approval')).toBeNull()
  })

  it('daftar kosong → pesan "Tidak ada jurnal menunggu approval"', () => {
    useStore.setState({ journals: mockJournals })
    render(<TopBar />)

    fireEvent.click(screen.getByRole('button', { name: /Notifikasi/ }))

    expect(screen.getByText(/Tidak ada jurnal menunggu approval/)).toBeTruthy()
  })
})
