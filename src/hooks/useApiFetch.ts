import { useEffect, useState } from 'react'

// Fetch async sekali per `key`/`ready`. `ready` harus true dulu (mis. setelah
// init() selesai login) agar request tidak dikirim tanpa token → 401.
// Jika request gagal (server offline), `fallback()` dipakai agar UI tetap
// menampilkan data (lokal/seed).
export function useApiFetch<T>(key: string, ready: boolean, loader: () => Promise<T>, fallback: () => T) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    if (!ready) {
      // Belum siap: jangan fetch, tunggu status koneksi menetap
      return
    }
    let alive = true
    setLoading(true)
    loader()
      .then((d) => {
        if (alive) {
          setData(d)
          setOffline(false)
        }
      })
      .catch(() => {
        if (alive) {
          setData(fallback())
          setOffline(true)
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
    // key adalah identitas request; loader/fallback di-recreate per render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready])

  return { data, loading, offline }
}
