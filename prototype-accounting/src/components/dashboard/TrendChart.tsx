import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { mockTrend } from '../../data/mock'
import { useStore } from '../../store/useStore'
import { api } from '../../api'
import { useApiFetch } from '../../hooks/useApiFetch'
import { formatIDR } from '../../lib/format'

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number; dataKey?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-bold text-ink">{label} 2026</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="text-ink-soft">{p.name}</span>
          <span className="num font-semibold text-ink">{formatIDR(Number(p.value ?? 0))}</span>
        </p>
      ))}
    </div>
  )
}

export default function TrendChart() {
  const apiStatus = useStore((s) => s.apiStatus)
  const { data } = useApiFetch(
    `dashboard-trend:${apiStatus}`,
    apiStatus === 'online' || apiStatus === 'offline',
    () => api.getDashboardTrend().then((d) => d.trend),
    () => mockTrend,
  )
  const trend = data ?? mockTrend

  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-ink">Grafik Laba Rugi 6 Bulan</h3>
          <p className="text-xs text-ink-soft">Pendapatan, beban, dan laba bersih per bulan</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-ink-soft">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary" /> Pendapatan</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-bad/70" /> Beban</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#38bdf8]" /> Laba Bersih</span>
        </div>
      </div>
      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barGap={3}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => `${Math.round(v / 1_000_000)}jt`}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
            <Bar dataKey="revenue" name="Pendapatan" fill="#2596be" radius={[3, 3, 0, 0]} maxBarSize={14} />
            <Bar dataKey="expenses" name="Beban" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={14} />
            <Bar dataKey="netIncome" name="Laba Bersih" fill="#38bdf8" radius={[3, 3, 0, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
