import { useEffect, useRef, useState } from 'react'
import { FileText, Landmark, Search } from 'lucide-react'
import { useStore } from '../store/useStore'
import { api, type SearchResult } from '../api'
import { formatIDR } from '../lib/format'
import StatusBadge from './StatusBadge'
import type { JournalStatus } from '../types'

const DEBOUNCE_MS = 300

/**
 * Pencarian global (GET /search) — jurnal & akun lintas halaman. Hasil
 * ditampilkan di dropdown; klik → navigasi + fokus (detail jurnal dibuka,
 * akun dipilih di Buku Besar). Nonaktif saat offline; respons basi
 * (query berubah lebih cepat dari server) diabaikan.
 */
export default function GlobalSearch() {
  const apiStatus = useStore((s) => s.apiStatus)
  const openSearchResult = useStore((s) => s.openSearchResult)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const seq = useRef(0)
  const rootRef = useRef<HTMLDivElement>(null)

  const online = apiStatus === 'online'

  useEffect(() => {
    const q = query.trim()
    if (!online || !q) {
      seq.current += 1
      setResults([])
      setSearching(false)
      return
    }
    const mySeq = ++seq.current
    setSearching(true)
    const timer = setTimeout(() => {
      api
        .search(q)
        .then(({ results: r }) => {
          if (seq.current !== mySeq) return // respons basi — query sudah berubah
          setResults(r)
          setSearching(false)
        })
        .catch(() => {
          if (seq.current !== mySeq) return
          setResults([])
          setSearching(false)
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, online])

  // Tutup dropdown saat klik di luar komponen
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const journals = results.filter((r) => r.type === 'journal')
  const accounts = results.filter((r) => r.type === 'account')

  const select = (type: 'journal' | 'account', id: string) => {
    setOpen(false)
    setQuery('')
    setResults([])
    openSearchResult(type, id)
  }

  const row =
    'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-surface-hover'

  return (
    <div ref={rootRef} className="relative hidden md:block">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="Cari transaksi atau akun..."
        aria-label="Pencarian global"
        className="h-9 w-64 rounded-lg border border-line bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />

      {open && query.trim() && (
        <div className="absolute right-0 top-full z-40 mt-2 max-h-96 w-96 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-modal animate-[fadein_0.15s_ease-out]">
          {searching && <p className="px-3 py-2 text-xs text-ink-soft">Mencari…</p>}
          {!searching && journals.length === 0 && accounts.length === 0 && (
            <p className="px-3 py-2 text-xs text-ink-soft">Tidak ada hasil untuk “{query.trim()}”</p>
          )}

          {journals.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Jurnal</p>
              {journals.map((r) => (
                <button key={r.id} type="button" onClick={() => select('journal', r.id)} className={row} title="Buka detail jurnal">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <FileText size={14} className="shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="num block truncate text-sm font-semibold text-ink">{r.title}</span>
                      <span className="block truncate text-xs text-ink-soft">{r.subtitle}</span>
                    </span>
                  </span>
                  {r.metadata.status && (
                    <span className="shrink-0">
                      <StatusBadge status={r.metadata.status as JournalStatus} />
                    </span>
                  )}
                </button>
              ))}
            </>
          )}

          {accounts.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Akun</p>
              {accounts.map((r) => (
                <button key={r.id} type="button" onClick={() => select('account', r.id)} className={row} title="Buka buku besar akun">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Landmark size={14} className="shrink-0 text-ok" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{r.title}</span>
                      <span className="block truncate text-xs text-ink-soft">{r.subtitle}</span>
                    </span>
                  </span>
                  {typeof r.metadata.balance === 'number' && (
                    <span className="num shrink-0 text-xs font-semibold text-ink">{formatIDR(r.metadata.balance)}</span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
