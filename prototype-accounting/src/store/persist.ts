// Migrasi state persist (zustand/middleware.persist) — PER-VERSION.
//
// Bukan satu fungsi generik: setiap perubahan format state tersimpan punya
// migrasi KECIL sendiri yang diregistrasi di MIGRATIONS[v] (dari versi v ke
// v+1). migratePersistedState() menjalankan rantai migrasi dari versi data
// tersimpan sampai CURRENT_VERSION, lalu langkah terakhir me-refresh seed.
//
// Versi format (naikkan CURRENT_VERSION saat struktur berubah):
//   v1 — format dasar (accounts, journals, activePeriod)
//   v2 — CONTOH 1: field baru `source` pada jurnal (default 'manual')
//   v3 — CONTOH 2: akun seed baru `1-1500 · Kas Kecil`
//   v4 — antrian offline (offlineQueue)
//   v5 — waktu sinkron terakhir (lastSyncedAt)
// (Metadata seed + sesi login bukan bagian versi — diurus langkah refresh
//  seed & normalisasi, sehingga menaikkan SEED_VERSION cukup dipicu dengan
//  bump CURRENT_VERSION agar refresh seed dijalankan.)
import { mockAccounts, mockJournals, SEED_JOURNAL_IDS, SEED_VERSION } from '../data/mock'
import type { Account, JournalEntry, OfflineJournalOp } from '../types'

// Bentuk data yang tersimpan di localStorage (subset dari AccountingState +
// metadata seed untuk migrasi ke depan).
export interface PersistedShape {
  accounts: Account[]
  journals: JournalEntry[]
  activePeriod: string
  seedVersion: number
  seedJournalIds: string[]
  // Sesi login: token & user tersimpan agar reload tidak login ulang.
  accessToken?: string | null
  refreshToken?: string | null
  user?: { id: string; name: string; email: string; role: string } | null
  // Antrian operasi offline: jurnal yang dibuat saat server mati, akan
  // di-flush ke API begitu koneksi pulih. Tidak boleh hilang saat reload.
  offlineQueue?: OfflineJournalOp[]
  // Waktu sinkronisasi terakhir: indikator "Data dari cache · sinkron X".
  lastSyncedAt?: string | null
}

export const CURRENT_VERSION = 5

// Info migrasi yang benar-benar terjadi (upgrade versi) — dipakai untuk
// memberitahu user lewat toast bahwa state lokal TIDAK hilang. Handler
// diregistrasi useStore.ts (pola sama seperti setTokensRefreshedHandler).
export interface MigrationInfo {
  fromVersion: number
  toVersion: number
  preservedUserJournals: number
}

type MigrationHandler = (info: MigrationInfo) => void
let migrationHandler: MigrationHandler | null = null

export const setMigrationHandler = (fn: MigrationHandler | null) => {
  migrationHandler = fn
}

// ---------------------------------------------------------------------------
// Migrasi per-version — MIGRATIONS[v] mengubah state versi v → v+1.
// Aturan: IDEMPOTEN & ADDITIF — hanya menambah field yang hilang, tidak
// pernah menghapus/mengubah data pengguna.
// ---------------------------------------------------------------------------
type Migration = (s: PersistedShape) => PersistedShape

// v1 → v2 — CONTOH 1: field baru `source` pada jurnal.
// Data lama tidak punya field ini; migrasi menambahkan nilai default 'manual'
// ke SEMUA jurnal (seed + buatan pengguna) agar konsisten dengan format baru.
const addJournalSource: Migration = (s) => ({
  ...s,
  journals: s.journals.map((j) => ({ ...j, source: j.source ?? ('manual' as const) })),
})

// v2 → v3 — CONTOH 2: akun seed baru `1-1500 · Kas Kecil`.
// Akun baru ditambahkan ke chart of accounts data lama (diambil dari seed
// terbaru). baseBalance 0 → identitas Aset = K+E tidak berubah.
const addSeedAccounts: Migration = (s) => {
  const missing = mockAccounts.filter((a) => !s.accounts.some((x) => x.id === a.id))
  return missing.length ? { ...s, accounts: [...s.accounts, ...missing] } : s
}

// v3 → v4: antrian operasi offline (field baru, default kosong).
const addOfflineQueue: Migration = (s) => ({
  ...s,
  offlineQueue: Array.isArray(s.offlineQueue) ? s.offlineQueue : [],
})

// v4 → v5: waktu sinkron terakhir (field baru, default null = belum pernah).
const addLastSyncedAt: Migration = (s) => ({
  ...s,
  lastSyncedAt: typeof s.lastSyncedAt === 'string' ? s.lastSyncedAt : null,
})

