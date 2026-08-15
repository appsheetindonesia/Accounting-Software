// @vitest-environment happy-dom
// Test komponen Jurnal Terbaru (Dashboard): badge rejectionReason tampil saat
// jurnal ditolak, tidak tampil saat tidak ada alasan.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { mockAccounts, mockJournals } from '../../data/mock'
import { useStore } from '../../store/useStore'
import RecentJournals from './RecentJournals'

vi.mock('../../api', () => ({
  ApiError: class ApiError extends Error {},
  isNetworkError: (e: unknown) => e instanceof TypeError,
  toJournalEntry: (j: any) => j,
  api: { getDashboardRecent: vi.fn() },
}))

import { api } from '../../api'

const mockedApi = vi.mocked(api)

// Jurnal ditolak: status kembali draft + rejectionReason terisi (mirror server).
// Tanggal paling baru agar masuk 5 besar "Jurnal Terbaru".
const rejectedJournal = {
  ...mockJournals[0],
  id: 'JNL-2026-03-011',
  transactionNumber: 'BKM-2026-03-0010',
  date: '2026-03-25',
  description: 'Penerimaan jasa — ditolak',
  status: 'draft' as const,
  rejectionReason: 'Nomor bukti tidak valid',
}

// 5 jurnal terbaru sesuai urutan sort RecentJournals (fallback offline)
const topRecent = (list: typeof mockJournals) =>
  [...list]
    .sort((a, b) => b.date.localeCompare(a.date) || b.transactionNumber.localeCompare(a.transactionNumber))
    .slice(0, 5)

beforeEach(() => {
  useStore.setState({
    apiStatus: 'offline', // fallback ke data store (localRecent)
    accounts: mockAccounts,
    journals: [rejectedJournal, ...mockJournals],
  })
  mockedApi.getDashboardRecent.mockRejectedValue(new TypeError('fetch failed'))
})

afterEach(() => {
  useStore.setState({ apiStatus: 'idle' })
  cleanup()
})

describe('RecentJournals — Jurnal Terbaru di Dashboard', () => {
  it('menampilkan badge rejectionReason pada jurnal yang ditolak', async () => {
    render(<RecentJournals />)

    const badge = await screen.findByText(/Ditolak — Nomor bukti tidak valid/)
    expect(badge).toBeTruthy()
    // Jurnal tanpa rejectionReason TIDAK menampilkan badge
    expect(screen.queryAllByText(/Ditolak —/)).toHaveLength(1)
  })

  it('tanpa rejectionReason → tidak ada badge, daftar tetap normal', async () => {
    useStore.setState({ journals: mockJournals })
    render(<RecentJournals />)

    // Tunggu render fallback offline selesai (deskripsi jurnal terbaru tampil)
    await screen.findByText(topRecent(mockJournals)[0].description)
    expect(screen.queryAllByText(/Ditolak —/)).toHaveLength(0)
  })
})
