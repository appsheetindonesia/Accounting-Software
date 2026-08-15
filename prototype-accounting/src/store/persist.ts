// Migrasi state persist (zustand/middleware.persist).
//
// Masalah yang dipecahkan: saat mock data (seed) berubah di masa depan,
// naikkan CURRENT_VERSION + SEED_VERSION. Zustand lalu memanggil migrate()
// untuk data lama — alih-alih meng-reset seluruh state ke seed (yang
// menghapus jurnal buatan pengguna), migrasi mengganti bagian SEED dengan
// seed terbaru dan mempertahankan jurnal milik pengguna.
import { mockAccounts, mockJournals, SEED_JOURNAL_IDS, SEED_VERSION } from '../data/mock'
import type { Account, JournalEntry } from '../types'

// Bentuk data yang tersimpan di localStorage (subset dari AccountingState +
// metadata seed untuk migrasi ke depan).
export interface PersistedShape {
  accounts: Account[]
  journals: JournalEntry[]
  activePeriod: string
  seedVersion: number
  seedJournalIds: string[]
  // Sesi login (v3): token & user tersimpan agar reload tidak login ulang.
  accessToken?: string | null
  refreshToken?: string | null
  user?: { id: string; name: string; email: string; role: string } | null
}

// Versi format state tersimpan. NAIKKAN saat struktur data/seed berubah.
// v3: menambah sesi login (accessToken + user) — field opsional, migrasi
// lama tetap mempertahankan jurnal pengguna.
// (Jangan ganti STORAGE_KEY — itu membuat data lama ter-orphan dan hilang.)
export const CURRENT_VERSION = 3

export const freshPersistedState = (): PersistedShape => ({
  accounts: mockAccounts,
  journals: mockJournals,
  activePeriod: '2026-03',
  seedVersion: SEED_VERSION,
  seedJournalIds: SEED_JOURNAL_IDS,
})

// Migrasi data lama → versi saat ini.
//
// Aturan:
// 1. Jurnal SEED (id tercatat di seedJournalIds milik state lama, atau —
//    untuk data v1 yang belum punya metadata — id seed saat ini) diganti
//    dengan seed terbaru. Nilai lama dibuang, nilai baru diambil.
// 2. Jurnal buatan pengguna (id di luar seed) dipertahankan apa adanya.
// 3. Jurnal seed yang DIUBAH pengguna (mis. di-reverse → status 'reversed'
//    atau reversalOf terisi) dipertahankan versi pengguna, agar pembatalan
//    tidak "hidup kembali" menjadi posted saat migrasi.
// 4. Akun selalu diambil dari seed terbaru (tidak ada UI edit akun).
export const migratePersistedState = (persisted: unknown): PersistedShape => {
  const p = persisted as Partial<PersistedShape> | null
  if (!p || !Array.isArray(p.journals)) return freshPersistedState()

  const seedIds = new Set(p.seedJournalIds?.length ? p.seedJournalIds : SEED_JOURNAL_IDS)

  const userJournals = p.journals.filter((j): j is JournalEntry => {
    if (!j || !j.id) return false
    if (!seedIds.has(j.id)) return true // bukan jurnal seed → milik pengguna
    // Seed yang dimodifikasi pengguna (di-reverse) tetap dipertahankan
    return j.status === 'reversed' || Boolean(j.reversalOf)
  })

  // Jangan dobel: jika user journal memakai id yang bentrok dengan seed baru
  const keptIds = new Set(userJournals.map((j) => j.id))
  const seedJournals = mockJournals.filter((j) => !keptIds.has(j.id))

  return {
    accounts: mockAccounts,
    journals: [...seedJournals, ...userJournals],
    activePeriod: p.activePeriod ?? '2026-03',
    seedVersion: SEED_VERSION,
    seedJournalIds: SEED_JOURNAL_IDS,
  }
}
