// Test integrasi REHIDRASI PENUH lewat localStorage (zustand persist NYATA,
// bukan unit test migrate langsung). Skenario upgrade nyata: SEED_VERSION
// naik 1 → 2 dan nilai mock data berubah (koreksi nominal BKM-0004 15jt →
// 12jt + jurnal seed draft baru JNL-010) — jurnal buatan pengguna HARUS
// bertahan saat state lama di-rehydrasi terhadap seed terbaru.
import { beforeEach, describe, expect, it } from 'vitest'
// WAJIB di-import SEBELUM ./useStore: zustand v5 persist membuat storage
// secara eager saat store dibuat (lihat _localStoragePolyfill.ts).
import './_localStoragePolyfill'
import { useStore } from './useStore'
import { CURRENT_VERSION, freshPersistedState } from './persist'
import { mockAccounts, mockJournals, SEED_VERSION } from '../data/mock'
import type { JournalEntry } from '../types'

// Key localStorage store (hardcode — lihat STORAGE_KEY di useStore.ts)
const STORAGE_KEY = 'appsheet-accounting-v1'
const ls = () => globalThis.localStorage

// ---------- Fixture: seed v1 (SEBELUM koreksi 2026-08) ----------
// JNL-004 masih 15jt (sebelum dikoreksi 12jt), TANPA jurnal draft JNL-010.
const OLD_SEED_JOURNALS: JournalEntry[] = mockJournals
  .filter((j) => j.id !== 'JNL-2026-03-010')
  .map((j) =>
    j.id === 'JNL-2026-03-004'
      ? {
          ...j,
          description: 'Penerimaan pembayaran piutang PT ABC',
          lines: j.lines.map((l) =>
            l.id === 'l4-1' ? { ...l, debit: 15_000_000 } : l.id === 'l4-2' ? { ...l, credit: 15_000_000 } : l,
          ),
        }
      : j,
  )
const OLD_SEED_IDS = OLD_SEED_JOURNALS.map((j) => j.id)

// Jurnal buatan pengguna (id di luar seed — HARUS bertahan saat migrasi)
const userJournal: JournalEntry = {
  id: 'JNL-USER-999',
  transactionNumber: 'BKM-USER-0001',
  date: '2026-03-25',
  description: 'Jurnal buatan pengguna (harus bertahan)',
  lines: [
    { id: 'u1', accountId: '1-1100', accountCode: '1-1100', accountName: 'Kas Besar', debit: 7_500_000, credit: 0 },
    { id: 'u2', accountId: '4-1000', accountCode: '4-1000', accountName: 'Pendapatan Jasa', debit: 0, credit: 7_500_000 },
  ],
  status: 'posted',
  createdBy: 'Rina',
  createdAt: '2026-03-25T08:00:00Z',
  postedAt: '2026-03-25T08:01:00Z',
}

const writePersisted = (state: unknown, version: number) =>
  ls().setItem(STORAGE_KEY, JSON.stringify({ state, version }))

beforeEach(async () => {
  ls().clear()
  // Baseline seed murni di memori (seperti store baru setelah reload)
  useStore.setState(freshPersistedState() as never)
  await useStore.persist!.rehydrate()
})

