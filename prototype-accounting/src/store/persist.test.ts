import { describe, expect, it, vi } from 'vitest'
import { migratePersistedState, freshPersistedState, CURRENT_VERSION, setMigrationHandler, type PersistedShape } from './persist'
import { mockAccounts, mockJournals, SEED_JOURNAL_IDS, SEED_VERSION } from '../data/mock'
import type { JournalEntry } from '../types'

// Jurnal buatan pengguna (id di luar seed) — mis. hasil localSave/saveJournal.
// TANPA field `source` — meniru data format v1 (sebelum field itu ada).
const userJournal = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  id: 'JNL-2026-03-009',
  transactionNumber: 'BKM-2026-03-0009',
  date: '2026-03-25',
  description: 'Penerimaan jasa PT Test',
  lines: [
    { id: 'u-1', accountId: '1-1100', accountCode: '1-1100', accountName: 'Kas Besar', debit: 10_000_000, credit: 0, description: 'Tunai' },
    { id: 'u-2', accountId: '4-1000', accountCode: '4-1000', accountName: 'Pendapatan Jasa', debit: 0, credit: 10_000_000, description: 'Pendapatan' },
  ],
  status: 'posted',
  createdBy: 'Rina',
  createdAt: '2026-03-25T08:00:00Z',
  postedAt: '2026-03-25T08:01:00Z',
  ...overrides,
})

// State lama yang di-reverse pengguna (seed id, tapi diubah → harus dipertahankan)
const reversedSeedJournal: JournalEntry = {
  ...mockJournals[0],
  status: 'reversed',
  reversalOf: 'REV-BKM-2026-03-0001',
}

describe('migratePersistedState — migrasi saat mock data (seed) berubah', () => {
  it('jurnal pengguna dipertahankan, jurnal seed diganti dengan nilai terbaru', () => {
    // Simulasi data v1 TANPA metadata seedJournalIds: jurnal seed dengan nilai
    // LAMA (mis. nominal berubah di mock data) + 1 jurnal buatan pengguna.
    const oldSeed = {
      ...mockJournals[0],
      description: 'Versi lama: nominal 30jt',
      lines: mockJournals[0].lines.map((l) => ({ ...l, debit: 30_000_000 })),
    }
    const persisted: Partial<PersistedShape> = {
      accounts: mockAccounts,
      journals: [userJournal(), oldSeed, ...mockJournals.slice(1)],
      activePeriod: '2026-03',
    }

    const migrated = migratePersistedState(persisted, 1) // data v1

    // Akun dari seed terbaru
    expect(migrated.accounts).toEqual(mockAccounts)

    // Jurnal pengguna tetap ada
    expect(migrated.journals.some((j) => j.id === 'JNL-2026-03-009')).toBe(true)

    // Seed diganti nilai terbaru (bukan versi lama 30jt)
    const seed = migrated.journals.find((j) => j.id === 'JNL-2026-03-001')!
    expect(seed.description).toBe(mockJournals[0].description)
    expect(seed.lines[0].debit).toBe(25_000_000)

    // Tidak ada dobel jurnal seed
    const count001 = migrated.journals.filter((j) => j.id === 'JNL-2026-03-001').length
    expect(count001).toBe(1)
  })

  it('jurnal seed yang di-reverse pengguna dipertahankan (tidak hidup kembali jadi posted)', () => {
    const persisted: Partial<PersistedShape> = {
      journals: [reversedSeedJournal, userJournal(), ...mockJournals.slice(1)],
      activePeriod: '2026-03',
    }

    const migrated = migratePersistedState(persisted, 1)

    const j001 = migrated.journals.find((j) => j.id === 'JNL-2026-03-001')!
    expect(j001.status).toBe('reversed')
    expect(j001.reversalOf).toBe('REV-BKM-2026-03-0001')
  })

  it('metadata seed terekam untuk migrasi berikutnya', () => {
    const migrated = migratePersistedState({ journals: [userJournal()], activePeriod: '2026-02' }, 1)
    expect(migrated.seedVersion).toBe(SEED_VERSION)
    expect(migrated.seedJournalIds).toEqual(SEED_JOURNAL_IDS)
    expect(migrated.activePeriod).toBe('2026-02') // field user dipertahankan
  })

  it('data kosong / korup → fresh seed (tanpa crash)', () => {
    for (const bad of [null, undefined, {}, { journals: 'bukan-array' }]) {
      const migrated = migratePersistedState(bad)
      expect(migrated.accounts).toEqual(mockAccounts)
      expect(migrated.journals).toEqual(mockJournals)
      expect(migrated.seedVersion).toBe(SEED_VERSION)
    }
  })

  it('idempoten: migrasi dua kali menghasilkan state yang sama', () => {
    const once = migratePersistedState({ journals: [userJournal(), ...mockJournals], activePeriod: '2026-03' }, 1)
    const twice = migratePersistedState(once, 1)
    expect(twice).toEqual(once)
  })

  it('jurnal seed baru yang belum ada di state lama ditambahkan (tidak hilang)', () => {
    // State lama hanya punya sebagian seed (mis. 5 dari 8) + jurnal user
    const partial = mockJournals.slice(0, 5)
    const migrated = migratePersistedState({ journals: [...partial, userJournal()], activePeriod: '2026-03' }, 1)
    const ids = migrated.journals.map((j) => j.id)
    for (const seed of mockJournals) expect(ids).toContain(seed.id) // semua seed terbaru ada
    expect(ids).toContain('JNL-2026-03-009') // user tetap ada
  })
})

