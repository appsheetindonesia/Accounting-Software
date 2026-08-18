// @vitest-environment happy-dom
// Test komponen — render tombol Export PDF/XLSX, klik memanggil api
// (exportReport / exportLedger) + feedback toast, nonaktif saat offline.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { api } from '../../api'
import { useStore } from '../../store/useStore'
import ExportButtons from './ExportButtons'

vi.mock('../../api', () => ({
  ApiError: class ApiError extends Error {},
  isNetworkError: (e: unknown) => e instanceof TypeError,
  toJournalEntry: (j: any) => j,
  api: {
    exportReport: vi.fn(),
    exportLedger: vi.fn(),
  },
}))

const mockedApi = vi.mocked(api)

beforeEach(() => {
  useStore.setState({ apiStatus: 'online', toast: null })
  mockedApi.exportReport.mockReset()
  mockedApi.exportLedger.mockReset()
})

afterEach(() => {
  useStore.setState({ apiStatus: 'idle', toast: null })
  cleanup()
})

describe('ExportButtons — tombol Export PDF/XLSX', () => {
  it('merender dua tombol; nonaktif saat offline, aktif saat online', () => {
    const { getByRole } = render(<ExportButtons reportType="income-statement" period="2026-03" />)
    const pdf = getByRole('button', { name: 'Export PDF' })
    const xlsx = getByRole('button', { name: 'Export XLSX' })
    expect(pdf).toHaveProperty('disabled', false)
    expect(xlsx).toHaveProperty('disabled', false)

    act(() => useStore.setState({ apiStatus: 'offline' }))
    expect(pdf).toHaveProperty('disabled', true)
    expect(xlsx).toHaveProperty('disabled', true)
  })

  it('variant laporan: klik Export PDF → api.exportReport(reportType, pdf, period) + toast sukses', async () => {
    mockedApi.exportReport.mockResolvedValue('Laba-Rugi-2026-03.pdf')
    const { getByRole } = render(<ExportButtons reportType="income-statement" period="2026-03" />)

    fireEvent.click(getByRole('button', { name: 'Export PDF' }))

    await waitFor(() => expect(mockedApi.exportReport).toHaveBeenCalledWith('income-statement', 'pdf', '2026-03'))
    await waitFor(() => {
      const t = useStore.getState().toast
      expect(t?.kind).toBe('success')
      expect(t?.message).toContain('Laba-Rugi-2026-03.pdf')
    })
    expect(mockedApi.exportLedger).not.toHaveBeenCalled()
  })

  it('variant Buku Besar per akun: klik Export XLSX → api.exportLedger(accountId, code, xlsx, period) + toast', async () => {
    mockedApi.exportLedger.mockResolvedValue('Buku-Besar-1-1100-2026-03.xlsx')
    const { getByRole } = render(
      <ExportButtons accountId="1-1100" accountCode="1-1100" accountName="Kas Besar" period="2026-03" />,
    )

    fireEvent.click(getByRole('button', { name: 'Export XLSX' }))

    await waitFor(() => expect(mockedApi.exportLedger).toHaveBeenCalledWith('1-1100', '1-1100', 'xlsx', '2026-03', undefined))
    await waitFor(() => {
      const t = useStore.getState().toast
      expect(t?.kind).toBe('success')
      expect(t?.message).toContain('Buku-Besar-1-1100-2026-03.xlsx')
    })
    expect(mockedApi.exportReport).not.toHaveBeenCalled()
  })

  it('variant Buku Besar dengan rentang custom: range diteruskan ke api.exportLedger + filename berisi rentang', async () => {
    mockedApi.exportLedger.mockResolvedValue('Buku-Besar-1-1100-2026-03-01..2026-03-15.xlsx')
    const { getByRole } = render(
      <ExportButtons
        accountId="1-1100"
        accountCode="1-1100"
        accountName="Kas Besar"
        period="2026-03"
        range={{ start: '2026-03-01', end: '2026-03-15' }}
      />,
    )

    fireEvent.click(getByRole('button', { name: 'Export XLSX' }))

    await waitFor(() =>
      expect(mockedApi.exportLedger).toHaveBeenCalledWith('1-1100', '1-1100', 'xlsx', '2026-03', {
        start: '2026-03-01',
        end: '2026-03-15',
      }),
    )
    await waitFor(() => {
      const t = useStore.getState().toast
      expect(t?.kind).toBe('success')
      expect(t?.message).toContain('Buku-Besar-1-1100-2026-03-01..2026-03-15.xlsx')
    })
  })

  it('gagal export → toast error, tanpa crash', async () => {
    mockedApi.exportReport.mockRejectedValue(new Error('Export gagal — coba lagi'))
    const { getByRole } = render(<ExportButtons reportType="balance-sheet" period="2026-03" />)

    fireEvent.click(getByRole('button', { name: 'Export PDF' }))

    await waitFor(() => {
      const t = useStore.getState().toast
      expect(t?.kind).toBe('error')
      expect(t?.message).toContain('Export gagal')
    })
  })

  it('saat export berjalan (busy), kedua tombol nonaktif sampai selesai', async () => {
    let resolve!: (v: string) => void
    mockedApi.exportReport.mockReturnValue(new Promise<string>((r) => (resolve = r)))
    const { getByRole } = render(<ExportButtons reportType="trial-balance" period="2026-03" />)

    fireEvent.click(getByRole('button', { name: 'Export PDF' }))
    // Busy pdf → tombol pdf & xlsx nonaktif (cegah export ganda)
    expect(getByRole('button', { name: 'Export PDF' })).toHaveProperty('disabled', true)
    expect(getByRole('button', { name: 'Export XLSX' })).toHaveProperty('disabled', true)

    await act(async () => resolve('Neraca-Lajur-2026-03.pdf'))
    await waitFor(() => expect(getByRole('button', { name: 'Export PDF' })).toHaveProperty('disabled', false))
    expect(getByRole('button', { name: 'Export XLSX' })).toHaveProperty('disabled', false)
    expect(mockedApi.exportReport).toHaveBeenCalledTimes(1)
  })

  it('klik ganda cepat pada tombol yang SAMA (satu frame, satu batch) → export dipanggil SEKALI saja', async () => {
    let resolve!: (v: string) => void
    mockedApi.exportReport.mockReturnValue(new Promise<string>((r) => (resolve = r)))
    const { getByRole } = render(<ExportButtons reportType="income-statement" period="2026-03" />)
    const pdf = getByRole('button', { name: 'Export PDF' })

    // Dua klik dalam SATU batch act: React 18 mengelompokkan setState, jadi busy
    // state BELUM ter-render di antara kedua klik — guard tombol-disabled TIDAK
    // cukup. Hanya guard sinkron (ref) di dalam handler yang mencegah export ganda.
    await act(async () => {
      fireEvent.click(pdf)
      fireEvent.click(pdf)
    })

    expect(mockedApi.exportReport).toHaveBeenCalledTimes(1)
    await act(async () => resolve('Laba-Rugi-2026-03.pdf'))
    await waitFor(() => expect(getByRole('button', { name: 'Export PDF' })).toHaveProperty('disabled', false))
    // Cooldown 350ms (useActionGuard): klik ganda NYATA dblclick datang setelah
    // microtask selesai — klik dalam cooldown tetap ditolak (hanya 1 request)
    fireEvent.click(getByRole('button', { name: 'Export PDF' }))
    expect(mockedApi.exportReport).toHaveBeenCalledTimes(1) // masih dalam cooldown
    // Setelah cooldown habis → tombol dipakai lagi, klik berikutnya memicu export baru
    await new Promise((r) => setTimeout(r, 400))
    fireEvent.click(getByRole('button', { name: 'Export PDF' }))
    await waitFor(() => expect(mockedApi.exportReport).toHaveBeenCalledTimes(2))
  })

  it('klik saat offline → api TIDAK dipanggil', () => {
    useStore.setState({ apiStatus: 'offline' })
    const { getByRole } = render(<ExportButtons reportType="income-statement" period="2026-03" />)

    fireEvent.click(getByRole('button', { name: 'Export PDF' }))

    expect(mockedApi.exportReport).not.toHaveBeenCalled()
    expect(mockedApi.exportLedger).not.toHaveBeenCalled()
  })
})
