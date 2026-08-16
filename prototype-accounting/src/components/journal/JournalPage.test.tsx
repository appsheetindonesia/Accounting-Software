// @vitest-environment happy-dom
// Halaman Jurnal harus menghormati periode aktif: judul memakai label periode,
// daftar jurnal difilter per periode, dan periode tertutup ditandai (badge +
// tombol Buat Jurnal nonaktif) — konsisten dengan kontrak periode API (isOpen).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { mockAccounts, mockJournals } from '../../data/mock'
import { useStore } from '../../store/useStore'
import JournalPage from './JournalPage'

const admin = { id: 'user-001', name: 'Rina', email: 'rina@estetikakreasi.co.id', role: 'admin' }

const periods = [
  { id: 'fp-2026-01', name: 'Januari 2026', month: 1, year: 2026, startDate: '2026-01-01', endDate: '2026-01-31', isOpen: false, isActive: false, closedAt: '2026-02-01T00:00:00Z' },
  { id: 'fp-2026-02', name: 'Februari 2026', month: 2, year: 2026, startDate: '2026-02-01', endDate: '2026-02-28', isOpen: false, isActive: false, closedAt: '2026-03-01T00:00:00Z' },
  { id: 'fp-2026-03', name: 'Maret 2026', month: 3, year: 2026, startDate: '2026-03-01', endDate: '2026-03-31', isOpen: true, isActive: true, closedAt: null },
] as const

// Jurnal Maret (seed base) + satu jurnal di periode lain (harus tersaring)
const janJournal = {
  ...mockJournals[0],
  id: 'JNL-2026-01-001',
  transactionNumber: 'BKM-2026-01-0001',
  date: '2026-01-05',
  description: 'Jurnal Januari (bukan periode aktif)',
  lines: mockJournals[0].lines.map((l) => ({ ...l, description: 'Jurnal Januari (bukan periode aktif)' })),
}

beforeEach(() => {
  useStore.setState({
    apiStatus: 'online',
    user: admin,
    accounts: mockAccounts,
    journals: [...mockJournals, janJournal as any],
    periods: periods as any,
    activePeriod: '2026-03',
    journalFilter: null,
    focusJournalId: null,
    toast: null,
  })
})

afterEach(() => {
  useStore.setState({ apiStatus: 'idle', user: null, periods: [] as any, journalFilter: null, focusJournalId: null })
  cleanup()
})

