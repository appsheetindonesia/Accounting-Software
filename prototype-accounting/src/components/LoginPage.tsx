import { useState, type FormEvent } from 'react'
import { BookMarked, Loader2, Lock, LogIn, Mail, WifiOff } from 'lucide-react'
import { useStore } from '../store/useStore'

// Akun demo mock API (mock-api/src/data.js) — ditampilkan sebagai petunjuk
const DEMO_ACCOUNTS = [
  { email: 'rina@bukuwarung.com', role: 'Admin' },
  { email: 'dimas@majujaya.co.id', role: 'Akuntan' },
  { email: 'budi@majujaya.co.id', role: 'Viewer' },
]
const DEMO_PASSWORD = 'password123'

export default function LoginPage() {
  const login = useStore((s) => s.login)
  const loginOffline = useStore((s) => s.loginOffline)
  const authLoading = useStore((s) => s.authLoading)
  const authError = useStore((s) => s.authError)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (authLoading) return
    login(email.trim(), password)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-white shadow-card">
            <BookMarked size={26} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">Appsheet Accounting Journal</h1>
            <p className="mt-0.5 text-sm text-ink-soft">Masuk untuk mengelola jurnal PT Maju Jaya</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-card"
        >
          {authError && (
            <div className="flex items-start gap-2 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2.5 text-sm text-bad">
              <WifiOff size={15} className="mt-0.5 shrink-0" />
              <p>{authError}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="login-email" className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              Email
            </label>
            <div className="relative">
              <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                id="login-email"
                type="email"
                required
                autoComplete="username"
                placeholder="nama@perusahaan.co.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full rounded-lg border border-line bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="login-password" className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              Password
            </label>
            <div className="relative">
              <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-lg border border-line bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={authLoading}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-card transition hover:bg-primary-light active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
          >
            {authLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Memeriksa...
              </>
            ) : (
              <>
                <LogIn size={16} /> Masuk
              </>
            )}
          </button>

          <div className="rounded-lg bg-canvas px-3 py-2.5 text-xs leading-relaxed text-ink-soft">
            <p className="font-bold uppercase tracking-wider text-ink-faint">Akun demo (mock API)</p>
            <p className="mt-1">
              {DEMO_ACCOUNTS.map((a) => (
                <span key={a.email} className="block">
                  {a.role}: <code className="rounded bg-surface px-1 py-0.5 font-mono text-primary">{a.email}</code>
                </span>
              ))}
              <span className="block">
                Password: <code className="rounded bg-surface px-1 py-0.5 font-mono text-primary">{DEMO_PASSWORD}</code>
              </span>
            </p>
          </div>
        </form>

        <button
          type="button"
          onClick={loginOffline}
          className="mt-4 w-full text-center text-xs text-ink-faint underline-offset-2 transition hover:text-primary hover:underline"
        >
          Server tidak berjalan? Masuk offline dengan data demo
        </button>
      </div>
    </div>
  )
}
