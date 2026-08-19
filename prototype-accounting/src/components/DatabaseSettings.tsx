import { useState } from 'react'
import { Eye, EyeOff, Save, Server } from 'lucide-react'
import { useStore } from '../store/useStore'

export default function DatabaseSettings() {
  const dbConfig = useStore((s) => s.dbConfig)
  const updateDbConfig = useStore((s) => s.updateDbConfig)
  const showToast = useStore((s) => s.showToast)

  const [form, setForm] = useState({ ...dbConfig })
  const [showPassword, setShowPassword] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  const handleSave = () => {
    // Validasi port harus angka
    const port = form.port.trim()
    if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) {
      showToast('Port harus berupa angka 1–65535', 'error')
      return
    }
    // Validasi host tidak kosong
    if (!form.host.trim()) {
      showToast('Host tidak boleh kosong', 'error')
      return
    }
    // Validasi nama basis data tidak kosong
    if (!form.database.trim()) {
      showToast('Nama basis data tidak boleh kosong', 'error')
      return
    }

    updateDbConfig({
      host: form.host.trim(),
      port: form.port.trim(),
      database: form.database.trim(),
      password: form.password,
    })
    setSaved(true)
    showToast('Pengaturan database tersimpan', 'success')
  }

  const isDirty =
    form.host !== dbConfig.host ||
    form.port !== dbConfig.port ||
    form.database !== dbConfig.database ||
    form.password !== dbConfig.password

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-center gap-2 border-b border-line bg-canvas px-5 py-3">
        <Server size={16} className="text-primary" />
        <h2 className="text-sm font-bold text-ink">Koneksi Database PostgreSQL</h2>
      </div>
      <div className="space-y-4 p-5">
        <p className="text-sm text-ink-soft">
          Konfigurasi koneksi ke database PostgreSQL untuk penyimpanan data permanen.
          Pengaturan ini disimpan di perangkat ini (localStorage).
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Host Internal */}
          <div className="space-y-1.5">
            <label htmlFor="db-host" className="block text-xs font-semibold text-ink">
              Host Internal
            </label>
            <input
              id="db-host"
              type="text"
              value={form.host}
              onChange={(e) => handleChange('host', e.target.value)}
              placeholder="localhost"
              className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <p className="text-[11px] text-ink-faint">Alamat server database (IP atau hostname)</p>
          </div>

          {/* Port Internal */}
          <div className="space-y-1.5">
            <label htmlFor="db-port" className="block text-xs font-semibold text-ink">
              Port Internal
            </label>
            <input
              id="db-port"
              type="text"
              value={form.port}
              onChange={(e) => handleChange('port', e.target.value)}
              placeholder="5432"
              className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <p className="text-[11px] text-ink-faint">Port PostgreSQL (default: 5432)</p>
          </div>

          {/* Nama Basis Data */}
          <div className="space-y-1.5">
            <label htmlFor="db-name" className="block text-xs font-semibold text-ink">
              Nama Basis Data
            </label>
            <input
              id="db-name"
              type="text"
              value={form.database}
              onChange={(e) => handleChange('database', e.target.value)}
              placeholder="accounting_db"
              className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <p className="text-[11px] text-ink-faint">Nama database yang akan digunakan</p>
          </div>

          {/* Kata Sandi */}
          <div className="space-y-1.5">
            <label htmlFor="db-password" className="block text-xs font-semibold text-ink">
              Kata Sandi
            </label>
            <div className="relative">
              <input
                id="db-password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => handleChange('password', e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-line bg-canvas px-3 py-2 pr-10 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-faint transition hover:text-ink"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="text-[11px] text-ink-faint">Password akun database</p>
          </div>
        </div>

        {/* Ringkasan */}
        <div className="rounded-lg bg-canvas px-3 py-2 text-xs text-ink-soft">
          <span className="font-medium text-ink">Koneksi:</span>{' '}
          <code className="rounded bg-surface px-1 py-0.5 font-mono text-primary">
            postgresql://{form.database || '???'}@{form.host || '???'}:{form.port || '???'}
          </code>
          {form.password && (
            <span className="ml-1 text-ink-faint">(dengan password)</span>
          )}
        </div>

        {/* Tombol Simpan */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-hover active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={15} /> Simpan Pengaturan
          </button>
          {saved && isDirty === false && (
            <span className="text-xs text-ok">✓ Tersimpan</span>
          )}
        </div>
      </div>
    </section>
  )
}
