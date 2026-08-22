import { useEffect, useState } from 'react'
import { Database, HardDrive, RefreshCw, Server, Table2, Upload } from 'lucide-react'
import { getDbStatus, seedAllToDb, type DbStatusResponse, type SeedAllResponse } from '../api'

const TABLE_LABELS: Record<string, string> = {
  entities: 'Entitas',
  users: 'Pengguna',
  entity_members: 'Relasi Entitas',
  sessions: 'Sesi Login',
  fiscal_periods: 'Periode Fiskal',
  accounts: 'Akun (COA)',
  journals: 'Jurnal',
  journal_lines: 'Baris Jurnal',
  attachments: 'Lampiran',
  audit_logs: 'Log Audit',
  journal_sequences: 'Nomor Urut',
  reports: 'Laporan',
  cash_flow_mapping: 'Pemetaan Arus Kas',
  settings: 'Pengaturan',
}

export default function DbStatus() {
  const [data, setData] = useState<DbStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [seedResult, setSeedResult] = useState<SeedAllResponse | null>(null)

  const fetchStatus = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getDbStatus()
      setData(res)
    } catch (err: any) {
      setError(err.message || 'Gagal mengambil status database')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  const totalRows = data ? Object.values(data.tables).filter((v) => v >= 0).reduce((a, b) => a + b, 0) : 0
  const tableCount = data ? Object.values(data.tables).filter((v) => v >= 0).length : 0
  const missingTables = data ? Object.entries(data.tables).filter(([, v]) => v === -1).map(([k]) => k) : []

  const handleSeedAll = async () => {
    if (!confirm('Seed SEMUA data in-memory (akun, jurnal, periode, users) ke PostgreSQL?\nData yang sudah ada tidak akan diduplikasi.')) return
    setSeeding(true)
    setSeedResult(null)
    try {
      const result = await seedAllToDb()
      setSeedResult(result)
      // Refresh status setelah seed
      await fetchStatus()
    } catch (err: any) {
      setSeedResult({ ok: false, accounts: 0, journals: 0, periods: 0, users: 0, errors: [{ table: 'api', error: err.message }] })
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="space-y-5 p-5 lg:p-7">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink lg:text-2xl">Status Database</h1>
          <p className="mt-0.5 text-sm text-ink-soft">Statistik PostgreSQL — jumlah baris per tabel</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSeedAll}
            disabled={seeding || loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 shadow-card transition hover:bg-green-100 active:translate-y-px disabled:opacity-50"
          >
            <Upload size={14} className={seeding ? 'animate-pulse' : ''} />
            {seeding ? 'Seeding...' : 'Seed Semua Data'}
          </button>
          <button
            type="button"
            onClick={fetchStatus}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink shadow-card transition hover:bg-canvas active:translate-y-px disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-bad/30 bg-bad/10 p-4 text-sm text-bad">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {data && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Table2 size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-ink">{tableCount}</p>
                <p className="text-xs text-ink-faint">Tabel Aktif</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                <Database size={20} className="text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-ink">{totalRows.toLocaleString('id-ID')}</p>
                <p className="text-xs text-ink-faint">Total Baris</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                <HardDrive size={20} className="text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-ink">{data.dbSize ?? '—'}</p>
                <p className="text-xs text-ink-faint">Ukuran DB</p>
              </div>
            </div>
          </div>

          {/* Connection Info */}
          <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-4 py-2.5 text-sm text-green-700">
            <Server size={14} />
            <span className="font-medium">Mode: PostgreSQL</span>
            <span className="text-green-600/70">·</span>
            <span className="text-green-600/70">{tableCount} tabel · {totalRows.toLocaleString('id-ID')} baris</span>
          </div>

          {/* Seed Result */}
          {seedResult && (
            <div className={`rounded-xl border p-4 text-sm ${
              seedResult.ok
                ? 'border-green-300 bg-green-50 text-green-800'
                : 'border-amber-300 bg-amber-50 text-amber-800'
            }`}>
              <p className="font-semibold">
                {seedResult.ok ? '✅ Seed berhasil!' : '⚠️ Seed sebagian berhasil'}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 font-mono text-xs">
                <span>Accounts: +{seedResult.accounts}</span>
                <span>Journals: +{seedResult.journals}</span>
                <span>Periods: +{seedResult.periods}</span>
                <span>Users: +{seedResult.users}</span>
              </div>
              {seedResult.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-amber-600">Errors:</p>
                  {seedResult.errors.slice(0, 5).map((e, i) => (
                    <p key={i} className="font-mono text-xs text-amber-600">{e.table}: {e.error}</p>
                  ))}
                  {seedResult.errors.length > 5 && (
                    <p className="text-xs text-amber-500">...+{seedResult.errors.length - 5} more</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Missing Tables Warning */}
          {missingTables.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-semibold">⚠️ {missingTables.length} tabel belum terbentuk:</p>
              <p className="mt-1 font-mono text-xs">{missingTables.join(', ')}</p>
              <p className="mt-2 text-xs text-amber-600">Klik "Jalankan Migration" di Pengaturan Database untuk membuat tabel yang belum ada.</p>
            </div>
          )}

          {/* Table Details */}
          <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <div className="flex items-center gap-2 border-b border-line bg-canvas px-5 py-3">
              <Table2 size={16} className="text-primary" />
              <h2 className="text-sm font-bold text-ink">Jumlah Baris per Tabel</h2>
            </div>
            <div className="divide-y divide-line">
              {Object.entries(data.tables).map(([key, count]) => {
                const label = TABLE_LABELS[key] ?? key
                const isMissing = count === -1
                const maxCount = Math.max(...Object.values(data!.tables).filter((v) => v >= 0), 1)
                const barWidth = isMissing ? 0 : (count / maxCount) * 100

                return (
                  <div key={key} className="flex items-center gap-4 px-5 py-3 transition hover:bg-canvas/50">
                    <div className="min-w-[180px]">
                      <p className="text-sm font-medium text-ink">{label}</p>
                      <p className="font-mono text-xs text-ink-faint">app.{key}</p>
                    </div>
                    <div className="min-w-[60px] text-right">
                      {isMissing ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                          N/A
                        </span>
                      ) : (
                        <span className="font-mono text-sm font-semibold text-ink">
                          {count.toLocaleString('id-ID')}
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="h-2 rounded-full bg-canvas">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            isMissing ? 'bg-amber-300' : barWidth > 50 ? 'bg-primary' : barWidth > 0 ? 'bg-primary/60' : 'bg-line'
                          }`}
                          style={{ width: `${isMissing ? 5 : Math.max(barWidth, count > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
