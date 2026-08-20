// @vitest-environment happy-dom
// Dropdown periode di Sidebar kini listbox CUSTOM (pola sama dengan GlobalSearch):
// role=listbox/option, ArrowUp/Down memindahkan highlight, Enter memilih,
// Escape menutup (fokus kembali ke tombol), klik item memilih, klik luar
// menutup. Test memverifikasi interaksi keyboard + mouse + sinkronisasi store.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useStore } from '../store/useStore'
import Sidebar from './Sidebar'

const admin = { id: 'user-001', name: 'Rina', email: 'rina@estetikakreasi.co.id', role: 'admin' }
const entities = [
  { id: 'ent-001', name: 'PT. Kreasi Inovasi Estetika', code: 'ENT01', isActive: true },
  { id: 'ent-002', name: 'CV Karya Mandiri', code: 'ENT02', isActive: true },
]

const periodBtn = () => screen.getByRole('button', { name: 'Pilih periode' })
const openPeriodListbox = () => {
  fireEvent.click(periodBtn())
  return screen.getByRole('listbox')
}

beforeEach(() => {
  useStore.setState({
    apiStatus: 'online',
    user: admin,
    entities,
    activeEntityId: 'ent-001',
    activePeriod: '2026-03',
    page: 'dashboard',
    toast: null,
  })
})

afterEach(() => {
  useStore.setState({ apiStatus: 'idle', user: null })
  cleanup()
})

describe('Sidebar — dropdown periode (listbox custom, pola GlobalSearch)', () => {
  it('klik tombol → listbox terbuka dengan 3 opsi; periode aktif ditandai aria-selected', () => {
    render(<Sidebar />)
    expect(periodBtn().getAttribute('aria-expanded')).toBe('false')

    const listbox = openPeriodListbox()
    expect(periodBtn().getAttribute('aria-expanded')).toBe('true')

    const opts = within(listbox).getAllByRole('option')
    expect(opts).toHaveLength(3)
    expect(within(listbox).getByRole('option', { name: 'Maret 2026' }).getAttribute('aria-selected')).toBe('true')
    expect(within(listbox).getByRole('option', { name: 'Februari 2026' }).getAttribute('aria-selected')).toBe('false')
  })

  it('ArrowDown dari tombol membuka listbox; ArrowDown lagi memindahkan highlight; Enter memilih + menutup + store aktif', () => {
    render(<Sidebar />)
    fireEvent.keyDown(periodBtn(), { key: 'ArrowDown' }) // buka pada periode aktif (Maret = index 0)
    const listbox = screen.getByRole('listbox')
    expect(periodBtn().getAttribute('aria-expanded')).toBe('true')

    fireEvent.keyDown(periodBtn(), { key: 'ArrowDown' }) // highlight pindah ke index 1 (Februari)
    const feb = within(listbox).getByRole('option', { name: 'Februari 2026' })
    expect(feb.className).toContain('bg-primary/10') // highlight aktif

    fireEvent.keyDown(periodBtn(), { key: 'Enter' })
    expect(useStore.getState().activePeriod).toBe('2026-02')
    expect(screen.queryByRole('listbox')).toBeNull() // tertutup
  })

  it('ArrowUp dari keadaan terbuka membungkus ke opsi terakhir; Enter memilihnya', () => {
    render(<Sidebar />)
    fireEvent.keyDown(periodBtn(), { key: 'ArrowUp' }) // buka pada periode aktif (index 0)
    const listbox = screen.getByRole('listbox')
    fireEvent.keyDown(periodBtn(), { key: 'ArrowUp' }) // dari index 0 bungkus ke index 2 (Januari)
    expect(within(listbox).getByRole('option', { name: 'Januari 2026' }).className).toContain('bg-primary/10')

    fireEvent.keyDown(periodBtn(), { key: 'Enter' })
    expect(useStore.getState().activePeriod).toBe('2026-01')
  })

  it('Escape menutup listbox dan mengembalikan fokus ke tombol', () => {
    render(<Sidebar />)
    openPeriodListbox()
    fireEvent.keyDown(periodBtn(), { key: 'Escape' })

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(periodBtn().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(periodBtn())
    expect(useStore.getState().activePeriod).toBe('2026-03') // tidak berubah
  })

  it('klik opsi langsung memilih periode dan menutup', () => {
    render(<Sidebar />)
    const listbox = openPeriodListbox()
    fireEvent.click(within(listbox).getByRole('option', { name: 'Januari 2026' }))

    expect(useStore.getState().activePeriod).toBe('2026-01')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('klik di luar dropdown menutup listbox tanpa mengubah periode', () => {
    render(<Sidebar />)
    openPeriodListbox()

    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(useStore.getState().activePeriod).toBe('2026-03')
  })
})
