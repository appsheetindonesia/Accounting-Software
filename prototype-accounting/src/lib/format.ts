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

// "2026-03-15" -> "15/03"
export const formatDateShort = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
