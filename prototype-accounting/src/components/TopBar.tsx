import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, BookMarked, LogOut, RotateCcw, Settings } from 'lucide-react'
import { useStore } from '../store/useStore'
import { ROLE_BADGE, ROLE_LABELS } from '../lib/permissions'
import { formatIDR } from '../lib/format'
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

  // ---------- Notifikasi approval ----------
  // Badge jumlah jurnal menunggu approval di tombol lonceng + dropdown
  // daftarnya. Klik item → navigasi ke Jurnal dengan baris detail terbuka
  // (fokus yang sama seperti global search) — tempat aksi Setujui/Tolak ada.
  const journals = useStore((s) => s.journals)
  const openSearchResult = useStore((s) => s.openSearchResult)
  const pendingApprovals = useMemo(
    () => journals.filter((j) => j.status === 'pending-approval'),
    [journals],
  )
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  // Tutup dropdown saat klik di luar komponen
  useEffect(() => {
    if (!notifOpen) return
    const onDown = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [notifOpen])

  const openPendingJournal = (id: string) => {
    setNotifOpen(false)
    openSearchResult('journal', id)
  }

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
        <div ref={notifRef} className="relative">
          <button
            type="button"
            aria-label={`Notifikasi — ${pendingApprovals.length} jurnal menunggu approval`}
            aria-expanded={notifOpen}
            onClick={() => setNotifOpen((v) => !v)}
            className="relative flex size-9 items-center justify-center rounded-lg text-ink-soft transition hover:bg-surface-hover hover:text-ink"
          >
            <Bell size={18} />
            {pendingApprovals.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface">
                {pendingApprovals.length > 9 ? '9+' : pendingApprovals.length}
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} aria-hidden="true" />
              <div className="absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-modal animate-[fadein_0.15s_ease-out]">
                <div className="flex items-center justify-between border-b border-line bg-canvas px-4 py-2.5">
                  <p className="text-sm font-bold text-ink">Menunggu Approval</p>
                  <span className="rounded-full bg-bad/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-bad">
                    {pendingApprovals.length}
                  </span>
                </div>
                <div className="max-h-80 overflow-y-auto p-1.5">
                  {pendingApprovals.length === 0 ? (
                    <p className="px-3 py-8 text-center text-xs text-ink-soft">Tidak ada jurnal menunggu approval 🎉</p>
                  ) : (
                    pendingApprovals.map((j) => {
                      const total = j.lines.reduce((sum, ln) => sum + ln.debit, 0)
                      return (
                        <button
                          key={j.id}
                          type="button"
                          onClick={() => openPendingJournal(j.id)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-surface-hover"
                          title={`Buka detail ${j.transactionNumber}`}
                        >
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="num truncate text-sm font-semibold text-ink">{j.transactionNumber}</span>
                              <span className="num shrink-0 text-[10px] text-ink-faint">{j.date}</span>
                            </span>
                            <span className="block truncate text-xs text-ink-soft">{j.description}</span>
                          </span>
                          <span className="num shrink-0 text-xs font-semibold text-ink">{formatIDR(total)}</span>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>

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
