import { useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Database,
  FileText,
  FolderDown,
  HardDrive,
  HelpCircle,
  Landmark,
  LayoutDashboard,
  ListOrdered,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Scale,
  Settings,
  TrendingUp,
  Waves,
} from 'lucide-react'
import type { PageKey } from '../types'
import { useStore } from '../store/useStore'
import { canWriteJournal } from '../lib/permissions'

type NavItem = { key: PageKey; label: string; icon: typeof LayoutDashboard; badge?: number }

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Menu Utama',
    icon: FileText,
    defaultOpen: true,
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { key: 'journal', label: 'Jurnal', icon: BookOpen },
    ],
  },
  {
    title: 'Laporan Keuangan',
    icon: TrendingUp,
    defaultOpen: true,
    items: [
      { key: 'buku-besar', label: 'Buku Besar', icon: NotebookPen },
      { key: 'neraca-lajur', label: 'Neraca Lajur', icon: Scale },
      { key: 'laba-rugi', label: 'Laba Rugi', icon: TrendingUp },
      { key: 'neraca', label: 'Neraca', icon: Landmark },
      { key: 'arus-kas', label: 'Arus Kas', icon: Waves },
      { key: 'laporan-lain', label: 'Laporan Lain', icon: FolderDown },
    ],
  },
  {
    title: 'Referensi',
    icon: Database,
    defaultOpen: true,
    items: [
      { key: 'akun', label: 'Tabel Akun', icon: ListOrdered },
      { key: 'glossary', label: 'Kamus Istilah', icon: HelpCircle },
    ],
  },
  {
    title: 'Pengaturan',
    icon: Settings,
    defaultOpen: true,
    items: [
      { key: 'pengaturan', label: 'Pengaturan', icon: Settings },
      { key: 'db-status', label: 'Status DB', icon: HardDrive },
    ],
  },
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

const SIDEBAR_GROUP_KEY = 'sidebar-collapsed-groups'
const SIDEBAR_COMPACT_KEY = 'sidebar-compact'

function readCollapsedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(SIDEBAR_GROUP_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function writeCollapsedGroups(collapsed: Set<string>) {
  try {
    localStorage.setItem(SIDEBAR_GROUP_KEY, JSON.stringify([...collapsed]))
  } catch { /* noop */ }
}

function NavGroupSection({
  group,
  page,
  setPage,
  compact,
}: {
  group: NavGroup
  page: PageKey
  setPage: (p: PageKey) => void
  compact: boolean
}) {
  // Read collapsed state from localStorage; defaultOpen=true → collapsed=false
  const [collapsed, setCollapsed] = useState(() => {
    const stored = readCollapsedGroups()
    if (stored.has(group.title)) return true
    return !(group.defaultOpen ?? true)
  })
  const open = !collapsed

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      const stored = readCollapsedGroups()
      if (next) stored.add(group.title)
      else stored.delete(group.title)
      writeCollapsedGroups(stored)
      return next
    })
  }

  const isActive = group.items.some((it) => it.key === page)
  const GroupIcon = group.icon

  return (
    <div>
      {/* Group header — hide in compact mode, otherwise click to expand/collapse */}
      {!compact && (
        <button
          type="button"
          onClick={toggle}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
            isActive ? 'text-primary' : 'text-ink-faint hover:text-ink-soft'
          }`}
          aria-expanded={open}
        >
          <GroupIcon size={12} className="shrink-0" />
          <span className="flex-1 whitespace-nowrap text-left">{group.title}</span>
          <ChevronDown
            size={12}
            className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}
          />
        </button>
      )}

      {/* Items — smooth expand/collapse via grid-template-rows transition */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div
            className={`mt-0.5 space-y-0.5 transition-[opacity] duration-200 ease-in-out ${
              open ? 'opacity-100 delay-100' : 'opacity-0 delay-0'
            }`}
          >
            {group.items.map((item) => {
              const { key, label, icon: Icon, badge } = item
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
                  } ${compact ? 'justify-center px-0 border-l-0' : ''}`}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200" style={{ maxWidth: compact ? 0 : '10rem', opacity: compact ? 0 : 1 }}>{label}</span>
                  {badge ? (
                    <span className={`${compact ? 'absolute -right-1 -top-1' : 'ml-auto'} flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white`}>
                      {badge > 9 ? '9+' : badge}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

type NavGroup = { title: string; icon: typeof FileText; items: NavItem[]; defaultOpen?: boolean }

export default function Sidebar() {
  const page = useStore((s) => s.page)
  const setPage = useStore((s) => s.setPage)
  const entities = useStore((s) => s.entities)
  const activeEntityId = useStore((s) => s.activeEntityId)
  const setActiveEntity = useStore((s) => s.setActiveEntity)
  const openModal = useStore((s) => s.openModal)
  const user = useStore((s) => s.user)
  const journals = useStore((s) => s.journals)
  const canWrite = canWriteJournal(user?.role)
  const canApprove = user?.role === 'admin' || user?.role === 'accountant'

  // Compact mode (persisted ke localStorage) — berlaku di semua ukuran layar
  const [compact, setCompact] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_COMPACT_KEY) === 'true' } catch { return false }
  })
  const toggleCompact = () => {
    setCompact((prev) => {
      const next = !prev
      try { localStorage.setItem(SIDEBAR_COMPACT_KEY, String(next)) } catch { /* noop */ }
      return next
    })
  }
  // Sidebar fully hidden (mobile only) — persist
  const [hidden, setHidden] = useState(() => {
    try { return window.innerWidth < 768 && localStorage.getItem(SIDEBAR_COMPACT_KEY) !== 'true' } catch { return false }
  })
  const toggleHidden = () => setHidden((h) => !h)

  // Badge: jumlah jurnal menunggu approval
  const pendingApprovalCount = canApprove
    ? journals.filter((j) => j.status === 'pending-approval').length
    : 0

  // Inject badge ke item Jurnal
  const groupsWithBadge = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.map((it) =>
      it.key === 'journal' ? { ...it, badge: pendingApprovalCount } : it,
    ),
  }))

  return (
    <>
    {/* Mobile hamburger button — only visible when sidebar is hidden on mobile */}
    {hidden && (
      <button
        type="button"
        onClick={toggleHidden}
        className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-surface shadow-card transition hover:bg-surface-hover lg:hidden"
        title="Buka sidebar"
        aria-label="Buka sidebar"
      >
        <PanelLeftOpen size={18} className="text-ink-soft" />
      </button>
    )}
    {/* Mobile overlay backdrop — only when sidebar is visible on mobile */}
    {!hidden && (
      <div
        className="fixed inset-0 z-30 bg-black/30 lg:hidden"
        onClick={toggleHidden}
        aria-hidden="true"
      />
    )}
    <aside
      className={`flex shrink-0 flex-col border-r border-line bg-surface transition-[width,transform] duration-300 ease-in-out ${
        compact ? 'w-[4.5rem]' : hidden ? 'w-0 overflow-hidden border-r-0 max-lg:-translate-x-full' : 'w-64'
      } ${!hidden ? 'fixed lg:static z-40' : 'fixed lg:static z-40'} h-full`}
    >
      {canWrite && (
        <div className="px-2 pt-4 lg:px-4">
          <button
            type="button"
            onClick={openModal}
            className={`flex w-full items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-light active:translate-y-px justify-center`}
            title="Buat Jurnal"
          >
            <Plus size={16} />
            {!compact && <span className="whitespace-nowrap">Buat Jurnal</span>}
          </button>
        </div>
      )}

      <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-2 lg:px-3">
        {groupsWithBadge.map((group) => (
          <NavGroupSection key={group.title} group={group} page={page} setPage={setPage} compact={compact} />
        ))}
      </nav>

      <div className="space-y-2 border-t border-line p-3 lg:p-4">
        {/* Toggle compact/expanded — visible on all screen sizes */}
        <button
          type="button"
          onClick={toggleCompact}
          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-soft transition hover:bg-surface-hover hover:text-ink ${compact ? 'justify-center' : ''}`}
          title={compact ? 'Perluas sidebar' : 'Kecilkan sidebar'}
        >
          {compact ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          {!compact && <span className="whitespace-nowrap">Perluas sidebar</span>}
        </button>

        <div>
          {!compact && <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Periode</p>}
          {compact ? (
            <button
              type="button"
              className="flex w-full items-center justify-center rounded-lg border border-line bg-canvas px-2.5 py-2 text-sm text-ink focus:outline-none"
              title={`Periode: ${PERIODS.find((p) => p.id === useStore.getState().activePeriod)?.label}`}
            >
              <CalendarDays size={14} className="text-ink-soft" />
            </button>
          ) : (
            <PeriodListbox />
          )}
        </div>
        <div>
          {!compact && <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Entitas</p>}
          <label className={`flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2 ${compact ? 'justify-center' : ''}`}>
            <Building2 size={14} className="shrink-0 text-primary" />
            {!compact ? (
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
            ) : (
              <span className="sr-only">Entitas aktif</span>
            )}
          </label>
        </div>

      </div>
    </aside>
    </>
  )
}
