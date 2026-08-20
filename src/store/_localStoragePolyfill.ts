// Polyfill in-memory localStorage untuk test integrasi rehidrasi.
//
// PENTING: modul ini harus di-import SEBELUM `./useStore` — zustand v5
// persist membuat storage secara EAGER saat store dibuat (evaluasi modul).
// Tanpa localStorage di global saat itu, persist berjalan tanpa storage
// (degraded) dan rehidrasi nyata lewat localStorage tidak bisa diuji.

class MemoryStorage implements Storage {
  private map = new Map<string, string>()

  get length(): number {
    return this.map.size
  }

  clear(): void {
    this.map.clear()
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
}

export const memoryStorage = new MemoryStorage()

// Install sebagai localStorage global (hindari TS readonly: pakai defineProperty)
Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage,
  writable: true,
  configurable: true,
})

// zustand v5 persist memakai `() => window.localStorage` sebagai storage
// default. Tanpa `window`, createJSONStorage gagal → storage undefined →
// persist return lebih awal TANPA `api.persist` (tidak bisa rehydrate).
// Shim minimal: window cukup punya localStorage.
Object.defineProperty(globalThis, 'window', {
  value: { localStorage: memoryStorage },
  writable: true,
  configurable: true,
})
