# PRD Ver 3 — Appsheet Accounting Journal
### Product Requirements Document — Aplikasi Akuntansi Double-Entry untuk UKM Indonesia

---

## Dokumen Informasi

| Field | Nilai |
|-------|-------|
| **Nama Produk** | Appsheet Accounting Journal |
| **Jenis Dokumen** | Product Requirements Document (PRD) |
| **Versi** | 3.0 (Final Draft) |
| **Status** | Disetujui untuk Pengembangan (MVP) |
| **Tanggal** | Agustus 2026 |
| **Dokumen Terkait** | BRD - Accounting, FRD - Accounting, TRD - Accounting |

### Riwayat Versi

| Versi | Tanggal | Perubahan |
|-------|---------|-----------|
| Ver 1 | — | Struktur dasar: layout multi-panel, data structure, wireframe Jurnal/Buku Besar/Laba Rugi/COA, mock data, kriteria sukses |
| Ver 2 | — | Penyempurnaan produk: branding Appsheet Accounting Journal, theming lengkap, state loading/empty/error/edge case, detail data model, dashboard |
| **Ver 3** | Agustus 2026 | **Penggabungan terbaik Ver 1 + Ver 2**, diselaraskan dengan BRD/FRD/TRD: modul lengkap 9 fitur, aturan bisnis, use case, validasi, NFR, roadmap, kriteria penerimaan per modul |

---

## Daftar Isi

