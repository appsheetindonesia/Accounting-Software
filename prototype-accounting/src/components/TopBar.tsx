import { useState } from 'react'
import { Bell, BookMarked, LogOut, RotateCcw, Settings } from 'lucide-react'
import { useStore } from '../store/useStore'
import { ROLE_BADGE, ROLE_LABELS } from '../lib/permissions'
import GlobalSearch from './GlobalSearch'
import ResetDataModal from './ResetDataModal'

export default function TopBar() {
  const user = useStore((s) => s.user)
  const logout = useStore((s) => s.logout)
  const setPage = useStore((s) => s.setPage)
  const entities = useStore((s) => s.entities)
  const activeEntityId = useStore((s) => s.activeEntityId)
  const entityName = entities.find((e) => e.id === activeEntityId)?.name ?? 'PT. Kreasi Inovasi Estetika'
  const initial = user?.name?.[0] ?? 'R'
  const role = user?.role ?? null

  // Dropdown avatar — akses cepat ke reset data demo & pengaturan dari halaman mana pun.
  const [menuOpen, setMenuOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line bg-surface px-4 lg:px-6">
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-white">
          <BookMarked size={18} />
        </div>
        <div className="hidden leading-tight sm:block">
          <p className="text-sm font-bold text-ink">Appsheet Accounting Journal</p>
          <p className="text-[11px] text-ink-soft">{entityName}</p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <GlobalSearch />
        <button
          type="button"
          aria-label="Notifikasi"
          className="relative flex size-9 items-center justify-center rounded-lg text-ink-soft transition hover:bg-surface-hover hover:text-ink"
        >
          <Bell size={18} />
          <span className="absolute right-2 top-2 size-2 rounded-full bg-bad ring-2 ring-surface" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            title={user ? `${user.name} (${ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role})` : 'Belum masuk'}
            aria-label="Menu akun"
            aria-expanded={menuOpen}
            className={`flex size-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-white transition ${
              menuOpen ? 'ring-2 ring-primary/40' : 'hover:opacity-90'
            }`}
          >
            {initial}
          </button>
          {role && (
            <span
              className={`absolute -bottom-1.5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-px text-[9px] font-bold uppercase tracking-wide ring-2 ring-surface sm:block ${
                ROLE_BADGE[role as keyof typeof ROLE_BADGE] ?? 'bg-ink-faint/10 text-ink-soft'
              }`}
            >
              {ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
            </span>
          )}

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={closeMenu} aria-hidden="true" />
              <div className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-modal animate-[fadein_0.15s_ease-out]">
                <div className="border-b border-line bg-canvas px-4 py-3">
                  <p className="truncate text-sm font-bold text-ink">{user?.name ?? 'Pengguna'}</p>
                  <p className="truncate text-[11px] text-ink-soft">{user?.email ?? 'Belum masuk'}</p>
                  {role && (
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        ROLE_BADGE[role as keyof typeof ROLE_BADGE] ?? 'bg-ink-faint/10 text-ink-soft'
                      }`}
                    >
                      {ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
                    </span>
                  )}
                </div>
                <div className="p-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu()
                      setPage('pengaturan')
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink transition hover:bg-surface-hover"
                  >
                    <Settings size={15} className="text-ink-soft" /> Pengaturan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu()
                      setResetOpen(true)
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-bad transition hover:bg-bad/10"
                  >
                    <RotateCcw size={15} /> Reset data demo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu()
                      logout()
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink transition hover:bg-surface-hover"
                  >
                    <LogOut size={15} className="text-ink-soft" /> Keluar
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

      </div>

      <ResetDataModal open={resetOpen} onClose={() => setResetOpen(false)} />
    </header>
  )
}
