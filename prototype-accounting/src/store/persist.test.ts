import { describe, expect, it } from 'vitest'
import { migratePersistedState, freshPersistedState, CURRENT_VERSION, type PersistedShape } from './persist'
import { mockAccounts, mockJournals, SEED_JOURNAL_IDS, SEED_VERSION } from '../data/mock'
import type { JournalEntry } from '../types'

// Jurnal buatan pengguna (id di luar seed) — mis. hasil localSave/saveJournal
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

    const migrated = migratePersistedState(persisted)

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

    const migrated = migratePersistedState(persisted)

    const j001 = migrated.journals.find((j) => j.id === 'JNL-2026-03-001')!
    expect(j001.status).toBe('reversed')
    expect(j001.reversalOf).toBe('REV-BKM-2026-03-0001')
  })

  it('metadata seed terekam untuk migrasi berikutnya', () => {
    const migrated = migratePersistedState({ journals: [userJournal()], activePeriod: '2026-02' })
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
    const once = migratePersistedState({ journals: [userJournal(), ...mockJournals], activePeriod: '2026-03' })
    const twice = migratePersistedState(once)
    expect(twice).toEqual(once)
  })

  it('jurnal seed baru yang belum ada di state lama ditambahkan (tidak hilang)', () => {
    // State lama hanya punya sebagian seed (mis. 5 dari 8) + jurnal user
    const partial = mockJournals.slice(0, 5)
    const migrated = migratePersistedState({ journals: [...partial, userJournal()], activePeriod: '2026-03' })
    const ids = migrated.journals.map((j) => j.id)
    for (const seed of mockJournals) expect(ids).toContain(seed.id) // semua seed terbaru ada
    expect(ids).toContain('JNL-2026-03-009') // user tetap ada
  })
})

describe('freshPersistedState & CURRENT_VERSION', () => {
  it('CURRENT_VERSION = 2 (bump saat struktur/seed berubah)', () => {
    expect(CURRENT_VERSION).toBe(2)
  })

  it('freshPersistedState = seed murni tanpa jurnal user', () => {
    const f = freshPersistedState()
    expect(f.journals).toEqual(mockJournals)
    expect(f.seedJournalIds).toEqual(SEED_JOURNAL_IDS)
  })
})
