import { useRef } from 'react'

/**
 * Guard aksi anti double-click SINKRON (ref) — pola yang sama dengan guard
 * busyRef di ExportButtons: state React di-batch, dua klik dalam satu frame
 * membaca state lama (mis. busy = null) sebelum re-render, jadi atribut
 * `disabled` tombol saja TIDAK cukup mencegah eksekusi ganda. Ref tidak
 * memicu render dan langsung terlihat oleh klik kedua dalam batch yang sama.
 *
 * Pemakaian (wajib melepas guard di `finally` agar lepas setelah selesai
 * ATAU gagal):
 *
 *   const guard = useActionGuard()
 *   const doIt = async () => {
 *     if (!guard.start()) return   // klik kedua dalam frame yang sama ditolak
 *     try { await aksi() } finally { guard.end() }
 *   }
 */
export function useActionGuard() {
  const busyRef = useRef(false)
  return {
    /** true hanya untuk panggilan pertama selama guard aktif; false = ditolak */
    start(): boolean {
      if (busyRef.current) return false
      busyRef.current = true
      return true
    },
    /** Lepas guard — panggil di finally. */
    end(): void {
      busyRef.current = false
    },
  }
}

/**
 * Varian per-id: aksi pada item BERBEDA tidak saling memblokir. Dipakai untuk
 * tombol aksi per baris (mis. Setujui/Posting di beberapa jurnal sekaligus —
 * pengguna boleh mengklik baris lain selagi baris pertama masih diproses),
 * tapi klik ganda pada baris yang SAMA tetap ditolak.
 */
export function useIdActionGuard() {
  const inFlightRef = useRef(new Set<string>())
  return {
    /** true hanya untuk id yang belum dalam proses; false = sedang diproses/ditolak */
    start(id: string): boolean {
      if (inFlightRef.current.has(id)) return false
      inFlightRef.current.add(id)
      return true
    },
    /** Lepas guard untuk id — panggil di finally. */
    end(id: string): void {
      inFlightRef.current.delete(id)
    },
  }
}
