// @vitest-environment happy-dom
// Test komponen Periode Fiskal (Pengaturan): dialog pilihan aksi draft muncul
// saat server 422 DRAFT_ACTION_REQUIRED, pilihan aksi → retry dengan
// confirmDraftAction, toast sukses/gagal, dan tombol Batal tanpa retry.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { api, ApiError, type PeriodInfo } from '../api'
import { useStore } from '../store/useStore'
import { renderWithStore, resetStoreState } from '../test/helpers'
import PeriodSettings from './PeriodSettings'

vi.mock('../api', () => {
  class ApiError extends Error {
    status: number
    code: string
    constructor(status: number, code: string, message: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.code = code
    }
  }
  return {
    ApiError,
    isNetworkError: (e: unknown) => e instanceof TypeError,
    toJournalEntry: (j: any) => j,
    api: {
      getPeriods: vi.fn(),
      closePeriod: vi.fn(),
      getJournals: vi.fn(),
    },
  }
})

const mockedApi = vi.mocked(api)

const openPeriod: PeriodInfo = {
  id: 'fp-2026-03',
  name: 'Maret 2026',
  month: 3,
  year: 2026,
  startDate: '2026-03-01',
  endDate: '2026-03-31',
  isOpen: true,
  isActive: true,
  closedAt: null,
}

const closedPeriod: PeriodInfo = {
  ...openPeriod,
  isOpen: false,
  isActive: false,
  closedAt: '2026-08-16T00:00:00Z',
}

beforeEach(() => {
  mockedApi.getPeriods.mockReset()
  mockedApi.closePeriod.mockReset()
  mockedApi.getJournals.mockReset()
  mockedApi.getJournals.mockResolvedValue({ journals: [], totals: { debit: 0, credit: 0, difference: 0 } })
})

afterEach(() => resetStoreState())

