import { useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  FolderDown,
  Landmark,
  LayoutDashboard,
  NotebookPen,
  Plus,
  Scale,
  Settings,
  TrendingUp,
  Waves,
} from 'lucide-react'
import type { PageKey } from '../types'
import { useStore } from '../store/useStore'
import { canWriteJournal } from '../lib/permissions'

const NAV: { key: PageKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'journal', label: 'Jurnal', icon: BookOpen },
  { key: 'buku-besar', label: 'Buku Besar', icon: NotebookPen },
  { key: 'neraca-lajur', label: 'Neraca Lajur', icon: Scale },
  { key: 'laba-rugi', label: 'Laba Rugi', icon: TrendingUp },
  { key: 'neraca', label: 'Neraca', icon: Landmark },
  { key: 'arus-kas', label: 'Arus Kas', icon: Waves },
  { key: 'laporan-lain', label: 'Laporan Lain', icon: FolderDown },
  { key: 'pengaturan', label: 'Pengaturan', icon: Settings },
]

const PERIODS = [
  { id: '2026-03', label: 'Maret 2026' },
  { id: '2026-02', label: 'Februari 2026' },
  { id: '2026-01', label: 'Januari 2026' },
]

/**
 * Dropdown periode dengan pola LISTBOX yang sama seperti GlobalSearch:
 * role=listbox/option, ArrowUp/Down memindahkan highlight (activeIndex),
 * Enter memilih, Escape menutup (fokus kembali ke tombol), klik item memilih,
 * klik di luar menutup. Menggantikan native <select> agar interaksi keyboard
 * konsisten di seluruh aplikasi.
 */
function PeriodListbox() {
  const activePeriod = useStore((s) => s.activePeriod)
  const setActivePeriod = useStore((s) => s.setActivePeriod)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const currentIndex = () => Math.max(0, PERIODS.findIndex((p) => p.id === activePeriod))
  const labelOf = (id: string) => PERIODS.find((p) => p.id === id)?.label ?? id

  const close = (refocus = true) => {
    setOpen(false)
    setActiveIndex(-1)
    if (refocus) buttonRef.current?.focus()
  }

  const select = (id: string) => {
    setActivePeriod(id)
    close()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (!open) {
      // Tombol difokuskan: panah/Enter/Spasi membuka listbox pada periode aktif
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
        setActiveIndex(currentIndex())
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % PERIODS.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? PERIODS.length - 1 : i - 1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      select(PERIODS[activeIndex].id)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveIndex(PERIODS.length - 1)
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  // Klik di luar dropdown → tutup
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        ref={buttonRef}
        onClick={() => (open ? close() : (setOpen(true), setActiveIndex(currentIndex())))}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Pilih periode"
        title={labelOf(activePeriod)}
        className="flex w-full items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2 text-sm text-ink focus:outline-none"
      >
        <CalendarDays size={14} className="shrink-0 text-ink-soft" />
        <span className="w-full truncate text-left">{labelOf(activePeriod)}</span>
        <ChevronDown size={13} className={`shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Pilih periode"
          className="absolute right-0 top-full z-40 mt-1 w-full min-w-[9rem] overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-modal"
        >
          {PERIODS.map((p, i) => {
            const selected = p.id === activePeriod
            const active = i === activeIndex
            return (
              <li
                key={p.id}
                role="option"
                aria-selected={selected}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition ${
                  active
                    ? 'bg-primary/10 font-semibold text-primary'
                    : selected
                      ? 'font-medium text-ink'
                      : 'text-ink-soft hover:bg-surface-hover'
                }`}
                onClick={() => select(p.id)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                {p.label}
                {selected && <Check size={13} className="shrink-0 text-primary" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default function Sidebar() {
  const page = useStore((s) => s.page)
  const setPage = useStore((s) => s.setPage)
  const activePeriod = useStore((s) => s.activePeriod)
  const setActivePeriod = useStore((s) => s.setActivePeriod)
  const entities = useStore((s) => s.entities)
  const activeEntityId = useStore((s) => s.activeEntityId)
  const setActiveEntity = useStore((s) => s.setActiveEntity)
  const openModal = useStore((s) => s.openModal)
  const user = useStore((s) => s.user)
  const canWrite = canWriteJournal(user?.role)
  const activeEntity = entities.find((e) => e.id === activeEntityId) ?? entities[0]

  return (
    <aside className="flex w-16 shrink-0 flex-col border-r border-line bg-surface lg:w-64">
      {canWrite && (
        <div className="px-2 pt-4 lg:px-4">
          <button
            type="button"
            onClick={openModal}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-light active:translate-y-px lg:justify-start"
          >
            <Plus size={16} />
            <span className="hidden lg:inline">Buat Jurnal</span>
          </button>
        </div>
      )}

      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-2 lg:px-3">
        {NAV.map(({ key, label, icon: Icon }) => {
          const active = page === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPage(key)}
              title={label}
              className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                active
                  ? 'border-l-[3px] bg-primary/10 font-semibold text-primary'
                  : 'border-l-[3px] border-transparent text-ink-soft hover:bg-surface-hover hover:text-ink'
              }`}
            >
              <Icon size={18} className="shrink-0" />
              <span className="hidden lg:inline">{label}</span>
            </button>
          )
        })}
      </nav>

      <div className="space-y-2 border-t border-line p-3 lg:p-4">
        <div className="hidden lg:block">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Periode</p>
          <PeriodListbox />
        </div>
        <div className="hidden lg:block">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Entitas</p>
          <label className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2">
            <Building2 size={14} className="shrink-0 text-primary" />
            <select
              value={activeEntityId}
              onChange={(e) => setActiveEntity(e.target.value)}
              className="w-full bg-transparent text-sm text-ink focus:outline-none"
              aria-label="Pilih entitas"
            >
              {entities.map((en) => (
                <option key={en.id} value={en.id}>
                  {en.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-2.5 py-2 text-ink-soft lg:bg-transparent lg:px-0">
          <Building2 size={14} className="shrink-0 text-primary" />
          <span className="hidden truncate text-sm font-medium text-ink lg:inline">{activeEntity?.name ?? '—'}</span>
          <span className="hidden text-[11px] text-ink-faint lg:inline">· IDR</span>
        </div>
      </div>
    </aside>
  )
}