// Rantai migrasi: dari versi v → v+1. Versi tanpa entri = tidak ada perubahan
// struktur pada langkah itu (data langsung lolos ke versi berikutnya).
const MIGRATIONS: Record<number, Migration> = {
  1: addJournalSource, // v1 → v2 (contoh 1)
  2: addSeedAccounts, // v2 → v3 (contoh 2)
  3: addOfflineQueue, // v3 → v4
  4: addLastSyncedAt, // v4 → v5
}

export const freshPersistedState = (): PersistedShape => ({
  accounts: mockAccounts,
  journals: mockJournals,
  activePeriod: '2026-03',
  seedVersion: SEED_VERSION,
  seedJournalIds: SEED_JOURNAL_IDS,
  offlineQueue: [],
  lastSyncedAt: null,
})

// Normalisasi input tersimpan → bentuk dasar PersistedShape (defensif:
// field hilang/salah tipe diberi default, jurnal tanpa id dibuang).
const normalizePersisted = (persisted: unknown): PersistedShape | null => {
  const p = persisted as Partial<PersistedShape> | null
  if (!p || !Array.isArray(p.journals)) return null
  return {
    accounts: Array.isArray(p.accounts) ? p.accounts : mockAccounts,
    journals: p.journals.filter((j): j is JournalEntry => Boolean(j && j.id)),
    activePeriod: typeof p.activePeriod === 'string' ? p.activePeriod : '2026-03',
    seedVersion: typeof p.seedVersion === 'number' ? p.seedVersion : 0,
    seedJournalIds: Array.isArray(p.seedJournalIds) ? p.seedJournalIds : [],
    accessToken: typeof p.accessToken === 'string' ? p.accessToken : null,
    refreshToken: typeof p.refreshToken === 'string' ? p.refreshToken : null,
    user: p.user && typeof p.user === 'object' ? p.user : null,
    offlineQueue: Array.isArray(p.offlineQueue) ? p.offlineQueue : [],
    lastSyncedAt: typeof p.lastSyncedAt === 'string' ? p.lastSyncedAt : null,
  }
}

// Langkah akhir: refresh seed. Jurnal seed diganti dengan versi terbaru
// (mockJournals), jurnal buatan pengguna & seed yang DIUBAH pengguna
// (reversed) dipertahankan; akun selalu dari seed terbaru.
const refreshSeed = (p: PersistedShape): PersistedShape => {
  const seedIds = new Set(p.seedJournalIds.length ? p.seedJournalIds : SEED_JOURNAL_IDS)

  const userJournals = p.journals.filter((j): j is JournalEntry => {
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
    accessToken: p.accessToken ?? null,
    refreshToken: p.refreshToken ?? null,
    user: p.user ?? null,
    offlineQueue: p.offlineQueue ?? [],
    lastSyncedAt: p.lastSyncedAt ?? null,
  }
}

// Migrasi data lama → versi saat ini.
//
// `fromVersion` = versi data tersimpan (zustand persist meneruskannya).
//  1. Normalisasi ke bentuk dasar.
//  2. Jalankan MIGRATIONS[fromVersion..CURRENT_VERSION-1] berurutan.
//  3. Refresh seed (jurnal seed terbaru, jurnal pengguna dipertahankan).
//
// Upgrade versi (fromVersion ≥ 1 dan < CURRENT_VERSION) menembak handler
// migrasi → toast "Data lokal dimigrasi ke versi baru" di UI.
export const migratePersistedState = (persisted: unknown, fromVersion = 0): PersistedShape => {
  const base = normalizePersisted(persisted)
  if (!base) return freshPersistedState()

  let state = base
  for (let v = fromVersion; v < CURRENT_VERSION; v++) {
    const migrate = MIGRATIONS[v]
    if (migrate) state = migrate(state)
  }
  const result = refreshSeed(state)

  const upgraded = fromVersion >= 1 && fromVersion < CURRENT_VERSION
  if (upgraded) {
    // Jumlah jurnal yang DI-PERTAHANKAN sebagai data pengguna: jurnal buatan
    // user (id di luar seed) + jurnal seed yang diubah user (mis. di-reverse,
    // status/reversalOf berbeda dari seed terbaru). Jurnal seed lama yang
    // identik dengan seed terbaru bukan data user → tidak dihitung.
    const seedById = new Map(mockJournals.map((j) => [j.id, j]))
    const preserved = result.journals.filter((j) => {
      const seed = seedById.get(j.id)
      if (!seed) return true
      return j.status !== seed.status || j.reversalOf !== seed.reversalOf
    }).length
    migrationHandler?.({ fromVersion, toVersion: CURRENT_VERSION, preservedUserJournals: preserved })
  }
  return result
}