describe('PeriodSettings — tutup periode & dialog DRAFT_ACTION_REQUIRED', () => {
  it('draft tersisa → DRAFT_ACTION_REQUIRED → dialog pilihan aksi muncul (default post-all); closePeriod tanpa aksi', async () => {
    mockedApi.getPeriods.mockResolvedValue({ periods: [openPeriod] })
    mockedApi.closePeriod.mockRejectedValue(
      new ApiError(422, 'DRAFT_ACTION_REQUIRED', 'Masih ada jurnal draft; pilih aksi terlebih dahulu'),
    )
    renderWithStore(<PeriodSettings />, { periods: [openPeriod] })

    fireEvent.click(await screen.findByRole('button', { name: 'Tutup periode Maret 2026' }))

    await waitFor(() => expect(mockedApi.closePeriod).toHaveBeenCalledWith('fp-2026-03', undefined))
    const dialog = await screen.findByRole('dialog', { name: 'Tutup periode' })
    expect(dialog).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Tutup periode Maret 2026' })).toBeTruthy()
    // Ketiga pilihan aksi tersedia, default = post-all
    const postAll = screen.getByRole('radio', { name: /Posting semua draft/ })
    expect(postAll).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Pertahankan draft/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Hapus semua draft/ })).toBeTruthy()
    expect((postAll as HTMLInputElement).checked).toBe(true)
    // Dialog menggantikan pesan error — tidak ada toast
    expect(useStore.getState().toast).toBeNull()
  })

  it('pilih aksi lain (delete-all) → closePeriod dengan confirmDraftAction; dialog tertutup, toast sukses, list di-refresh', async () => {
    mockedApi.getPeriods
      .mockResolvedValueOnce({ periods: [openPeriod] })
      .mockResolvedValueOnce({ periods: [closedPeriod] })
    mockedApi.closePeriod
      .mockRejectedValueOnce(new ApiError(422, 'DRAFT_ACTION_REQUIRED', 'Masih ada jurnal draft; pilih aksi terlebih dahulu'))
      .mockResolvedValueOnce({ id: 'fp-2026-03', isOpen: false, handledDrafts: { posted: 0, deleted: 1, kept: 0 } })
    renderWithStore(<PeriodSettings />, { periods: [openPeriod] })

    fireEvent.click(await screen.findByRole('button', { name: 'Tutup periode Maret 2026' }))
    await screen.findByRole('dialog', { name: 'Tutup periode' })

    fireEvent.click(screen.getByRole('radio', { name: /Hapus semua draft/ }))
    fireEvent.click(screen.getByRole('button', { name: /Tutup Periode/ }))

    await waitFor(() => expect(mockedApi.closePeriod).toHaveBeenLastCalledWith('fp-2026-03', 'delete-all'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tutup periode' })).toBeNull())
    // Store: periode ditandai tertutup + toast ringkasan handledDrafts (dari aksi store asli)
    expect(useStore.getState().periods.find((p) => p.id === 'fp-2026-03')?.isOpen).toBe(false)
    expect(useStore.getState().toast?.message).toContain('1 dihapus')
    // List di-refresh via fetch ulang (getPeriods ke-2) → periode kini tampil tertutup
    await waitFor(() => expect(screen.getByText('Tertutup — posting diblokir')).toBeTruthy())
    expect(mockedApi.getPeriods).toHaveBeenCalledTimes(2)
  })

  it('error selain DRAFT_ACTION_REQUIRED (PERIOD_ALREADY_CLOSED) → toast error, dialog TIDAK muncul', async () => {
    mockedApi.getPeriods.mockResolvedValue({ periods: [openPeriod] })
    mockedApi.closePeriod.mockRejectedValue(new ApiError(409, 'PERIOD_ALREADY_CLOSED', 'Periode sudah ditutup'))
    renderWithStore(<PeriodSettings />, { periods: [openPeriod] })

    fireEvent.click(await screen.findByRole('button', { name: 'Tutup periode Maret 2026' }))

    await waitFor(() =>
      expect(useStore.getState().toast).toMatchObject({ message: 'Periode sudah ditutup', kind: 'error' }),
    )
    expect(screen.queryByRole('dialog', { name: 'Tutup periode' })).toBeNull()
  })

  it('periode TANPA draft → langsung tertutup tanpa dialog (closePeriod sukses di panggilan pertama)', async () => {
    mockedApi.getPeriods
      .mockResolvedValueOnce({ periods: [openPeriod] })
      .mockResolvedValueOnce({ periods: [closedPeriod] })
    // Tanpa 422 DRAFT_ACTION_REQUIRED: server langsung menerima penutupan
    mockedApi.closePeriod.mockResolvedValue({ id: 'fp-2026-03', isOpen: false, handledDrafts: { posted: 0, deleted: 0, kept: 0 } })
    renderWithStore(<PeriodSettings />, { periods: [openPeriod] })

    fireEvent.click(await screen.findByRole('button', { name: 'Tutup periode Maret 2026' }))

    // Satu panggilan closePeriod tanpa confirmDraftAction — tidak ada dialog
    await waitFor(() => expect(mockedApi.closePeriod).toHaveBeenCalledWith('fp-2026-03', undefined))
    expect(screen.queryByRole('dialog', { name: 'Tutup periode' })).toBeNull()
    // Store: periode ditandai tertutup + toast ringkasan handledDrafts
    expect(useStore.getState().periods.find((p) => p.id === 'fp-2026-03')?.isOpen).toBe(false)
    expect(useStore.getState().toast?.message).toContain('0 draft diposting, 0 dipertahankan, 0 dihapus')
    // List di-refresh (fetch ke-2) → periode kini tampil tertutup, tombol hilang
    await waitFor(() => expect(screen.getByText('Tertutup — posting diblokir')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Tutup periode Maret 2026' })).toBeNull()
    expect(mockedApi.getPeriods).toHaveBeenCalledTimes(2)
  })

  it('role NON-admin (accountant) → tombol Tutup TIDAK ditampilkan + hint izin period.manage', async () => {
    mockedApi.getPeriods.mockResolvedValue({ periods: [openPeriod] })
    const accountant = { id: 'user-002', name: 'Dimas', email: 'dimas@estetikakreasi.co.id', role: 'accountant' as const }
    renderWithStore(<PeriodSettings />, { periods: [openPeriod], user: accountant })

    // Periode terbuka TETAPI tanpa izin period.manage → tidak ada tombol Tutup
    await screen.findByText('Maret 2026')
    expect(screen.queryByRole('button', { name: 'Tutup periode Maret 2026' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Tutup/ })).toBeNull()
    // Hint "hanya admin" tampil; closePeriod tidak pernah dipanggil
    expect(screen.getByText(/Hanya admin yang dapat menutup periode/)).toBeTruthy()
    expect(mockedApi.closePeriod).not.toHaveBeenCalled()
  })

  it('Batal menutup dialog tanpa retry closePeriod', async () => {
    mockedApi.getPeriods.mockResolvedValue({ periods: [openPeriod] })
    mockedApi.closePeriod.mockRejectedValue(
      new ApiError(422, 'DRAFT_ACTION_REQUIRED', 'Masih ada jurnal draft; pilih aksi terlebih dahulu'),
    )
    renderWithStore(<PeriodSettings />, { periods: [openPeriod] })

    fireEvent.click(await screen.findByRole('button', { name: 'Tutup periode Maret 2026' }))
    await screen.findByRole('dialog', { name: 'Tutup periode' })
    expect(mockedApi.closePeriod).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Batal' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tutup periode' })).toBeNull())
    expect(mockedApi.closePeriod).toHaveBeenCalledTimes(1) // tidak ada retry
    expect(useStore.getState().toast).toBeNull()
  })
})
