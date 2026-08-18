// @vitest-environment happy-dom
// Buku Besar mengikuti pola yang sama dengan halaman laporan: saat aplikasi
// masih menghubungkan ke API (apiStatus 'connecting'), useApiFetch belum fetch
// → skeleton tampil; begitu online, GET /ledger/accounts/:id dijalankan dan
// skeleton diganti data. ExportButtons memakai variant PER AKUN (accountId/
// accountCode/accountName) → klik export memanggil api.exportLedger, dan
// exportReport TIDAK boleh terpanggil.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { mockAccounts, mockJournals } from '../../data/mock'
import { useStore } from '../../store/useStore'
import { api } from '../../api'
import LedgerPage from './LedgerPage'

vi.mock('../../api', () => ({
  api: {
    getLedger: vi.fn(),
    exportLedger: vi.fn(),
    exportReport: vi.fn(),
  },
}))

const admin = { id: 'user-001', name: 'Rina', email: 'rina@estetikakreasi.co.id', role: 'admin' }

// Fixture respons server — baseline Maret akun 1-1100 Kas Besar: opening 60jt,
// closing 87jt, 4 entries (0001..0004).
const ledgerFixture = {
  accountId: '1-1100',
  accountCode: '1-1100',
  accountName: 'Kas Besar',
  period: '2026-03',
  openingBalance: 60_000_000,
  closingBalance: 87_000_000,
  entries: [
    { journalEntryId: 'JNL-2026-03-001', date: '2026-03-05', reference: 'BKM-2026-03-0001', description: 'Penerimaan jasa', debit: 25_000_000, credit: 0, balance: 85_000_000 },
    { journalEntryId: 'JNL-2026-03-002', date: '2026-03-07', reference: 'BKK-2026-03-0002', description: 'Pembayaran sewa', debit: 0, credit: 10_000_000, balance: 75_000_000 },
    { journalEntryId: 'JNL-2026-03-003', date: '2026-03-10', reference: 'BKK-2026-03-0003', description: 'Pembelian ATK', debit: 0, credit: 3_000_000, balance: 72_000_000 },
    { journalEntryId: 'JNL-2026-03-004', date: '2026-03-12', reference: 'BKM-2026-03-0004', description: 'Penerimaan piutang', debit: 15_000_000, credit: 0, balance: 87_000_000 },
  ],
}

beforeEach(() => {
  useStore.setState({
    apiStatus: 'connecting',
    lastSyncedAt: null,
    user: admin,
    accounts: mockAccounts,
    journals: mockJournals,
    toast: null,
  })
  vi.mocked(api.getLedger).mockReset()
  vi.mocked(api.exportLedger).mockReset()
  vi.mocked(api.exportReport).mockReset()
})

afterEach(() => {
  useStore.setState({ apiStatus: 'idle', user: null })
  cleanup()
})

describe('LedgerPage — ExportButtons variant per akun', () => {
  it('ExportButtons ter-render (PDF & XLSX) saat online, klik XLSX → exportLedger(1-1100, xlsx, 2026-03) + exportReport TIDAK dipanggil + toast', async () => {
    vi.mocked(api.getLedger).mockResolvedValue(ledgerFixture as any)
    vi.mocked(api.exportLedger).mockResolvedValue('Buku-Besar-1-1100-2026-03.xlsx')
    useStore.setState({ apiStatus: 'online', lastSyncedAt: '2026-08-16T00:00:00Z' })
    render(<LedgerPage />)
    // Data termuat (skeleton diganti) — Saldo Akhir tampil di kartu & baris tabel
    await screen.findAllByText('Rp 87.000.000', { exact: true })

    expect(screen.getByRole('button', { name: 'Export PDF' })).toHaveProperty('disabled', false)
    expect(screen.getByRole('button', { name: 'Export XLSX' })).toHaveProperty('disabled', false)

    fireEvent.click(screen.getByRole('button', { name: 'Export XLSX' }))

    await waitFor(() =>
      expect(api.exportLedger).toHaveBeenCalledWith('1-1100', '1-1100', 'xlsx', '2026-03', undefined),
    )
    expect(api.exportReport).not.toHaveBeenCalled() // variant per akun, bukan laporan
    await waitFor(() => {
      const t = useStore.getState().toast
      expect(t?.kind).toBe('success')
      expect(t?.message).toContain('Buku-Besar-1-1100-2026-03.xlsx')
    })
  })

  it('dengan rentang custom diisi → exportLedger dipanggil dengan range {start,end} (bukan period bulanan)', async () => {
    vi.mocked(api.getLedger).mockResolvedValue(ledgerFixture as any)
    vi.mocked(api.exportLedger).mockResolvedValue('Buku-Besar-1-1100-2026-03-06..2026-03-11.xlsx')
    useStore.setState({ apiStatus: 'online', lastSyncedAt: '2026-08-16T00:00:00Z' })
    render(<LedgerPage />)
    await screen.findAllByText('Rp 87.000.000', { exact: true })

    fireEvent.change(screen.getByLabelText('Tanggal mulai export'), { target: { value: '2026-03-06' } })
    fireEvent.change(screen.getByLabelText('Tanggal akhir export'), { target: { value: '2026-03-11' } })

    fireEvent.click(screen.getByRole('button', { name: 'Export XLSX' }))

    await waitFor(() =>
      expect(api.exportLedger).toHaveBeenCalledWith('1-1100', '1-1100', 'xlsx', '2026-03', {
        start: '2026-03-06',
        end: '2026-03-11',
      }),
    )
    expect(api.exportReport).not.toHaveBeenCalled()
    await waitFor(() => {
      const t = useStore.getState().toast
      expect(t?.kind).toBe('success')
      expect(t?.message).toContain('Buku-Besar-1-1100-2026-03-06..2026-03-11.xlsx')
    })
  })
})

describe('LedgerPage — skeleton saat connecting, diganti data', () => {
  it('connecting → skeleton tampil, API belum dipanggil, belum ada isi tabel', () => {
    useStore.setState({ apiStatus: 'connecting' })
    render(<LedgerPage />)

    expect(screen.getByLabelText('Pilih akun')).not.toBeNull()
    // Skeleton hadir (SkeletonTable & SkeletonLines) — asersi via class container
    expect(document.querySelector('.animate-pulse')).not.toBeNull()
    expect(api.getLedger).not.toHaveBeenCalled()
  })

  it('online → data menggantikan skeleton: Saldo Awal 60jt & Saldo Akhir 87jt tampil', async () => {
    vi.mocked(api.getLedger).mockResolvedValue(ledgerFixture as any)
    useStore.setState({ apiStatus: 'online', lastSyncedAt: '2026-08-16T00:00:00Z' })
    render(<LedgerPage />)

    await screen.findAllByText('Saldo Awal', { exact: true })
    await screen.findAllByText('Rp 87.000.000', { exact: true })
    await screen.findAllByText('Rp 60.000.000', { exact: true })
    expect(api.getLedger).toHaveBeenCalledWith('1-1100', '2026-03', undefined)
  })
})
