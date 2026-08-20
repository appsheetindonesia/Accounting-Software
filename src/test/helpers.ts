// Helper test bersama — pola yang dipakai konsisten di test komponen:
// - deferred(): mengontrol kapan loader selesai (renderHook / fetch asinkron)
// - renderWithStore(): render komponen dengan state store baseline + override
// - resetStoreState(): kondisi pasca-logout untuk afterEach
// File test baru DIWAJIBKAN memakai helper ini (bukan menyalin pola per file).
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { mockAccounts, mockJournals } from '../data/mock'
import { useStore } from '../store/useStore'

// Deferred promise — kendali penuh kapan promise selesai (state loading →
// selesai). Dipakai useApiFetch & komponen yang fetch asinkron (refetch,
// race, unmount-saat-pending).
export const deferred = <T,>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Bentuk state store (parameter setState Zustand) — override bertipe aman
// tanpa `as any` berulang di tiap test.
export type StoreState = Parameters<typeof useStore.setState>[0]

// Baseline state test komponen: online + data seed entitas ent-001
// (PT. Kreasi Inovasi Estetika). Override per-test via renderWithStore.
export const baseStoreState = (): Partial<StoreState> => ({
  apiStatus: 'online',
  lastSyncedAt: '2026-08-16T00:00:00Z',
  user: { id: 'user-001', name: 'Rina', email: 'rina@estetikakreasi.co.id', role: 'admin' },
  accounts: mockAccounts,
  journals: mockJournals,
  toast: null,
})

// Set state store ke baseline (+ override) lalu render elemen. Ganti pola
// `useStore.setState({...})` di beforeEach + `render(...)` di tiap test.
export const renderWithStore = (ui: ReactElement, overrides: Partial<StoreState> = {}) => {
  useStore.setState({ ...baseStoreState(), ...overrides })
  return render(ui)
}

// Reset store ke kondisi pasca-logout di afterEach — mencegah kebocoran state
// antar test (status sesi, data entitas, toast) + cleanup DOM global setup.
export const resetStoreState = (overrides: Partial<StoreState> = {}) => {
  useStore.setState({ apiStatus: 'idle', user: null, lastSyncedAt: null, ...overrides })
}
