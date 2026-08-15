// ============================================================
// Peran & izin — SAMA dengan rolePermissions di mock API
// (mock-api/src/data.js, API - Accounting.md §2.4 /auth/me).
// UI menyembunyikan aksi yang tidak diizinkan peran user agar
// konsisten dengan 403 yang akan dikembalikan server.
// ============================================================

export type Role = 'admin' | 'accountant' | 'viewer'

// Label tampilan (bahasa Indonesia) per peran
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  accountant: 'Akuntan',
  viewer: 'Viewer',
}

// Style badge peran (warna pill) — dipakai TopBar & area lain
export const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-primary/10 text-primary',
  accountant: 'bg-[#7c3aed]/10 text-[#6d28d9]',
  viewer: 'bg-ink-faint/10 text-ink-soft',
}

// Mirror persis rolePermissions mock API
export const ROLE_PERMISSIONS: Record<Role, readonly string[]> = {
  admin: ['account.write', 'journal.write', 'journal.approve', 'report.read', 'period.manage', 'user.manage', 'entity.manage', 'export.read'],
  accountant: ['account.write', 'journal.write', 'report.read', 'export.read'],
  viewer: ['report.read', 'export.read'],
}

/** Cek apakah role memiliki izin tertentu (aman untuk role tak dikenal → false). */
export const can = (role: string | null | undefined, permission: string): boolean => {
  if (!role) return false
  return ROLE_PERMISSIONS[role as Role]?.includes(permission) ?? false
}

/** Dapat membuat/memposting/mereverse/menghapus jurnal (journal.write). */
export const canWriteJournal = (role: string | null | undefined): boolean => can(role, 'journal.write')

/** Dapat menyetujui/menolak jurnal (journal.approve) — hanya admin. */
export const canApproveJournal = (role: string | null | undefined): boolean => can(role, 'journal.approve')
