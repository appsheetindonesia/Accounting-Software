const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

const idrCompact = new Intl.NumberFormat('id-ID', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const idrPlain = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

export const formatIDR = (value: number) => idr.format(value)

export const formatIDRCompact = (value: number) => idrCompact.format(value)

export const formatIDRPlain = (value: number) => idrPlain.format(value)

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

// "2026-03-15" -> "15 Maret 2026"
export const formatDateLong = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS_ID[m - 1]} ${y}`
}

// "2026-03" -> "Maret 2026" (id periode YYYY-MM)
export const formatPeriodLabel = (periodId: string) => {
  const [y, m] = periodId.split('-').map(Number)
  return `${MONTHS_ID[m - 1]} ${y}`
}

// "2026-03-15" -> "15/03"
export const formatDateShort = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

// Waktu relatif bahasa Indonesia untuk "sinkron terakhir" (data dari cache).
// "2026-08-15T04:00:00Z" -> "10 menit lalu" | "baru saja" | "belum pernah tersinkron"
export const formatSyncAgo = (iso: string | null | undefined): string => {
  if (!iso) return 'belum pernah tersinkron'
  const diffMs = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diffMs) || diffMs < 0) return 'baru saja'
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return 'baru saja'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} menit lalu`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} hari lalu`
  return 'lebih dari sebulan lalu'
}
