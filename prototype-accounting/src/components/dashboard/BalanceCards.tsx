import { ArrowDownRight, ArrowUpRight, Banknote, Landmark, Minus, PiggyBank, TrendingUp } from 'lucide-react'
import { useStore, useBalances } from '../../store/useStore'
import { api } from '../../api'
import { useApiFetch } from '../../hooks/useApiFetch'
import { formatIDR } from '../../lib/format'
import type { BalanceCardData } from '../../types'

const ICONS = {
  aset: Landmark,
  utang: Banknote,
  modal: PiggyBank,
  laba: TrendingUp,
} as const

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="h-3 w-20 rounded bg-surface-hover" />
      <div className="mt-3 h-7 w-32 rounded bg-surface-hover" />
      <div className="mt-2 h-3 w-24 rounded bg-surface-hover" />
    </div>
  )
}

export default function BalanceCards() {
  const accounts = useStore((s) => s.accounts)
  const balances = useBalances()
  const apiStatus = useStore((s) => s.apiStatus)
  const ready = apiStatus === 'online' || apiStatus === 'offline'

  // Fallback offline: hitung dari data lokal (sama seperti sebelumnya)
  const localCards = (): BalanceCardData[] => {
    let asset = 0
    let liability = 0
    let equity = 0
    let revenue = 0
    let expense = 0
    for (const a of accounts) {
      const b = balances.get(a.id) ?? 0
      if (a.type === 'asset') asset += b
      else if (a.type === 'liability') liability += b
      else if (a.type === 'equity') equity += b
      else if (a.type === 'revenue') revenue += b
      else expense += b
    }
    return [
      { key: 'aset', label: 'Total Aset', value: asset, deltaPercent: 12.5, deltaDirection: 'up', compareLabel: 'dari bulan lalu' },
      { key: 'utang', label: 'Total Utang', value: liability, deltaPercent: 3.2, deltaDirection: 'down', compareLabel: 'dari bulan lalu' },
      { key: 'modal', label: 'Total Modal', value: equity, deltaPercent: 8.1, deltaDirection: 'up', compareLabel: 'dari bulan lalu' },
      { key: 'laba', label: 'Laba Bruto', value: revenue - expense, deltaPercent: 15.3, deltaDirection: 'up', compareLabel: 'dari bulan lalu' },
    ]
  }

  const { data, loading } = useApiFetch(
    `dashboard-summary:${apiStatus}`,
    ready,
    () => api.getDashboardSummary().then((d) => d.cards),
    localCards,
  )

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  const cards = data ?? []

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = ICONS[card.key as keyof typeof ICONS] ?? TrendingUp
        const positive = card.deltaDirection === 'up'
        return (
          <div
            key={card.key}
            className="rounded-xl border border-line bg-surface p-5 shadow-card transition hover:shadow-pop"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">{card.label}</p>
              <Icon size={16} className="text-primary" />
            </div>
            <p className="num mt-2 text-2xl font-bold text-ink">{formatIDR(card.value)}</p>
            <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${positive ? 'text-ok' : 'text-bad'}`}>
              {card.deltaDirection === 'flat' ? (
                <Minus size={13} />
              ) : positive ? (
                <ArrowUpRight size={13} />
              ) : (
                <ArrowDownRight size={13} />
              )}
              {card.deltaPercent}%{' '}
              <span className="font-normal text-ink-faint">{card.compareLabel}</span>
            </p>
          </div>
        )
      })}
    </div>
  )
}