describe('migrasi PER-VERSION (registry MIGRATIONS[v])', () => {
  it('v1 → v2: field baru `source` ditambahkan ke jurnal (default manual)', () => {
    const migrated = migratePersistedState({ journals: [userJournal()], activePeriod: '2026-03' }, 1)
    const user = migrated.journals.find((j) => j.id === 'JNL-2026-03-009')!
    expect(user.source).toBe('manual')
    // Seed terbaru juga konsisten format v2
    for (const j of migrated.journals) expect(j.source).toBe('manual')
  })

  it('fromVersion 2: source TIDAK diubah — nilai lama (mis. import) dipertahankan', () => {
    const migrated = migratePersistedState(
      { journals: [{ ...userJournal(), source: 'import' as const }], activePeriod: '2026-03' },
      2,
    )
    expect(migrated.journals.find((j) => j.id === 'JNL-2026-03-009')!.source).toBe('import')
  })

  it('v2 → v3: akun seed baru 1-1500 Kas Kecil ditambahkan ke data lama', () => {
    const payload = {
      journals: [],
      accounts: mockAccounts.filter((a) => a.id !== '1-1500'), // data v2 belum punya Kas Kecil
      activePeriod: '2026-03',
    }
    const migrated = migratePersistedState(payload, 2)
    expect(migrated.accounts.some((a) => a.id === '1-1500' && a.name === 'Kas Kecil')).toBe(true)
  })

  it('fromVersion 3: akun seed yang sudah ada tidak digandakan', () => {
    const migrated = migratePersistedState({ journals: [], accounts: mockAccounts, activePeriod: '2026-03' }, 3)
    expect(migrated.accounts.filter((a) => a.id === '1-1500')).toHaveLength(1)
  })

  it('v3 → v4: offlineQueue ditambahkan (default kosong); fromVersion 4 mempertahankan isinya', () => {
    const fromV3 = migratePersistedState({ journals: [], activePeriod: '2026-03' }, 3)
    expect(fromV3.offlineQueue).toEqual([])

    const op = { id: 'op-1', kind: 'post' as const, ref: 'JNL-2026-03-006' }
    const fromV4 = migratePersistedState({ journals: [], offlineQueue: [op], activePeriod: '2026-03' }, 4)
    expect(fromV4.offlineQueue).toEqual([op])
  })

  it('v4 → v5: lastSyncedAt ditambahkan (null); fromVersion 5 mempertahankan nilai', () => {
    const fromV4 = migratePersistedState({ journals: [], activePeriod: '2026-03' }, 4)
    expect(fromV4.lastSyncedAt).toBeNull()

    const fromV5 = migratePersistedState({ journals: [], lastSyncedAt: '2026-08-15T04:00:00Z', activePeriod: '2026-03' }, 5)
    expect(fromV5.lastSyncedAt).toBe('2026-08-15T04:00:00Z')
  })

  it('rantai penuh v1 → v5: source + Kas Kecil + antrian + lastSyncedAt semuanya ada', () => {
    const migrated = migratePersistedState({ journals: [userJournal()], activePeriod: '2026-03' }, 1)
    expect(migrated.journals.find((j) => j.id === 'JNL-2026-03-009')!.source).toBe('manual')
    expect(migrated.accounts.some((a) => a.id === '1-1500')).toBe(true)
    expect(migrated.offlineQueue).toEqual([])
    expect(migrated.lastSyncedAt).toBeNull()
    expect(migrated.seedVersion).toBe(SEED_VERSION)
  })
})

