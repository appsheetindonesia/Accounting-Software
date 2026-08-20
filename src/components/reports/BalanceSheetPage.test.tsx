// @vitest-environment happy-dom
// Halaman Neraca mengikuti pola loading konsisten: saat aplikasi masih
// menghubungkan ke API (apiStatus 'connecting'), useApiFetch belum fetch →
// skeleton tampil; begitu online, GET /reports/balance-sheet dijalankan dan
// skeleton diganti data laporan.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { mockAccounts, mockJournals } from '../../data/mock'
import { useStore } from '../../store/useStore'
import { api } from '../../api'
import BalanceSheetPage from './BalanceSheetPage'

vi.mock('../../api', () => ({
  api: {
    getBalanceSheet: vi.fn(),
    exportReport: vi.fn(),
    exportLedger: vi.fn(),
  },
}))

const admin = { id: 'user-001', name: 'Rina', email: 'rina@estetikakreasi.co.id', role: 'admin' }

// Fixture respons server — baseline Maret: Aset 557 = Kewajiban 150 + Modal
// 363 + Laba Ditahan 44 → balanced. Nama baris 'Laba Ditahan (berjalan)'
// wajib agar halaman memisahkan retained earnings dari total K&E.
const bsFixture = {
  asOf: '2026-03-31',
  entity: { id: 'ent-001', name: 'PT. Kreasi Inovasi Estetika' },
  sections: [
    {
      title: 'ASET',
      subtotal: 557_000_000,
      lines: [
        { accountCode: '1-1100', accountName: 'Kas Besar', amount: 84_000_000, indentLevel: 1, isBold: false, isTotal: false },
        { accountCode: '1-1200', accountName: 'Bank BCA 123456', amount: 380_000_000, indentLevel: 1, isBold: false, isTotal: false },
      ],
    },
    {
      title: 'KEWAJIBAN & EKUITAS',
      subtotal: 557_000_000,
      lines: [
        { accountCode: '2-1000', accountName: 'Utang Usaha', amount: 150_000_000, indentLevel: 1, isBold: false, isTotal: false },
        { accountCode: '3-1000', accountName: 'Modal Pemilik', amount: 363_000_000, indentLevel: 1, isBold: false, isTotal: false },
        { accountCode: '', accountName: 'Laba Ditahan (berjalan)', amount: 44_000_000, indentLevel: 1, isBold: true, isTotal: false },
      ],
    },
  ],
  totalAssets: 557_000_000,
  totalLiabilitiesEquity: 557_000_000,
  isBalanced: true,
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
  vi.mocked(api.getBalanceSheet).mockReset()
  vi.mocked(api.exportReport).mockReset()
})

afterEach(() => {
  useStore.setState({ apiStatus: 'idle', user: null })
  cleanup()
})

describe('BalanceSheetPage — ExportButtons variant reportType', () => {
  it('ExportButtons ter-render (PDF & XLSX) saat online, klik PDF → exportReport(balance-sheet) + toast', async () => {
    vi.mocked(api.getBalanceSheet).mockResolvedValue(bsFixture as any)
    vi.mocked(api.exportReport).mockResolvedValue('Neraca-2026-03.pdf')
    useStore.setState({ apiStatus: 'online', lastSyncedAt: '2026-08-16T00:00:00Z' })
    render(<BalanceSheetPage />)
    await screen.findByText('✓ Seimbang (Aset = Kewajiban + Ekuitas)', { exact: true })

    expect(screen.getByRole('button', { name: 'Export PDF' })).toHaveProperty('disabled', false)
    expect(screen.getByRole('button', { name: 'Export XLSX' })).toHaveProperty('disabled', false)

    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }))

    await waitFor(() => expect(api.exportReport).toHaveBeenCalledWith('balance-sheet', 'pdf', '2026-03'))
    expect(api.exportLedger).not.toHaveBeenCalled() // variant laporan, bukan per akun
    await waitFor(() => {
      const t = useStore.getState().toast
      expect(t?.kind).toBe('success')
      expect(t?.message).toContain('Neraca-2026-03.pdf')
    })
  })
})

describe('BalanceSheetPage — skeleton saat connecting, diganti data', () => {
  it('connecting → skeleton tampil, API belum dipanggil, belum ada isi laporan', () => {
    render(<BalanceSheetPage />)

    expect(screen.getByText('Laporan Neraca')).toBeTruthy()
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(api.getBalanceSheet).not.toHaveBeenCalled() // belum siap → tidak fetch
    expect(screen.queryByText(/Seimbang/)).toBeNull()
  })

  it('online → skeleton diganti data API (seimbang + baris akun)', async () => {
    vi.mocked(api.getBalanceSheet).mockResolvedValue(bsFixture as any)
    render(<BalanceSheetPage />)
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)

    // Sinkron selesai → useApiFetch fetch + render data
    act(() => useStore.setState({ apiStatus: 'online', lastSyncedAt: '2026-08-16T00:00:00Z' }))
    expect(await screen.findByText('✓ Seimbang (Aset = Kewajiban + Ekuitas)', { exact: true })).toBeTruthy()
    expect(screen.getByText('Kas Besar')).toBeTruthy()
    expect(screen.getByText('Utang Usaha')).toBeTruthy()
    expect(screen.getAllByText('Rp 557.000.000', { exact: true }).length).toBeGreaterThan(0)
    expect(document.querySelectorAll('.animate-pulse').length).toBe(0)
  })

  it('refetch ganti entitas (entityRefetching) → skeleton tampil walau apiView ada, lalu data kembali', async () => {
    vi.mocked(api.getBalanceSheet).mockResolvedValue(bsFixture as any)
    useStore.setState({ apiStatus: 'online', lastSyncedAt: '2026-08-16T00:00:00Z', entityRefetching: false, activeEntityId: 'ent-001' })
    render(<BalanceSheetPage />)
    expect(await screen.findByText('✓ Seimbang (Aset = Kewajiban + Ekuitas)', { exact: true })).toBeTruthy()
    expect(document.querySelectorAll('.animate-pulse').length).toBe(0)

    // Refetch entitas berjalan → skeleton menggantikan konten entitas lama
    act(() => useStore.setState({ entityRefetching: true }))
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Seimbang/)).toBeNull()

    // Selesai → konten (refetch entitas baru, key berisi activeEntityId)
    act(() => useStore.setState({ entityRefetching: false }))
    expect(screen.getByText('✓ Seimbang (Aset = Kewajiban + Ekuitas)', { exact: true })).toBeTruthy()
    expect(document.querySelectorAll('.animate-pulse').length).toBe(0)
  })
})
