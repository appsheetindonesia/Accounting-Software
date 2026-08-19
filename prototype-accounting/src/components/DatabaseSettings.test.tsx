// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { act } from 'react'
import DatabaseSettings from './DatabaseSettings'
import { useStore } from '../store/useStore'

// Pastikan persist middleware tidak aktif di test (localStorage tidak tersedia)
beforeEach(() => {
  // Reset store ke default
  useStore.setState({
    dbConfig: { host: 'localhost', port: '5432', database: 'accounting_db', password: '' },
    toast: null,
  })
})

describe('DatabaseSettings', () => {
  it('render 4 field input dengan nilai default', () => {
    render(<DatabaseSettings />)

    expect((screen.getByLabelText('Host Internal') as HTMLInputElement).value).toBe('localhost')
    expect((screen.getByLabelText('Port Internal') as HTMLInputElement).value).toBe('5432')
    expect((screen.getByLabelText('Nama Basis Data') as HTMLInputElement).value).toBe('accounting_db')
    expect((screen.getByLabelText('Kata Sandi') as HTMLInputElement).value).toBe('')
  })

  it('menampilkan ringkasan koneksi', () => {
    render(<DatabaseSettings />)

    expect(screen.getByText(/Koneksi:/)).toBeDefined()
    expect(screen.getByText(/accounting_db@localhost:5432/)).toBeDefined()
  })

  it('tombol Simpan aktif setelah mengubah form', () => {
    render(<DatabaseSettings />)

    const saveBtn = screen.getByRole('button', { name: /Simpan Pengaturan/ }) as HTMLButtonElement
    // Initially disabled (no changes)
    expect(saveBtn.disabled).toBe(true)

    // Change host
    fireEvent.change(screen.getByLabelText('Host Internal'), { target: { value: '192.168.1.100' } })
    expect(saveBtn.disabled).toBe(false)
  })

  it('menyimpan perubahan ke store saat klik Simpan', () => {
    render(<DatabaseSettings />)

    fireEvent.change(screen.getByLabelText('Host Internal'), { target: { value: '10.0.0.1' } })
    fireEvent.change(screen.getByLabelText('Port Internal'), { target: { value: '5433' } })
    fireEvent.change(screen.getByLabelText('Nama Basis Data'), { target: { value: 'prod_db' } })
    fireEvent.change(screen.getByLabelText('Kata Sandi'), { target: { value: 'secret123' } })

    fireEvent.click(screen.getByRole('button', { name: /Simpan Pengaturan/ }))

    const state = useStore.getState()
    expect(state.dbConfig.host).toBe('10.0.0.1')
    expect(state.dbConfig.port).toBe('5433')
    expect(state.dbConfig.database).toBe('prod_db')
    expect(state.dbConfig.password).toBe('secret123')
  })

  it('menolak port非 angka', () => {
    render(<DatabaseSettings />)

    fireEvent.change(screen.getByLabelText('Port Internal'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: /Simpan Pengaturan/ }))

    // Store tetap default
    expect(useStore.getState().dbConfig.port).toBe('5432')
    expect(useStore.getState().toast?.kind).toBe('error')
  })

  it('menolak port di luar rentang', () => {
    render(<DatabaseSettings />)

    fireEvent.change(screen.getByLabelText('Port Internal'), { target: { value: '99999' } })
    fireEvent.click(screen.getByRole('button', { name: /Simpan Pengaturan/ }))

    expect(useStore.getState().dbConfig.port).toBe('5432')
    expect(useStore.getState().toast?.kind).toBe('error')
  })

  it('menolak host kosong', () => {
    render(<DatabaseSettings />)

    fireEvent.change(screen.getByLabelText('Host Internal'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Simpan Pengaturan/ }))

    expect(useStore.getState().toast?.kind).toBe('error')
  })

  it('menolak nama basis data kosong', () => {
    render(<DatabaseSettings />)

    fireEvent.change(screen.getByLabelText('Nama Basis Data'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Simpan Pengaturan/ }))

    expect(useStore.getState().toast?.kind).toBe('error')
  })

  it('toggle visibility password', () => {
    render(<DatabaseSettings />)

    const pwdInput = screen.getByLabelText('Kata Sandi')
    expect(pwdInput.getAttribute('type')).toBe('password')

    // Find the eye button (the toggle)
    const toggleBtn = pwdInput.parentElement!.querySelector('button')!
    fireEvent.click(toggleBtn)
    expect(pwdInput.getAttribute('type')).toBe('text')

    fireEvent.click(toggleBtn)
    expect(pwdInput.getAttribute('type')).toBe('password')
  })

  it('menampilkan tanda "dengan password" di ringkasan bila password terisi', () => {
    render(<DatabaseSettings />)

    fireEvent.change(screen.getByLabelText('Kata Sandi'), { target: { value: 'mypassword' } })
    expect(screen.getByText('(dengan password)')).toBeDefined()
  })
})
