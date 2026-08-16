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

const reportResult: SearchResult = {
  type: 'report',
  id: 'arus-kas',
  title: 'Arus Kas',
  subtitle: 'Laporan · arus kas operasi/investasi/pendanaan',
  metadata: {},
}

const pageResult: SearchResult = {
  type: 'page',
  id: 'pengaturan',
  title: 'Pengaturan',
  subtitle: 'Halaman · periode, entitas & preferensi',
  metadata: {},
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
    await waitFor(() => expect(screen.getByRole('option', { name: /JV-2026-03-0005/ })).toBeTruthy())
    expect(screen.getByText('Jurnal')).toBeTruthy()
    expect(screen.getByRole('option', { name: /Pendapatan Jasa/ })).toBeTruthy()
    expect(screen.getByText('Akun')).toBeTruthy()
    expect(screen.getByText('Rp 155.000.000')).toBeTruthy() // saldo akun di hasil
  })

  it('klik hasil jurnal → store: halaman Jurnal + focusJournalId; dropdown & query ditutup', async () => {
    mockedApi.search.mockResolvedValue({ results: [journalResult] })
    render(<GlobalSearch />)
    const input = screen.getByLabelText('Pencarian global')

    fireEvent.change(input, { target: { value: 'gaji' } })
    const btn = await screen.findByRole('option', { name: /JV-2026-03-0005/ })
    fireEvent.click(btn)

    const s = useStore.getState()
    expect(s.page).toBe('journal')
    expect(s.focusJournalId).toBe('JNL-2026-03-005')
    expect(s.focusAccountId).toBeNull()
    expect((input as HTMLInputElement).value).toBe('') // query dibersihkan
    expect(screen.queryByRole('option', { name: /JV-2026-03-0005/ })).toBeNull() // dropdown tertutup
  })

  it('hasil laporan & halaman dirender berkelompok (Laporan / Halaman)', async () => {
    mockedApi.search.mockResolvedValue({ results: [reportResult, pageResult] })
    render(<GlobalSearch />)
    const input = screen.getByLabelText('Pencarian global')

    fireEvent.change(input, { target: { value: 'kas' } })

    await waitFor(() => expect(mockedApi.search).toHaveBeenCalledWith('kas'))
    await waitFor(() => expect(screen.getByRole('option', { name: /Arus Kas/ })).toBeTruthy())
    expect(screen.getByText('Laporan')).toBeTruthy()
    expect(screen.getByRole('option', { name: /Pengaturan/ })).toBeTruthy()
    expect(screen.getByText('Halaman')).toBeTruthy()
  })

  it('klik hasil laporan → store: pindah ke halaman laporan tsb (arus-kas)', async () => {
    mockedApi.search.mockResolvedValue({ results: [reportResult] })
    render(<GlobalSearch />)
    const input = screen.getByLabelText('Pencarian global')

    fireEvent.change(input, { target: { value: 'kas' } })
    const btn = await screen.findByRole('option', { name: /Arus Kas/ })
    fireEvent.click(btn)

    const s = useStore.getState()
    expect(s.page).toBe('arus-kas')
    expect(s.focusAccountId).toBeNull()
    expect(s.focusJournalId).toBeNull()
  })

  it('klik hasil halaman → store: pindah ke halaman tsb (pengaturan)', async () => {
    mockedApi.search.mockResolvedValue({ results: [pageResult] })
    render(<GlobalSearch />)
    const input = screen.getByLabelText('Pencarian global')

    fireEvent.change(input, { target: { value: 'pengaturan' } })
    const btn = await screen.findByRole('option', { name: /Pengaturan/ })
    fireEvent.click(btn)

    expect(useStore.getState().page).toBe('pengaturan')
  })

  it('klik hasil akun → store: halaman Buku Besar + focusAccountId', async () => {
    mockedApi.search.mockResolvedValue({ results: [accountResult] })
    render(<GlobalSearch />)
    const input = screen.getByLabelText('Pencarian global')

    fireEvent.change(input, { target: { value: 'Pendapatan' } })
    const btn = await screen.findByRole('option', { name: /Pendapatan Jasa/ })
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
    expect(screen.queryByRole('option', { name: /JV-2026-03-0005/ })).toBeNull()
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
    await waitFor(() => expect(screen.getByRole('option', { name: /Pendapatan Jasa/ })).toBeTruthy())
    expect(screen.queryByText('JV-STALE')).toBeNull()
  })
})

