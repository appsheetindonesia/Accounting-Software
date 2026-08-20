import { useState, type FormEvent } from 'react'
import { ArrowLeft, BookMarked, CheckCircle2, KeyRound, Loader2, Mail, WifiOff } from 'lucide-react'
import { api, ApiError, isNetworkError } from '../api'

interface ForgotResult {
  email: string
  name: string
  role: string
  hint: string
  note: string
}

export default function ForgotPasswordPage({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ForgotResult | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.forgotPassword(email.trim())
      setResult({ email: res.email, name: res.name, role: res.role, hint: res.hint, note: res.note })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.code === 'USER_NOT_FOUND'
            ? 'Email tidak terdaftar di sistem ini. Pastikan email sudah benar, atau hubungi admin untuk dibantu.'
            : err.message,
        )
      } else if (isNetworkError(err)) {
        setError('Server tidak dapat dijangkau. Pastikan mock API berjalan, atau hubungi admin untuk reset manual.')
      } else {
        setError('Terjadi kesalahan. Silakan coba lagi atau hubungi admin.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-white shadow-card">
            <BookMarked size={26} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">Lupa Password</h1>
            <p className="mt-0.5 text-sm text-ink-soft">Reset akses ke Appsheet Accounting Journal</p>
          </div>
        </div>

        {result ? (
          <div className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-card">
            <div className="flex items-start gap-2 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2.5 text-sm text-ink">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" />
              <div>
                <p className="font-semibold text-ink">Permintaan reset diterima</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Akun terdaftar untuk <strong className="text-ink">{result.email}</strong> ({result.name} · {result.role})
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-canvas px-4 py-3 text-sm">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-faint">
                <KeyRound size={13} /> Petunjuk (mode demo)
              </p>
              <p className="mt-1.5 text-ink">{result.hint}</p>
            </div>
            <div className="rounded-lg border border-line bg-canvas px-4 py-3 text-xs leading-relaxed text-ink-soft">
              <p className="font-bold uppercase tracking-wider text-ink-faint">Lingkungan produksi</p>
              <p className="mt-1">{result.note}</p>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-card transition hover:bg-primary-light active:translate-y-px"
            >
              <ArrowLeft size={16} /> Kembali ke halaman masuk
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-card">
            <p className="text-sm leading-relaxed text-ink-soft">
              Masukkan email yang terdaftar. Di mock API, petunjuk password akun akan ditampilkan; di lingkungan
              produksi tautan reset dikirim ke email Anda.
            </p>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2.5 text-sm text-bad">
                <WifiOff size={15} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="forgot-email" className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                Email
              </label>
              <div className="relative">
                <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  id="forgot-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="nama@perusahaan.co.id"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-lg border border-line bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-card transition hover:bg-primary-light active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Memeriksa...
                </>
              ) : (
                <>
                  <KeyRound size={16} /> Kirim permintaan reset
                </>
              )}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={onBack}
          className="mt-4 flex w-full items-center justify-center gap-1.5 text-xs text-ink-faint underline-offset-2 transition hover:text-primary hover:underline"
        >
          <ArrowLeft size={13} /> Kembali ke halaman masuk
        </button>
      </div>
    </div>
  )
}
