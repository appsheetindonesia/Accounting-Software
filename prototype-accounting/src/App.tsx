import { useEffect, useState } from 'react'
import { useStore } from './store/useStore'
import LoginPage from './components/LoginPage'
import ForgotPasswordPage from './components/ForgotPasswordPage'
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
import CashFlowPage from './components/reports/CashFlowPage'
import SettingsPage from './components/SettingsPage'
import ComingSoon from './components/ComingSoon'
import SessionExpiredModal from './components/SessionExpiredModal'

function App() {
  const page = useStore((s) => s.page)
  const modalOpen = useStore((s) => s.modalOpen)
  const accessToken = useStore((s) => s.accessToken)
  const init = useStore((s) => s.init)
  const pollConnection = useStore((s) => s.pollConnection)

  // Reconnect sesi tersimpan saat aplikasi mulai (bukan auto-login demo)
  useEffect(() => {
    init()
  }, [init])

  // Polling koneksi berkala: selama sesi offline, cek GET /health tiap 10 detik
  // (ringan, tanpa auth). Begitu server kembali → pollConnection memanggil
  // `init({ silent: true })` otomatis → banner offline hilang TANPA klik
  // "Coba lagi" (auto-login demo bila token 'local.demo'). No-op saat online.
  const HEALTH_POLL_MS = 10_000
  useEffect(() => {
    const timer = setInterval(() => pollConnection(), HEALTH_POLL_MS)
    return () => clearInterval(timer)
  }, [pollConnection])

  // Halaman auth (belum login): login ↔ lupa password. State lokal saja
  // (tidak dipersist — reload kembali ke halaman login).
  const [authView, setAuthView] = useState<'login' | 'forgot'>('login')

  return (
    <>
      {!accessToken ? (
        authView === 'forgot' ? (
          <ForgotPasswordPage onBack={() => setAuthView('login')} />
        ) : (
          <LoginPage onForgotPassword={() => setAuthView('forgot')} />
        )
      ) : (
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
              ) : page === 'arus-kas' ? (
                <CashFlowPage />
              ) : page === 'pengaturan' ? (
                <SettingsPage />
              ) : (
                <ComingSoon />
              )}
            </main>
          </div>
          <BottomBar />
          {modalOpen && <JournalEntryModal />}
        </div>
      )}
      {/* Toast di level PALING LUAR agar muncul juga di halaman login
          (mis. toast "Anda telah keluar" setelah logout). */}
      <Toast />
      {/* Modal sesi berakhir di level terluar juga — muncul di atas halaman
          login (refresh gagal → logout otomatis + pemberitahuan eksplisit). */}
      <SessionExpiredModal />
    </>
  )
}

export default App
