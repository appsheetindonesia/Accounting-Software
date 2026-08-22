import { useCallback, useEffect, useState } from 'react'
import {
  ArrowUpRight,
  Check,
  Clock,
  Filter,
  GitBranch,
  History,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  ShieldX,
  Trash2,
} from 'lucide-react'
import { getAuditTrail, type AuditTrailResponse } from '../api'

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: typeof History }> = {
  create: { label: 'Dibuat', color: 'bg-blue-100 text-blue-700', icon: Check },
  update: { label: 'Diperbarui', color: 'bg-amber-100 text-amber-700', icon: RefreshCw },
  post: { label: 'Diposting', color: 'bg-green-100 text-green-700', icon: ArrowUpRight },
  reverse: { label: 'Dibalik', color: 'bg-red-100 text-red-700', icon: RotateCcw },
  submit: { label: 'Disubmit', color: 'bg-indigo-100 text-indigo-700', icon: Send },
  approve: { label: 'Disetujui', color: 'bg-emerald-100 text-emerald-700', icon: ShieldCheck },
  reject: { label: 'Ditolak', color: 'bg-rose-100 text-rose-700', icon: ShieldX },
  delete: { label: 'Dihapus', color: 'bg-gray-100 text-gray-700', icon: Trash2 },
}

const ACTIONS = [
  { value: '', label: 'Semua Aksi' },
  { value: 'create', label: 'Dibuat' },
  { value: 'update', label: 'Diperbarui' },
  { value: 'post', label: 'Diposting' },
  { value: 'reverse', label: 'Dibalik' },
  { value: 'submit', label: 'Disubmit' },
  { value: 'approve', label: 'Disetujui' },
  { value: 'reject', label: 'Ditolak' },
]

function formatTimestamp(ts: string): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export default function AuditTrail() {
  const [data, setData] = useState<AuditTrailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter state
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [page, setPage] = useState(1)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getAuditTrail({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        userId: filterUser || undefined,
        action: filterAction || undefined,
        page,
      })
      setData(res)
    } catch (err: any) {
      setError(err.message || 'Gagal mengambil audit trail')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, filterUser, filterAction, page])

  useEffect(() => { fetchData() }, [fetchData])

  const handleResetFilters = () => {
    setStartDate('')
    setEndDate('')
    setFilterUser('')
    setFilterAction('')
    setPage(1)
  }

  return (
    <div className="space-y-5 p-5 lg:p-7">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink lg:text-2xl">Audit Trail</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Log semua aksi user — {data?.meta.total ?? 0} entri
          </p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink shadow-card transition hover:bg-canvas active:translate-y-px disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-bad/30 bg-bad/10 p-4 text-sm text-bad">{error}</div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
        <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <Filter size={14} className="text-primary" />
          Filter:
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-ink-faint">Dari Tanggal</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
            className="rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-ink-faint">Sampai Tanggal</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
            className="rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-ink-faint">User</label>
          <select
            value={filterUser}
            onChange={(e) => { setFilterUser(e.target.value); setPage(1) }}
            className="rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          >
            <option value="">Semua User</option>
            {data?.users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-ink-faint">Aksi</label>
          <select
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(1) }}
            className="rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          >
            {ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>
        {(startDate || endDate || filterUser || filterAction) && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-surface"
          >
            Reset
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {/* Empty */}
      {!loading && data && data.entries.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-sm text-ink-faint">
          <History size={32} className="opacity-40" />
          <p>Belum ada audit trail</p>
          <p className="text-xs">Aksi user akan tercatat saat membuat, mengedit, atau memposting jurnal</p>
        </div>
      )}

      {/* Entries */}
      {data && data.entries.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="divide-y divide-line">
            {data.entries.map((entry) => {
              const cfg = ACTION_CONFIG[entry.action] ?? { label: entry.action, color: 'bg-gray-100 text-gray-700', icon: History }
              const Icon = cfg.icon
              return (
                <div key={entry.id} className="flex items-start gap-4 px-5 py-3 transition hover:bg-canvas/50">
                  {/* Icon */}
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.color}`}>
                    <Icon size={14} />
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <span className="font-mono text-xs font-semibold text-primary">{entry.entityLabel}</span>
                    </div>
                    <p className="mt-1 text-sm text-ink">{entry.description || entry.entityLabel}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-faint">
                      <span className="flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-primary" />
                        {entry.userName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {formatTimestamp(entry.timestamp)}
                      </span>
                      {entry.entityId && (
                        <span className="flex items-center gap-1 font-mono">
                          <GitBranch size={11} />
                          {entry.entityId.length > 20 ? entry.entityId.slice(0, 20) + '…' : entry.entityId}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Pagination */}
      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-faint">
            Halaman {data.meta.page} dari {data.meta.totalPages} · {data.meta.total} entri
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface disabled:opacity-40"
            >
              ← Sebelumnya
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
              disabled={page >= data.meta.totalPages}
              className="rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface disabled:opacity-40"
            >
              Selanjutnya →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
