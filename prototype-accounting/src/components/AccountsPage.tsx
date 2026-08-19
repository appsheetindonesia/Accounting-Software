import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  Edit3,
  Eye,
  EyeOff,
  Filter,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'
import { api } from '../api/index'
import { useStore } from '../store/useStore'
import { can } from '../lib/permissions'
import type { Account, AccountType } from '../types'

const TYPE_LABELS: Record<AccountType, string> = {
  asset: 'Aset',
  liability: 'Utang',
  equity: 'Modal',
  revenue: 'Pendapatan',
  expense: 'Beban',
}

const TYPE_BADGES: Record<AccountType, string> = {
  asset: 'bg-blue-100 text-blue-700',
  liability: 'bg-red-100 text-red-700',
  equity: 'bg-purple-100 text-purple-700',
  revenue: 'bg-emerald-100 text-emerald-700',
  expense: 'bg-amber-100 text-amber-700',
}

const EMPTY_FORM = {
  code: '',
  name: '',
  type: 'asset' as AccountType,
  category: '',
  normalBalance: 'debit' as 'debit' | 'credit',
  description: '',
}

type FormData = typeof EMPTY_FORM

export default function AccountsPage() {
  const user = useStore((s) => s.user)
  const showToast = useStore((s) => s.showToast)
  const canWrite = can(user?.role, 'account.write')

  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<AccountType | ''>('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.getAccounts()
      setAccounts(res.accounts)
    } catch {
      showToast('Gagal memuat daftar akun', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load() }, [load])

  const filtered = accounts.filter((a) => {
    if (filterType && a.type !== filterType) return false
    if (search) {
      const q = search.toLowerCase()
      return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    }
    return true
  })

  const openAdd = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (a: Account) => {
    setEditingId(a.id)
    setForm({
      code: a.code,
      name: a.name,
      type: a.type,
      category: a.category,
      normalBalance: a.normalBalance,
      description: '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      showToast('Kode dan Nama akun wajib diisi', 'error')
      return
    }
    if (!/^\d+-\d+$/.test(form.code.trim())) {
      showToast('Format kode harus {{GOL}}-{{NOMOR}} (mis. 1-1100)', 'error')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await api.updateAccount(editingId, {
          code: form.code.trim(),
          name: form.name.trim(),
          type: form.type,
          category: form.category.trim() || undefined,
          normalBalance: form.normalBalance,
          description: form.description.trim() || undefined,
        })
        showToast('Akun berhasil diperbarui', 'success')
      } else {
        await api.createAccount({
          code: form.code.trim(),
          name: form.name.trim(),
          type: form.type,
          category: form.category.trim() || undefined,
          normalBalance: form.normalBalance,
          description: form.description.trim() || undefined,
        })
        showToast('Akun berhasil ditambahkan', 'success')
      }
      setDialogOpen(false)
      load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan akun'
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteAccount(id)
      showToast('Akun dinonaktifkan', 'success')
      setConfirmDelete(null)
      load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus akun'
      showToast(msg, 'error')
    }
  }

  const handleToggleActive = async (a: Account) => {
    try {
      if (a.isActive) {
        await api.deleteAccount(a.id) // soft delete
        showToast('Akun dinonaktifkan', 'success')
      } else {
        await api.activateAccount(a.id)
        showToast('Akun diaktifkan kembali', 'success')
      }
      load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengubah status akun'
      showToast(msg, 'error')
    }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="space-y-4 p-5 lg:p-7">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink lg:text-2xl">Tabel Akun (COA)</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Daftar Chart of Accounts — {accounts.length} akun aktif
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-hover active:translate-y-px"
          >
            <Plus size={15} /> Tambah Akun
          </button>
        )}
      </div>

      {/* Toolbar: search + filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            placeholder="Cari kode atau nama akun..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-line bg-canvas pl-9 pr-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-ink-faint" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as AccountType | '')}
            className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          >
            <option value="">Semua Tipe</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-ink-faint">Memuat data akun...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-ink-faint">
            <BookOpen size={24} className="opacity-40" />
            <p>Tidak ada akun ditemukan</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas text-xs font-semibold uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Nama Akun</th>
                <th className="px-4 py-3">Tipe</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3 text-center">Status</th>
                {canWrite && <th className="px-4 py-3 text-center">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  className={`border-b border-line last:border-0 transition hover:bg-surface-hover ${!a.isActive ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{a.code}</td>
                  <td className="px-4 py-3 font-medium text-ink">{a.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_BADGES[a.type]}`}>
                      {TYPE_LABELS[a.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-soft">{a.category || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{fmt(a.baseBalance)}</td>
                  <td className="px-4 py-3 text-center">
                    {a.isActive ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ok">
                        <span className="size-1.5 rounded-full bg-ok" /> Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-faint">
                        <span className="size-1.5 rounded-full bg-ink-faint" /> Non-aktif
                      </span>
                    )}
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(a)}
                          className="rounded p-1.5 text-ink-faint transition hover:bg-primary/10 hover:text-primary"
                          title="Edit akun"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(a)}
                          className="rounded p-1.5 text-ink-faint transition hover:bg-amber-100 hover:text-amber-700"
                          title={a.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        >
                          {a.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        {!a.isActive && (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(a.id)}
                            className="rounded p-1.5 text-ink-faint transition hover:bg-bad/10 hover:text-bad"
                            title="Hapus permanen"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Dialog Tambah/Edit */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-line bg-surface shadow-modal">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="text-sm font-bold text-ink">
                {editingId ? 'Edit Akun' : 'Tambah Akun Baru'}
              </h2>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="rounded p-1 text-ink-faint hover:text-ink"
              >
                ✕
              </button>
            </div>
            <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSave() }} className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Kode */}
                <div className="space-y-1.5">
                  <label htmlFor="acc-code" className="block text-xs font-semibold text-ink">Kode Akun *</label>
                  <input
                    id="acc-code"
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="1-1100"
                    disabled={!!editingId}
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
                  />
                  <p className="text-[11px] text-ink-faint">Format: golongan-nomor (mis. 1-1100)</p>
                </div>

                {/* Nama */}
                <div className="space-y-1.5">
                  <label htmlFor="acc-name" className="block text-xs font-semibold text-ink">Nama Akun *</label>
                  <input
                    id="acc-name"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Kas Besar"
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>

                {/* Tipe */}
                <div className="space-y-1.5">
                  <label htmlFor="acc-type" className="block text-xs font-semibold text-ink">Tipe Akun</label>
                  <select
                    id="acc-type"
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AccountType }))}
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  >
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* Kategori */}
                <div className="space-y-1.5">
                  <label htmlFor="acc-category" className="block text-xs font-semibold text-ink">Kategori</label>
                  <input
                    id="acc-category"
                    type="text"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="Kas & Bank"
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>

                {/* Normal Balance */}
                <div className="space-y-1.5">
                  <label htmlFor="acc-nb" className="block text-xs font-semibold text-ink">Saldo Normal</label>
                  <select
                    id="acc-nb"
                    value={form.normalBalance}
                    onChange={(e) => setForm((f) => ({ ...f, normalBalance: e.target.value as 'debit' | 'credit' }))}
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  >
                    <option value="debit">Debit</option>
                    <option value="credit">Kredit</option>
                  </select>
                </div>
              </div>

              {/* Deskripsi */}
              <div className="space-y-1.5">
                <label htmlFor="acc-desc" className="block text-xs font-semibold text-ink">Deskripsi</label>
                <textarea
                  id="acc-desc"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Deskripsi singkat akun..."
                  rows={2}
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
            </form>
            <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-3">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="rounded-lg border border-line bg-canvas px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface"
              >
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

      {/* Dialog Konfirmasi Hapus */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-modal">
            <h3 className="text-sm font-bold text-ink">Hapus Akun?</h3>
            <p className="mt-2 text-sm text-ink-soft">
              Akun ini akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg border border-line bg-canvas px-4 py-2 text-sm font-medium text-ink"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                className="rounded-lg bg-bad px-4 py-2 text-sm font-semibold text-white transition hover:bg-bad/90"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
