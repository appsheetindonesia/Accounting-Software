// @vitest-environment happy-dom
// Test tombol 'Setujui' inline di baris jurnal Menunggu Approval (tanpa buka
// detail): tampil untuk admin, klik → status posted; tidak tampil untuk viewer
// atau jurnal draft/posted.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { mockAccounts, mockJournals } from '../../data/mock'
import { useStore } from '../../store/useStore'
import JournalTable from './JournalTable'

const admin = { id: 'user-001', name: 'Rina', email: 'rina@estetikakreasi.co.id', role: 'admin' }
const viewer = { id: 'user-003', name: 'Budi', email: 'budi@estetikakreasi.co.id', role: 'viewer' }

// Jurnal menunggu approval (status server pending-approval, belum diposting)
const pendingJournal = {
  ...mockJournals[0],
  id: 'JNL-2026-03-012',
  transactionNumber: 'BKK-2026-03-0011',
  description: 'Pembelian ATK — menunggu approval',
  status: 'pending-approval' as const,
}

beforeEach(() => {
  useStore.setState({
    apiStatus: 'offline', // jalur lokal (tanpa api) agar approve transisi status murni di store
    user: admin,
    accounts: mockAccounts,
    journals: [pendingJournal],
    toast: null,
  })
})

afterEach(() => {
  useStore.setState({ apiStatus: 'idle', user: null })
  cleanup()
})

describe('JournalTable — Setujui langsung di baris (tanpa buka detail)', () => {
  it('admin melihat tombol Setujui di baris Menunggu Approval; klik → status posted + toast sukses', () => {
    render(<JournalTable journals={[pendingJournal]} />)

    const btn = screen.getByRole('button', { name: `Setujui ${pendingJournal.transactionNumber}` })
    expect(btn).toHaveProperty('disabled', false)

    fireEvent.click(btn)

    const s = useStore.getState()
    expect(s.journals[0].status).toBe('posted')
    expect(s.journals[0].postedAt).toBeTruthy()
    expect(s.toast?.kind).toBe('success')
  })

  it('klik ganda cepat pada Setujui baris yang SAMA (satu frame) → approve hanya SEKALI (guard ref)', () => {
    const approveSpy = vi.spyOn(useStore.getState(), 'approveJournal')
    render(<JournalTable journals={[pendingJournal]} />)

    const btn = screen.getByRole('button', { name: `Setujui ${pendingJournal.transactionNumber}` })
    fireEvent.click(btn)
    fireEvent.click(btn) // frame yang sama — state React di-batch, guard ref menolak

    expect(approveSpy).toHaveBeenCalledTimes(1)
    const s = useStore.getState()
    expect(s.journals[0].status).toBe('posted')
    expect(s.toast?.kind).toBe('success')
    approveSpy.mockRestore()
  })

  it('viewer TIDAK melihat tombol Setujui (tanpa izin approve)', () => {
    useStore.setState({ user: viewer })
    render(<JournalTable journals={[pendingJournal]} />)

    expect(screen.queryByRole('button', { name: /Setujui/ })).toBeNull()
  })

  it('jurnal draft & posted TIDAK menampilkan tombol Setujui', () => {
    render(<JournalTable journals={[mockJournals[0], mockJournals[5]]} />) // posted + draft

    expect(screen.queryByRole('button', { name: /Setujui/ })).toBeNull()
  })
})

describe('JournalTable — Tolak langsung di baris (dialog alasan wajib, tanpa buka detail)', () => {
  it('admin melihat tombol Tolak di baris Menunggu Approval; klik → dialog alasan wajib muncul', () => {
    render(<JournalTable journals={[pendingJournal]} />)

    const btn = screen.getByRole('button', { name: `Tolak ${pendingJournal.transactionNumber}` })
    expect(btn).toHaveProperty('disabled', false)

    fireEvent.click(btn)

    // Dialog Reject terbuka dengan tombol konfirmasi nonaktif (alasan belum diisi)
    const dialog = screen.getByRole('dialog', { name: 'Tolak jurnal' })
    expect(dialog).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reject' })).toHaveProperty('disabled', true)
  })

  it('isi alasan wajib → Reject → status kembali draft + rejectionReason tersimpan + toast', async () => {
    render(<JournalTable journals={[pendingJournal]} />)

    fireEvent.click(screen.getByRole('button', { name: `Tolak ${pendingJournal.transactionNumber}` }))
    fireEvent.change(screen.getByLabelText('Alasan penolakan'), { target: { value: 'Bukti pendukung belum lengkap' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await act(async () => {}) // rejectJournal async → tunggu microtask sebelum asersi

    const s = useStore.getState()
    expect(s.journals[0].status).toBe('draft')
    expect(s.journals[0].rejectionReason).toBe('Bukti pendukung belum lengkap')
    expect(s.toast?.message).toBe('Jurnal ditolak — kembali ke draft')
    expect(s.toast?.kind).toBe('success')
    // Dialog tertutup setelah konfirmasi
    expect(screen.queryByRole('dialog', { name: 'Tolak jurnal' })).toBeNull()
  })

  it('viewer TIDAK melihat tombol Tolak (tanpa izin approve)', () => {
    useStore.setState({ user: viewer })
    render(<JournalTable journals={[pendingJournal]} />)

    expect(screen.queryByRole('button', { name: /Tolak/ })).toBeNull()
  })

  it('jurnal draft & posted TIDAK menampilkan tombol Tolak', () => {
    render(<JournalTable journals={[mockJournals[0], mockJournals[5]]} />) // posted + draft

    expect(screen.queryByRole('button', { name: /Tolak/ })).toBeNull()
  })
})
