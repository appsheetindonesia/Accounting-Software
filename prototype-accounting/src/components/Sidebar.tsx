import {
  BookOpen,
  Building2,
  CalendarDays,
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

export default function Sidebar() {
  const page = useStore((s) => s.page)
  const setPage = useStore((s) => s.setPage)
  const activePeriod = useStore((s) => s.activePeriod)
  const setActivePeriod = useStore((s) => s.setActivePeriod)
  const openModal = useStore((s) => s.openModal)

  return (
    <aside className="flex w-16 shrink-0 flex-col border-r border-line bg-surface lg:w-64">
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
          <label className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2">
            <CalendarDays size={14} className="shrink-0 text-ink-soft" />
            <select
              value={activePeriod}
              onChange={(e) => setActivePeriod(e.target.value)}
              className="w-full bg-transparent text-sm text-ink focus:outline-none"
              aria-label="Pilih periode"
            >
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-2.5 py-2 text-ink-soft lg:bg-transparent lg:px-0">
          <Building2 size={14} className="shrink-0 text-primary" />
          <span className="hidden truncate text-sm font-medium text-ink lg:inline">PT. Kreasi Inovasi Estetika</span>
          <span className="hidden text-[11px] text-ink-faint lg:inline">· IDR</span>
        </div>
      </div>
    </aside>
  )
}
