import { useStore } from './store/useStore'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import BottomBar from './components/BottomBar'
import Toast from './components/Toast'
import DashboardPage from './components/dashboard/DashboardPage'
import JournalPage from './components/journal/JournalPage'
import JournalEntryModal from './components/journal/JournalEntryModal'
import ComingSoon from './components/ComingSoon'

function App() {
  const page = useStore((s) => s.page)
  const modalOpen = useStore((s) => s.modalOpen)

  return (
    <div className="flex h-dvh flex-col bg-canvas font-sans text-ink">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          {page === 'dashboard' ? <DashboardPage /> : page === 'journal' ? <JournalPage /> : <ComingSoon />}
        </main>
      </div>
      <BottomBar />
      {modalOpen && <JournalEntryModal />}
      <Toast />
    </div>
  )
}

export default App
