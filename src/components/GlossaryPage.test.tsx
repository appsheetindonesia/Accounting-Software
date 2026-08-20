// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import GlossaryPage from './GlossaryPage'

describe('GlossaryPage', () => {
  it('menampilkan semua istilah default', () => {
    render(<GlossaryPage />)
    expect(screen.getByText('Kamus Istilah')).toBeTruthy()
    expect(screen.getByText('Bukti Kas Masuk')).toBeTruthy()
    expect(screen.getByText('BKM')).toBeTruthy()
    expect(screen.getByText('Jurnal Umum')).toBeTruthy()
    expect(screen.getByText('JV')).toBeTruthy()
    expect(screen.getByText('Chart of Accounts')).toBeTruthy()
    expect(screen.getByText('COA')).toBeTruthy()
  })

  it('search berdasarkan singkatan', () => {
    render(<GlossaryPage />)
    fireEvent.change(screen.getByPlaceholderText('Cari istilah atau singkatan...'), { target: { value: 'BKM' } })
    expect(screen.getByText('Bukti Kas Masuk')).toBeTruthy()
    expect(screen.queryByText('Jurnal Umum')).toBeNull()
  })

  it('filter berdasarkan kategori', () => {
    render(<GlossaryPage />)
    // Klik tombol filter 'Jurnal' (bukan teks di kartu)
    const filterBtns = screen.getAllByText('Jurnal')
    // Tombol filter adalah button dengan className rounded-full
    const filterBtn = filterBtns.find((el) => el.tagName === 'BUTTON')
    expect(filterBtn).toBeTruthy()
    fireEvent.click(filterBtn!)
    expect(screen.getByText('Bukti Kas Masuk')).toBeTruthy()
    expect(screen.getByText('Bukti Kas Keluar')).toBeTruthy()
    expect(screen.queryByText('Neraca')).toBeNull()
  })

  it('menampilkan definisi dan contoh', () => {
    render(<GlossaryPage />)
    expect(screen.getByText(/Bukti penerimaan kas/)).toBeTruthy()
    expect(screen.getByText(/BKM-2026-03-0001/)).toBeTruthy()
  })

  it('tombol Semua reset filter kategori', () => {
    render(<GlossaryPage />)
    const filterBtns = screen.getAllByText('Jurnal')
    const filterBtn = filterBtns.find((el) => el.tagName === 'BUTTON')
    fireEvent.click(filterBtn!)
    fireEvent.click(screen.getByText('Semua'))
    expect(screen.getByText('Neraca')).toBeTruthy()
  })
})
