import { useEffect } from 'react'
import { useStore } from './store/useStore'
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
  const init = useStore((s) => s.init)

  // Reconnect sesi tersimpan saat aplikasi mulai (bukan auto-login demo)
  useEffect(() => {
    init()
  }, [init])

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
