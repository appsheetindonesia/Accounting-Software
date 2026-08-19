import { useRef, useState } from 'react'
import { Eye, EyeOff, Save, Server, Plug, HardDrive, Database, Table2, RotateCcw } from 'lucide-react'
import { useStore } from '../store/useStore'
import { request } from '../api/client'
import type { DbTables } from '../types'
import { DEFAULT_DB_TABLES } from '../types'

export default function DatabaseSettings() {
  const dbConfig = useStore((s) => s.dbConfig)
  const updateDbConfig = useStore((s) => s.updateDbConfig)
  const showToast = useStore((s) => s.showToast)

  const [form, setForm] = useState({
    ...dbConfig,
    tables: dbConfig.tables ?? DEFAULT_DB_TABLES,
    storageMode: dbConfig.storageMode ?? 'local',
    host: dbConfig.host ?? 'localhost',
    port: dbConfig.port ?? '5432',
    database: dbConfig.database ?? 'accounting_db',
    schema: dbConfig.schema ?? 'public',
    username: dbConfig.username ?? 'postgres',
    password: dbConfig.password ?? '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latencyMs?: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const isLocalMode = form.storageMode === 'local'

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
    setTestResult(null)
  }

  const handleModeChange = (mode: 'postgresql' | 'local') => {
    setForm((prev) => ({ ...prev, storageMode: mode }))
    setSaved(false)
    setTestResult(null)
  }

  const handleTableChange = (key: keyof DbTables, value: string) => {
    setForm((prev) => ({
      ...prev,
      tables: { ...prev.tables, [key]: value },
    }))
    setSaved(false)
  }

  const resetTables = () => {
    setForm((prev) => ({ ...prev, tables: { ...DEFAULT_DB_TABLES } }))
    setSaved(false)
  }

  const handleSave = () => {
    if (!isLocalMode) {
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
    }

    updateDbConfig({
      storageMode: form.storageMode,
      host: form.host.trim(),
      port: form.port.trim(),
      database: form.database.trim(),
      schema: form.schema.trim() || 'public',
      username: form.username.trim() || 'postgres',
      password: form.password,
      tables: form.tables,
    })
    setSaved(true)
    showToast(
      isLocalMode
        ? 'Mode penyimpanan lokal aktif — data disimpan di perangkat ini'
        : 'Pengaturan database tersimpan',
      'success',
    )
  }

  const handleTestConnection = async () => {
    // Validasi ringan sebelum test
    if (!form.host.trim() || !form.port.trim() || !form.database.trim() || !form.username.trim()) {
      showToast('Lengkapi host, port, nama basis data, dan pengguna terlebih dahulu', 'error')
      return
    }

    setTesting(true)
    setTestResult(null)
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    try {
      const res = await request<{ ok: boolean; message: string; latencyMs: number }>(
        '/settings/test-connection',
        {
          method: 'POST',
          body: {
            host: form.host.trim(),
            port: form.port.trim(),
            database: form.database.trim(),
            schema: form.schema.trim() || 'public',
            username: form.username.trim() || 'postgres',
            password: form.password,
          },
        }
      )
      setTestResult(res)
      showToast(res.ok ? 'Koneksi database berhasil' : 'Koneksi database gagal', res.ok ? 'success' : 'error')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menguji koneksi'
      setTestResult({ ok: false, message: msg })
      showToast(msg, 'error')
    } finally {
      setTesting(false)
    }
  }

  const isDirty =
    form.storageMode !== dbConfig.storageMode ||
    form.host !== dbConfig.host ||
    form.port !== dbConfig.port ||
    form.database !== dbConfig.database ||
    form.schema !== dbConfig.schema ||
    form.username !== dbConfig.username ||
    form.password !== dbConfig.password ||
    JSON.stringify(form.tables) !== JSON.stringify(dbConfig.tables)

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-center gap-2 border-b border-line bg-canvas px-5 py-3">
        <Server size={16} className="text-primary" />
        <h2 className="text-sm font-bold text-ink">Koneksi Database</h2>
        {/* Badge mode aktif */}
        <span
          className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            isLocalMode
              ? 'bg-amber-100 text-amber-700'
              : 'bg-emerald-100 text-emerald-700'
          }`}
          data-testid="storage-mode-badge"
        >
          {isLocalMode ? <HardDrive size={11} /> : <Database size={11} />}
          {isLocalMode ? 'Lokal' : 'PostgreSQL'}
        </span>
      </div>
      <div className="space-y-4 p-5">
        <p className="text-sm text-ink-soft">
          Pilih mode penyimpanan data. Mode <strong>Lokal</strong> menyimpan data di perangkat ini
          (localStorage) tanpa memerlukan database. Mode <strong>PostgreSQL</strong> menghubungkan ke
          server database untuk penyimpanan data permanen.
        </p>

        {/* Mode selector */}
        <div className="flex gap-3" data-testid="storage-mode-selector">
          <button
            type="button"
            onClick={() => handleModeChange('local')}
            className={`flex-1 rounded-lg border-2 px-4 py-3 text-left transition ${
              isLocalMode
                ? 'border-amber-400 bg-amber-50 shadow-sm'
                : 'border-line bg-canvas hover:border-ink-faint'
            }`}
            data-testid="mode-local-btn"
          >
            <div className="flex items-center gap-2">
              <HardDrive size={16} className={isLocalMode ? 'text-amber-600' : 'text-ink-faint'} />
              <span className={`text-sm font-semibold ${isLocalMode ? 'text-amber-700' : 'text-ink'}`}>
                Lokal
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              Data disimpan di perangkat ini. Cocok untuk penggunaan offline atau testing.
            </p>
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('postgresql')}
            className={`flex-1 rounded-lg border-2 px-4 py-3 text-left transition ${
              !isLocalMode
                ? 'border-emerald-400 bg-emerald-50 shadow-sm'
                : 'border-line bg-canvas hover:border-ink-faint'
            }`}
            data-testid="mode-postgresql-btn"
          >
            <div className="flex items-center gap-2">
              <Database size={16} className={!isLocalMode ? 'text-emerald-600' : 'text-ink-faint'} />
              <span className={`text-sm font-semibold ${!isLocalMode ? 'text-emerald-700' : 'text-ink'}`}>
                PostgreSQL
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              Hubungkan ke server database PostgreSQL untuk penyimpanan data permanen.
            </p>
          </button>
        </div>

        {/* Form PostgreSQL — hanya tampil saat mode PostgreSQL */}
        {!isLocalMode && (
          <div className="space-y-4" data-testid="postgresql-form">
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

              {/* Schema */}
              <div className="space-y-1.5">
                <label htmlFor="db-schema" className="block text-xs font-semibold text-ink">
                  Schema
                </label>
                <input
                  id="db-schema"
                  type="text"
                  value={form.schema}
                  onChange={(e) => handleChange('schema', e.target.value)}
                  placeholder="public"
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <p className="text-[11px] text-ink-faint">Schema PostgreSQL (default: public)</p>
              </div>

              {/* Pengguna */}
              <div className="space-y-1.5">
                <label htmlFor="db-username" className="block text-xs font-semibold text-ink">
                  Pengguna
                </label>
                <input
                  id="db-username"
                  type="text"
                  value={form.username}
                  onChange={(e) => handleChange('username', e.target.value)}
                  placeholder="postgres"
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <p className="text-[11px] text-ink-faint">Username akun database (default: postgres)</p>
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
                postgresql://{form.username || '???'}@{form.host || '???'}:{form.port || '???'}/{form.database || '???'}{form.schema && form.schema !== 'public' ? `/${form.schema}` : ''}
              </code>
              {form.password && (
                <span className="ml-1 text-ink-faint">(dengan password)</span>
              )}
            </div>

            {/* Konfigurasi Nama Tabel */}
            <div className="space-y-3 rounded-lg border border-line bg-canvas p-4" data-testid="table-config">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Table2 size={15} className="text-primary" />
                  <h3 className="text-xs font-bold text-ink">Nama Tabel PostgreSQL</h3>
                </div>
                <button
                  type="button"
                  onClick={resetTables}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-ink-faint transition hover:bg-surface hover:text-ink"
                  data-testid="reset-tables-btn"
                >
                  <RotateCcw size={11} /> Reset default
                </button>
              </div>
              <p className="text-[11px] text-ink-faint">
                Atur nama tabel yang akan dibuat di PostgreSQL. Kosongkan untuk menggunakan nama default.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['accounts', 'Tabel Akun'],
                    ['journals', 'Tabel Jurnal'],
                    ['journalLines', 'Tabel Baris Jurnal'],
                    ['periods', 'Tabel Periode'],
                    ['users', 'Tabel Pengguna'],
                    ['entities', 'Tabel Entitas'],
                    ['sessions', 'Tabel Sesi'],
                    ['attachments', 'Tabel Lampiran'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <label htmlFor={`table-${key}`} className="block text-[11px] font-medium text-ink-soft">
                      {label}
                    </label>
                    <input
                      id={`table-${key}`}
                      type="text"
                      value={form.tables[key]}
                      onChange={(e) => handleTableChange(key, e.target.value)}
                      placeholder={DEFAULT_DB_TABLES[key]}
                      className="w-full rounded border border-line bg-surface px-2 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                      data-testid={`table-input-${key}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Info mode lokal */}
        {isLocalMode && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4" data-testid="local-mode-info">
            <div className="flex items-start gap-3">
              <HardDrive size={18} className="mt-0.5 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Penyimpanan Lokal Aktif</p>
                <p className="mt-1 text-xs text-amber-700">
                  Semua data jurnal, akun, dan pengaturan disimpan langsung di perangkat ini menggunakan
                  browser storage. Tidak memerlukan koneksi ke server database.
                </p>
                <ul className="mt-2 space-y-1 text-xs text-amber-600">
                  <li>• Data tetap tersimpan meskipun server mati</li>
                  <li>• Cocok untuk penggunaan offline atau testing</li>
                  <li>• Data hanya ada di browser ini (tidak ter-sync lintas perangkat)</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Tombol Simpan + Test Koneksi */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-hover active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={15} /> Simpan Pengaturan
          </button>
          {!isLocalMode && (
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-canvas px-4 py-2.5 text-sm font-semibold text-ink shadow-card transition hover:bg-surface active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="test-connection-btn"
            >
              <Plug size={15} className={testing ? 'animate-pulse' : ''} />
              {testing ? 'Menguji...' : 'Test Koneksi'}
            </button>
          )}
          {saved && isDirty === false && (
            <span className="text-xs text-ok">✓ Tersimpan</span>
          )}
        </div>

        {/* Hasil Test Koneksi — dengan saran beralih ke mode lokal saat gagal */}
        {testResult && (
          <div className="space-y-2">
            <div
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                testResult.ok
                  ? 'border border-ok/30 bg-ok/5 text-ok'
                  : 'border border-error/30 bg-error/5 text-error'
              }`}
              data-testid="test-result"
            >
              <span className="mt-0.5 text-base">{testResult.ok ? '✓' : '✗'}</span>
              <div>
                <p className="font-medium">{testResult.message}</p>
                {testResult.latencyMs !== undefined && (
                  <p className="mt-0.5 text-xs opacity-70">Latency: {testResult.latencyMs}ms</p>
                )}
              </div>
            </div>
            {/* Saran beralih ke mode lokal saat koneksi gagal */}
            {!testResult.ok && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700" data-testid="local-mode-suggestion">
                <HardDrive size={14} />
                <span>
                  Koneksi gagal?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      handleModeChange('local')
                      setTestResult(null)
                      // Auto-save saat beralih via saran — user tidak perlu klik Simpan lagi
                      updateDbConfig({
                        ...form,
                        storageMode: 'local',
                      })
                      setSaved(true)
                      showToast('Beralih ke mode penyimpanan lokal', 'success')
                    }}
                    className="font-semibold underline decoration-amber-400 underline-offset-2 hover:text-amber-900"
                    data-testid="switch-to-local-btn"
                  >
                    Gunakan mode Lokal
                  </button>{' '}
                  untuk menyimpan data di perangkat ini tanpa database.
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
