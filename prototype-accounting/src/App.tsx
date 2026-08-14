import { useEffect } from 'react'
import { useStore } from './store/useStore'
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
import ComingSoon from './components/ComingSoon'

function App() {
  const page = useStore((s) => s.page)
  const modalOpen = useStore((s) => s.modalOpen)
  const init = useStore((s) => s.init)

  // Koneksi ke mock API (auto-login demo + muat data) saat aplikasi mulai
  useEffect(() => {
    init()
  }, [init])

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