describe('GlobalSearch — navigasi keyboard (aksesibilitas)', () => {
  it('ArrowDown memilih item pertama, ArrowDown lagi → kedua; highlight + aria-selected mengikuti', async () => {
    mockedApi.search.mockResolvedValue({ results: [journalResult, accountResult] })
    render(<GlobalSearch />)
    const input = screen.getByLabelText('Pencarian global')

    fireEvent.change(input, { target: { value: 'gaji' } })
    await screen.findByRole('option', { name: /JV-2026-03-0005/ })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const first = screen.getByRole('option', { name: /JV-2026-03-0005/ })
    expect(first.getAttribute('aria-selected')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toBe('gs-result-0')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const second = screen.getByRole('option', { name: /Pendapatan Jasa/ })
    expect(second.getAttribute('aria-selected')).toBe('true')
    expect(first.getAttribute('aria-selected')).toBe('false')
    expect(input.getAttribute('aria-activedescendant')).toBe('gs-result-1')
  })

  it('ArrowUp dari item pertama → wrap ke item terakhir', async () => {
    mockedApi.search.mockResolvedValue({ results: [journalResult, accountResult] })
    render(<GlobalSearch />)
    const input = screen.getByLabelText('Pencarian global')

    fireEvent.change(input, { target: { value: 'gaji' } })
    await screen.findByRole('option', { name: /JV-2026-03-0005/ })

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.getAttribute('aria-activedescendant')).toBe('gs-result-1')
    expect(screen.getByRole('option', { name: /Pendapatan Jasa/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('Enter pada item aktif → navigasi via store (fokus jurnal), dropdown tertutup', async () => {
    mockedApi.search.mockResolvedValue({ results: [journalResult] })
    render(<GlobalSearch />)
    const input = screen.getByLabelText('Pencarian global')

    fireEvent.change(input, { target: { value: 'gaji' } })
    await screen.findByRole('option', { name: /JV-2026-03-0005/ })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    const s = useStore.getState()
    expect(s.page).toBe('journal')
    expect(s.focusJournalId).toBe('JNL-2026-03-005')
    expect((input as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('option', { name: /JV-2026-03-0005/ })).toBeNull()
  })

  it('Escape menutup dropdown tanpa membersihkan query', async () => {
    mockedApi.search.mockResolvedValue({ results: [journalResult] })
    render(<GlobalSearch />)
    const input = screen.getByLabelText('Pencarian global')

    fireEvent.change(input, { target: { value: 'gaji' } })
    await screen.findByRole('option', { name: /JV-2026-03-0005/ })

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('option', { name: /JV-2026-03-0005/ })).toBeNull()
    expect((input as HTMLInputElement).value).toBe('gaji') // query dipertahankan
    expect(useStore.getState().page).toBe('dashboard')
  })

  it('Enter tanpa item aktif (belum ArrowDown) → tidak crash, tidak navigasi, dropdown tetap terbuka', async () => {
    mockedApi.search.mockResolvedValue({ results: [journalResult] })
    render(<GlobalSearch />)
    const input = screen.getByLabelText('Pencarian global')

    fireEvent.change(input, { target: { value: 'gaji' } })
    await screen.findByRole('option', { name: /JV-2026-03-0005/ })

    fireEvent.keyDown(input, { key: 'Enter' }) // activeIndex masih -1
    expect(useStore.getState().page).toBe('dashboard')
    expect(screen.getByRole('option', { name: /JV-2026-03-0005/ })).toBeTruthy()
  })
})
