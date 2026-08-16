// @vitest-environment happy-dom
// Test komponen global search (TopBar): debounce, dropdown hasil, klik →
// navigasi + fokus via store, nonaktif saat offline, respons basi diabaikan.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { api, type SearchResult } from '../api'
import { useStore } from '../store/useStore'
import { deferred } from '../test/helpers'
import GlobalSearch from './GlobalSearch'

vi.mock('../api', () => ({
  ApiError: class ApiError extends Error {},
  isNetworkError: (e: unknown) => e instanceof TypeError,
  toJournalEntry: (j: any) => j,
  api: { search: vi.fn() },
}))

const mockedApi = vi.mocked(api)

const journalResult: SearchResult = {
  type: 'journal',
  id: 'JNL-2026-03-005',
  title: 'JV-2026-03-0005',
  subtitle: 'Pencatatan beban gaji karyawan Maret · 15/03/2026',
  metadata: { status: 'posted' },
}

const accountResult: SearchResult = {
  type: 'account',
  id: '4-1000',
  title: 'Pendapatan Jasa',
  subtitle: '4-1000 · revenue',
  metadata: { balance: 155_000_000 },
}

beforeEach(() => {
  useStore.setState({ apiStatus: 'online', page: 'dashboard', focusJournalId: null, focusAccountId: null })
  mockedApi.search.mockReset()
})

afterEach(() => {
  // Cleanup DOM otomatis via setup global (src/test/setup.ts)
  useStore.setState({ apiStatus: 'idle' })
})

describe('GlobalSearch — pencarian global di TopBar', () => {
  it('mengetik → debounce → api.search(q); hasil jurnal & akun dirender berkelompok', async () => {
    mockedApi.search.mockResolvedValue({ results: [journalResult, accountResult] })
    render(<GlobalSearch />)
    const input = screen.getByLabelText('Pencarian global')

    fireEvent.change(input, { target: { value: 'gaji' } })

    await waitFor(() => expect(mockedApi.search).toHaveBeenCalledWith('gaji'))
    await waitFor(() => expect(screen.getByRole('button', { name: /JV-2026-03-0005/ })).toBeTruthy())
    expect(screen.getByText('Jurnal')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Pendapatan Jasa/ })).toBeTruthy()
    expect(screen.getByText('Akun')).toBeTruthy()
    expect(screen.getByText('Rp 155.000.000')).toBeTruthy() // saldo akun di hasil
  })

  it('klik hasil jurnal → store: halaman Jurnal + focusJournalId; dropdown & query ditutup', async () => {
    mockedApi.search.mockResolvedValue({ results: [journalResult] })
    render(<GlobalSearch />)
    const input = screen.getByLabelText('Pencarian global')

    fireEvent.change(input, { target: { value: 'gaji' } })
    const btn = await screen.findByRole('button', { name: /JV-2026-03-0005/ })
    fireEvent.click(btn)

    const s = useStore.getState()
    expect(s.page).toBe('journal')
    expect(s.focusJournalId).toBe('JNL-2026-03-005')
    expect(s.focusAccountId).toBeNull()
    expect((input as HTMLInputElement).value).toBe('') // query dibersihkan
    expect(screen.queryByRole('button', { name: /JV-2026-03-0005/ })).toBeNull() // dropdown tertutup
  })

  it('klik hasil akun → store: halaman Buku Besar + focusAccountId', async () => {
    mockedApi.search.mockResolvedValue({ results: [accountResult] })
    render(<GlobalSearch />)
    const input = screen.getByLabelText('Pencarian global')

    fireEvent.change(input, { target: { value: 'Pendapatan' } })
    const btn = await screen.findByRole('button', { name: /Pendapatan Jasa/ })
    fireEvent.click(btn)

    const s = useStore.getState()
    expect(s.page).toBe('buku-besar')
    expect(s.focusAccountId).toBe('4-1000')
    expect(s.focusJournalId).toBeNull()
  })

  it('saat offline → api.search TIDAK dipanggil (hasil dikosongkan)', async () => {
    useStore.setState({ apiStatus: 'offline' })
    render(<GlobalSearch />)
    const input = screen.getByLabelText('Pencarian global')

    fireEvent.change(input, { target: { value: 'gaji' } })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400)) // lewati jendela debounce
    })

    expect(mockedApi.search).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /JV-2026-03-0005/ })).toBeNull()
  })

  it('respons basi (query diganti lebih cepat dari server) diabaikan — hanya hasil terbaru yang tampil', async () => {
    const stale = deferred<{ results: SearchResult[] }>()
    const fresh = { results: [accountResult] }
    mockedApi.search
      .mockImplementationOnce(() => stale.promise) // 'a' — lambat
      .mockResolvedValueOnce(fresh) // 'ab' — cepat
    render(<GlobalSearch />)
    const input = screen.getByLabelText('Pencarian global')

    fireEvent.change(input, { target: { value: 'a' } })
    await waitFor(() => expect(mockedApi.search).toHaveBeenCalledWith('a'))

    fireEvent.change(input, { target: { value: 'ab' } })
    await waitFor(() => expect(mockedApi.search).toHaveBeenCalledWith('ab'))

    // Respons 'a' yang basi tiba setelah 'ab' — harus diabaikan
    await act(async () =>
      stale.resolve({ results: [{ ...journalResult, title: 'JV-STALE', subtitle: 'Respons basi' }] }),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /Pendapatan Jasa/ })).toBeTruthy())
    expect(screen.queryByText('JV-STALE')).toBeNull()
  })
})
