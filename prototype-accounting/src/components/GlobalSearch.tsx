import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Landmark, LayoutGrid, NotebookPen, PieChart, Search } from 'lucide-react'
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
  // Navigasi keyboard: index aktif di daftar hasil gabungan (jurnal + akun),
  // -1 = tidak ada item ter-pilih. Reset tiap kali hasil berubah.
  const [activeIndex, setActiveIndex] = useState(-1)
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
  const reports = results.filter((r) => r.type === 'report')
  const pages = results.filter((r) => r.type === 'page')

  // Daftar gabungan untuk navigasi keyboard — urutan: jurnal → akun → laporan → halaman.
  const items = useMemo(() => {
    const arr: { r: SearchResult; group: 'journal' | 'account' | 'report' | 'page' }[] = []
    for (const r of journals) arr.push({ r, group: 'journal' })
    for (const r of accounts) arr.push({ r, group: 'account' })
    for (const r of reports) arr.push({ r, group: 'report' })
    for (const r of pages) arr.push({ r, group: 'page' })
    return arr
  }, [journals, accounts, reports, pages])

  const select = (type: 'journal' | 'account' | 'report' | 'page', id: string) => {
    setOpen(false)
    setQuery('')
    setResults([])
    setActiveIndex(-1)
    openSearchResult(type, id)
  }

  const itemId = (i: number) => `gs-result-${i}`

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      const it = items[activeIndex]
      select(it.group, it.r.id)
    }
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
          setActiveIndex(-1)
        }}
        onFocus={() => {
          setOpen(true)
          setActiveIndex(-1)
        }}
        onKeyDown={onKeyDown}
        aria-activedescendant={activeIndex >= 0 ? itemId(activeIndex) : undefined}
        aria-expanded={open && query.trim() ? 'true' : undefined}
        placeholder="Cari transaksi atau akun..."
        aria-label="Pencarian global"
        className="h-9 w-64 rounded-lg border border-line bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />

      {open && query.trim() && (
        <div
          role="listbox"
          id="gs-listbox"
          className="absolute right-0 top-full z-40 mt-2 max-h-96 w-96 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-modal animate-[fadein_0.15s_ease-out]"
        >
          {searching && <p className="px-3 py-2 text-xs text-ink-soft">Mencari…</p>}
          {!searching && items.length === 0 && (
            <p className="px-3 py-2 text-xs text-ink-soft">Tidak ada hasil untuk “{query.trim()}”</p>
          )}

          {journals.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Jurnal</p>
              {journals.map((r, gi) => {
                const i = gi // index di daftar gabungan: jurnal = posisi asli
                const active = activeIndex === i
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => select('journal', r.id)}
                    onMouseEnter={() => setActiveIndex(i)}
                    role="option"
                    aria-selected={active}
                    id={itemId(i)}
                    className={`${row} ${active ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
                    title="Buka detail jurnal"
                  >
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
                )
              })}
            </>
          )}

          {accounts.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Akun</p>
              {accounts.map((r, gi) => {
                const i = journals.length + gi // index di daftar gabungan
                const active = activeIndex === i
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => select('account', r.id)}
                    onMouseEnter={() => setActiveIndex(i)}
                    role="option"
                    aria-selected={active}
                    id={itemId(i)}
                    className={`${row} ${active ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
                    title="Buka buku besar akun"
                  >
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
                )
              })}
            </>
          )}

          {reports.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Laporan</p>
              {reports.map((r, gi) => {
                const i = journals.length + accounts.length + gi
                const active = activeIndex === i
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => select('report', r.id)}
                    onMouseEnter={() => setActiveIndex(i)}
                    role="option"
                    aria-selected={active}
                    id={itemId(i)}
                    className={`${row} ${active ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
                    title={`Buka laporan ${r.title}`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <PieChart size={14} className="shrink-0 text-[#0891b2]" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{r.title}</span>
                        <span className="block truncate text-xs text-ink-soft">{r.subtitle}</span>
                      </span>
                    </span>
                  </button>
                )
              })}
            </>
          )}

          {pages.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Halaman</p>
              {pages.map((r, gi) => {
                const i = journals.length + accounts.length + reports.length + gi
                const active = activeIndex === i
                const Icon = r.id === 'journal' ? NotebookPen : r.id === 'pengaturan' ? LayoutGrid : r.id === 'dashboard' ? LayoutGrid : LayoutGrid
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => select('page', r.id)}
                    onMouseEnter={() => setActiveIndex(i)}
                    role="option"
                    aria-selected={active}
                    id={itemId(i)}
                    className={`${row} ${active ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
                    title={`Buka halaman ${r.title}`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Icon size={14} className="shrink-0 text-ink-soft" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{r.title}</span>
                        <span className="block truncate text-xs text-ink-soft">{r.subtitle}</span>
                      </span>
                    </span>
                  </button>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
