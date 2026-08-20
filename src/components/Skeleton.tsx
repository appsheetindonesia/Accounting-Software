// Skeleton loading — dipakai saat fetch dari API belum selesai.
// Gaya sama dengan SkeletonCard di dashboard (animate-pulse + surface-hover)
// agar seluruh aplikasi konsisten.
export function SkeletonBar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-hover ${className}`} />
}

// Kartu dengan N baris placeholder — cocok untuk tabel/laporan.
export function SkeletonLines({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3 rounded-xl border border-line bg-surface p-5 shadow-card">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="h-3 w-1/3 rounded bg-surface-hover" />
          <div className="h-3 w-16 rounded bg-surface-hover" />
        </div>
      ))}
    </div>
  )
}

// Header + baris tabel skeleton (kolom Debit/Kredit/Saldo).
export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between gap-4 border-b border-line bg-canvas px-5 py-3">
        <div className="h-3 w-24 rounded bg-surface-hover" />
        <div className="h-3 w-16 rounded bg-surface-hover" />
        <div className="h-3 w-16 rounded bg-surface-hover" />
        <div className="h-3 w-20 rounded bg-surface-hover" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 border-b border-line/60 px-5 py-3">
          <div className="h-3 w-1/4 rounded bg-surface-hover" />
          <div className="h-3 w-1/6 rounded bg-surface-hover" />
          <div className="h-3 w-1/5 rounded bg-surface-hover" />
          <div className="h-3 w-16 rounded bg-surface-hover" />
        </div>
      ))}
    </div>
  )
}
