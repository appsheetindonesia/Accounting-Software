// @vitest-environment happy-dom
// Test tombol 'Setujui' inline di baris jurnal Menunggu Approval (tanpa buka
// detail): tampil untuk admin, klik → status posted; tidak tampil untuk viewer
// atau jurnal draft/posted.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
