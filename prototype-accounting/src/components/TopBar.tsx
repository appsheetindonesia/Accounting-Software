import { Bell, BookMarked, LogOut, Search } from 'lucide-react'
import { useStore } from '../store/useStore'

export default function TopBar() {
  const user = useStore((s) => s.user)
  const logout = useStore((s) => s.logout)
  const initial = user?.name?.[0] ?? 'R'
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line bg-surface px-4 lg:px-6">
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-white">
          <BookMarked size={18} />
        </div>
        <div className="hidden leading-tight sm:block">
          <p className="text-sm font-bold text-ink">Appsheet Accounting Journal</p>
          <p className="text-[11px] text-ink-soft">PT Maju Jaya</p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            placeholder="Cari transaksi atau akun..."
            className="h-9 w-64 rounded-lg border border-line bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          type="button"
          aria-label="Notifikasi"
          className="relative flex size-9 items-center justify-center rounded-lg text-ink-soft transition hover:bg-surface-hover hover:text-ink"
        >
          <Bell size={18} />
          <span className="absolute right-2 top-2 size-2 rounded-full bg-bad ring-2 ring-surface" />
        </button>
        <button
          type="button"
          title={user ? `${user.name} (${user.role})` : 'Belum masuk'}
          className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-white"
        >
          {initial}
        </button>
        <button
          type="button"
          onClick={logout}
          title="Keluar"
          aria-label="Keluar"
          className="flex size-9 items-center justify-center rounded-lg text-ink-soft transition hover:bg-surface-hover hover:text-bad"
        >
          <LogOut size={17} />
        </button>
      </div>
    </header>
  )
}
