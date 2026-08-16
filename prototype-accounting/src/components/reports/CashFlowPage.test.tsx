// @vitest-environment happy-dom
// Halaman Arus Kas mengikuti pola laporan lain: skeleton saat fetch pertama,
// data dari GET /reports/cash-flow, dan fallback offline ke data lokal.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { mockAccounts, mockJournals } from '../../data/mock'
import { useStore } from '../../store/useStore'
import { api } from '../../api'
import CashFlowPage from './CashFlowPage'

vi.mock('../../api', () => ({
  api: { getCashFlow: vi.fn() },
}))

const admin = { id: 'user-001', name: 'Rina', email: 'rina@estetikakreasi.co.id', role: 'admin' }

// Fixture respons server — baseline Maret (Kas 440 → 464jt, laba bersih 44jt)
const cashFlowFixture = {
  id: 'RPT-2026-03-003',
  type: 'cash-flow',
  period: { start: '2026-03-01', end: '2026-03-31' },
  sections: [
    {
      title: 'ARUS KAS DARI AKTIVITAS OPERASI',
      subtotal: 44_000_000,
      lines: [{ accountCode: '', accountName: 'Laba bersih', amount: 44_000_000, indentLevel: 1, isBold: false, isTotal: false }],
    },
    { title: 'ARUS KAS DARI AKTIVITAS INVESTASI', subtotal: 0, lines: [] },
    { title: 'ARUS KAS DARI AKTIVITAS PENDANAAN', subtotal: 0, lines: [] },
  ],
  netCashFlow: 24_000_000,
  beginningCash: 440_000_000,
  endingCash: 464_000_000,
}

beforeEach(() => {
  useStore.setState({
    apiStatus: 'online',
    user: admin,
    accounts: mockAccounts,
    journals: mockJournals,
    toast: null,
  })
  vi.mocked(api.getCashFlow).mockReset()
})

afterEach(() => {
  useStore.setState({ apiStatus: 'idle', user: null })
  cleanup()
})

describe('CashFlowPage — arus kas dengan skeleton & fallback', () => {
  it('skeleton tampil saat fetch pertama (loading), bukan konten kosong', () => {
    vi.mocked(api.getCashFlow).mockReturnValue(new Promise(() => {})) // pending selamanya
    render(<CashFlowPage />)

    expect(screen.getByText('Laporan Arus Kas')).toBeTruthy()
    // Skeleton (animate-pulse) konsisten dengan halaman laporan lain
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('data dari API dirender: section operasi, laba bersih, dan arus kas bersih', async () => {
    vi.mocked(api.getCashFlow).mockResolvedValue(cashFlowFixture as any)
    render(<CashFlowPage />)

    expect(await screen.findByText('ARUS KAS DARI AKTIVITAS OPERASI')).toBeTruthy()
    expect(screen.getByText('Laba bersih')).toBeTruthy()
    expect(screen.getByText('ARUS KAS DARI AKTIVITAS INVESTASI')).toBeTruthy()
    expect(screen.getByText('ARUS KAS DARI AKTIVITAS PENDANAAN')).toBeTruthy()
    // Ringkasan: net +24jt (prefix '+' dalam span yang sama), saldo awal → akhir
    expect(screen.getByText(/\+ Rp 24\.000\.000/)).toBeTruthy()
    expect(screen.getByText(/Saldo kas awal Rp 440.000.000 → akhir Rp 464.000.000/)).toBeTruthy()
    // Baris total section operasi
    expect(screen.getByText('Total ARUS KAS DARI AKTIVITAS OPERASI')).toBeTruthy()
  })

  it('offline → banner + fallback data lokal (angka tetap konsisten)', async () => {
    vi.mocked(api.getCashFlow).mockRejectedValue(new Error('server mati'))
    render(<CashFlowPage />)

    expect(await screen.findByText(/Mock API tidak terhubung/)).toBeTruthy()
    // Fallback lokal computeCashFlow: Maret baseline 440 → 464jt, net +24jt
    expect(screen.getByText(/\+ Rp 24\.000\.000/)).toBeTruthy()
    expect(screen.getByText('Laba bersih')).toBeTruthy()
    // Baris Laba bersih + baris Total section operasi sama-sama 44jt
    expect(screen.getAllByText('Rp 44.000.000', { exact: true }).length).toBeGreaterThan(0)
  })

  it('navigasi periode memanggil API dengan periode baru (Maret → Februari)', async () => {
    vi.mocked(api.getCashFlow).mockResolvedValue(cashFlowFixture as any)
    render(<CashFlowPage />)

    // Default Maret: net +24jt
    expect(await screen.findByText(/\+ Rp 24\.000\.000/)).toBeTruthy()
    // Satu klik ke belakang: Maret → Februari, API dipanggil dengan 2026-02
    await screen.getByRole('button', { name: 'Periode sebelumnya' }).click()
    expect(vi.mocked(api.getCashFlow)).toHaveBeenLastCalledWith('2026-02')
  })
})
