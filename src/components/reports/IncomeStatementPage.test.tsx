// @vitest-environment happy-dom
// Halaman Laba Rugi mengikuti pola loading konsisten: saat apiStatus
// 'connecting', useApiFetch belum fetch → skeleton; begitu online,
// GET /reports/income-statement dijalankan dan skeleton diganti data.
// ExportButtons ter-render dengan variant reportType='income-statement'
// dan klik export memanggil api.exportReport dengan reportType yang benar.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { mockAccounts, mockJournals } from '../../data/mock'
import { useStore } from '../../store/useStore'
import { api } from '../../api'
import IncomeStatementPage from './IncomeStatementPage'

vi.mock('../../api', () => ({
  api: {
    getIncomeStatement: vi.fn(),
    exportReport: vi.fn(),
    exportLedger: vi.fn(),
  },
}))

const admin = { id: 'user-001', name: 'Rina', email: 'rina@estetikakreasi.co.id', role: 'admin' }

// Fixture respons server — baseline Maret: Pendapatan 155jt, Beban 111jt,
// Laba Bersih 44jt. Baris isTotal ('Total Pendapatan'/'Total Beban') di-filter
// halaman; subtotal memakai subtotal section.
const isFixture = {
  id: 'RPT-2026-03-001',
  type: 'income-statement',
  sections: [
    {
      title: 'PENDAPATAN',
      subtotal: 155_000_000,
      lines: [
        { accountCode: '4-1000', accountName: 'Pendapatan Jasa', amount: 155_000_000, indentLevel: 2, isBold: false, isTotal: false },
        { accountCode: '', accountName: 'Total Pendapatan', amount: 155_000_000, indentLevel: 1, isBold: true, isTotal: true },
      ],
    },
    {
      title: 'BEBAN',
      subtotal: 111_000_000,
      lines: [
        { accountCode: '5-1000', accountName: 'Beban Gaji', amount: 45_000_000, indentLevel: 2, isBold: false, isTotal: false },
        { accountCode: '5-3000', accountName: 'Beban Operasional', amount: 66_000_000, indentLevel: 2, isBold: false, isTotal: false },
        { accountCode: '', accountName: 'Total Beban', amount: 111_000_000, indentLevel: 1, isBold: true, isTotal: true },
      ],
    },
  ],
  netIncome: 44_000_000,
  entity: { id: 'ent-001', name: 'PT. Kreasi Inovasi Estetika' },
  period: { start: '2026-03-01', end: '2026-03-31' },
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
  vi.mocked(api.getIncomeStatement).mockReset()
  vi.mocked(api.exportReport).mockReset()
})

afterEach(() => {
  useStore.setState({ apiStatus: 'idle', user: null })
  cleanup()
})

describe('IncomeStatementPage — skeleton saat connecting, diganti data', () => {
  it('connecting → skeleton tampil, API belum dipanggil, belum ada isi laporan', () => {
    render(<IncomeStatementPage />)

    expect(screen.getByText('Laporan Laba Rugi')).toBeTruthy()
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(api.getIncomeStatement).not.toHaveBeenCalled() // belum siap → tidak fetch
    expect(screen.queryByText('Laba Bersih')).toBeNull()
  })

  it('online → skeleton diganti data API (pendapatan, beban, laba bersih)', async () => {
    vi.mocked(api.getIncomeStatement).mockResolvedValue(isFixture as any)
    render(<IncomeStatementPage />)
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)

    // Sinkron selesai → useApiFetch fetch + render data
    act(() => useStore.setState({ apiStatus: 'online', lastSyncedAt: '2026-08-16T00:00:00Z' }))
    expect(await screen.findByText('Pendapatan Jasa')).toBeTruthy()
    expect(screen.getByText('Beban Gaji')).toBeTruthy()
    expect(screen.getByText('Total PENDAPATAN')).toBeTruthy()
    expect(screen.getByText('Total BEBAN')).toBeTruthy()
    // Laba Bersih + nominal 44jt (sekali di footer laba)
    expect(screen.getByText('Laba Bersih')).toBeTruthy()
    expect(screen.getAllByText('Rp 44.000.000', { exact: true }).length).toBe(1)
    expect(document.querySelectorAll('.animate-pulse').length).toBe(0)
  })
})

describe('IncomeStatementPage — ExportButtons variant reportType', () => {
  it('ExportButtons ter-render (PDF & XLSX) saat online, klik PDF → exportReport(income-statement) + toast', async () => {
    vi.mocked(api.getIncomeStatement).mockResolvedValue(isFixture as any)
    vi.mocked(api.exportReport).mockResolvedValue('Laba-Rugi-2026-03.pdf')
    render(<IncomeStatementPage />)
    act(() => useStore.setState({ apiStatus: 'online', lastSyncedAt: '2026-08-16T00:00:00Z' }))
    await screen.findByText('Pendapatan Jasa')

    // Tombol export tersedia di header (variant laporan → reportType income-statement)
    expect(screen.getByRole('button', { name: 'Export PDF' })).toHaveProperty('disabled', false)
    expect(screen.getByRole('button', { name: 'Export XLSX' })).toHaveProperty('disabled', false)

    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }))

    await waitFor(() => expect(api.exportReport).toHaveBeenCalledWith('income-statement', 'pdf', '2026-03'))
    expect(api.exportLedger).not.toHaveBeenCalled() // variant laporan, bukan per akun
    await waitFor(() => {
      const t = useStore.getState().toast
      expect(t?.kind).toBe('success')
      expect(t?.message).toContain('Laba-Rugi-2026-03.pdf')
    })
  })

  it('klik Export XLSX → exportReport(income-statement, xlsx) dengan periode aktif', async () => {
    vi.mocked(api.getIncomeStatement).mockResolvedValue(isFixture as any)
    vi.mocked(api.exportReport).mockResolvedValue('Laba-Rugi-2026-03.xlsx')
    render(<IncomeStatementPage />)
    act(() => useStore.setState({ apiStatus: 'online', lastSyncedAt: '2026-08-16T00:00:00Z' }))
    await screen.findByText('Pendapatan Jasa')

    fireEvent.click(screen.getByRole('button', { name: 'Export XLSX' }))

    await waitFor(() => expect(api.exportReport).toHaveBeenCalledWith('income-statement', 'xlsx', '2026-03'))
  })
})
