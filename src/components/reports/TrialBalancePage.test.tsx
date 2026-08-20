// @vitest-environment happy-dom
// Halaman Neraca Lajur mengikuti pola loading konsisten: saat apiStatus
// 'connecting', useApiFetch belum fetch → skeleton; begitu online,
// GET /reports/trial-balance dijalankan dan skeleton diganti data tabel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { mockAccounts, mockJournals } from '../../data/mock'
import { useStore } from '../../store/useStore'
import { api } from '../../api'
import TrialBalancePage from './TrialBalancePage'

vi.mock('../../api', () => ({
  api: {
    getTrialBalance: vi.fn(),
    exportReport: vi.fn(),
    exportLedger: vi.fn(),
  },
}))

const admin = { id: 'user-001', name: 'Rina', email: 'rina@estetikakreasi.co.id', role: 'admin' }

// Fixture respons server — baseline Maret: debit = kredit = 668jt, balanced
const tbFixture = {
  lines: [
    { accountId: '1-1100', accountCode: '1-1100', accountName: 'Kas Besar', debit: 84_000_000, credit: 0 },
    { accountCode: '4-1000', accountName: 'Pendapatan Jasa', debit: 0, credit: 155_000_000 },
  ],
  totals: { debit: 668_000_000, credit: 668_000_000, isBalanced: true },
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
  vi.mocked(api.getTrialBalance).mockReset()
  vi.mocked(api.exportReport).mockReset()
})

afterEach(() => {
  useStore.setState({ apiStatus: 'idle', user: null })
  cleanup()
})

describe('TrialBalancePage — ExportButtons variant reportType', () => {
  it('ExportButtons ter-render saat online, klik XLSX → exportReport(trial-balance) + toast', async () => {
    vi.mocked(api.getTrialBalance).mockResolvedValue(tbFixture as any)
    vi.mocked(api.exportReport).mockResolvedValue('Neraca-Lajur-2026-03.xlsx')
    useStore.setState({ apiStatus: 'online', lastSyncedAt: '2026-08-16T00:00:00Z' })
    render(<TrialBalancePage />)
    await screen.findByText('✓ Seimbang (Debit = Kredit)', { exact: true })

    expect(screen.getByRole('button', { name: 'Export PDF' })).toHaveProperty('disabled', false)
    expect(screen.getByRole('button', { name: 'Export XLSX' })).toHaveProperty('disabled', false)

    fireEvent.click(screen.getByRole('button', { name: 'Export XLSX' }))

    await waitFor(() => expect(api.exportReport).toHaveBeenCalledWith('trial-balance', 'xlsx', '2026-03'))
    expect(api.exportLedger).not.toHaveBeenCalled() // variant laporan, bukan per akun
    await waitFor(() => {
      const t = useStore.getState().toast
      expect(t?.kind).toBe('success')
      expect(t?.message).toContain('Neraca-Lajur-2026-03.xlsx')
    })
  })
})

describe('TrialBalancePage — skeleton saat connecting, diganti data', () => {
  it('connecting → skeleton tampil, API belum dipanggil, belum ada isi tabel', () => {
    render(<TrialBalancePage />)

    expect(screen.getByText('Neraca Lajur')).toBeTruthy()
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(api.getTrialBalance).not.toHaveBeenCalled() // belum siap → tidak fetch
    expect(screen.queryByText(/Seimbang/)).toBeNull()
  })

  it('online → skeleton diganti data API (seimbang + baris akun)', async () => {
    vi.mocked(api.getTrialBalance).mockResolvedValue(tbFixture as any)
    render(<TrialBalancePage />)
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)

    // Sinkron selesai → useApiFetch fetch + render data
    act(() => useStore.setState({ apiStatus: 'online', lastSyncedAt: '2026-08-16T00:00:00Z' }))
    expect(await screen.findByText('✓ Seimbang (Debit = Kredit)', { exact: true })).toBeTruthy()
    expect(screen.getByText('Kas Besar')).toBeTruthy()
    expect(screen.getByText('Pendapatan Jasa')).toBeTruthy()
    // Total debit & kredit (dua sel) + baris footer 'Total · Seimbang'
    expect(screen.getAllByText('Rp 668.000.000', { exact: true }).length).toBe(2)
    expect(screen.getByText('Total · Seimbang')).toBeTruthy()
    expect(document.querySelectorAll('.animate-pulse').length).toBe(0)
  })

  it('refetch ganti entitas (entityRefetching) → skeleton tampil walau apiView ada, lalu data kembali', async () => {
    vi.mocked(api.getTrialBalance).mockResolvedValue(tbFixture as any)
    useStore.setState({ apiStatus: 'online', lastSyncedAt: '2026-08-16T00:00:00Z', entityRefetching: false, activeEntityId: 'ent-001' })
    render(<TrialBalancePage />)
    expect(await screen.findByText('✓ Seimbang (Debit = Kredit)', { exact: true })).toBeTruthy()
    expect(document.querySelectorAll('.animate-pulse').length).toBe(0)

    // Refetch entitas berjalan → skeleton menggantikan konten entitas lama
    act(() => useStore.setState({ entityRefetching: true }))
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Seimbang/)).toBeNull()

    // Selesai → konten (refetch entitas baru, key berisi activeEntityId)
    act(() => useStore.setState({ entityRefetching: false }))
    expect(screen.getByText('✓ Seimbang (Debit = Kredit)', { exact: true })).toBeTruthy()
    expect(document.querySelectorAll('.animate-pulse').length).toBe(0)
  })
})
