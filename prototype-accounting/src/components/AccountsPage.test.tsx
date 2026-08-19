// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import AccountsPage from './AccountsPage'
import { useStore } from '../store/useStore'
import * as api from '../api/index'

vi.mock('../api/index', () => ({
  api: {
    getAccounts: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    activateAccount: vi.fn(),
  },
}))

const mockAccounts = [
  { id: '1-1100', code: '1-1100', name: 'Kas Besar', type: 'asset', category: 'Kas & Bank', normalBalance: 'debit', baseBalance: 60_000_000, isActive: true },
  { id: '4-1000', code: '4-1000', name: 'Pendapatan Jasa', type: 'revenue', category: 'Pendapatan', normalBalance: 'credit', baseBalance: 130_000_000, isActive: true },
  { id: '5-1000', code: '5-1000', name: 'Beban Gaji', type: 'expense', category: 'Beban Operasional', normalBalance: 'debit', baseBalance: 40_000_000, isActive: false },
]

beforeEach(() => {
  useStore.setState({
    user: { id: 'user-001', name: 'Rina', email: 'rina@test.com', role: 'admin' },
  })
  vi.mocked(api.api.getAccounts).mockResolvedValue({ accounts: mockAccounts } as never)
  vi.mocked(api.api.createAccount).mockResolvedValue({ id: '6-1000', code: '6-1000', name: 'Test', type: 'expense', category: '', normalBalance: 'debit', baseBalance: 0, isActive: true } as never)
  vi.mocked(api.api.updateAccount).mockResolvedValue({ id: '1-1100', code: '1-1100', name: 'Kas Updated', type: 'asset', category: 'Kas & Bank', normalBalance: 'debit', baseBalance: 0, isActive: true } as never)
  vi.mocked(api.api.deleteAccount).mockResolvedValue(undefined as never)
  vi.mocked(api.api.activateAccount).mockResolvedValue({ id: '5-1000', isActive: true } as never)
})

describe('AccountsPage', () => {
  it('menampilkan daftar akun dari API', async () => {
    render(<AccountsPage />)
    expect(await screen.findByText('Kas Besar')).toBeTruthy()
    expect(screen.getByText('Pendapatan Jasa')).toBeTruthy()
    expect(screen.getByText('Beban Gaji')).toBeTruthy()
  })

  it('filter berdasarkan tipe akun', async () => {
    render(<AccountsPage />)
    await screen.findByText('Kas Besar')
    fireEvent.change(screen.getByDisplayValue('Semua Tipe'), { target: { value: 'asset' } })
    expect(screen.getByText('Kas Besar')).toBeTruthy()
    expect(screen.queryByText('Pendapatan Jasa')).toBeNull()
  })

  it('search berdasarkan kode atau nama', async () => {
    render(<AccountsPage />)
    await screen.findByText('Kas Besar')
    fireEvent.change(screen.getByPlaceholderText('Cari kode atau nama akun...'), { target: { value: 'Gaji' } })
    expect(screen.getByText('Beban Gaji')).toBeTruthy()
    expect(screen.queryByText('Kas Besar')).toBeNull()
  })

  it('tombol Tambah Akun membuka dialog', async () => {
    render(<AccountsPage />)
    await screen.findByText('Kas Besar')
    fireEvent.click(screen.getByText('Tambah Akun'))
    expect(screen.getByText('Tambah Akun Baru')).toBeTruthy()
    expect(screen.getByLabelText('Kode Akun *')).toBeTruthy()
  })

  it('menyimpan akun baru via dialog', async () => {
    render(<AccountsPage />)
    await screen.findByText('Kas Besar')
    fireEvent.click(screen.getByText('Tambah Akun'))

    fireEvent.change(screen.getByLabelText('Kode Akun *'), { target: { value: '6-1000' } })
    fireEvent.change(screen.getByLabelText('Nama Akun *'), { target: { value: 'Beban Listrik' } })
    fireEvent.click(screen.getByText('Simpan'))

    await waitFor(() => {
      expect(api.api.createAccount).toHaveBeenCalledWith(expect.objectContaining({ code: '6-1000', name: 'Beban Listrik' }))
    })
  })

  it('tombol Edit membuka dialog dengan data akun', async () => {
    render(<AccountsPage />)
    await screen.findByText('Kas Besar')
    const editBtns = screen.getAllByTitle('Edit akun')
    fireEvent.click(editBtns[0])
    expect(screen.getByText('Edit Akun')).toBeTruthy()
    expect((screen.getByLabelText('Kode Akun *') as HTMLInputElement).value).toBe('1-1100')
  })

  it('nonaktifkan akun memanggil API', async () => {
    render(<AccountsPage />)
    await screen.findByText('Kas Besar')
    const toggleBtns = screen.getAllByTitle('Nonaktifkan')
    fireEvent.click(toggleBtns[0])
    await waitFor(() => {
      expect(api.api.deleteAccount).toHaveBeenCalledWith('1-1100')
    })
  })

  it('menampilkan badge status aktif/non-aktif', async () => {
    render(<AccountsPage />)
    await screen.findByText('Kas Besar')
    expect(screen.getAllByText('Aktif').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Non-aktif').length).toBeGreaterThanOrEqual(1)
  })
})