describe('JournalPage — periode aktif & status tertutup', () => {
  it('judul memakai label periode aktif dan hanya menampilkan jurnal periode itu', () => {
    render(<JournalPage />)

    expect(screen.getByText(/Maret 2026 ·/)).toBeTruthy()
    // Jurnal Januari (BKM-2026-01-0001) TIDAK tampil di periode Maret
    expect(screen.queryByText('BKM-2026-01-0001')).toBeNull()
    // Hitungan hanya jurnal Maret
    expect(screen.getByText(/Maret 2026 · \d+ entri jurnal/)).toBeTruthy()
  })

  it('periode Maret terbuka → tidak ada badge tertutup, tombol Buat Jurnal aktif', () => {
    render(<JournalPage />)

    expect(screen.queryByText(/Periode tertutup/)).toBeNull()
    const btn = screen.getByRole('button', { name: 'Buat Jurnal' })
    expect(btn).toHaveProperty('disabled', false)
  })

  it('periode Januari (tertutup) → badge "Periode tertutup" + tombol Buat Jurnal nonaktif', () => {
    useStore.setState({ activePeriod: '2026-01' })
    render(<JournalPage />)

    expect(screen.getByText(/Januari 2026 ·/)).toBeTruthy()
    expect(screen.getByText(/Periode tertutup/)).toBeTruthy()
    const btn = screen.getByRole('button', { name: /Buat Jurnal/ })
    expect(btn).toHaveProperty('disabled', true)
    // Jurnal Januari kini tampil (periode aktif), jurnal Maret tersaring
    expect(screen.getByText('BKM-2026-01-0001')).toBeTruthy()
    expect(screen.queryByText('BKM-2026-03-0001')).toBeNull()
  })

  it('periode belum termuat (offline) → diperlakukan terbuka agar demo tetap jalan', () => {
    useStore.setState({ periods: [] as any, activePeriod: '2026-03' })
    render(<JournalPage />)

    // Fallback label dari id periode + tanpa badge tertutup
    expect(screen.getByText(/Maret 2026 ·/)).toBeTruthy()
    expect(screen.queryByText(/Periode tertutup/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Buat Jurnal' })).toHaveProperty('disabled', false)
  })

  it('state connecting → skeleton tampil, lalu diganti data saat sinkron selesai', () => {
    // Awal: aplikasi masih menghubungkan ke API (belum pernah sinkron)
    useStore.setState({ apiStatus: 'connecting', lastSyncedAt: null })
    render(<JournalPage />)

    // Skeleton konsisten (animate-pulse), daftar jurnal belum dirender
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.queryByText('BKM-2026-03-0001')).toBeNull()

    // Sinkron selesai → skeleton diganti data jurnal dari store
    act(() => useStore.setState({ apiStatus: 'online', lastSyncedAt: '2026-08-16T00:00:00Z' }))
    expect(screen.getByText('BKM-2026-03-0001')).toBeTruthy()
    expect(screen.getByText(/Maret 2026 · \d+ entri jurnal/)).toBeTruthy()
    expect(document.querySelectorAll('.animate-pulse').length).toBe(0)
  })

  it('dibuka dari dropdown notifikasi → filter Menunggu Approval diterapkan + flag dibersihkan', () => {
    const pendingJournal = {
      ...mockJournals[0],
      id: 'JNL-2026-03-020',
      transactionNumber: 'BKM-2026-03-0020',
      date: '2026-03-28',
      description: 'Menunggu approval dari notifikasi',
      status: 'pending-approval' as const,
    }
    // Persis apa yang dilakukan openPendingApproval saat item notifikasi diklik
    useStore.setState({
      journals: [...mockJournals, pendingJournal as any],
      journalFilter: 'pending-approval',
      focusJournalId: pendingJournal.id,
    })
    render(<JournalPage />)

    // Hanya jurnal Menunggu Approval yang tampil — jurnal posted/draft tersaring
    expect(screen.getByText('BKM-2026-03-0020')).toBeTruthy()
    expect(screen.queryByText('BKM-2026-03-0001')).toBeNull()
    expect(screen.queryByText('BKM-2026-03-0002')).toBeNull()
    // Select Status = Menunggu Approval; flag transient sudah dibersihkan
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('pending-approval')
    expect(useStore.getState().journalFilter).toBeNull()
  })

  it('dibuka dari global search (tanpa journalFilter) → filter default Semua, jurnal target tidak tersaring', () => {
    useStore.setState({ focusJournalId: 'JNL-2026-03-001' })
    render(<JournalPage />)

    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('all')
    expect(screen.getByText('BKM-2026-03-0001')).toBeTruthy()
    expect(useStore.getState().journalFilter).toBeNull()
  })

  it('refetch ganti entitas (entityRefetching) → skeleton tampil walau sudah pernah sinkron, lalu data', () => {
    // Sudah pernah sinkron — tanpa entityRefetching, data langsung tampil
    useStore.setState({ apiStatus: 'online', lastSyncedAt: '2026-08-16T00:00:00Z', entityRefetching: false })
    render(<JournalPage />)
    expect(screen.getByText('BKM-2026-03-0001')).toBeTruthy()

    // Ganti entitas: refetch sedang berjalan → data lama diganti skeleton
    act(() => useStore.setState({ entityRefetching: true }))
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.queryByText('BKM-2026-03-0001')).toBeNull()

    // Refetch selesai → skeleton hilang, data entitas baru tampil
    act(() => useStore.setState({ entityRefetching: false }))
    expect(screen.getByText('BKM-2026-03-0001')).toBeTruthy()
    expect(document.querySelectorAll('.animate-pulse').length).toBe(0)
  })
})
