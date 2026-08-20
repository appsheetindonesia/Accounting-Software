// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { act } from 'react'
import DatabaseSettings from './DatabaseSettings'
import { useStore } from '../store/useStore'
import * as apiClient from '../api/client'

// Pastikan persist middleware tidak aktif di test (localStorage tidak tersedia)
beforeEach(() => {
  // Reset store ke default
  useStore.setState({
    dbConfig: { storageMode: 'local', host: 'localhost', port: '5432', database: 'accounting_db', schema: 'public', username: 'postgres', password: '', tables: { accounts: 'accounts', journals: 'journals', journalLines: 'journal_lines', periods: 'periods', users: 'users', entities: 'entities', sessions: 'sessions', attachments: 'attachments' } },
    toast: null,
  })
})

describe('DatabaseSettings', () => {
  // ---- Mode selector ----
  it('menampilkan dua tombol mode (Lokal dan PostgreSQL)', () => {
    render(<DatabaseSettings />)

    expect(screen.getByTestId('mode-local-btn')).toBeDefined()
    expect(screen.getByTestId('mode-postgresql-btn')).toBeDefined()
    expect(screen.getByTestId('storage-mode-badge')).toBeDefined()
  })

  it('default mode adalah Lokal', () => {
    render(<DatabaseSettings />)

    const badge = screen.getByTestId('storage-mode-badge')
    expect(badge.textContent).toContain('Lokal')
    // Form PostgreSQL tidak tampil
    expect(screen.queryByTestId('postgresql-form')).toBeNull()
    // Info mode lokal tampil
    expect(screen.getByTestId('local-mode-info')).toBeDefined()
  })

  it('mengklik PostgreSQL menampilkan form database', () => {
    render(<DatabaseSettings />)

    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))

    expect(screen.getByTestId('postgresql-form')).toBeDefined()
    expect(screen.queryByTestId('local-mode-info')).toBeNull()
    const badge = screen.getByTestId('storage-mode-badge')
    expect(badge.textContent).toContain('PostgreSQL')
  })

  it('mengklik Lokal kembali menampilkan info lokal', () => {
    render(<DatabaseSettings />)

    // Switch to PostgreSQL first
    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))
    expect(screen.getByTestId('postgresql-form')).toBeDefined()

    // Switch back to Local
    fireEvent.click(screen.getByTestId('mode-local-btn'))
    expect(screen.queryByTestId('postgresql-form')).toBeNull()
    expect(screen.getByTestId('local-mode-info')).toBeDefined()
  })

  it('tombol Test Koneksi tidak tampil di mode Lokal', () => {
    render(<DatabaseSettings />)

    expect(screen.queryByTestId('test-connection-btn')).toBeNull()
  })

  it('tombol Test Koneksi tampil di mode PostgreSQL', () => {
    render(<DatabaseSettings />)

    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))
    expect(screen.getByTestId('test-connection-btn')).toBeDefined()
  })

  // ---- PostgreSQL form ----
  it('render 6 field input dengan nilai default saat mode PostgreSQL', () => {
    useStore.setState({
      dbConfig: { storageMode: 'postgresql', host: '192.168.1.1', port: '5433', database: 'prod_db', schema: 'myschema', username: 'admin', password: 'secret', tables: { accounts: 'accounts', journals: 'journals', journalLines: 'journal_lines', periods: 'periods', users: 'users', entities: 'entities', sessions: 'sessions', attachments: 'attachments' } },
    })
    render(<DatabaseSettings />)

    expect((screen.getByLabelText('Host Internal') as HTMLInputElement).value).toBe('192.168.1.1')
    expect((screen.getByLabelText('Port Internal') as HTMLInputElement).value).toBe('5433')
    expect((screen.getByLabelText('Nama Basis Data') as HTMLInputElement).value).toBe('prod_db')
    expect((screen.getByLabelText('Schema') as HTMLInputElement).value).toBe('myschema')
    expect((screen.getByLabelText('Pengguna', { selector: '#db-username' }) as HTMLInputElement).value).toBe('admin')
    expect((screen.getByLabelText('Kata Sandi') as HTMLInputElement).value).toBe('secret')
  })

  it('menampilkan ringkasan koneksi di mode PostgreSQL', () => {
    render(<DatabaseSettings />)
    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))

    expect(screen.getByText(/Koneksi:/)).toBeDefined()
    expect(screen.getByText(/postgres@localhost:5432\/accounting_db/)).toBeDefined()
  })

  it('tombol Simpan aktif setelah mengubah form', () => {
    // Mulai dari PostgreSQL agar form awal match store
    useStore.setState({ dbConfig: { storageMode: 'postgresql', host: 'localhost', port: '5432', database: 'accounting_db', schema: 'public', username: 'postgres', password: '', tables: { accounts: 'accounts', journals: 'journals', journalLines: 'journal_lines', periods: 'periods', users: 'users', entities: 'entities', sessions: 'sessions', attachments: 'attachments' } } })
    render(<DatabaseSettings />)

    const saveBtn = screen.getByRole('button', { name: /Simpan Pengaturan/ }) as HTMLButtonElement
    expect(saveBtn.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Host Internal'), { target: { value: '192.168.1.100' } })
    expect(saveBtn.disabled).toBe(false)
  })

  it('menyimpan perubahan ke store saat klik Simpan (PostgreSQL)', () => {
    render(<DatabaseSettings />)
    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))

    fireEvent.change(screen.getByLabelText('Host Internal'), { target: { value: '10.0.0.1' } })
    fireEvent.change(screen.getByLabelText('Port Internal'), { target: { value: '5433' } })
    fireEvent.change(screen.getByLabelText('Nama Basis Data'), { target: { value: 'prod_db' } })
    fireEvent.change(screen.getByLabelText('Schema'), { target: { value: 'myschema' } })
    fireEvent.change(screen.getByLabelText('Pengguna', { selector: '#db-username' }), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('Kata Sandi'), { target: { value: 'secret123' } })

    fireEvent.click(screen.getByRole('button', { name: /Simpan Pengaturan/ }))

    const state = useStore.getState()
    expect(state.dbConfig.storageMode).toBe('postgresql')
    expect(state.dbConfig.host).toBe('10.0.0.1')
    expect(state.dbConfig.port).toBe('5433')
    expect(state.dbConfig.database).toBe('prod_db')
    expect(state.dbConfig.schema).toBe('myschema')
    expect(state.dbConfig.username).toBe('admin')
    expect(state.dbConfig.password).toBe('secret123')
  })

  it('menyimpan mode lokal saat klik Simpan', () => {
    render(<DatabaseSettings />)

    // Default sudah lokal, klik Simpan langsung
    fireEvent.click(screen.getByRole('button', { name: /Simpan Pengaturan/ }))

    const state = useStore.getState()
    expect(state.dbConfig.storageMode).toBe('local')
  })

  it('menolak port非 angka', () => {
    render(<DatabaseSettings />)
    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))

    fireEvent.change(screen.getByLabelText('Port Internal'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: /Simpan Pengaturan/ }))

    // Store tetap default
    expect(useStore.getState().dbConfig.port).toBe('5432')
    expect(useStore.getState().toast?.kind).toBe('error')
  })

  it('menolak port di luar rentang', () => {
    render(<DatabaseSettings />)
    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))

    fireEvent.change(screen.getByLabelText('Port Internal'), { target: { value: '99999' } })
    fireEvent.click(screen.getByRole('button', { name: /Simpan Pengaturan/ }))

    expect(useStore.getState().dbConfig.port).toBe('5432')
    expect(useStore.getState().toast?.kind).toBe('error')
  })

  it('menolak host kosong', () => {
    render(<DatabaseSettings />)
    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))

    fireEvent.change(screen.getByLabelText('Host Internal'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Simpan Pengaturan/ }))

    expect(useStore.getState().toast?.kind).toBe('error')
  })

  it('menolak nama basis data kosong', () => {
    render(<DatabaseSettings />)
    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))

    fireEvent.change(screen.getByLabelText('Nama Basis Data'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Simpan Pengaturan/ }))

    expect(useStore.getState().toast?.kind).toBe('error')
  })

  it('toggle visibility password', () => {
    render(<DatabaseSettings />)
    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))

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
    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))

    fireEvent.change(screen.getByLabelText('Kata Sandi'), { target: { value: 'mypassword' } })
    expect(screen.getByText('(dengan password)')).toBeDefined()
  })

  // ---- Test Koneksi ----
  it('schema kosong otomatis jadi "public" saat simpan', () => {
    render(<DatabaseSettings />)
    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))

    fireEvent.change(screen.getByLabelText('Schema'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Simpan Pengaturan/ }))

    expect(useStore.getState().dbConfig.schema).toBe('public')
  })

  it('username kosong otomatis jadi "postgres" saat simpan', () => {
    render(<DatabaseSettings />)
    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))

    fireEvent.change(screen.getByLabelText('Pengguna', { selector: '#db-username' }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Simpan Pengaturan/ }))

    expect(useStore.getState().dbConfig.username).toBe('postgres')
  })

  it('tombol Test Koneksi tampil di awal (mode PostgreSQL)', () => {
    render(<DatabaseSettings />)
    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))

    const btn = screen.getByTestId('test-connection-btn')
    expect(btn).toBeDefined()
    expect(btn.textContent).toContain('Test Koneksi')
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  it('tombol Test Koneksi menunjukkan "Menguji..." saat loading', async () => {
    const spy = vi.spyOn(apiClient, 'request').mockImplementation(() =>
      new Promise((resolve) =>
        setTimeout(() => resolve({ ok: true, message: 'Koneksi berhasil', latencyMs: 50 } as never), 200)
      )
    )

    render(<DatabaseSettings />)
    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))

    const btn = screen.getByTestId('test-connection-btn')
    fireEvent.click(btn)

    // Tunggu render pertama (loading state)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    expect(btn.textContent).toContain('Menguji...')
    expect((btn as HTMLButtonElement).disabled).toBe(true)

    // Tunggu selesai
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    expect(screen.getByTestId('test-result')).toBeDefined()
    spy.mockRestore()
  })

  it('menampilkan hasil sukses setelah test koneksi berhasil', async () => {
    const spy = vi.spyOn(apiClient, 'request').mockResolvedValue({
      ok: true, message: 'Koneksi ke accounting_db@localhost:5432 berhasil', latencyMs: 50,
    } as never)

    render(<DatabaseSettings />)
    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))

    fireEvent.click(screen.getByTestId('test-connection-btn'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    const result = screen.getByTestId('test-result')
    expect(result).toBeDefined()
    expect(result.textContent).toContain('berhasil')
    expect(result.textContent).toContain('50ms')
    // Tidak ada saran mode lokal
    expect(screen.queryByTestId('local-mode-suggestion')).toBeNull()
    spy.mockRestore()
  })

  it('menampilkan hasil gagal + saran mode lokal saat request throw error', async () => {
    const spy = vi.spyOn(apiClient, 'request').mockRejectedValue(new Error('Network error'))

    render(<DatabaseSettings />)
    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))

    fireEvent.click(screen.getByTestId('test-connection-btn'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    const result = screen.getByTestId('test-result')
    expect(result).toBeDefined()
    expect(result.textContent).toContain('Network error')
    // Saran mode lokal muncul
    const suggestion = screen.getByTestId('local-mode-suggestion')
    expect(suggestion).toBeDefined()
    expect(suggestion.textContent).toContain('Gunakan mode Lokal')
    spy.mockRestore()
  })

  it('menampilkan saran mode lokal saat server merespons gagal', async () => {
    const spy = vi.spyOn(apiClient, 'request').mockResolvedValue({
      ok: false, message: 'Gagal terhubung ke db@wrong-host:5432 — host tidak dapat dijangkau', latencyMs: 100,
    } as never)

    render(<DatabaseSettings />)
    fireEvent.click(screen.getByTestId('mode-postgresql-btn'))

    fireEvent.click(screen.getByTestId('test-connection-btn'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    const result = screen.getByTestId('test-result')
    expect(result).toBeDefined()
    expect(result.textContent?.toLowerCase()).toContain('gagal')
    // Saran mode lokal muncul
    const suggestion = screen.getByTestId('local-mode-suggestion')
    expect(suggestion).toBeDefined()
    // Klik tombol "Gunakan mode Lokal"
    fireEvent.click(screen.getByTestId('switch-to-local-btn'))
    // Sekarang mode berubah ke lokal
    const badge = screen.getByTestId('storage-mode-badge')
    expect(badge.textContent).toContain('Lokal')
    spy.mockRestore()
  })

  it('bisa switch ke mode lokal via tombol saran', async () => {
    // Mulai di mode PostgreSQL
    useStore.setState({
      dbConfig: { storageMode: 'postgresql', host: 'wrong-host', port: '5432', database: 'db', schema: 'public', username: 'pg', password: '', tables: { accounts: 'accounts', journals: 'journals', journalLines: 'journal_lines', periods: 'periods', users: 'users', entities: 'entities', sessions: 'sessions', attachments: 'attachments' } },
    })
    const spy = vi.spyOn(apiClient, 'request').mockResolvedValue({
      ok: false, message: 'Gagal terhubung', latencyMs: 100,
    } as never)

    render(<DatabaseSettings />)

    fireEvent.click(screen.getByTestId('test-connection-btn'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    // Klik "Gunakan mode Lokal"
    fireEvent.click(screen.getByTestId('switch-to-local-btn'))

    // Verifikasi mode berubah
    expect(useStore.getState().dbConfig.storageMode).toBe('local')
    // Form PostgreSQL hilang
    expect(screen.queryByTestId('postgresql-form')).toBeNull()
    // Info lokal tampil
    expect(screen.getByTestId('local-mode-info')).toBeDefined()
    spy.mockRestore()
  })

  // ---- Konfigurasi Nama Tabel ----
  it('menampilkan section konfigurasi nama tabel saat mode PostgreSQL', () => {
    useStore.setState({ dbConfig: { storageMode: 'postgresql', host: 'localhost', port: '5432', database: 'accounting_db', schema: 'public', username: 'postgres', password: '', tables: { accounts: 'akun', journals: 'buku_besar', journalLines: 'baris_jurnal', periods: 'periode', users: 'pengguna', entities: 'entitas', sessions: 'sesi', attachments: 'lampiran' } } })
    render(<DatabaseSettings />)

    expect(screen.getByTestId('table-config')).toBeDefined()
    expect((screen.getByTestId('table-input-accounts') as HTMLInputElement).value).toBe('akun')
    expect((screen.getByTestId('table-input-journals') as HTMLInputElement).value).toBe('buku_besar')
  })

  it('tidak menampilkan section nama tabel saat mode Lokal', () => {
    render(<DatabaseSettings />)
    expect(screen.queryByTestId('table-config')).toBeNull()
  })

  it('mengubah nama tabel dan tombol Simpan aktif', () => {
    useStore.setState({ dbConfig: { storageMode: 'postgresql', host: 'localhost', port: '5432', database: 'accounting_db', schema: 'public', username: 'postgres', password: '', tables: { accounts: 'accounts', journals: 'journals', journalLines: 'journal_lines', periods: 'periods', users: 'users', entities: 'entities', sessions: 'sessions', attachments: 'attachments' } } })
    render(<DatabaseSettings />)

    const saveBtn = screen.getByRole('button', { name: /Simpan Pengaturan/ }) as HTMLButtonElement
    expect(saveBtn.disabled).toBe(true)

    fireEvent.change(screen.getByTestId('table-input-accounts'), { target: { value: 'coa_master' } })
    expect(saveBtn.disabled).toBe(false)
  })

  it('tombol Reset default mengembalikan semua nama tabel ke default', () => {
    useStore.setState({ dbConfig: { storageMode: 'postgresql', host: 'localhost', port: '5432', database: 'accounting_db', schema: 'public', username: 'postgres', password: '', tables: { accounts: 'custom_akun', journals: 'custom_jurnal', journalLines: 'custom_lines', periods: 'custom_periode', users: 'custom_users', entities: 'custom_entities', sessions: 'custom_sessions', attachments: 'custom_attachments' } } })
    render(<DatabaseSettings />)

    // Ubah dulu
    fireEvent.change(screen.getByTestId('table-input-accounts'), { target: { value: 'lagi_lain' } })
    expect((screen.getByTestId('table-input-accounts') as HTMLInputElement).value).toBe('lagi_lain')

    // Klik reset
    fireEvent.click(screen.getByTestId('reset-tables-btn'))
    expect((screen.getByTestId('table-input-accounts') as HTMLInputElement).value).toBe('accounts')
    expect((screen.getByTestId('table-input-journals') as HTMLInputElement).value).toBe('journals')
  })

  it('menyimpan nama tabel custom ke store saat klik Simpan', () => {
    useStore.setState({ dbConfig: { storageMode: 'postgresql', host: 'localhost', port: '5432', database: 'accounting_db', schema: 'public', username: 'postgres', password: '', tables: { accounts: 'accounts', journals: 'journals', journalLines: 'journal_lines', periods: 'periods', users: 'users', entities: 'entities', sessions: 'sessions', attachments: 'attachments' } } })
    render(<DatabaseSettings />)

    fireEvent.change(screen.getByTestId('table-input-accounts'), { target: { value: 'coa_master' } })
    fireEvent.change(screen.getByTestId('table-input-journals'), { target: { value: 'buku_jurnal' } })
    fireEvent.click(screen.getByRole('button', { name: /Simpan Pengaturan/ }))

    const state = useStore.getState()
    expect(state.dbConfig.tables.accounts).toBe('coa_master')
    expect(state.dbConfig.tables.journals).toBe('buku_jurnal')
  })
})
