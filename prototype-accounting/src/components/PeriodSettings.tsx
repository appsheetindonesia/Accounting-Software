import { useState } from 'react'
import { CalendarX2, Lock, ShieldCheck } from 'lucide-react'
import { useStore } from '../store/useStore'
import { api, ApiError, type PeriodInfo } from '../api'
import { useApiFetch } from '../hooks/useApiFetch'
import { useActionGuard } from '../hooks/useActionGuard'
import { can } from '../lib/permissions'
import { SkeletonLines } from './Skeleton'

type DraftAction = 'post-all' | 'delete-all' | 'keep'

const DRAFT_ACTIONS: { value: DraftAction; label: string; hint: string }[] = [
  { value: 'post-all', label: 'Posting semua draft', hint: 'Jurnal draft diposting (masuk saldo & laporan)' },
  { value: 'keep', label: 'Pertahankan draft', hint: 'Jurnal draft tetap draft, tidak ikut laporan' },
  { value: 'delete-all', label: 'Hapus semua draft', hint: 'Jurnal draft dihapus permanen' },
]

/**
 * Kelola periode fiskal (Pengaturan). Menampilkan daftar periode dari
 * GET /periods?includeClosed=true. Tutup periode (period.manage — admin):
 * tanpa jurnal draft → langsung ditutup; dengan draft → server 422
 * DRAFT_ACTION_REQUIRED → dialog pilihan aksi draft muncul, lalu retry
 * dengan confirmDraftAction.
 */
export default function PeriodSettings() {
  const apiStatus = useStore((s) => s.apiStatus)
  const user = useStore((s) => s.user)
  const closePeriod = useStore((s) => s.closePeriod)
  const showToast = useStore((s) => s.showToast)
  // Guard anti double-click SINKRON (ref) — dua klik Tutup periode / konfirmasi
  // dialog dalam satu frame tidak boleh close dua kali (state `busy` di-batch,
  // `disabled` saja tidak cukup). Pola sama dengan guard busyRef di ExportButtons.
  const closeGuard = useActionGuard()
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, setPending] = useState<PeriodInfo | null>(null)
  const [action, setAction] = useState<DraftAction>('post-all')
  const canManage = can(user?.role, 'period.manage')

  const ready = apiStatus === 'online' || apiStatus === 'offline'
  const { data, loading, offline } = useApiFetch<{ periods: PeriodInfo[] }>(
    `periods:${apiStatus}:${refresh}`,
    ready,
    () => api.getPeriods(),
    () => ({ periods: [] }),
  )
  const periods = data?.periods ?? []

  const attemptClose = async (period: PeriodInfo) => {
    if (!closeGuard.start()) return
    if (busy) {
      closeGuard.end()
      return
    }
    setBusy(period.id)
    try {
      await closePeriod(period.id)
      setRefresh((n) => n + 1)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'DRAFT_ACTION_REQUIRED') {
        setAction('post-all')
        setPending(period) // ada draft — minta pilihan aksi
      } else if (e instanceof ApiError) {
        showToast(e.message, 'error')
      }
    } finally {
      setBusy(null)
      closeGuard.end()
    }
  }

  const confirmClose = async () => {
    if (!closeGuard.start()) return
    if (!pending) {
      closeGuard.end()
      return
    }
    setBusy(pending.id)
    try {
      await closePeriod(pending.id, action)
      setPending(null)
      setRefresh((n) => n + 1)
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Gagal menutup periode', 'error')
    } finally {
      setBusy(null)
      closeGuard.end()
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-center gap-2 border-b border-line bg-canvas px-5 py-3">
        <CalendarX2 size={16} className="text-primary" />
        <h2 className="text-sm font-bold text-ink">Periode Fiskal</h2>
      </div>
      <div className="space-y-3 p-5">
        <p className="text-sm text-ink-soft">
          Tutup periode mengunci entri jurnal: posting & pembalikan di periode tertutup ditolak server
          (<code className="rounded bg-canvas px-1 py-0.5 font-mono text-primary">PERIOD_CLOSED</code>). Jurnal draft
          yang tersisa perlu keputusan aksi saat penutupan.
        </p>

        {offline && (
          <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs font-medium text-[#b45309]">
            Mock API tidak terhubung — daftar periode tidak dapat dimuat.
          </p>
        )}

        {loading ? (
          <SkeletonLines rows={3} />
        ) : (
          <ul className="divide-y divide-line/70 rounded-lg border border-line bg-canvas">
            {periods.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    {p.name}
                    {p.isActive && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        Aktif
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {p.isOpen ? (
                      'Terbuka — jurnal dapat diposting'
                    ) : (
                      <span className="flex items-center gap-1">
                        <Lock size={11} /> Tertutup — posting diblokir
                      </span>
                    )}
                  </p>
                </div>
                {p.isOpen && canManage && (
                  <button
                    type="button"
                    onClick={() => attemptClose(p)}
                    disabled={busy !== null}
                    aria-label={`Tutup periode ${p.name}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-bad/30 bg-bad/10 px-3 py-1.5 text-xs font-semibold text-bad transition hover:bg-bad/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CalendarX2 size={13} /> {busy === p.id ? 'Menutup…' : 'Tutup'}
                  </button>
                )}
              </li>
            ))}
            {periods.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-ink-soft">Belum ada periode.</li>
            )}
          </ul>
        )}

        {!canManage && (
          <p className="flex items-center gap-1.5 text-xs text-ink-faint">
            <ShieldCheck size={13} /> Hanya admin yang dapat menutup periode (izin period.manage).
          </p>
        )}
      </div>

      {pending && (
        <>
          <div className="fixed inset-0 z-30 bg-ink/40" onClick={() => setPending(null)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Tutup periode"
            className="fixed left-1/2 top-1/2 z-40 w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-modal"
          >
            <div className="border-b border-line bg-canvas px-5 py-3">
              <h3 className="text-sm font-bold text-ink">Tutup periode {pending.name}</h3>
              <p className="mt-0.5 text-xs text-ink-soft">
                Masih ada jurnal draft di periode ini — pilih cara menanganinya.
              </p>
            </div>
            <div className="space-y-2 p-5">
              {DRAFT_ACTIONS.map((a) => (
                <label
                  key={a.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                    action === a.value ? 'border-primary/50 bg-primary/5' : 'border-line hover:bg-surface-hover'
                  }`}
                >
                  <input
                    type="radio"
                    name="draft-action"
                    value={a.value}
                    checked={action === a.value}
                    onChange={() => setAction(a.value)}
                    className="mt-0.5 accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{a.label}</span>
                    <span className="block text-xs text-ink-soft">{a.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-line bg-canvas px-5 py-3">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-hover"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmClose}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-bad px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:opacity-90 disabled:opacity-40"
              >
                <CalendarX2 size={14} /> {busy === pending.id ? 'Menutup…' : 'Tutup Periode'}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
