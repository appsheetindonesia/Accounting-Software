import { useEffect, useRef } from 'react'
import { useStore } from './store/useStore'
import { nextRetryDelay } from './lib/retry'
import LoginPage from './components/LoginPage'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import BottomBar from './components/BottomBar'
import OfflineBanner from './components/OfflineBanner'
import Toast from './components/Toast'
import DashboardPage from './components/dashboard/DashboardPage'
import JournalPage from './components/journal/JournalPage'
import JournalEntryModal from './components/journal/JournalEntryModal'
import LedgerPage from './components/ledger/LedgerPage'
import IncomeStatementPage from './components/reports/IncomeStatementPage'
import TrialBalancePage from './components/reports/TrialBalancePage'
import BalanceSheetPage from './components/reports/BalanceSheetPage'
import SettingsPage from './components/SettingsPage'
import ComingSoon from './components/ComingSoon'

function App() {
  const page = useStore((s) => s.page)
  const modalOpen = useStore((s) => s.modalOpen)
  const accessToken = useStore((s) => s.accessToken)
  const apiStatus = useStore((s) => s.apiStatus)
  const init = useStore((s) => s.init)

  // Reconnect sesi tersimpan saat aplikasi mulai (bukan auto-login demo)
  useEffect(() => {
    init()
  }, [init])

  // Retry otomatis dengan backoff eksponensial: begitu apiStatus offline,
  // coba `init()` ulang sendiri (2s → 4s → 8s → … → 30s) — user TIDAK perlu
  // menekan "Coba lagi". Percobaan otomatis memakai `silent` agar toast error
  // tidak spam; counter attempt disimpan di ref agar backoff tidak ter-reset
  // oleh flicker offline→connecting→offline di setiap percobaan.
  const retryAttempt = useRef(0)
  useEffect(() => {
    // Reset counter hanya saat benar-benar online/idle. Status 'connecting'
    // (flicker di tiap percobaan) TIDAK boleh me-reset — kalau di-reset,
    // backoff selalu mulai dari 2s lagi dan tidak pernah tumbuh.
    if (apiStatus === 'online' || apiStatus === 'idle') {
      retryAttempt.current = 0
      return
    }
    if (apiStatus !== 'offline') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const attempt = retryAttempt.current
    retryAttempt.current += 1
    timer = setTimeout(async () => {
      if (cancelled) return
      await init({ silent: true })
      // Kalau masih offline, effect akan di-trigger ulang oleh perubahan
      // apiStatus → menjadwalkan percobaan berikutnya dengan delay lebih besar.
    }, nextRetryDelay(attempt))
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [apiStatus, init])

  // Belum login → halaman login
  if (!accessToken) return <LoginPage />

  return (
    <div className="flex h-dvh flex-col bg-canvas font-sans text-ink">
      <TopBar />
      <OfflineBanner />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          {page === 'dashboard' ? (
            <DashboardPage />
          ) : page === 'journal' ? (
            <JournalPage />
          ) : page === 'buku-besar' ? (
            <LedgerPage />
          ) : page === 'laba-rugi' ? (
            <IncomeStatementPage />
          ) : page === 'neraca-lajur' ? (
            <TrialBalancePage />
          ) : page === 'neraca' ? (
            <BalanceSheetPage />
          ) : page === 'pengaturan' ? (
            <SettingsPage />
          ) : (
            <ComingSoon />
          )}
        </main>
      </div>
      <BottomBar />
      {modalOpen && <JournalEntryModal />}
      <Toast />
    </div>
  )
}

export default App
