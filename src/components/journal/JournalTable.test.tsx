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

describe('JournalTable — rejectionReason di baris EXPAND detail (bukan hanya Dashboard)', () => {
  // Jurnal ditolak: status kembali draft + rejectionReason terisi (mirror server).
  const rejectedJournal = {
    ...mockJournals[5], // draft
    id: 'JNL-2026-03-099',
    transactionNumber: 'BKK-2026-03-0099',
    description: 'Pembelian ATK — ditolak',
    status: 'draft' as const,
    rejectionReason: 'Bukti pendukung belum lengkap',
  }

  it('jurnal ditolak: baris tertutup TIDAK menampilkan badge; setelah expand (Buka detail) badge "Ditolak — alasan" TAMPIL', () => {
    render(<JournalTable journals={[rejectedJournal]} />)

    // Sebelum expand: badge rejectionReason belum tampil
    expect(screen.queryByText(/Ditolak — alasan/)).toBeNull()

    // Expand baris detail
    fireEvent.click(screen.getByRole('button', { name: 'Buka detail' }))

    // Badge tampil di baris expand detail: "Ditolak — alasan: <reason>"
    const badge = screen.getByText(/Ditolak — alasan:/)
    expect(badge).toBeTruthy()
    expect(badge.textContent).toContain('Bukti pendukung belum lengkap')
    expect(screen.getByText('Bukti pendukung belum lengkap', { exact: true })).toBeTruthy()
  })

  it('jurnal TANPA rejectionReason: tidak ada badge walau baris di-expand', () => {
    render(<JournalTable journals={[mockJournals[5]]} />) // draft tanpa rejectionReason

    fireEvent.click(screen.getByRole('button', { name: 'Buka detail' }))

    expect(screen.queryByText(/Ditolak — alasan/)).toBeNull()
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

describe('JournalTable — scroll-into-view saat focusJournalId di-set', () => {
  it('baris yang di-fokuskan di-scroll ke tengah viewport (id journal-row-<id>)', () => {
    // happy-dom: requestAnimationFrame async — jalankan sinkron agar rAF callback
    // dieksekusi segera di dalam test (bukan menunggu frame berikutnya).
    const origRaf = window.requestAnimationFrame
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    }
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})

    useStore.setState({ focusJournalId: 'JNL-2026-03-002', clearSearchFocus: () => {} })
    render(<JournalTable journals={[mockJournals[0], mockJournals[1], mockJournals[2]]} />)

    // Efek scroll berjalan setelah render + rAF sinkron
    expect(scrollSpy).toHaveBeenCalledTimes(1)
    expect(scrollSpy.mock.calls[0][0]).toEqual({ block: 'center', behavior: 'smooth' })
    // Baris target ter-expand (detail terbuka) + punya id yang di-scroll
    expect(document.getElementById('journal-row-JNL-2026-03-002')).not.toBeNull()

    scrollSpy.mockRestore()
    window.requestAnimationFrame = origRaf
  })
})