describe('handler migrasi — notifikasi "Data lokal dimigrasi ke versi baru"', () => {
  it('upgrade versi menembak handler dengan info yang benar', () => {
    const handler = vi.fn()
    setMigrationHandler(handler)
    try {
      // Data v1: 1 jurnal user + seed lama; upgrade → handler terpanggil
      migratePersistedState({ journals: [userJournal(), ...mockJournals], activePeriod: '2026-03' }, 1)
      expect(handler).toHaveBeenCalledTimes(1)
      const info = handler.mock.calls[0][0]
      expect(info.fromVersion).toBe(1)
      expect(info.toVersion).toBe(CURRENT_VERSION)
      // 1 jurnal user (JNL-2026-03-009) dipertahankan
      expect(info.preservedUserJournals).toBe(1)
    } finally {
      setMigrationHandler(null)
    }
  })

  it('data versi SEKARANG (v5) TIDAK menembak handler (bukan migrasi)', () => {
    const handler = vi.fn()
    setMigrationHandler(handler)
    try {
      migratePersistedState({ journals: [userJournal()], activePeriod: '2026-03' }, CURRENT_VERSION)
      expect(handler).not.toHaveBeenCalled()
    } finally {
      setMigrationHandler(null)
    }
  })

  it('data korup / fromVersion 0 (tanpa versi) TIDAK menembak handler', () => {
    const handler = vi.fn()
    setMigrationHandler(handler)
    try {
      migratePersistedState(null)
      migratePersistedState({ journals: [userJournal()], activePeriod: '2026-03' }, 0)
      expect(handler).not.toHaveBeenCalled()
    } finally {
      setMigrationHandler(null)
    }
  })

  it('preservedUserJournals menghitung seed yang dimodifikasi pengguna (reversed)', () => {
    const handler = vi.fn()
    setMigrationHandler(handler)
    try {
      const reversedSeed = { ...mockJournals[0], status: 'reversed' as const, reversalOf: 'REV-X' }
      migratePersistedState({ journals: [reversedSeed, userJournal()], activePeriod: '2026-03' }, 1)
      // 1 jurnal user + 1 seed yang di-reverse user = 2 dipertahankan
      expect(handler.mock.calls[0][0].preservedUserJournals).toBe(2)
    } finally {
      setMigrationHandler(null)
    }
  })
})

describe('freshPersistedState & CURRENT_VERSION', () => {
  it('CURRENT_VERSION = 5 (bump saat struktur/seed berubah)', () => {
    expect(CURRENT_VERSION).toBe(5)
  })

  it('freshPersistedState = seed murni tanpa jurnal user', () => {
    const f = freshPersistedState()
    expect(f.journals).toEqual(mockJournals)
    expect(f.seedJournalIds).toEqual(SEED_JOURNAL_IDS)
  })
})
