import { useCallback, useEffect, useState } from 'react'
import {
  Edit3,
  EyeOff,
  Key,
  Shield,
  ShieldCheck,
  ShieldOff,
  UserPlus,
} from 'lucide-react'
import { api, type UserInfo } from '../api/index'
import { useStore } from '../store/useStore'
import { can } from '../lib/permissions'

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: typeof Shield; desc: string; permissions: string[] }> = {
  admin: {
    label: 'Admin',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: ShieldCheck,
    desc: 'Akses penuh: kelola akun, jurnal, laporan, user, dan pengaturan',
    permissions: ['account.write', 'journal.write', 'journal.approve', 'report.read', 'period.manage', 'user.manage', 'entity.manage', 'export.read'],
  },
  accountant: {
    label: 'Akuntan',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: Shield,
    desc: 'Buat & edit jurnal, lihat laporan. Tidak bisa approve atau kelola user',
    permissions: ['account.write', 'journal.write', 'report.read', 'export.read'],
  },
  viewer: {
    label: 'Viewer',
    color: 'bg-gray-100 text-gray-700 border-gray-200',
    icon: ShieldOff,
    desc: 'Hanya melihat laporan dan export. Tidak bisa input data',
    permissions: ['report.read', 'export.read'],
  },
}

const EMPTY_FORM = { name: '', email: '', role: 'accountant' as string }

export default function UserManagement() {
  const user = useStore((s) => s.user)
  const showToast = useStore((s) => s.showToast)
  const canManage = can(user?.role, 'user.manage')

  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null)
  const [showPermissions, setShowPermissions] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.getUsers()
      setUsers(res.users)
    } catch {
      showToast('Gagal memuat daftar pengguna', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load() }, [load])

  const openAdd = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (u: UserInfo) => {
    setEditingId(u.id)
    setForm({ name: u.name, email: u.email, role: u.role })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      showToast('Nama dan email wajib diisi', 'error')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      showToast('Format email tidak valid', 'error')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await api.updateUser(editingId, { name: form.name.trim(), role: form.role })
        showToast('Pengguna berhasil diperbarui', 'success')
      } else {
        await api.createUser({ name: form.name.trim(), email: form.email.trim(), role: form.role })
        showToast('Pengguna berhasil ditambahkan', 'success')
      }
      setDialogOpen(false)
      load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan pengguna'
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (id: string) => {
    try {
      await api.deactivateUser(id)
      showToast('Pengguna dinonaktifkan', 'success')
      setConfirmDeactivate(null)
      load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menonaktifkan'
      showToast(msg, 'error')
    }
  }

  const roleCounts = {
    admin: users.filter((u) => u.role === 'admin' && u.isActive).length,
    accountant: users.filter((u) => u.role === 'accountant' && u.isActive).length,
    viewer: users.filter((u) => u.role === 'viewer' && u.isActive).length,
  }

  return (
    <div className="space-y-5 p-5 lg:p-7">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink lg:text-2xl">Manajemen Pengguna</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Kelola akses admin, akuntan, dan viewer — {users.filter((u) => u.isActive).length} pengguna aktif
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-hover active:translate-y-px"
          >
            <UserPlus size={15} /> Tambah Pengguna
          </button>
        )}
      </div>

      {/* Role Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {Object.entries(ROLE_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon
          return (
            <div key={key} className={`flex items-center gap-3 rounded-xl border p-4 shadow-card ${cfg.color}`}>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/60">
                <Icon size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold">{roleCounts[key as keyof typeof roleCounts]}</p>
                <p className="text-xs font-medium opacity-70">{cfg.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {/* Users Table */}
      {!loading && (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas text-xs font-semibold uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-3">Pengguna</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 text-center">Status</th>
                {canManage && <th className="px-4 py-3 text-center">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const roleCfg = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.viewer
                return (
                  <tr key={u.id} className={`border-b border-line last:border-0 transition hover:bg-surface-hover ${!u.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-ink">{u.name}</p>
                          <p className="text-xs text-ink-faint">{u.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-soft">{u.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${roleCfg.color}`}>
                          <roleCfg.icon size={11} />
                          {roleCfg.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowPermissions(showPermissions === u.id ? null : u.id)}
                          className="rounded p-1 text-ink-faint transition hover:bg-canvas hover:text-primary"
                          title="Lihat izin"
                        >
                          <Key size={12} />
                        </button>
                      </div>
                      {showPermissions === u.id && (
                        <div className="mt-2 rounded-lg border border-line bg-canvas p-2">
                          <p className="mb-1 text-[11px] font-medium text-ink-faint">Izin aktif:</p>
                          <div className="flex flex-wrap gap-1">
                            {roleCfg.permissions.map((p) => (
                              <span key={p} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary">{p}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {u.isActive ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ok">
                          <span className="size-1.5 rounded-full bg-ok" /> Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-faint">
                          <span className="size-1.5 rounded-full bg-ink-faint" /> Non-aktif
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            className="rounded p-1.5 text-ink-faint transition hover:bg-primary/10 hover:text-primary"
                            title="Edit"
                          >
                            <Edit3 size={14} />
                          </button>
                          {u.isActive && u.id !== user?.id && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeactivate(u.id)}
                              className="rounded p-1.5 text-ink-faint transition hover:bg-bad/10 hover:text-bad"
                              title="Nonaktifkan"
                            >
                              <EyeOff size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog Tambah/Edit */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-line bg-surface shadow-modal">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="text-sm font-bold text-ink">
                {editingId ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}
              </h2>
              <button type="button" onClick={() => setDialogOpen(false)} className="rounded p-1 text-ink-faint hover:text-ink">✕</button>
            </div>
            <div className="space-y-4 p-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink">Nama Lengkap *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Masukkan nama lengkap"
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="nama@perusahaan.com"
                  disabled={!!editingId}
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
                />
                {editingId && <p className="text-[11px] text-ink-faint">Email tidak dapat diubah</p>}
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink">Role *</label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {Object.entries(ROLE_CONFIG).map(([key, cfg]) => {
                    const Icon = cfg.icon
                    const isSelected = form.role === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, role: key }))}
                        className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-center transition ${
                          isSelected ? `${cfg.color} border-current shadow-card` : 'border-line bg-canvas text-ink-soft hover:border-primary/30'
                        }`}
                      >
                        <Icon size={18} />
                        <span className="text-xs font-bold">{cfg.label}</span>
                        <span className="text-[10px] leading-tight opacity-70">{cfg.desc}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              {!editingId && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                  <Key size={12} className="mr-1 inline" />
                  Password default: <strong>password123</strong> — pengguna harus mengubah setelah login pertama.
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-3">
              <button type="button" onClick={() => setDialogOpen(false)} className="rounded-lg border border-line bg-canvas px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface">
                Batal
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : editingId ? 'Perbarui' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog Konfirmasi Deactivate */}
      {confirmDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-modal">
            <h3 className="text-sm font-bold text-ink">Nonaktifkan Pengguna?</h3>
            <p className="mt-2 text-sm text-ink-soft">
              Pengguna ini tidak akan bisa login lagi. Aktifkan kembali kapan saja jika diperlukan.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmDeactivate(null)} className="rounded-lg border border-line bg-canvas px-4 py-2 text-sm font-medium text-ink">
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleDeactivate(confirmDeactivate)}
                className="rounded-lg bg-bad px-4 py-2 text-sm font-semibold text-white transition hover:bg-bad/90"
              >
                Nonaktifkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
