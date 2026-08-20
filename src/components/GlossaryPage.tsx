import { useState } from 'react'
import { BookMarked, Search } from 'lucide-react'

interface GlossaryItem {
  term: string
  abbrev?: string
  category: string
  definition: string
  example?: string
}

const GLOSSARY: GlossaryItem[] = [
  // --- Jurnal & Transaksi ---
  {
    term: 'Bukti Kas Masuk',
    abbrev: 'BKM',
    category: 'Jurnal',
    definition: 'Bukti penerimaan kas (uang masuk). Digunakan saat perusahaan menerima pembayaran dari pelanggan, piutang, atau sumber pendapatan lainnya.',
    example: 'BKM-2026-03-0001: Penerimaan pembayaran dari PT ABC sebesar Rp 15.000.000',
  },
  {
    term: 'Bukti Kas Keluar',
    abbrev: 'BKK',
    category: 'Jurnal',
    definition: 'Bukti pengeluaran kas (uang keluar). Digunakan saat perusahaan melakukan pembayaran ke pemasok, gaji karyawan, atau beban lainnya.',
    example: 'BKK-2026-03-0002: Pembayaran gaji karyawan Maret sebesar Rp 45.000.000',
  },
  {
    term: 'Jurnal Umum',
    abbrev: 'JV',
    category: 'Jurnal',
    definition: 'Jurnal Voucher — pencatatan transaksi umum yang tidak termasuk kas masuk atau kas keluar. Digunakan untuk pencatatan koreksi, penyesuaian, atau transaksi non-kas.',
    example: 'JV-2026-03-0003: Koreksi beban listrik dan air Maret sebesar Rp 2.500.000',
  },
  {
    term: 'Jurnal Pembalikan',
    abbrev: 'REV',
    category: 'Jurnal',
    definition: 'Jurnal yang membatalkan jurnal lain yang sudah diposting. Membuat entri terbalik (debit ↔ kredit) dari jurnal asli. Status jurnal asli berubah menjadi "Reversed".',
    example: 'Membatalkan jurnal penerimaan pendapatan yang salah catat',
  },

  // --- Status Jurnal ---
  {
    term: 'Draft',
    category: 'Status',
    definition: 'Status awal jurnal saat baru dibuat. Belum diposting dan dapat diedit atau dihapus. Jurnal draft tidak mempengaruhi saldo akun.',
  },
  {
    term: 'Menunggu Approval',
    abbrev: 'Pending Approval',
    category: 'Status',
    definition: 'Status jurnal yang sudah diajukan untuk persetujuan. Menunggu admin menyetujui atau menolak. Jurnal dalam status ini belum mempengaruhi saldo.',
  },
  {
    term: 'Posted',
    category: 'Status',
    definition: 'Status jurnal yang sudah diproses dan mempengaruhi saldo akun. Jurnal posted tidak dapat diedit, hanya bisa dibatalkan dengan jurnal pembalikan (reversal).',
  },
  {
    term: 'Reversed',
    category: 'Status',
    definition: 'Status jurnal yang sudah dibatalkan melalui jurnal pembalikan. Data asli tetap tersimpan untuk audit trail.',
  },

  // --- Akuntansi Dasar ---
  {
    term: 'Chart of Accounts',
    abbrev: 'COA',
    category: 'Akuntansi',
    definition: 'Daftar lengkap semua akun yang digunakan perusahaan untuk mencatat transaksi. Disusun berdasarkan golongan: Aset (1), Utang (2), Modal (3), Pendapatan (4), Beban (5).',
    example: '1-1100 = Kas Besar, 4-1000 = Pendapatan Jasa',
  },
  {
    term: 'Neraca',
    abbrev: 'Balance Sheet',
    category: 'Laporan',
    definition: 'Laporan keuangan yang menunjukkan posisi keuangan perusahaan pada tanggal tertentu. Rumus: Aset = Utang + Modal.',
  },
  {
    term: 'Laba Rugi',
    abbrev: 'Income Statement',
    category: 'Laporan',
    definition: 'Laporan keuangan yang menunjukkan hasil usaha perusahaan selama periode tertentu. Rumus: Pendapatan − Beban = Laba Bersih.',
  },
  {
    term: 'Neraca Lajur',
    abbrev: 'Trial Balance',
    category: 'Laporan',
    definition: 'Daftar saldo seluruh akun yang membuktikan total debit sama dengan total kredit. Digunakan sebagai langkah awal penyusunan laporan keuangan.',
  },
  {
    term: 'Arus Kas',
    abbrev: 'Cash Flow',
    category: 'Laporan',
    definition: 'Laporan yang menunjukkan pergerakan kas (uang tunai) masuk dan keluar perusahaan selama periode tertentu. Terdiri dari 3 aktivitas: operasi, investasi, pendanaan.',
  },
  {
    term: 'Saldo Awal',
    abbrev: 'Opening Balance',
    category: 'Akuntansi',
    definition: 'Saldo akun pada awal periode akuntansi. Untuk periode pertama, saldo awal diambil dari data awal (base balance).',
  },
  {
    term: 'Saldo Akhir',
    abbrev: 'Closing Balance',
    category: 'Akuntansi',
    definition: 'Saldo akun pada akhir periode akuntansi. Dihitung dari saldo awal + total debit − total kredit selama periode.',
  },
  {
    term: 'Debit',
    category: 'Akuntansi',
    definition: 'Sisi kiri akun. Meningkatkan aset dan beban; mengurangi utang, modal, dan pendapatan.',
  },
  {
    term: 'Kredit',
    category: 'Akuntansi',
    definition: 'Sisi kanan akun. Meningkatkan utang, modal, dan pendapatan; mengurangi aset dan beban.',
  },
  {
    term: 'Saldo Normal',
    abbrev: 'Normal Balance',
    category: 'Akuntansi',
    definition: 'Sisi di mana saldo akun biasanya bertambah. Aset & beban → debit; utang, modal & pendapatan → kredit.',
  },

  // --- Sistem & Workflow ---
  {
    term: 'Periode Fiskal',
    category: 'Sistem',
    definition: 'Periode akuntansi yang dibuka untuk pencatatan transaksi. Biasanya satu bulan. Periode tertutup memblokir posting dan pembalikan jurnal.',
  },
  {
    term: 'Tutup Periode',
    abbrev: 'Close Period',
    category: 'Sistem',
    definition: 'Mengunci periode akuntansi agar tidak ada jurnal baru yang bisa diposting. Jurnal draft yang tersisa perlu keputusan: post semua, hapus semua, atau biarkan.',
  },
  {
    term: 'Multi-Entitas',
    category: 'Sistem',
    definition: 'Kemampuan mengelola beberapa perusahaan/entitas dalam satu sistem. Setiap entitas memiliki COA, jurnal, dan laporan terpisah.',
    example: 'PT. Kreasi Inovasi Estetika (ent-001) dan CV Karya Mandiri (ent-002)',
  },
  {
    term: 'Approval',
    abbrev: 'Persetujuan',
    category: 'Workflow',
    definition: 'Proses persetujuan jurnal oleh admin. Jurnal yang diajukan (submit) menunggu approve/reject. Hanya admin yang bisa menyetujui.',
  },
  {
    term: 'Offline Queue',
    category: 'Sistem',
    definition: 'Antrian operasi jurnal yang dilakukan saat server tidak tersedia. Operasi disimpan lokal dan otomatis dikirim ke server saat koneksi pulih.',
  },

  // --- Database ---
  {
    term: 'Mode Lokal',
    category: 'Database',
    definition: 'Mode penyimpanan data di perangkat ini (localStorage) tanpa memerlukan database. Cocok untuk penggunaan offline atau testing.',
  },
  {
    term: 'Mode PostgreSQL',
    category: 'Database',
    definition: 'Mode penyimpanan data di server database PostgreSQL. Data tersimpan permanen dan bisa diakses dari berbagai perangkat.',
  },
  {
    term: 'Persist',
    category: 'Sistem',
    definition: 'Mekanisme penyimpanan data di server (file JSON) agar state tetap ada saat server di-restart. Data tidak hilang meskipun server mati.',
  },
]