describe('rehidrasi penuh via localStorage — upgrade seed v1 → v2', () => {
  it('jurnal pengguna BERTAHAN, seed diganti nilai terbaru + jurnal seed baru ditambahkan', async () => {
    // Simulasi data tersimpan dari SEED_VERSION 1 (sebelum koreksi):
    // seed lama (JNL-004 15jt, tanpa JNL-010) + 1 jurnal pengguna
    writePersisted(
      {
        accounts: mockAccounts,
        journals: [userJournal, ...OLD_SEED_JOURNALS],
        activePeriod: '2026-03',
        seedVersion: 1,
        seedJournalIds: OLD_SEED_IDS,
      },
      1,
    )

    await useStore.persist!.rehydrate()

    const s = useStore.getState()
    // 1. Jurnal pengguna BERTAHAN
    expect(s.journals.some((j) => j.id === 'JNL-USER-999')).toBe(true)
    // 2. Jurnal seed baru (v2) ikut termuat — tidak hilang
    expect(s.journals.some((j) => j.id === 'JNL-2026-03-010')).toBe(true)
    // 3. Seed lama diganti nilai terbaru: JNL-004 sekarang 12jt + deskripsi koreksi
    const j004 = s.journals.find((j) => j.id === 'JNL-2026-03-004')!
    expect(j004.description).toContain('koreksi')
    expect(j004.lines[0].debit).toBe(12_000_000)
    expect(j004.lines[1].credit).toBe(12_000_000)
    // 4. Jurnal seed yang di-reverse pengguna tetap reversed (tidak hidup kembali)
    expect(s.journals.find((j) => j.id === 'JNL-2026-03-008')!.status).toBe('reversed')
    // 5. CONTOH migrasi v1→v2: field `source` ditambahkan ke semua jurnal
    for (const j of s.journals) expect(j.source).toBe('manual')
    // 6. CONTOH migrasi v2→v3: akun seed Kas Kecil (1-1500) hadir di data lama
    expect(s.accounts.some((a) => a.id === '1-1500' && a.name === 'Kas Kecil')).toBe(true)
    // 7. Metadata seed ter-update ke versi terbaru (di state tersimpan ulang)
    const stored = JSON.parse(ls().getItem(STORAGE_KEY)!)
    expect(stored.state.seedVersion).toBe(SEED_VERSION)
    // 8. Id unik — tidak ada duplikasi seed vs user
    const ids = s.journals.map((j) => j.id)
    expect(new Set(ids).size).toBe(ids.length)
    // 9. Storage ditulis ulang ke versi terbaru setelah migrasi (zustand v5)
    expect(stored.version).toBe(CURRENT_VERSION)
    // 10. TOAST: user diberi tahu data lokalnya TIDAK hilang (migrasi v1 → v5)
    expect(s.toast?.kind).toBe('success')
    expect(s.toast?.message).toContain('Data lokal dimigrasi ke versi baru (v1 → v5)')
    expect(s.toast?.message).toContain('1 jurnal pengguna dipertahankan')
  })

  it('sesi login + antrian offline + lastSyncedAt BERTAHAN saat rehidrasi (v4 → v5)', async () => {
    writePersisted(
      {
        accounts: mockAccounts,
        journals: [userJournal, ...OLD_SEED_JOURNALS],
        activePeriod: '2026-02',
        seedVersion: 1,
        seedJournalIds: OLD_SEED_IDS,
        accessToken: 'mock.user-001.1',
        refreshToken: 'refresh-1',
        user: { id: 'user-001', name: 'Rina', email: 'rina@bukuwarung.com', role: 'admin' },
        offlineQueue: [{ id: 'op-1', kind: 'post', ref: 'JNL-USER-999' }],
        lastSyncedAt: '2026-08-15T04:00:00Z',
      },
      4,
    )

    await useStore.persist!.rehydrate()

    const s = useStore.getState()
    // Data jurnal pengguna tetap ada
    expect(s.journals.some((j) => j.id === 'JNL-USER-999')).toBe(true)
    // Sesuai versi terbaru seed (JNL-010 ada, JNL-004 dikoreksi)
    expect(s.journals.some((j) => j.id === 'JNL-2026-03-010')).toBe(true)
    // Sesi & metadata user dipertahankan (tidak dipaksa login ulang)
    expect(s.accessToken).toBe('mock.user-001.1')
    expect(s.refreshToken).toBe('refresh-1')
    expect(s.user?.name).toBe('Rina')
    expect(s.activePeriod).toBe('2026-02')
    // Antrian offline & waktu sinkron terakhir tidak hilang
    expect(s.offlineQueue).toEqual([{ id: 'op-1', kind: 'post', ref: 'JNL-USER-999' }])
    expect(s.lastSyncedAt).toBe('2026-08-15T04:00:00Z')
  })
})

describe('round-trip penuh — aksi nyata → localStorage → rehidrasi (reload)', () => {
  it('jurnal yang dibuat offline TERSIMPAN di localStorage dan BERTAHAN setelah rehidrasi', async () => {
    // Baseline seed (sudah direhidrasi di beforeEach)
    expect(useStore.getState().journals).toHaveLength(mockJournals.length)

    // Masuk offline lalu buat + posting jurnal → jalur lokal + antrian, persist nyata
    useStore.setState({ apiStatus: 'offline', accessToken: 'local.demo' })
    await useStore.getState().saveJournal(
      {
        date: '2026-03-25',
        transactionNumber: 'BKM-USER-0002',
        description: 'Jurnal offline user',
        lines: [
          { accountId: '1-1100', debit: 5_000_000, credit: 0 },
          { accountId: '4-1000', debit: 0, credit: 5_000_000 },
        ],
      },
      'post',
    )
    const createdId = useStore.getState().journals[0].id
    // Id lokal TIDAK boleh tabrakan dengan seed v2 (JNL-010)
    expect(createdId).not.toBe('JNL-2026-03-010')
    expect(useStore.getState().journals).toHaveLength(mockJournals.length + 1)

    // Persist menulis jurnal baru ke localStorage pada tiap setState
    const storedBefore = JSON.parse(ls().getItem(STORAGE_KEY)!)
    expect(storedBefore.state.journals.some((j: JournalEntry) => j.id === createdId)).toBe(true)

    // Simulasi RELOAD: simpan dulu apa yang ada di storage, reset memori ke
    // baseline (seperti store baru), pulihkan storage, lalu rehidrasi penuh.
    const persistedJson = ls().getItem(STORAGE_KEY)!
    useStore.setState(freshPersistedState() as never)
    ls().setItem(STORAGE_KEY, persistedJson)
    await useStore.persist!.rehydrate()

    const s = useStore.getState()
    // Jurnal pengguna bertahan di rehidrasi penuh + antrian offline ikut
    expect(s.journals.some((j) => j.id === createdId)).toBe(true)
    expect(s.journals).toHaveLength(mockJournals.length + 1)
    expect(s.offlineQueue).toHaveLength(1) // op create dari saveJournal
  })
})

describe('storage korup / kosong — rehidrasi aman', () => {
  it('JSON korup → seed murni tanpa crash', async () => {
    ls().setItem(STORAGE_KEY, '{not-json!!')
    await useStore.persist!.rehydrate()
    expect(useStore.getState().journals).toEqual(mockJournals)
  })

  it('storage kosong → seed murni (freshPersistedState)', async () => {
    await useStore.persist!.rehydrate()
    expect(useStore.getState().journals).toEqual(mockJournals)
    expect(useStore.getState().accounts).toEqual(mockAccounts)
  })
})