1. [Ringkasan Eksekutif](#1-ringkasan-eksekutif)
2. [Tujuan Produk & Metrik](#2-tujuan-produk--metrik)
3. [Target Pengguna & Persona](#3-target-pengguna--persona)
4. [Lingkup (Scope)](#4-lingkup-scope)
5. [Fitur & Prioritas](#5-fitur--prioritas)
6. [Arsitektur UI & Core Layout](#6-arsitektur-ui--core-layout)
7. [Desain Visual & Theming](#7-desain-visual--theming)
8. [Spesifikasi Modul & UI Components](#8-spesifikasi-modul--ui-components)
9. [Data Structure](#9-data-structure)
10. [Aturan Bisnis (Business Rules)](#10-aturan-bisnis-business-rules)
11. [Alur Pengguna (Use Cases)](#11-alur-pengguna-use-cases)
12. [Interaksi, State & Edge Cases](#12-interaksi-state--edge-cases)
13. [Bahasa & Lokalisasi](#13-bahasa--lokalisasi)
14. [Non-Functional Requirements](#14-non-functional-requirements)
15. [Validasi & Penanganan Error](#15-validasi--penanganan-error)
16. [Contoh Mock Data](#16-contoh-mock-data)
17. [Kriteria Penerimaan (Success Criteria)](#17-kriteria-penerimaan-success-criteria)
18. [Roadmap & Timeline](#18-roadmap--timeline)
19. [Pertanyaan Terbuka](#19-pertanyaan-terbuka)

---

## 1. Ringkasan Eksekutif

Appsheet Accounting Journal adalah aplikasi akuntansi **double-entry** berbasis web (PWA) untuk UKM Indonesia yang mengotomatiskan siklus akuntansi penuh: pencatatan jurnal → buku besar → laporan keuangan. Produk menjawab masalah utama UKM yang masih mengandalkan pencatatan manual/spreadsheet: rawan error, tidak terstruktur, dan lambat menghasilkan laporan.

**Visi:** Membuat pembukuan akuntansi profesional semudah mencatat di buku tulis — dalam Bahasa Indonesia, dengan harga terjangkau, dan dioptimalkan untuk mobile.

**Value Proposition Utama:**
| Masalah | Solusi Appsheet Accounting Journal |
|---------|-------------------|
| Pencatatan manual rawan error | Sistem double-entry dengan validasi otomatis (debit = kredit) |
| Spreadsheet tidak terstruktur | Chart of Account standar PSAK + kustomisasi |
| Laporan butuh waktu lama | Generate laporan keuangan 1 klik |
| Istilah asing sulit dipahami | Bahasa Indonesia dengan istilah akuntansi PSAK |
| Biaya software mahal | Pricing terjangkau mulai Rp50.000/bulan |
| Tidak ada backup data | Cloud sync otomatis + backup terjadwal |

**Diferensiator kompetitif:** Double-entry penuh, UI sederhana untuk non-akuntan, Bahasa Indonesia murni, mobile-first, multi-entitas untuk akuntan freelance, dan harga terjangkau dibanding Accurate (Rp150rb+) / Jurnal Mekari (Rp99rb+) / Zahir (Rp175rb+).

---

## 2. Tujuan Produk & Metrik

| Tujuan | Metrik | Target (12 bulan) | Prioritas |
|--------|--------|-------------------|-----------|
| Mendapatkan pengguna aktif | MAU (Monthly Active Users) | 5.000 pengguna | P0 |
| Meningkatkan retensi | Retention rate bulan-3 | >60% | P0 |
| Monetisasi | Konversi free-to-paid | 8% | P1 |
| Kepuasan pengguna | NPS Score | >40 | P1 |
| Akurasi data | Error rate jurnal | <0.5% | P0 |
| Waktu onboarding | Time-to-first-journal | <5 menit | P0 |

---

## 3. Target Pengguna & Persona

### Persona 1: Rina — Pemilik Toko Kelontong
- **Usia:** 35 tahun · **Latar belakang:** SMA, tanpa latar akuntansi
- **Usaha:** Toko kelontong di pasar tradisional, omzet Rp30–50 juta/bulan
- **Kebutuhan:** Mencatat pemasukan/pengeluaran, tahu untung-rugi tiap bulan
- **Pain point:** Bingung dengan istilah akuntansi, takut salah catat
- **Device:** Smartphone Android, kadang laptop pinjaman

### Persona 2: Dimas — Akuntan Freelance
- **Usia:** 28 tahun · **Latar belakang:** D3 Akuntansi, melayani 5–10 klien UKM
- **Kebutuhan:** Platform multi-entitas, generate laporan untuk klien
- **Pain point:** Repot manage banyak spreadsheet untuk tiap klien
- **Device:** Laptop Windows, tablet

### Persona 3: Budi — Manajer Keuangan Startup
- **Usia:** 40 tahun · **Latar belakang:** S1 Manajemen, kelola keuangan startup 20 karyawan
- **Kebutuhan:** Laporan real-time, approval workflow, integrasi bank
- **Pain point:** Butuh laporan akurat untuk investor dan pajak
- **Device:** Laptop macOS, smartphone

---

## 4. Lingkup (Scope)

### In Scope (MVP)
- Chart of Account management (template PSAK + kustom)
- Jurnal umum (single & multi-line, draft → posting → reverse)
- Buku Besar otomatis dengan saldo berjalan
- Neraca Lajur (Trial Balance)
- Laporan Laba Rugi
- Laporan Neraca (Posisi Keuangan)
- Laporan Arus Kas (metode tidak langsung)
- Manajemen periode fiskal (buka/tutup periode)
- Dashboard ringkasan keuangan
- Export PDF & Excel
- Multi-entitas (untuk akuntan multi-klien)
- Multi-periode & template akun default

### Out of Scope (MVP)
- Modul penggajian (HR/payroll)
- Manajemen inventaris
- Faktur penjualan & pembelian
- Perpajakan langsung (PPh, PPN) — disiapkan sebagai modul terpisah
- Integrasi rekening bank (post-MVP)
- Multi-user & role-based access (post-MVP / sprint 5)

---

## 5. Fitur & Prioritas

| ID | Fitur | Prioritas | Kompleksitas | Timeline |
|----|-------|-----------|--------------|----------|
| P0-01 | Chart of Account management (CRUD + hierarki) | P0 | Medium | Sprint 1 |
| P0-02 | Jurnal umum (single & double entry, draft/posting) | P0 | High | Sprint 1–2 |
| P0-03 | Buku Besar otomatis | P0 | High | Sprint 2 |
| P0-04 | Laporan Laba Rugi | P0 | Medium | Sprint 3 |
| P0-05 | Laporan Neraca | P0 | Medium | Sprint 3 |
| P0-06 | Multi-periode akuntansi | P0 | Medium | Sprint 3 |
| P0-07 | Dashboard ringkasan | P0 | Medium | Sprint 1 |
| P1-08 | Neraca Lajur (Trial Balance) | P1 | Medium | Sprint 4 |
| P1-09 | Export PDF/Excel | P1 | Low | Sprint 4 |
| P1-10 | Template akun default | P1 | Low | Sprint 1 |
| P1-11 | Pencarian & filter transaksi | P1 | Medium | Sprint 2 |
| P1-12 | Upload bukti transaksi (foto/PDF) | P1 | Medium | Sprint 4 |
| P1-13 | Reverse jurnal (koreksi) | P1 | Medium | Sprint 4 |
| P1-14 | Approval workflow | P1 | Medium | Sprint 4 |
| P2-15 | Laporan Arus Kas | P2 | High | Sprint 5 |
| P2-16 | Multi-user & role (admin/akuntan/viewer) | P2 | High | Sprint 5 |
| P2-17 | Integrasi rekening bank | P2 | High | Sprint 6 |

---

## 6. Arsitektur UI & Core Layout

### 6.1 Kerangka Halaman

```
┌───────────────────────────────────────────────────────────────────────┐
│ [Logo] Appsheet Accounting Journal   [🔍 Cari transaksi…]  [🔔] [👤 Profil] │  ← Top Bar (64px)
├──────────┬────────────────────────────────────────────────────────────┤
│          │                                                            │
│ Sidebar  │  Panel Utama (Konten Dinamis)                              │
│ 280px    │                                                            │
│          │  ┌──────────────────────────────────────────────────────┐  │
│ 🏠 Dasb  │  │  [Breadcrumb]                      [Aksi Utama: +]   │  │
│ 📒 Jurnal│  │                                                      │  │
│ 📊 Buku  │  │  Konten modul aktif                                  │  │
│ 📋 N.    │  │  (tabel / form / laporan / form entri)               │  │
│ 📄 Laba  │  │                                                      │  │
│ 📑 Nera  │  └──────────────────────────────────────────────────────┘  │
│ 💰 Arus  │                                                            │
│ 📁 Lap.  │  ┌──────────────────────────────────────────────────────┐  │
│ ⚙️ Peng. │  │  Panel Detail/Form (master-detail)  — 0–25% layar    │  │
│          │  │  Contoh: form jurnal, detail akun, preview bukti     │  │
│          │  └──────────────────────────────────────────────────────┘  │
│ 📅 Peri  │                                                            │
│ 🏢 Entit │                                                            │
├──────────┴────────────────────────────────────────────────────────────┤
│ © 2026 Appsheet Accounting Journal · v1.0.0 · Periode: Maret 2026 · Online │  ← Bottom Bar (32px)
└───────────────────────────────────────────────────────────────────────┘
```

**Struktur layout — kombinasi terbaik Ver 1 & Ver 2:**

| Elemen | Lebar | Konten |
|--------|-------|--------|
| **Top Bar** | 100% × 64px | Logo + nama aplikasi, pencarian global, notifikasi, menu profil |
| **Sidebar Kiri** | 280px (collapsible ke 64px) | Navigasi modul, periode aktif (dropdown), entity selector, quick action "+ Buat Jurnal" |
| **Panel Utama** | Flex 1 | Konten dinamis per modul; pada mode master-detail menyisakan 25% untuk panel kanan |
| **Panel Detail (opsional)** | 25% (min 320px) | Form jurnal, detail akun + transaksi, preview lampiran, kalkulator cepat |
| **Bottom Bar** | 100% × 32px | Status koneksi, periode akuntansi aktif, versi aplikasi |

**Responsivitas:**
- **Desktop (≥1280px):** sidebar penuh + panel utama + panel detail
- **Tablet (768–1279px):** sidebar collapsible, panel detail menjadi drawer/modal
- **Mobile (<768px):** sidebar menjadi drawer overlay, tabel → kartu, form full-screen

### 6.2 Navigasi Sidebar

```
┌──────────────────────┐
│ [Logo] Appsheet Accounting Journal    │  48px — logo + nama aplikasi
├──────────────────────┤
│ 🏠 Dashboard         │
│ 📒 Jurnal            │
│ 📊 Buku Besar        │
│ 📋 Neraca Lajur      │
│ 📄 Laba Rugi         │   ← active state
│ 📑 Neraca            │
│ 💰 Arus Kas          │
│ 📁 Laporan Lain ▾    │   — submenu collapsible
│ ⚙️ Pengaturan        │
├──────────────────────┤
│ [➕ Buat Jurnal]      │  — quick action (tombol primary)
├──────────────────────┤
│ 📅 Periode: Maret 26 │  — dropdown periode fiskal
│ 🏢 PT Maju Jaya      │  — entity selector
└──────────────────────┘
```

- Item aktif: `bg-primary/10` + `text-primary` + border-left 3px `primary`
- Hover: `bg-slate-100` · Icon 20px dengan gap-3
- **State navigasi:** posisi aktif tersimpan di URL (React Router), sidebar collapse state di Zustand

---

## 7. Desain Visual & Theming

### 7.1 Identitas Visual
- **Aesthetic:** Modern, profesional, bersih, nuansa SaaS akuntansi — "spreadsheet yang indah"
- **Warna utama:** Biru `#2596BE` (kepercayaan & keandalan) — mengikuti BRD/FRD/TRD
- **Semantik akun:** Debit = biru `#3B82F6`, Kredit = emerald `#10B981` (membantu scan cepat tabel)

### 7.2 Palet Warna

| Token | Nilai | Penggunaan |
|-------|-------|------------|
| `--color-primary` | `#2596BE` | Brand, tombol utama, item aktif |
| `--color-primary-light` | `#4FB3D8` | Hover, gradient |
| `--color-primary-dark` | `#1A6985` | Tekan (pressed), header |
| `--color-accent` | `#F59E0B` | Peringatan, sorotan, badge |
| `--color-background` | `#F8FAFC` (slate-50) | Latar halaman |
| `--color-surface` | `#FFFFFF` | Kartu, sidebar, tabel |
| `--color-text-primary` | `#1E293B` (slate-800) | Teks utama |
| `--color-text-secondary` | `#64748B` (slate-500) | Label, keterangan |
| `--color-success` | `#10B981` | Positif, kredit |
| `--color-error` | `#EF4444` | Error, negatif |
| `--color-warning` | `#F59E0B` | Peringatan |
| `--color-info` | `#3B82F6` | Info, debit |
| `--color-border` | `#E2E8F0` | Border default |

### 7.3 Tipografi
- **Font:** Inter (sans-serif) — weight 400, 500, 600, 700
- **Monospace:** JetBrains Mono untuk kode akun & nominal
- Heading: `text-2xl` (24px) – `text-4xl` (36px) · Body tabel: `text-sm` (14px) · Konten umum: `text-base` (16px)
- Format angka: `Intl.NumberFormat('id-ID')` → `Rp 1.000.000,00` · Tanggal: `dd MMMM yyyy` → `15 Maret 2026`

### 7.4 Spacing, Radius, Shadow
- Sidebar 280px (`w-72`) · Container max 1440px · Card padding 24px (`p-6`) · Grid gap 24px (`gap-6`)
- Radius: sm 6px / md 8px / lg 12px
- Shadow: card `0 1px 3px rgba(0,0,0,0.08)` · dropdown `0 4px 12px rgba(0,0,0,0.12)` · modal `0 8px 24px rgba(0,0,0,0.16)`

### 7.5 Animasi
- Framer Motion: transisi halaman (fade + slide 200ms), expand/collapse sidebar, munculnya toast, drawer mobile
- Mengurangi gerakan: hormati `prefers-reduced-motion`

---

## 8. Spesifikasi Modul & UI Components

### 8.1 Dashboard

```
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ 💰 Total Aset    │ 📋 Total Utang   │ 🏦 Total Modal   │ 📈 Laba Bruto    │
│ Rp 850.000.000   │ Rp 320.000.000   │ Rp 530.000.000   │ Rp 45.000.000    │
│ ▲ 12.5%          │ ▼ 3.2%           │ ▲ 8.1%           │ ▲ 15.3%          │
│ dari bulan lalu  │ dari bulan lalu  │ dari bulan lalu  │ dari bulan lalu  │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘

┌─────────────────────────────┐  ┌─────────────────────────────┐
│ Grafik Laba Rugi 6 Bulan    │  │ Peringatan                  │
│  [Bar Chart — Recharts]     │  │ ⚠️ 3 jurnal draft belum     │
│                             │  │    diposting                │
│                             │  │ 📅 Periode Februari belum   │
│                             │  │    ditutup                  │
└─────────────────────────────┘  └─────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ Jurnal Terbaru (5 entri)                        [Lihat Semua →] │
│ ┌──────┬──────────┬──────────────────────┬───────────┬─────────┐ │
│ │ Tgl  │ No.Bukti │ Keterangan           │ Debit     │ Kredit  │ │
│ ├──────┼──────────┼──────────────────────┼───────────┼─────────┤ │
│ │15/03 │ BKM-0015 │ Kas Besar            │15.000.000 │         │ │
│ │      │          │ Pendapatan Jasa      │           │15.000.000│ │
│ └──────┴──────────┴──────────────────────┴───────────┴─────────┘ │
└────────────────────────────────────────────────────────────────┘
```

**Persyaratan:**
- Kartu saldo: 4 kartu dengan delta % vs periode sebelumnya (▲ hijau / ▼ merah)
- Grafik tren Laba Rugi 6 bulan (Recharts, lazy-loaded)
- Peringatan proaktif: jurnal draft, periode belum ditutup, akun non-aktif
- Tabel 5 jurnal terbaru dengan link ke modul Jurnal

### 8.2 Chart of Accounts (COA)

```
▼ AKTIVA (1)
  ▼ Aktiva Lancar (1-1000)
      1-1100  Kas                                  Rp 50 jt
      1-1200  Bank BCA 123456                      Rp 150 jt
      1-1300  Piutang Usaha                        Rp 25 jt
      1-1400  Perlengkapan Kantor                  Rp 5 jt
  ▼ Aktiva Tetap (1-2000)
      1-2100  Tanah                                Rp 500 jt
      1-2200  Bangunan                             Rp 1 M
      1-2300  Peralatan                            Rp 100 jt
▼ KEWAJIBAN (2)
  2-1000  Utang Usaha                              Rp 120 jt
▼ MODAL (3)
  3-1000  Modal Pemilik                            Rp 500 jt
▼ PENDAPATAN (4)
  4-1000  Pendapatan Jasa                          Rp 150 jt
▼ BEBAN (5)
  5-1000  Beban Gaji                               Rp 45 jt
```

**Persyaratan:**
- Tampilan tree dengan indentasi bertingkat + expand/collapse
- CRUD akun: kode unik format `{{GOL}}-{{NOMOR}}`, nama, tipe, grup, saldo normal, status aktif, parent
- Template default: satu-klik memuat COA standar PSAK untuk UKM (Kas & Bank, Piutang, Persediaan, Aktiva Tetap, Utang, Modal, Pendapatan, Beban)
- Akun induk tidak bisa dihapus jika masih punya sub-akun aktif
- Klik akun → drill-down ke Buku Besar akun tersebut
- Import/Export COA via Excel (P1)

**Form Akun:**
```
┌──────────────────────────────────────────────┐
│ ✏️ Tambah Akun                        [Simpan]│
│ Kode        [1-1500                     ]    │
│ Nama        [Kas Kecil                  ]    │
│ Tipe        [Aset ▾]  Grup [Kas & Bank ▾]   │
│ Saldo Normal [(•) Debit  ( ) Kredit]         │
│ Induk Akun  [— (Akun Utama) ▾]              │
│ Deskripsi   [Kas kecil untuk operasional]    │
│ Status      [☑ Aktif]                        │
└──────────────────────────────────────────────┘
```

### 8.3 Jurnal Umum

#### 8.3.1 Form Entri Jurnal (Panel Detail / Modal)

```
┌──────────────────────────────────────────────────────────────┐
│ ✏️ Jurnal Baru                                  [Simpan]     │
│ Tanggal     [📅 15 Maret 2026        ]  Status: [Draft ▾]    │
│ No. Bukti   [BKM-2026-03-0015       ]  (auto-generate)      │
│ Deskripsi   [Penerimaan pembayaran dari PT ABC              ]│
│                                                              │
│ ┌────────────┬──────────────┬────────────┬──────────┬──────┐ │
│ │ Kode Akun  │ Nama Akun    │ Debit (Rp) │ Kredit   │      │ │
│ ├────────────┼──────────────┼────────────┼──────────┼──────┤ │
│ │ [1-1100 ▾] │ Kas Besar    │ 15.000.000 │          │ [X]  │ │
│ │ [4-1000 ▾] │ Pendapatan   │            │15.000.000│ [X]  │ │
│ │            │              │            │          │[+Ln] │ │
│ ├────────────┴──────────────┼────────────┼──────────┼──────┤ │
│ │ TOTAL                     │15.000.000  │15.000.000│      │ │
│ └───────────────────────────┴────────────┴──────────┴──────┘ │
│ 📎 Lampirkan bukti (foto/PDF)      [Batal] [Simpan Draft]     │
│ [Posting]                                                    │
└──────────────────────────────────────────────────────────────┘
```

**Persyaratan form:**
- **Auto-balance:** total debit harus = total kredit sebelum tombol Posting aktif; tampilkan selisih saat tidak balance
- **Auto-generate No. Bukti:** `{{PREFIX}}-{{TAHUN}}-{{BULAN}}-{{NOMOR}}` (BKM = Bank Masuk, BKK = Bank Keluar, JKM = Jurnal Kas Masuk, JKK = Jurnal Kas Keluar, JV = Jurnal Umum/Voucher)
- **Akun selector:** dropdown pencarian dengan `kode + nama` (hanya akun aktif)
- **Format nominal:** auto-format IDR saat mengetik; input debit XOR kredit per baris (satu di antaranya wajib 0)
- **Tambah baris dinamis** (minimal 2 baris: 1 debit + 1 kredit), hapus baris per baris
- **Draft vs Posted:** Draft tidak mengubah saldo & tidak muncul di laporan; Posted mengunci form (read-only)
- **Lampiran bukti:** upload foto/PDF (P1)
- **Shortcut:** `Tab` navigasi antar kolom, `Enter` tambah baris, `Ctrl+Enter` simpan

#### 8.3.2 Daftar Jurnal (Tabel)

```
┌──────────┬──────────────────────────────────────────────┬───────────────┐
│ [Filter: Tanggal ▾] [Akun ▾] [Status ▾]  [🔍 Cari…]     │ [Export ▾]     │
├──────────┬───────────┬────────────────────────┬──────────┬──────────────┤
│ Tgl      │ No. Bukti │ Keterangan             │ Debit    │ Kredit       │
├──────────┼───────────┼────────────────────────┼──────────┼──────────────┤
│ 15/03/26 │ BKM-0015  │ Kas Besar              │15.000.000│              │
│          │           │ Pendapatan Jasa        │          │15.000.000    │
│          │           │ ▶ Pembayaran PT ABC    │          │              │
│          │           │        [📎 bukti.pdf]   │          │              │
├──────────┼───────────┼────────────────────────┼──────────┼──────────────┤
│ 14/03/26 │ BKK-0008  │ Biaya Sewa             │ 5.000.000│              │
│          │           │ Kas Besar              │          │ 5.000.000    │
│          │           │ ▶ Pembayaran sewa April│          │              │
└──────────┴───────────┴────────────────────────┴──────────┴──────────────┘
│ Total: Debit Rp X │ Kredit Rp Y │ Selisih Rp Z                        │
```

**Persyaratan tabel:**
- Baris per line-item, dikelompokkan per jurnal (expandable untuk detail + lampiran)
- Badge status: `Draft` (slate), `Posted` (green), `Reversed` (red)
- **Filter:** rentang tanggal, akun, status, kata kunci (debounce 300ms)
- Footer agregat: total debit, total kredit, selisih
- Aksi per baris: Lihat Detail, Edit (draft), Posting, Reverse, Cetak/Export, Hapus (draft)
- **Virtual scrolling** untuk ribuan baris (performansi 10.000 baris < 2 detik)
- Sortable kolom (tgl, no. bukti, nominal)

#### 8.3.3 Alur Status Jurnal

```
        ┌─────────┐    Simpan Draft    ┌─────────┐
        │  Draft  │──────────────────▶ │  Posted │
        │ (tidak  │  Posting           │ (kunci  │
        │  ubah   │  (validasi balance)│  edit)  │
        │  saldo) │                    └────┬────┘
        └────┬────┘                         │ Reverse
             │ Edit/Hapus                   ▼
             │                        ┌──────────┐
             └──────────────────────▶ │ Reversed │  (batal + jurnal
                                     │          │   koreksi otomatis)
                                     └──────────┘
```

- **Posting:** draft → posted; validasi balance + periode terbuka; mengunci edit; update saldo akun
- **Reverse:** posted → reversed; sistem membuat jurnal pembalik otomatis (debit/kredit dibalik) dengan referensi `REV-{{no bukti}}`; jejak audit tetap ada
- **Edit:** hanya untuk draft; edit posted dicatat di audit trail (siapa, kapan, perubahan apa)

### 8.4 Buku Besar (General Ledger)

```
┌──────────────────────────────────────────────┐
│ Buku Besar: 1-1100 Kas Besar       [Export ▾] │
│ Periode: Maret 2026              [Prev] [Next] │
│ ┌──────┬──────────┬──────────────┬─────────┬─────────┬────────┐ │
│ │ Tgl  │ Ref      │ Deskripsi    │ Debit   │ Kredit  │ Saldo  │ │
│ ├──────┼──────────┼──────────────┼─────────┼─────────┼────────┤ │
│ │01 Mar│ Saldo    │ Saldo Awal   │         │         │ 50.000.│ │
│ │05 Mar│ BKM-0015 │ Penjualan    │15.000.00│         │ 65.000.│ │
│ │10 Mar│ BKK-0008 │ Bayar sewa   │         │ 5.000.00│ 60.000.│ │
│ │15 Mar│ BKK-0012 │ Beli alat    │         │ 2.000.00│ 58.000.│ │
│ ├──────┴──────────┴──────────────┴─────────┴─────────┼────────┤ │
│ │ Total                                              │        │ │
│ └────────────────────────────────────────────────────┴────────┘ │
│ Saldo Akhir: Rp 58.000.000                                    │
└──────────────────────────────────────────────────────────────┘
```

**Persyaratan:**
- Di-generate otomatis dari jurnal **posted** (draft tidak muncul)
- Kolom saldo berjalan (kumulatif) sesuai saldo normal akun
- Baris "Saldo Awal" di awal periode + "Saldo Akhir" di footer
- Filter per akun (dropdown/URL param) + per periode
- Klik referensi → buka detail jurnal sumber
- Drill-down akun dari COA/laporan menuju halaman ini

### 8.5 Neraca Lajur (Trial Balance)

```
┌──────────────────────────────────────────────────────────┐
│ NERACA LAJUR                                             │
│ Periode: Maret 2026                                      │
│ ┌───────────┬─────────────────────┬──────────┬──────────┐ │
│ │ Kode      │ Nama Akun           │ Debit    │ Kredit   │ │
│ ├───────────┼─────────────────────┼──────────┼──────────┤ │
│ │ 1-1100    │ Kas Besar           │ 58.000.000│          │ │
│ │ 1-1200    │ Bank BCA            │450.000.000│          │ │
│ │ 1-1300    │ Piutang Usaha       │ 85.000.000│          │ │
│ │ 2-1000    │ Utang Usaha         │          │120.000.00│ │
│ │ 3-1000    │ Modal Pemilik       │          │500.000.00│ │
│ │ 4-1000    │ Pendapatan Jasa     │          │155.000.00│ │
│ │ 5-1000    │ Beban Gaji          │ 45.000.000│          │ │
│ ├───────────┼─────────────────────┼──────────┼──────────┤ │
│ │ TOTAL     │                     │638.000.00│638.000.00│ │
│ └───────────┴─────────────────────┴──────────┴──────────┘ │
│ ✓ Total Debit = Total Kredit                              │
└──────────────────────────────────────────────────────────┘
```

**Persyaratan:**
- Menampilkan saldo seluruh akun per periode dari buku besar
- Indikator keseimbangan: hijau ✓ jika seimbang, merah + selisih jika tidak
- Export PDF/Excel; klik baris akun → drill-down buku besar

### 8.6 Laporan Laba Rugi

```
┌──────────────────────────────────────────────────────────┐
│ PT MAJU JAYA                                            │
│ LAPORAN LABA RUGI                                       │
│ Periode: Maret 2026                          [Cetak ▾]   │
│ ─────────────────────────────────────────────────────── │
│ PENDAPATAN                                              │
│   4-1000  Pendapatan Jasa          Rp 150.000.000       │
│   4-2000  Pendapatan Lainnya       Rp   5.000.000       │
│           Total Pendapatan         Rp 155.000.000       │
│ ─────────────────────────────────────────────────────── │
│ BEBAN                                                    │
│   5-1000  Beban Gaji               Rp  45.000.000       │
│   5-2000  Beban Sewa               Rp  10.000.000       │
│   5-3000  Beban Operasional        Rp   5.000.000       │
│   5-4000  Beban Penyusutan         Rp   2.000.000       │
│           Total Beban              Rp  62.000.000       │
│ ─────────────────────────────────────────────────────── │
│ LABA BERSIH                          Rp  93.000.000     │
└──────────────────────────────────────────────────────────┘
```

**Persyaratan:**
- Struktur: PENDAPATAN (detail + subtotal) → BEBAN (detail + subtotal) → LABA/RUGI BERSIH (bold)
- Periode bisa dipilih (bulanan/tahunan/kustom), termasuk pembanding periode sebelumnya (opsional P2)
- Sertakan grafik mini tren bila diakses dari dashboard
- Export PDF (header kop perusahaan, footer tanda tangan) & Excel

### 8.7 Laporan Neraca (Posisi Keuangan)

```
┌──────────────────────────────────────────────────────────┐
│ PT MAJU JAYA                                            │
│ LAPORAN NERACA                                          │
│ Per 31 Maret 2026                            [Cetak ▾]   │
│ ─────────────────────────────────────────────────────── │
│ ASET                                                    │
│   Aset Lancar                                           │
│     1-1100  Kas Besar              Rp  58.000.000       │
│     1-1200  Bank BCA               Rp 450.000.000       │
│     1-1300  Piutang Usaha          Rp  85.000.000       │
│   Aset Tetap                                            │
│     1-2100  Tanah                  Rp 500.000.000       │
│   TOTAL ASET                        Rp 1.093.000.000    │
│ ─────────────────────────────────────────────────────── │
│ KEWAJIBAN & EKUITAS                                     │
│   Utang Lancar                                          │
│     2-1000  Utang Usaha            Rp 120.000.000       │
│   Modal                                                 │
│     3-1000  Modal Pemilik          Rp 500.000.000       │
│     3-2000  Laba Ditahan           Rp  93.000.000       │
│   TOTAL KEWAJIBAN & EKUITAS        Rp 713.000.000       │
│ ─────────────────────────────────────────────────────── │
│ Aset = Kewajiban + Ekuitas?            ✓ Seimbang       │
└──────────────────────────────────────────────────────────┘
```

**Persyaratan:**
- Disajikan per tanggal (bukan periode) dengan saldo kumulatif
- Formula aset = kewajiban + ekuitas; indikator keseimbangan
- Laba periode berjalan masuk ke ekuitas (Laba Ditahan)
- Export PDF/Excel

### 8.8 Laporan Arus Kas (P2)

- Metode **tidak langsung**: mulai dari laba bersih, disesuaikan dengan item non-kas & perubahan modal kerja
- Tiga seksi: **Aktivitas Operasi, Aktivitas Investasi, Aktivitas Pendanaan**
- Klasifikasi akun: mapping grup akun → aktivitas (konfigurasi di Pengaturan)
- Export PDF/Excel

### 8.9 Export Laporan

- **Format:** PDF (jsPDF + autotable, kop perusahaan + periode + footer) dan Excel (XLSX)
- Nama file: `Laba-Rugi-Maret-2026.pdf`, `Neraca-31-Maret-2026.xlsx`
- Export tersedia dari: Jurnal (daftar), Buku Besar, Neraca Lajur, Laba Rugi, Neraca, Arus Kas
- Tombol "Cetak" membuka dialog print-friendly

### 8.10 Periode Fiskal & Pengaturan

```
┌────────────────────────────────────────────────┐
│ ⚙️ Pengaturan                                  │
│ ────────────────────────────────────────────── │
│ PERIODE FISKAL                                 │
│ ┌──────────┬──────────┬───────┬─────────────┐  │
│ │ Periode  │ Rentang  │ Status│ Aksi        │  │
│ ├──────────┼──────────┼───────┼─────────────┤  │
│ │Jan 2026  │01/01–31/01│✅ Buka│ [Tutup]     │  │
│ │Feb 2026  │01/02–28/02│✅ Buka│ [Tutup]     │  │
│ │Mar 2026  │01/03–31/03│▶ Aktif│ [Tutup]     │  │
│ └──────────┴──────────┴───────┴─────────────┘  │
│ [+ Buka Periode Baru]                          │
│ ────────────────────────────────────────────── │
│ PERUSAHAAN / ENTITAS                           │
│ Nama: PT Maju Jaya · Mata uang: IDR            │
│ Awal Tahun Fiskal: 1 Januari                   │
│ ────────────────────────────────────────────── │
│ TEMPLATE COA                                   │
│ [Muat Template UKM PSAK] [Import Excel]        │
│ ────────────────────────────────────────────── │
│ MAPPING ARUS KAS                               │
│ [Grup akun → aktivitas operasi/investasi/dana] │
└────────────────────────────────────────────────┘
```

**Aturan periode:**
- Hanya satu periode **aktif** (default untuk entri baru)
- **Periode ditutup** = terkunci: tidak bisa entri/edit/posting jurnal baru; laporan tetap bisa dibaca
- Konfirmasi saat menutup periode: "Tutup periode Maret 2026? Jurnal tidak dapat diubah lagi."
- Buka periode otomatis saat periode aktif berakhir (opsi otomatis di Pengaturan)

### 8.11 Multi-Entitas & Role (P1–P2)

- **Entity selector** di sidebar: switch antar perusahaan/klien (akuntan freelance)
- Data terisolasi penuh antar entity (multi-tenant, row-level security di backend)
- **Role (P2):** `admin` (penuh), `accountant` (entri + approval), `viewer` (read-only)
- Approval workflow (P1): jurnal yang membutuhkan approval berstatus `pending-approval` → disetujui/ditolak oleh role dengan hak approve

---

## 9. Data Structure

```typescript
// ===== Tipe dasar =====
type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
type AccountGroup =
  | 'current_asset' | 'fixed_asset' | 'other_asset'
  | 'current_liability' | 'long_term_liability'
  | 'capital' | 'retained_earnings' | 'drawings'
  | 'operating_revenue' | 'other_income'
  | 'operating_expense' | 'other_expense'
type JournalStatus = 'draft' | 'posted' | 'reversed' | 'pending-approval'

// ===== Chart of Account =====
interface Account {
  id: string
  code: string               // "1-1000" — unik, format {{GOL}}-{{NOMOR}}
  name: string               // "Kas Besar"
  type: AccountType
  group: AccountGroup
  category: string           // "Kas & Bank" — grup tampilan
  normalBalance: 'debit' | 'credit'
  balance: number            // saldo terkini (hanya berubah via jurnal)
  isActive: boolean
  parentId: string | null    // sub-akun
  description?: string
  createdAt: string          // ISO date
}

// ===== Jurnal =====
interface JournalEntry {
  id: string                 // "JNL-2026-03-001"
  transactionNumber: string  // "BKM-2026-03-0001"
  date: string               // ISO — tanggal transaksi
  description: string
  lines: JournalLine[]
  status: JournalStatus
  createdBy: string          // user ID
  createdAt: string
  approvedBy?: string
  approvedAt?: string
  postedAt?: string
  attachment?: string        // URL bukti transaksi
  reversalOf?: string        // id jurnal asal (saat reverse)
  auditTrail?: AuditEntry[]  // riwayat perubahan
}

interface JournalLine {
  id: string
  accountId: string
  accountCode: string        // denormalized
  accountName: string        // denormalized
  debit: number
  credit: number             // debit XOR credit per baris
  description?: string
}

interface AuditEntry {
  userId: string
  action: 'create' | 'update' | 'post' | 'reverse' | 'approve' | 'reject'
  timestamp: string
  changes?: Record<string, { from: unknown; to: unknown }>
}

// ===== Buku Besar =====
interface GeneralLedger {
  accountId: string
  accountCode: string
  accountName: string
  period: string             // "2026-03"
  openingBalance: number
  entries: LedgerEntry[]
  closingBalance: number
}

interface LedgerEntry {
  journalEntryId: string
  date: string
  reference: string          // transactionNumber
  description: string
  debit: number
  credit: number
  balance: number            // saldo berjalan
}

// ===== Neraca Lajur =====
interface TrialBalanceLine {
  accountId: string
  accountCode: string
  accountName: string
  debit: number
  credit: number
}

// ===== Laporan Keuangan =====
interface FinancialReport {
  id: string
  type: 'balance-sheet' | 'income-statement' | 'cash-flow' | 'trial-balance'
  period: { start: string; end: string }
  generatedAt: string
  currency: string           // 'IDR'
  sections: ReportSection[]
  totalDebit: number
  totalCredit: number
}

interface ReportSection {
  title: string              // "PENDAPATAN"
  lines: ReportLine[]
  subtotal: number
}

interface ReportLine {
  accountCode: string
  accountName: string
  amount: number
  indentLevel: number        // 0=header, 1=grup, 2=detail
  isBold?: boolean
  isTotal?: boolean
}

// ===== Periode Fiskal =====
interface FiscalPeriod {
  id: string
  name: string               // "Maret 2026"
  month: number
  year: number
  startDate: string
  endDate: string
  isOpen: boolean
  isActive: boolean
  previousPeriodId?: string
}

// ===== Entitas & Pengguna =====
interface Entity {
  id: string
  name: string               // "PT Maju Jaya"
  currency: string           // "IDR"
  fiscalYearStart: string    // "01-01"
  createdAt: string
}

interface AppUser {
  id: string
  name: string
  email: string
  role: 'admin' | 'accountant' | 'viewer'
  entityId: string
}
```

---

## 10. Aturan Bisnis (Business Rules)

| # | Aturan | Detail |
|---|--------|--------|
| BR-1 | **Double-Entry** | Setiap jurnal ≥ 1 debit dan ≥ 1 kredit; total debit = total kredit |
| BR-2 | **Saldo Normal** | Aset & Beban = debit normal; Utang, Modal, Pendapatan = kredit normal |
| BR-3 | **Periode Tertutup** | Jurnal tidak bisa ditambah/diedit/diposting di periode tertutup |
| BR-4 | **Audit Trail** | Setiap perubahan jurnal tercatat (siapa, kapan, apa yang diubah) |
| BR-5 | **Nomor Urut** | No. bukti auto-generate `{{PREFIX}}-{{TAHUN}}-{{BULAN}}-{{NOMOR}}`, unik per periode |
| BR-6 | **Draft Tidak Efektif** | Jurnal draft tidak mengubah saldo & tidak muncul di laporan |
| BR-7 | **Saldo via Jurnal** | Saldo akun hanya berubah melalui jurnal posted; tidak bisa diedit manual |
| BR-8 | **Akun Induk** | Akun induk tidak bisa dihapus jika memiliki sub-akun aktif |
| BR-9 | **Debit XOR Kredit** | Setiap baris jurnal hanya boleh memiliki salah satu nilai (debit atau kredit) > 0 |
| BR-10 | **Akun Non-Aktif** | Akun non-aktif tidak muncul di dropdown pemilihan |
| BR-11 | **Reverse** | Jurnal posted hanya dibatalkan via reverse (bukan hapus), menghasilkan jurnal pembalik |
| BR-12 | **Konsistensi Nilai** | Semua nilai dalam IDR, format 2 desimal; tidak ada nilai negatif di kolom debit/kredit |
| BR-13 | **Satu Periode Aktif** | Hanya satu periode aktif sebagai default entri |
| BR-14 | **Isolasi Entitas** | Data antar entitas terisolasi penuh; role viewer read-only |

---

## 11. Alur Pengguna (Use Cases)

### UC-1: Mencatat Transaksi Penjualan Tunai

**Aktor:** Rina (Pemilik Toko)
**Prekondisi:** Login, COA terisi, periode Maret 2026 aktif

**Alur Normal:**
1. Rina klik menu "Jurnal" → "+ Buat Jurnal"
2. Sistem menampilkan form entri jurnal kosong
3. Rina pilih tanggal (15 Maret 2026); No. Bukti ter-generate otomatis
4. Rina isi deskripsi: "Penjualan tunai 15 Maret 2026"
5. Baris debit: akun "Kas Besar" → Rp15.000.000
6. Baris kredit: akun "Pendapatan Jasa" → Rp15.000.000
7. Sistem validasi: total debit = total kredit ✓; tombol "Posting" aktif
8. Rina klik "Posting"
9. Sistem simpan status `posted`, update saldo Kas (+15jt) & Pendapatan (+15jt)
10. Toast "Jurnal berhasil diposting"; daftar jurnal menampilkan entri terbaru di atas

**Alur Alternatif (Debit ≠ Kredit):**
- 7a. Total debit ≠ total kredit → error inline: "Total debit dan kredit harus sama. Selisih: Rp1.000.000"; tombol Posting non-aktif sampai balance

**Alur Alternatif (Simpan Draft):**
- 8a. Rina klik "Simpan Draft" → status `draft`, saldo tidak berubah, label "Draft" di daftar

**Alur Alternatif (Periode Tertutup):**
- 3a. Tanggal di periode tertutup → warning: "Periode Februari 2026 sudah ditutup"; entri diblokir

### UC-2: Generate Laporan Laba Rugi Bulanan

**Aktor:** Budi (Manajer Keuangan)
**Prekondisi:** Semua jurnal Maret 2026 sudah diposting

**Alur Normal:**
1. Budi klik "Laba Rugi"; sistem tampilkan laporan periode aktif
2. Budi ganti periode via dropdown → sistem query jurnal posted periode tersebut
3. Sistem kelompokkan per akun pendapatan & beban, hitung subtotal & laba bersih
4. Tampil format: header perusahaan + judul + periode, section PENDAPATAN/BEBAN, **LABA BERSIH** (bold)
5. Budi klik "Cetak PDF" → file `Laba-Rugi-Maret-2026.pdf` ter-download

**Alur Alternatif (Tidak Ada Data):**
- 2a. Periode tanpa jurnal → empty state: "Belum ada transaksi di periode ini" + link "Buat Jurnal"

### UC-3: Menutup Periode Fiskal

**Aktor:** Dimas (Akuntan)
**Alur Normal:**
1. Dimas buka Pengaturan → Periode Fiskal
2. Pilih periode Maret 2026 → klik "Tutup Periode"
3. Sistem validasi: semua jurnal draft di periode tersebut sudah diposting atau dihapus (dengan konfirmasi)
4. Dialog konfirmasi: "Tutup periode Maret 2026? Jurnal tidak dapat diubah lagi."
5. Periode berubah `isOpen: false`; status badge "Terkunci"
6. Semua modul menolak entri baru di periode tersebut

### UC-4: Membalik Jurnal (Reverse)

**Aktor:** Dimas (Akuntan)
**Prekondisi:** Ada jurnal posted yang salah
1. Dimas buka detail jurnal posted → klik "Reverse"
2. Sistem tampilkan konfirmasi + pratinjau jurnal pembalik (debit↔kredit)
3. Konfirmasi → jurnal asal berstatus `reversed`; jurnal pembalik `posted` dengan ref `REV-{{no}}`
4. Saldo akun dikembalikan otomatis; audit trail mencatat kedua aksi

---

## 12. Interaksi, State & Edge Cases

### 12.1 Loading States
- **Skeleton loader:** kartu saldo dashboard (pulse animation 3 baris)
- **Spinner + overlay:** saat submit jurnal ("Menyimpan...")
- **Progress bar:** saat generate laporan tahunan
- **Shimmer:** tabel saat loading (5 baris shimmer)

### 12.2 Empty States
- **Belum ada jurnal:** ilustrasi buku kosong + "Belum ada transaksi. Mulai catat jurnal pertama Anda!" + CTA "+ Buat Jurnal"
- **Belum ada akun:** "Chart of Account masih kosong. Buat akun pertama Anda." + CTA "Muat Template"
- **Tidak ada hasil pencarian:** "Tidak ditemukan jurnal dengan kata kunci '{{KEYWORD}}'"
- **Belum ada laporan:** "Pilih periode untuk generate laporan"

### 12.3 Error States
| Kasus | Tampilan |
|-------|----------|
| Network error | Banner merah "Gagal memuat data. Periksa koneksi internet." + tombol "Muat Ulang" |
| Validation error | Field error merah + pesan spesifik (e.g. "Total debit dan kredit tidak sama") |
| Server error | Toast "Terjadi kesalahan server. Kode: {{ERROR_CODE}}" |
| Session expired | Modal "Sesi berakhir. Silakan login kembali." |
| Data conflict | "Data sudah diubah oleh pengguna lain. Muat ulang halaman." |

### 12.4 Edge Cases
- **Double-click submit:** tombol disabled setelah klik pertama + label "Menyimpan..."
- **Periode tertutup:** warning saat entri di periode closed
- **Saldo tidak balance:** alert saat total debit ≠ kredit (selisih ditampilkan)
- **Akun non-aktif:** tidak muncul di dropdown
- **Nominal negatif:** ditolak validasi di field debit/kredit
- **Hari libur:** warning info jika tanggal transaksi jatuh di hari Minggu/libur nasional (non-blocking)
- **Nomor bukti duplikat:** error "Nomor bukti sudah digunakan" (validasi unik per periode)
- **Hapus akun ber-saldo:** ditolak; sarankan non-aktifkan akun
- **Reverse jurnal yang sudah di-reverse:** tidak diizinkan (status final)
- **Angka besar:** batas maks 999.999.999.999 per baris

### 12.5 Interaksi Utama
- Entri jurnal: penambahan baris dinamis, auto-balance real-time
- Posting: mengunci edit + update saldo
- Drill-down: akun (COA/laporan) → Buku Besar → detail jurnal
- Pilihan periode global di sidebar mempengaruhi semua modul laporan
- Search global di top bar: jurnal, akun (dengan debounce 300ms)

---

## 13. Bahasa & Lokalisasi

Seluruh UI dalam **Bahasa Indonesia** dengan istilah akuntansi PSAK:

| Kategori | Istilah |
|----------|---------|
| Modul | Dashboard, Jurnal, Buku Besar, Neraca Lajur, Laba Rugi, Neraca, Arus Kas, Pengaturan |
| Tipe akun | Aktiva/Aset, Kewajiban/Utang, Ekuitas/Modal, Pendapatan, Beban |
| Aksi | Buat Jurnal, Simpan, Simpan Draft, Posting, Reverse, Batal, Edit, Hapus, Cetak, Export PDF, Lihat Buku Besar |
| Label form | Tanggal, No. Bukti, Keterangan, Debit, Kredit, Saldo, Total |
| Laporan | Neraca Saldo, Laporan Laba Rugi, Neraca, Laporan Arus Kas |
| Bulan | Januari, Februari, Maret, April, Mei, Juni, Juli, Agustus, September, Oktober, November, Desember |
| Mata uang | "Rp" + format IDR (`1.000.000,00`) |
| Tanggal | `dd MMMM yyyy` → "15 Maret 2026" |
| Status | Draft, Posted, Reversed, Menunggu Approval, Periode Terkunci |

---

## 14. Non-Functional Requirements

| Kategori | Requirement |
|----------|-------------|
| **Performance** | Load daftar jurnal 10.000 baris < 2 detik (virtual scrolling) |
| **Performance** | Generate laporan < 3 detik per periode |
| **Performance** | FCP < 1,5 dtk · LCP < 2,5 dtk · TTI < 3 dtk · Lighthouse > 90 |
| **Performance** | Bundle awal < 200 KB gzip (code splitting per modul) |
| **Availability** | Uptime 99,5% |
| **Security** | Enkripsi at-rest (AES-256) & in-transit (TLS 1.3); JWT refresh token; RBAC |
| **Compliance** | Data di server Indonesia (UU Perlindungan Data Pribadi) |
| **Usability** | Onboarding signup → jurnal pertama < 5 menit |
| **Mobile** | Responsive 320px – 1920px; Android 8+ / iOS 14+ |
| **Concurrency** | 50 user concurrent per entity |
| **Backup** | Otomatis tiap 6 jam, retensi 30 hari, point-in-time recovery |
| **Audit** | Semua operasi write tercatat di audit log |

---

## 15. Validasi & Penanganan Error

### 15.1 Tabel Validasi

| Field | Rule | Pesan |
|-------|------|-------|
| Tanggal | Wajib, valid, dalam periode terbuka | "Tanggal wajib diisi" / "Periode {{PERIODE}} sudah ditutup" |
| No. Bukti | Wajib, unik per periode | "Nomor bukti sudah digunakan" |
| Debit | > 0, ≤ 999.999.999.999, XOR dengan kredit | "Nilai debit harus lebih dari 0" |
| Kredit | > 0, ≤ 999.999.999.999, XOR dengan debit | "Nilai kredit harus lebih dari 0" |
| Balance | Σdebit = Σkredit | "Total debit ({{D}}) dan kredit ({{K}}) harus sama. Selisih: {{SELISIH}}" |
| Akun | Aktif & tidak dihapus | "Akun tidak aktif atau sudah dihapus" |
| Baris jurnal | Minimal 1 debit + 1 kredit | "Jurnal harus memiliki minimal 1 debit dan 1 kredit" |
| Nama akun | Wajib, maks 100 karakter | "Nama akun wajib diisi" |
| Kode akun | Unik, format {{GOL}}-{{NOMOR}} | "Kode akun sudah digunakan" |

### 15.2 Strategi Error Berlapis

```
Layer 1: Zod Validation (form)     — pesan per field, tombol submit disabled sampai valid
Layer 2: API Client (network)      — 401 → login; 403 → "Tidak memiliki akses";
                                     404 → "Data tidak ditemukan"; 409 → konflik;
                                     422 → mapping ke field; 500 → toast server error
Layer 3: TanStack Query (data)     — onError per query; retry 3× GET, tanpa retry POST/PUT
Layer 4: React Error Boundary      — fallback UI + tombol "Muat Ulang"
```

**Display:** Toast (sukses/gagal, auto-dismiss 5 dtk) · Inline (validasi form) · Banner (jaringan/server) · Modal (error kritis: session expired, korupsi data)

---

## 16. Contoh Mock Data

```typescript
// ===== Chart of Accounts =====
const mockAccounts: Account[] = [
  { id: "1-1100", code: "1-1100", name: "Kas Besar", type: "asset",
    group: "current_asset", category: "Kas & Bank", normalBalance: "debit",
    balance: 58_000_000, isActive: true, parentId: null,
    description: "Kas tunai perusahaan", createdAt: "2025-01-01T00:00:00Z" },
  { id: "1-1200", code: "1-1200", name: "Bank BCA 123456", type: "asset",
    group: "current_asset", category: "Kas & Bank", normalBalance: "debit",
    balance: 450_000_000, isActive: true, parentId: null,
    description: "Rekening giro BCA", createdAt: "2025-01-01T00:00:00Z" },
  { id: "1-1300", code: "1-1300", name: "Piutang Usaha", type: "asset",
    group: "current_asset", category: "Piutang", normalBalance: "debit",
    balance: 85_000_000, isActive: true, parentId: null, createdAt: "2025-01-01T00:00:00Z" },
  { id: "2-1000", code: "2-1000", name: "Utang Usaha", type: "liability",
    group: "current_liability", category: "Utang Lancar", normalBalance: "credit",
    balance: 120_000_000, isActive: true, parentId: null, createdAt: "2025-01-01T00:00:00Z" },
  { id: "3-1000", code: "3-1000", name: "Modal Pemilik", type: "equity",
    group: "capital", category: "Modal", normalBalance: "credit",
    balance: 500_000_000, isActive: true, parentId: null, createdAt: "2025-01-01T00:00:00Z" },
  { id: "4-1000", code: "4-1000", name: "Pendapatan Jasa", type: "revenue",
    group: "operating_revenue", category: "Pendapatan", normalBalance: "credit",
    balance: 155_000_000, isActive: true, parentId: null, createdAt: "2025-01-01T00:00:00Z" },
  { id: "5-1000", code: "5-1000", name: "Beban Gaji", type: "expense",
    group: "operating_expense", category: "Beban Operasional", normalBalance: "debit",
    balance: 45_000_000, isActive: true, parentId: null, createdAt: "2025-01-01T00:00:00Z" },
  { id: "5-2000", code: "5-2000", name: "Beban Sewa", type: "expense",
    group: "operating_expense", category: "Beban Operasional", normalBalance: "debit",
    balance: 10_000_000, isActive: true, parentId: null, createdAt: "2025-01-01T00:00:00Z" },
  { id: "5-3000", code: "5-3000", name: "Beban Operasional", type: "expense",
    group: "operating_expense", category: "Beban Operasional", normalBalance: "debit",
    balance: 5_000_000, isActive: true, parentId: null, createdAt: "2025-01-01T00:00:00Z" },
  { id: "5-4000", code: "5-4000", name: "Beban Penyusutan", type: "expense",
    group: "operating_expense", category: "Beban Operasional", normalBalance: "debit",
    balance: 2_000_000, isActive: true, parentId: null, createdAt: "2025-01-01T00:00:00Z" }
];

// ===== Jurnal =====
const mockJournalEntries: JournalEntry[] = [
  {
    id: "JNL-2026-03-001",
    transactionNumber: "BKM-2026-03-0001",
    date: "2026-03-15T10:00:00Z",
    description: "Penerimaan pembayaran jasa konsultasi dari PT Maju Sejahtera",
    lines: [
      { id: "line-1", accountId: "1-1100", accountCode: "1-1100",
        accountName: "Kas Besar", debit: 25_000_000, credit: 0,
        description: "Penerimaan tunai" },
      { id: "line-2", accountId: "4-1000", accountCode: "4-1000",
        accountName: "Pendapatan Jasa", debit: 0, credit: 25_000_000,
        description: "Pendapatan jasa konsultasi" }
    ],
    status: "posted",
    createdBy: "user-001",
    createdAt: "2026-03-15T10:05:00Z",
    approvedBy: "user-002",
    approvedAt: "2026-03-15T11:00:00Z",
    postedAt: "2026-03-15T10:06:00Z"
  },
  {
    id: "JNL-2026-03-002",
    transactionNumber: "BKK-2026-03-0008",
    date: "2026-03-10T09:00:00Z",
    description: "Pembayaran sewa kantor bulan April",
    lines: [
      { id: "line-1", accountId: "5-2000", accountCode: "5-2000",
        accountName: "Beban Sewa", debit: 10_000_000, credit: 0,
        description: "Sewa kantor April" },
      { id: "line-2", accountId: "1-1100", accountCode: "1-1100",
        accountName: "Kas Besar", debit: 0, credit: 10_000_000,
        description: "Pembayaran via transfer" }
    ],
    status: "posted",
    createdBy: "user-001",
    createdAt: "2026-03-10T09:02:00Z",
    postedAt: "2026-03-10T09:05:00Z"
  }
];

// ===== Buku Besar (contoh Kas Besar, Maret 2026) =====
const mockLedger: GeneralLedger = {
  accountId: "1-1100",
  accountCode: "1-1100",
  accountName: "Kas Besar",
  period: "2026-03",
  openingBalance: 50_000_000,
  entries: [
    { journalEntryId: "JNL-2026-03-001", date: "2026-03-15",
      reference: "BKM-2026-03-0001", description: "Penerimaan dari PT ABC",
      debit: 15_000_000, credit: 0, balance: 65_000_000 },
    { journalEntryId: "JNL-2026-03-002", date: "2026-03-10",
      reference: "BKK-2026-03-0008", description: "Bayar sewa April",
      debit: 0, credit: 10_000_000, balance: 55_000_000 }
  ],
  closingBalance: 55_000_000
};

// ===== Laporan Laba Rugi =====
const mockIncomeStatement: FinancialReport = {
  id: "RPT-2026-03-001",
  type: "income-statement",
  period: { start: "2026-03-01", end: "2026-03-31" },
  generatedAt: "2026-03-31T23:59:00Z",
  currency: "IDR",
  sections: [
    {
      title: "PENDAPATAN",
      lines: [
        { accountCode: "4-1000", accountName: "Pendapatan Jasa",
          amount: 150_000_000, indentLevel: 2 },
        { accountCode: "4-2000", accountName: "Pendapatan Lainnya",
          amount: 5_000_000, indentLevel: 2 },
        { accountCode: "", accountName: "Total Pendapatan",
          amount: 155_000_000, indentLevel: 1, isBold: true, isTotal: true }
      ],
      subtotal: 155_000_000
    },
    {
      title: "BEBAN",
      lines: [
        { accountCode: "5-1000", accountName: "Beban Gaji",
          amount: 45_000_000, indentLevel: 2 },
        { accountCode: "5-2000", accountName: "Beban Sewa",
          amount: 10_000_000, indentLevel: 2 },
        { accountCode: "5-3000", accountName: "Beban Operasional",
          amount: 5_000_000, indentLevel: 2 },
        { accountCode: "5-4000", accountName: "Beban Penyusutan",
          amount: 2_000_000, indentLevel: 2 },
        { accountCode: "", accountName: "Total Beban",
          amount: 62_000_000, indentLevel: 1, isBold: true, isTotal: true }
      ],
      subtotal: 62_000_000
    }
  ],
  totalDebit: 62_000_000,
  totalCredit: 155_000_000
};

// ===== Periode Fiskal =====
const mockFiscalPeriods: FiscalPeriod[] = [
  { id: "fp-2026-01", name: "Januari 2026", month: 1, year: 2026,
    startDate: "2026-01-01", endDate: "2026-01-31",
    isOpen: false, isActive: false, previousPeriodId: "fp-2025-12" },
  { id: "fp-2026-02", name: "Februari 2026", month: 2, year: 2026,
    startDate: "2026-02-01", endDate: "2026-02-28",
    isOpen: false, isActive: false, previousPeriodId: "fp-2026-01" },
  { id: "fp-2026-03", name: "Maret 2026", month: 3, year: 2026,
    startDate: "2026-03-01", endDate: "2026-03-31",
    isOpen: true, isActive: true, previousPeriodId: "fp-2026-02" }
];
```

---

## 17. Kriteria Penerimaan (Success Criteria)

### 17.1 Kriteria Wajib (P0 — MVP)

**Modul & Navigasi**
- [ ] Layout top bar + sidebar + panel utama + bottom bar render sesuai spesifikasi
- [ ] Navigasi antar 9 modul berfungsi; state aktif tersimpan di URL
- [ ] Responsive: desktop, tablet (drawer), mobile (kartu) — tanpa error layout
- [ ] Pemilih periode & entity di sidebar mempengaruhi seluruh modul

**Chart of Accounts**
- [ ] Tree hierarki akun render dengan indentasi & expand/collapse
- [ ] CRUD akun lengkap dengan validasi kode unik & format {{GOL}}-{{NOMOR}}
- [ ] Template COA UKM PSAK dapat dimuat satu klik
- [ ] Akun induk dengan sub-akun aktif tidak bisa dihapus
- [ ] Klik akun → drill-down ke Buku Besar

**Jurnal**
- [ ] Entri jurnal multi-line dengan auto-balance (debit = kredit) real-time
- [ ] No. bukti auto-generate `{{PREFIX}}-{{TAHUN}}-{{BULAN}}-{{NOMOR}}`
- [ ] Simpan Draft (tidak ubah saldo) vs Posting (kunci + update saldo) berfungsi
- [ ] Daftar jurnal dengan filter tanggal/akun/status/keyword + footer agregat
- [ ] Edit & hapus hanya untuk draft; posted read-only; reverse membuat jurnal pembalik
- [ ] Akun non-aktif tidak muncul di dropdown; nominal negatif ditolak
- [ ] Lampiran bukti transaksi dapat di-upload & ditampilkan

**Buku Besar & Laporan**
- [ ] Buku besar ter-generate otomatis dari jurnal posted, dengan saldo berjalan & saldo awal/akhir
- [ ] Neraca Lajur menampilkan semua akun dengan total debit = total kredit
- [ ] Laporan Laba Rugi & Neraca akurat per periode; indikator keseimbangan berfungsi
- [ ] Export PDF & Excel menghasilkan file valid dengan format profesional

**Periode & Sistem**
- [ ] Periode fiskal dapat dibuka/ditutup; periode tertutup memblokir entri baru
- [ ] Semua UI menggunakan Bahasa Indonesia + format IDR & tanggal Indonesia
- [ ] Skeleton/empty/error state muncul sesuai kondisi
- [ ] Tabel 10.000 baris jurnal render < 2 detik
- [ ] ✅ NO backend calls / NO API integration — seluruhnya mock data

### 17.2 Kriteria Sekunder (P1–P2)
- [ ] Approval workflow (pending → approve/reject) dengan role
- [ ] Laporan Arus Kas metode tidak langsung dengan mapping aktivitas
- [ ] Multi-entitas: switch perusahaan dengan isolasi data
- [ ] Role-based access: admin/akuntan/viewer
- [ ] Import/Export COA Excel

---

## 18. Roadmap & Timeline

| Fase | Durasi | Milestone |
|------|--------|-----------|
| **Fase 1: Foundation** | 4 minggu | COA (template + CRUD), Jurnal (form + daftar + posting), Buku Besar |
| **Fase 2: Pelaporan** | 3 minggu | Laba Rugi, Neraca, Neraca Lajur, Dashboard |
| **Fase 3: Quality & Export** | 2 minggu | Export PDF/Excel, search & filter, reverse jurnal, lampiran |
| **Fase 4: Multi-user & Approval** | 3 minggu | Role management, approval workflow, multi-entitas |
| **Fase 5: Advanced** | 4 minggu | Arus Kas, integrasi bank, pembanding laporan |
| **Beta Closed** | 2 minggu | 50 user beta (persona Rina, Dimas, Budi) |
| **Launch Publik** | — | Web (PWA) + Android |

---

## 19. Pertanyaan Terbuka

1. **Prefiks bukti:** Apakah perlu konfigurasi prefiks khusus per jenis transaksi (BKM/BKK/JKM/JKK/JV) di Pengaturan, atau cukup template otomatis?
2. **Pembukuan ganda vs tunggal:** Apakah jurnal sederhana (1 baris, cash-basis) tetap dibutuhkan untuk onboarding user non-akuntan (Rina), atau wajib double-entry sejak awal?
3. **Periode penyesuaian (adjustment):** Apakah jurnal penyesuaian akhir bulan (depresiasi, accrual) masuk MVP atau sprint berikutnya?
4. **Mata uang:** Cukup IDR saja untuk MVP, atau perlu multi-currency sejak awal?
5. **Lampiran bukti:** Batas ukuran & tipe file (foto JPEG/PNG, PDF) perlu ditetapkan; storage cloud (S3/MinIO) atau lokal?

---

*Dokumen ini menggabungkan dan menyempurnakan PRD Ver 1 dan Ver 2, serta selaras dengan BRD, FRD, dan TRD Appsheet Accounting Journal. Perubahan dari Ver 2 → Ver 3: struktur modul 8.1–8.11, aturan bisnis eksplisit (BR-1 s/d BR-14), use case UC-1 s/d UC-4, tabel validasi, kriteria penerimaan per modul, dan roadmap implementasi.*
