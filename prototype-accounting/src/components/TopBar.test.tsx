// @vitest-environment happy-dom
// Test notifikasi approval di TopBar: badge jumlah jurnal menunggu approval di
// tombol lonceng, dropdown daftarnya, klik item → navigasi ke Jurnal dengan
// fokus (detail terbuka), tombol Setujui inline (approve tanpa pindah halaman),
// dan state kosong.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { mockAccounts, mockJournals } from '../data/mock'
import { useStore } from '../store/useStore'
import TopBar from './TopBar'

const admin = { id: 'user-001', name: 'Rina', email: 'rina@estetikakreasi.co.id', role: 'admin' }
const viewer = { id: 'user-003', name: 'Budi', email: 'budi@estetikakreasi.co.id', role: 'viewer' }

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
    journalFilter: null,
    toast: null,
  })
})

afterEach(() => {
  useStore.setState({ apiStatus: 'idle', user: null, focusJournalId: null, focusAccountId: null, journalFilter: null })
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

  it('klik item daftar → navigasi ke halaman Jurnal + fokus + filter Menunggu Approval + dropdown tertutup', () => {
    render(<TopBar />)

    fireEvent.click(screen.getByRole('button', { name: /Notifikasi/ }))
    fireEvent.click(screen.getByText('BKK-2026-03-0011'))

    const s = useStore.getState()
    expect(s.page).toBe('journal')
    expect(s.focusJournalId).toBe('JNL-2026-03-012')
    // Halaman Jurnal terbuka dengan filter status Menunggu Approval
    expect(s.journalFilter).toBe('pending-approval')
    // Dropdown tertutup kembali
    expect(screen.queryByText('Menunggu Approval')).toBeNull()
  })

  it('admin melihat tombol Setujui INLINE di item dropdown; klik → posted + toast, tanpa navigasi', async () => {
    render(<TopBar />)

    fireEvent.click(screen.getByRole('button', { name: /Notifikasi/ }))
    const btn = screen.getByRole('button', { name: 'Setujui BKK-2026-03-0011' })
    expect(btn).toHaveProperty('disabled', false)

    fireEvent.click(btn)
    await act(async () => {}) // approveJournal async → tunggu microtask

    const s = useStore.getState()
    // Status berubah posted tanpa navigasi (tetap di halaman saat ini)
    const approved = s.journals.find((j) => j.id === 'JNL-2026-03-012')
    expect(approved?.status).toBe('posted')
    expect(approved?.postedAt).toBeTruthy()
    expect(s.toast?.kind).toBe('success')
    expect(s.page).toBe('dashboard') // tidak pindah halaman
    // Item sudah di-approve → hilang dari dropdown, item lain tetap ada
    expect(screen.queryByText('BKK-2026-03-0011')).toBeNull()
    expect(screen.getByText('BKM-2026-03-0012')).toBeTruthy()
  })

  it('viewer TIDAK melihat tombol Setujui di dropdown (tanpa izin approve)', () => {
    useStore.setState({ user: viewer })
    render(<TopBar />)

    fireEvent.click(screen.getByRole('button', { name: /Notifikasi/ }))

    expect(screen.getByText('BKK-2026-03-0011')).toBeTruthy() // item tetap tampil
    expect(screen.queryByRole('button', { name: /Setujui/ })).toBeNull()
  })

  it('daftar kosong → pesan "Tidak ada jurnal menunggu approval"', () => {
    useStore.setState({ journals: mockJournals })
    render(<TopBar />)

    fireEvent.click(screen.getByRole('button', { name: /Notifikasi/ }))

    expect(screen.getByText(/Tidak ada jurnal menunggu approval/)).toBeTruthy()
  })
})