const CATEGORIES = [...new Set(GLOSSARY.map((g) => g.category))]

export default function GlossaryPage() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | ''>('')

  const filtered = GLOSSARY.filter((g) => {
    if (activeCategory && g.category !== activeCategory) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        g.term.toLowerCase().includes(q) ||
        (g.abbrev && g.abbrev.toLowerCase().includes(q)) ||
        g.definition.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="space-y-5 p-5 lg:p-7">
      <div>
        <h1 className="text-xl font-bold text-ink lg:text-2xl">Kamus Istilah</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Daftar istilah dan singkatan yang digunakan dalam aplikasi — {GLOSSARY.length} istilah
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            placeholder="Cari istilah atau singkatan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-line bg-canvas pl-9 pr-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveCategory('')}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${!activeCategory ? 'bg-primary text-white' : 'bg-canvas text-ink-soft hover:bg-surface-hover'}`}
          >
            Semua
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(activeCategory === cat ? '' : cat)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${activeCategory === cat ? 'bg-primary text-white' : 'bg-canvas text-ink-soft hover:bg-surface-hover'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Glossary List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-ink-faint">
          <BookMarked size={24} className="opacity-40" />
          <p>Tidak ada istilah ditemukan</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((g, i) => (
            <div
              key={`${g.term}-${i}`}
              className="rounded-xl border border-line bg-surface p-4 shadow-card transition hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-ink">{g.term}</h3>
                    {g.abbrev && (
                      <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                        {g.abbrev}
                      </span>
                    )}
                  </div>
                  <span className="mt-0.5 inline-block rounded-full bg-canvas px-2 py-0.5 text-[10px] font-semibold text-ink-faint">
                    {g.category}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{g.definition}</p>
              {g.example && (
                <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-xs text-ink-faint">
                  <span className="font-semibold text-ink-soft">Contoh: </span>{g.example}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
