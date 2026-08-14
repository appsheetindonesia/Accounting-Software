import { AlertTriangle, Info } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../api'
import { useApiFetch } from '../../hooks/useApiFetch'

interface PanelAlert {
  severity: 'warning' | 'info'
  message: string
  action: () => void
  actionLabel: string
}

export default function AlertsPanel() {
  const journals = useStore((s) => s.journals)
  const setPage = useStore((s) => s.setPage)
  const apiStatus = useStore((s) => s.apiStatus)

  const localAlerts = (): PanelAlert[] => {
    const alerts: PanelAlert[] = []
    const draftCount = journals.filter((j) => j.status === 'draft').length
    if (draftCount > 0) {
      alerts.push({
        severity: 'warning',
        message: `${draftCount} jurnal draft belum diposting`,
        action: () => setPage('journal'),
        actionLabel: 'Tinjau',
      })
    }
    alerts.push({
      severity: 'info',
      message: 'Periode Februari 2026 belum ditutup',
      action: () => setPage('pengaturan'),
      actionLabel: 'Atur Periode',
    })
    return alerts
  }

  const actionFor = (type: string): { action: () => void; actionLabel: string } =>
    type === 'period_not_closed'
      ? { action: () => setPage('pengaturan'), actionLabel: 'Atur Periode' }
      : { action: () => setPage('journal'), actionLabel: 'Tinjau' }

  const { data } = useApiFetch(
    `dashboard-alerts:${apiStatus}`,
    apiStatus === 'online' || apiStatus === 'offline',
    () =>
      api.getDashboardAlerts().then((d) =>
        d.alerts.map((a): PanelAlert => ({
          severity: a.severity === 'info' ? 'info' : 'warning',
          message: a.message,
          ...actionFor(a.type),
        })),
      ),
    localAlerts,
  )
  const alerts = data ?? localAlerts()

  return (
    <div className="rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h3 className="text-sm font-bold text-ink">Peringatan</h3>
        <AlertTriangle size={16} className="text-warn" />
      </div>
      <ul className="divide-y divide-line/70">
        {alerts.map((alert, i) => (
          <li key={i} className="flex items-center gap-3 px-5 py-3.5">
            {alert.severity === 'warning' ? (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warn/15 text-[#b45309]">
                <AlertTriangle size={15} />
              </span>
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-debit/10 text-debit">
                <Info size={15} />
              </span>
            )}
            <p className="flex-1 text-sm text-ink">{alert.message}</p>
            <button
              type="button"
              onClick={alert.action}
              className="shrink-0 text-xs font-semibold text-primary hover:text-primary-light"
            >
              {alert.actionLabel}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
