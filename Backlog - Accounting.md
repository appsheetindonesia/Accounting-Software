# Backlog User Stories — BukuWarung Akuntansi
### Sprint-Ready Backlog · Sumber: PRD Ver 3 - Accounting · Agustus 2026

---

## Dokumen Informasi

| Field | Nilai |
|-------|-------|
| **Produk** | BukuWarung Akuntansi |
| **Format story** | "Sebagai [peran], saya ingin [aksi], agar [manfaat]" |
| **Estimasi** | Story Points (Fibonacci: 1, 2, 3, 5, 8, 13) — kalibrasi di planning poker |
| **Asumsi tim** | 2–3 developer frontend/backend + 1 QA |
| **Durasi sprint** | 2 minggu |
| **Referensi fitur** | P0-XX / P1-XX / P2-XX (PRD Ver 3 §5), COA-XX/JRN-XX/GL-XX/RPT-XX/SYS-XX (FRD) |

---

## 1. Definition of Ready (DoR)

Story dianggap siap dikerjakan jika:
- [ ] Memiliki user story yang jelas (peran → aksi → manfaat)
- [ ] Acceptance criteria testable & tanpa ambiguitas
- [ ] Dependensi terhadap story lain sudah teridentifikasi
- [ ] Data mock / API contract tersedia (lihat `API - Accounting.md`)
- [ ] Desain UI terkait sudah direview (lihat PRD Ver 3 §6–§8)

## 2. Definition of Done (DoD)

Story dianggap selesai jika:
- [ ] Kode lolos typecheck & lint (TS strict)
- [ ] Unit test untuk logika keuangan (balance, saldo, laporan) ≥80% coverage
- [ ] Semua acceptance criteria terpenuhi & terverifikasi QA
- [ ] Berjalan di desktop + tablet + mobile (320px) tanpa error layout
- [ ] Tidak ada regresi pada modul terkait (regression test)
- [ ] Teks UI Bahasa Indonesia, format IDR & tanggal `dd MMMM yyyy` konsisten

---

## 3. Ringkasan Backlog per Sprint

| Sprint | Fokus | Story | Total SP |
|--------|-------|-------|----------|
| **Sprint 1** | Foundation: Layout, COA, Jurnal Dasar | BW-001 – BW-009 | 48 |
| **Sprint 2** | Buku Besar, Filter, Periode, Dashboard | BW-010 – BW-015 | 36 |
| **Sprint 3** | Pelaporan: Laba Rugi, Neraca, Neraca Lajur | BW-016 – BW-019 | 24 |
| **Sprint 4** | Quality: Export, Reverse, Lampiran, Approval | BW-020 – BW-024 | 26 |
| **Sprint 5** | Multi-user: Role, Entitas, Arus Kas, Search | BW-025 – BW-029 | 27 |
| **Sprint 6** | Advanced & Polish | BW-030 – BW-034 | 36 |
| **Icebox** | Post-MVP | BW-100+ | — |
| **TOTAL MVP** | | **34 story** | **197 SP** |

---

## 4. Sprint 1 — Foundation: Layout, COA, Jurnal Dasar

### BW-001 · Setup Proyek & Layout Aplikasi — 8 SP
**Referensi:** P0-01 · **Prioritas:** P0 · **Dependensi:** —
**User story:** Sebagai pengguna, saya ingin aplikasi terbuka dengan kerangka layout yang konsisten (top bar, sidebar, panel utama, bottom bar), agar saya bisa bernavigasi dengan mudah.
**Acceptance criteria:**
- [ ] Proyek Vite + React + TS + Tailwind berjalan (`npm run dev`)
- [ ] Top bar (64px): logo + nama aplikasi, pencarian global (placeholder), notifikasi, menu profil
- [ ] Sidebar (280px, collapsible ke 64px) dengan navigasi 9 modul + quick action "+ Buat Jurnal"
- [ ] Bottom bar (32px): versi, periode aktif, status koneksi
- [ ] Rute tiap modul berfungsi (React Router, lazy loading) & state aktif di URL
- [ ] Responsive: desktop penuh / tablet sidebar-collapse / mobile drawer
- [ ] Tema hijau `#0D5C3D` + font Inter & JetBrains Mono aktif

### BW-002 · Sidebar Navigasi + Pemilih Periode & Entitas — 3 SP
**Referensi:** P0-01 · **Prioritas:** P0 · **Dependensi:** BW-001
**User story:** Sebagai pengguna, saya ingin sidebar menampilkan item aktif dan dropdown periode/entitas, agar saya tahu sedang berada di modul dan periode mana.
**Acceptance criteria:**
- [ ] Item aktif: `bg-primary/10` + border-left 3px primary; hover `bg-slate-100`
- [ ] Submenu "Laporan Lain" collapse/expand
- [ ] Dropdown periode menampilkan periode aktif; dropdown entitas (multi-entity placeholder)
- [ ] Quick action "+ Buat Jurnal" menuju form jurnal baru

### BW-003 · Chart of Accounts — Tree View — 5 SP
**Referensi:** P0-01 / COA-01 · **Prioritas:** P0 · **Dependensi:** BW-001
**User story:** Sebagai pemilik usaha, saya ingin melihat daftar akun dalam hierarki pohon, agar struktur keuangan saya mudah dipahami.
**Acceptance criteria:**
- [ ] Tree 5 tipe akun (Aktiva, Kewajiban, Modal, Pendapatan, Beban) dengan indentasi bertingkat
- [ ] Expand/collapse per grup akun; ikon + badge tipe akun
- [ ] Setiap baris: kode, nama, saldo (format IDR)
- [ ] Klik akun → navigasi ke Buku Besar akun tersebut (placeholder di Sprint 1)
- [ ] Empty state: "Chart of Account masih kosong. Buat akun pertama Anda." + CTA Muat Template
- [ ] Loading: skeleton 5 baris

### BW-004 · COA — CRUD Akun (Form Tambah/Edit/Hapus) — 5 SP
**Referensi:** P0-01 / COA-01 · **Prioritas:** P0 · **Dependensi:** BW-003
**User story:** Sebagai akuntan, saya ingin menambah, mengedit, dan menonaktifkan akun, agar struktur akun sesuai kebutuhan usaha.
**Acceptance criteria:**
- [ ] Form: kode, nama, tipe, grup, kategori, saldo normal (debit/kredit), induk akun, deskripsi, status aktif
- [ ] Validasi kode unik + format `{{GOL}}-{{NOMOR}}` → "Kode akun sudah digunakan" / "Format kode tidak valid"
- [ ] Akun induk tidak bisa dihapus jika memiliki sub-akun aktif → toast 409
- [ ] Akun ber-saldo hanya bisa dinonaktifkan (bukan dihapus) → warning konfirmasi
- [ ] Akun non-aktif tidak muncul di dropdown pemilihan akun (modul jurnal)
- [ ] Nominal saldo tidak dapat diedit manual (hanya via jurnal)

### BW-005 · Template COA UKM PSAK — 3 SP
**Referensi:** P1-10 / COA-02 · **Prioritas:** P1 · **Dependensi:** BW-003
**User story:** Sebagai pemilik baru, saya ingin memuat template akun standar, agar tidak perlu membuat akun satu per satu.
**Acceptance criteria:**
- [ ] Tombol "Muat Template UKM PSAK" di COA (atau empty state)
- [ ] Memuat ≥40 akun standar: Kas & Bank, Piutang, Persediaan, Aktiva Tetap, Utang, Modal, Pendapatan, Beban
- [ ] Jika COA sudah terisi → dialog konfirmasi mode replace vs merge
- [ ] Setelah muat, tree langsung menampilkan akun baru; toast "Template berhasil dimuat"

### BW-006 · Form Entri Jurnal (Multi-Line, Auto-Balance) — 8 SP
**Referensi:** P0-02 / JRN-01 · **Prioritas:** P0 · **Dependensi:** BW-004
**User story:** Sebagai pemilik usaha, saya ingin mencatat transaksi dengan beberapa baris debit/kredit, agar jurnal selalu balance otomatis.
**Acceptance criteria:**
- [ ] Form: tanggal, no. bukti (auto), deskripsi, baris (kode akun dropdown, deskripsi, debit, kredit)
- [ ] Per baris: debit XOR kredit (salah satu wajib 0); nilai negatif ditolak
- [ ] Tambah/hapus baris dinamis; minimal 1 debit + 1 kredit
- [ ] Total debit & kredit live di footer; jika tidak sama → pesan "Total debit ({{D}}) dan kredit ({{K}}) harus sama. Selisih: {{S}}"
- [ ] Tombol Posting non-aktif sampai balance
- [ ] Format IDR otomatis saat mengetik; shortcut Tab/Enter tambah baris
- [ ] Akun dropdown hanya menampilkan akun aktif (kode + nama)

### BW-007 · Auto-Generate Nomor Bukti — 3 SP
**Referensi:** P0-02 / BR-5 · **Prioritas:** P0 · **Dependensi:** BW-006
**User story:** Sebagai pemilik usaha, saya ingin nomor bukti terisi otomatis, agar pencatatan saya tertib tanpa pusing mengurutkan nomor.
**Acceptance criteria:**
- [ ] Format `{{PREFIX}}-{{TAHUN}}-{{BULAN}}-{{NOMOR}}` (BKM/BKK/JKM/JKK/JV)
- [ ] Nomor berikutnya didapat dari endpoint `GET /journals/next-number` (fallback ke mock)
- [ ] Nomor unik per periode; input manual tetap dimungkinkan
- [ ] Duplikat nomor → error "Nomor bukti sudah digunakan"

### BW-008 · Simpan Draft vs Posting — 8 SP
**Referensi:** P0-02 / JRN-03 / BR-6 · **Prioritas:** P0 · **Dependensi:** BW-006, BW-007
**User story:** Sebagai akuntan, saya ingin menyimpan jurnal sebagai draft atau langsung posting, agar saya bisa memeriksa dulu sebelum mempengaruhi saldo.
**Acceptance criteria:**
- [ ] "Simpan Draft" → status `draft`; tidak mengubah saldo; tidak muncul di laporan
- [ ] "Posting" → validasi balance + periode terbuka → status `posted`; saldo akun ter-update
- [ ] Draft dapat diedit & dihapus; posted read-only (form terkunci)
- [ ] Setelah posting: toast "Jurnal berhasil diposting", saldo akun terkait berubah di COA
- [ ] Posting di periode tertutup → diblokir "Periode {{P}} sudah ditutup"
- [ ] Double-click submit → tombol disabled + "Menyimpan..."

### BW-009 · Daftar Jurnal (Tabel + Badge Status + Footer) — 5 SP
**Referensi:** P0-02 / JRN-02 · **Prioritas:** P0 · **Dependensi:** BW-008
**User story:** Sebagai pemilik usaha, saya ingin melihat daftar semua jurnal dengan statusnya, agar mudah menelusuri riwayat transaksi.
**Acceptance criteria:**
- [ ] Tabel: Tgl, No. Bukti, Keterangan (per line-item, dikelompokkan per jurnal), Debit, Kredit
- [ ] Badge status: Draft (slate) / Posted (green) / Reversed (red)
- [ ] Footer agregat: total debit, total kredit, selisih
- [ ] Baris dapat di-expand untuk lihat detail + lampiran (placeholder)
- [ ] Aksi: Lihat Detail, Edit (draft), Posting, Reverse (placeholder), Hapus (draft)
- [ ] Empty state: "Belum ada transaksi. Mulai catat jurnal pertama Anda!" + CTA

---

## 5. Sprint 2 — Buku Besar, Filter, Periode, Dashboard

### BW-010 · Buku Besar per Akun (Saldo Berjalan) — 8 SP
**Referensi:** P0-03 / GL-01–03 · **Prioritas:** P0 · **Dependensi:** BW-008
**User story:** Sebagai akuntan, saya ingin melihat buku besar per akun, agar bisa menelusuri semua transaksi yang mempengaruhi saldo akun.
**Acceptance criteria:**
- [ ] Header: kode + nama akun, periode, tombol prev/next periode
- [ ] Kolom: Tgl, Ref, Deskripsi, Debit, Kredit, **Saldo** (berjalan, sesuai saldo normal)
- [ ] Baris "Saldo Awal" di awal + "Saldo Akhir" di footer
- [ ] Hanya jurnal `posted` yang muncul (draft tidak)
- [ ] Klik Ref → buka detail jurnal sumber
- [ ] Di-generate otomatis dari daftar jurnal (mock: derive dari mockJournals)

### BW-011 · Filter & Pencarian Jurnal — 5 SP
**Referensi:** P1-11 / JRN-02 · **Prioritas:** P1 · **Dependensi:** BW-009
**User story:** Sebagai akuntan, saya ingin memfilter jurnal berdasarkan tanggal, akun, status, dan kata kunci, agar cepat menemukan transaksi tertentu.
**Acceptance criteria:**
- [ ] Filter: rentang tanggal (date range picker), akun (dropdown), status (multi-select)
- [ ] Pencarian kata kunci dengan debounce 300ms (match no. bukti, deskripsi, nama akun)
- [ ] Kombinasi filter bekerja bersamaan; URL search params menyimpan filter
- [ ] Empty state pencarian: "Tidak ditemukan jurnal dengan kata kunci '{{KEYWORD}}'"
- [ ] Footer agregat mengikuti hasil filter

### BW-012 · Periode Fiskal: Buka, Aktif, Tutup — 8 SP
**Referensi:** P0-06 / SYS-01 / BR-3 · **Prioritas:** P0 · **Dependensi:** BW-008
**User story:** Sebagai akuntan, saya ingin membuka dan menutup periode fiskal, agar pembukuan tiap bulan terkunci rapi.
**Acceptance criteria:**
- [ ] Halaman Pengaturan → daftar periode (bulan, tahun, rentang, status, aksi)
- [ ] Hanya satu periode aktif; default untuk entri jurnal baru
- [ ] "Tutup Periode" → dialog konfirmasi + penanganan jurnal draft tersisa (post-all / delete-all / keep)
- [ ] Periode tertutup: entri/edit/posting jurnal diblokir di semua modul (warning yang jelas)
- [ ] Laporan periode tertutup tetap bisa dibaca
- [ ] Badge "Terkunci" pada periode yang ditutup

### BW-013 · Edit & Hapus Jurnal Draft + Audit Trail — 5 SP
**Referensi:** P0-02 / JRN-03 / BR-4 · **Prioritas:** P0 · **Dependensi:** BW-009
**User story:** Sebagai akuntan, saya ingin mengedit atau menghapus jurnal draft dan melihat riwayat perubahannya, agar koreksi tercatat dengan aman.
**Acceptance criteria:**
- [ ] Edit hanya untuk `draft` (posted read-only) — tombol edit disabled + tooltip
- [ ] Hapus draft dengan dialog konfirmasi "Yakin ingin menghapus jurnal ini?"
- [ ] Audit trail menampilkan riwayat: create, update, post (user, timestamp, aksi)
- [ ] Edit draft tidak mempengaruhi saldo

### BW-014 · Dashboard: Kartu Saldo + Delta — 5 SP
**Referensi:** P0-07 · **Prioritas:** P0 · **Dependensi:** BW-008
**User story:** Sebagai pemilik usaha, saya ingin melihat ringkasan aset, utang, modal, dan laba di satu layar, agar langsung tahu kondisi keuangan.
**Acceptance criteria:**
- [ ] 4 kartu: Total Aset, Total Utang, Total Modal, Laba Bruto (format IDR)
- [ ] Delta % vs bulan lalu dengan panah ▲/▼ dan warna kontekstual (naiknya utang = merah)
- [ ] Skeleton loading saat data dimuat
- [ ] Klik kartu → navigasi ke laporan terkait

### BW-015 · Dashboard: Grafik Tren, Jurnal Terbaru, Peringatan — 5 SP
**Referensi:** P0-07 · **Prioritas:** P0 · **Dependensi:** BW-014
**User story:** Sebagai pemilik usaha, saya ingin melihat tren laba rugi, jurnal terbaru, dan peringatan, agar bisa memantau kesehatan usaha.
**Acceptance criteria:**
- [ ] Grafik bar Laba Rugi 6 bulan (Recharts, lazy-loaded)
- [ ] Tabel 5 jurnal terbaru dengan link "Lihat Semua" → modul Jurnal
- [ ] Panel peringatan: jurnal draft belum diposting, periode belum ditutup, jurnal tidak balance
- [ ] Peringatan klikable → navigasi ke tempat perbaikan

---

## 6. Sprint 3 — Pelaporan

### BW-016 · Laporan Laba Rugi — 8 SP
**Referensi:** P0-04 / RPT-01 · **Prioritas:** P0 · **Dependensi:** BW-010
**User story:** Sebagai pemilik usaha, saya ingin melihat laba rugi per periode, agar tahu untung atau rugi usaha saya.
**Acceptance criteria:**
- [ ] Format: header perusahaan + judul + periode; section PENDAPATAN & BEBAN (detail + subtotal); **LABA/RUGI BERSIH** bold
- [ ] Akurat: total pendapatan − total beban = laba bersih (unit test)
- [ ] Selektor periode (bulanan); default periode aktif
- [ ] Empty state: "Belum ada transaksi di periode ini" + link buat jurnal
- [ ] Nilai indentasi sesuai hierarki akun; format IDR konsisten

### BW-017 · Laporan Neraca (Posisi Keuangan) — 8 SP
**Referensi:** P0-05 / RPT-02 · **Prioritas:** P0 · **Dependensi:** BW-010
**User story:** Sebagai pemilik usaha, saya ingin melihat posisi keuangan per tanggal, agar tahu total aset vs kewajiban dan modal.
**Acceptance criteria:**
- [ ] Disajikan per tanggal (`Per 31 Maret 2026`), saldo kumulatif
- [ ] Section: ASET (lancar/tetap) · KEWAJIBAN & EKUITAS (utang, modal, laba ditahan)
- [ ] Laba periode berjalan masuk ke ekuitas
- [ ] Indikator keseimbangan: Aset = Kewajiban + Ekuitas (✓ hijau / ✗ merah + selisih)
- [ ] Unit test: formula keseimbangan dengan data mock

### BW-018 · Neraca Lajur (Trial Balance) — 5 SP
**Referensi:** P1-08 / RPT-03 · **Prioritas:** P1 · **Dependensi:** BW-010
**User story:** Sebagai akuntan, saya ingin melihat saldo semua akun dalam satu tabel debit/kredit, agar cepat memeriksa keseimbangan buku.
**Acceptance criteria:**
- [ ] Tabel: kode, nama akun, debit, kredit — semua akun per periode
- [ ] Total debit = total kredit dengan indikator ✓/✗ + selisih
- [ ] Klik baris akun → Buku Besar akun tersebut
- [ ] Akun tanpa transaksi tetap muncul jika ber-saldo awal

### BW-019 · Selektor Periode Global — 3 SP
**Referensi:** P0-06 · **Prioritas:** P0 · **Dependensi:** BW-016, BW-017
**User story:** Sebagai pengguna, saya ingin mengubah periode dari satu tempat, agar semua laporan mengikuti periode yang sama.
**Acceptance criteria:**
- [ ] Dropdown periode di sidebar mempengaruhi Laba Rugi, Neraca, Neraca Lajur, Buku Besar, Dashboard
- [ ] Periode tersimpan di URL (`?period=2026-03`) sehingga bisa di-share
- [ ] Ganti periode → semua modul laporan re-fetch & re-render

---

## 7. Sprint 4 — Quality: Export, Reverse, Lampiran, Approval

### BW-020 · Export Laporan ke PDF — 5 SP
**Referensi:** P1-09 / RPT-05 · **Prioritas:** P1 · **Dependensi:** BW-016–018
**User story:** Sebagai pemilik usaha, saya ingin mengunduh laporan sebagai PDF profesional, agar bisa dibagikan ke bank, investor, atau pajak.
**Acceptance criteria:**
- [ ] Export dari: Laba Rugi, Neraca, Neraca Lajur, Buku Besar, daftar Jurnal
- [ ] PDF berisi: kop perusahaan, judul, periode, isi laporan, footer
- [ ] Nama file: `Laba-Rugi-Maret-2026.pdf` / `Neraca-31-Maret-2026.pdf`
- [ ] jsPDF + autotable; tabel rapi, angka rata kanan, format IDR
- [ ] Progress indicator saat generate (progress bar untuk laporan tahunan)

### BW-021 · Export Laporan ke Excel — 3 SP
**Referensi:** P1-09 / RPT-06 · **Prioritas:** P1 · **Dependensi:** BW-020
**User story:** Sebagai akuntan, saya ingin mengunduh laporan sebagai Excel, agar bisa diolah lebih lanjut.
**Acceptance criteria:**
- [ ] Export XLSX untuk semua laporan + daftar jurnal
- [ ] Kolom & header rapi; nilai angka (bukan teks) agar bisa dihitung
- [ ] Nama file: `Neraca-Lajur-Maret-2026.xlsx`

### BW-022 · Reverse Jurnal (Pembalik Otomatis) — 5 SP
**Referensi:** P1-13 / JRN-05 / BR-11 · **Prioritas:** P1 · **Dependensi:** BW-009
**User story:** Sebagai akuntan, saya ingin membatalkan jurnal yang sudah diposting, agar koreksi tercatat rapi tanpa menghapus riwayat.
**Acceptance criteria:**
- [ ] Aksi "Reverse" hanya pada jurnal `posted`; bukan hapus
- [ ] Dialog konfirmasi + pratinjau jurnal pembalik (debit↔kredit)
- [ ] Jurnal asal → `reversed`; jurnal pembalik auto-`posted` dengan ref `REV-{{no}}`; saldo kembali
- [ ] Jurnal yang sudah reversed tidak bisa di-reverse lagi
- [ ] Audit trail mencatat aksi reverse (user, timestamp)

### BW-023 · Upload Lampiran Bukti Transaksi — 5 SP
**Referensi:** P1-12 / JRN-06 · **Prioritas:** P1 · **Dependensi:** BW-009
**User story:** Sebagai pemilik usaha, saya ingin melampirkan foto/PDF bukti transaksi, agar semua bukti tersimpan di satu tempat.
**Acceptance criteria:**
- [ ] Upload dari form jurnal (drag-drop + klik) — jpg/png/pdf, maks 5MB, maks 5 file
- [ ] Thumbnail/ikon lampiran tampil di detail jurnal; bisa diunduh
- [ ] Hapus lampiran hanya jika jurnal belum posted
- [ ] Error: "Ukuran file maksimal 5 MB" / "Tipe file tidak didukung"

### BW-024 · Approval Workflow — 8 SP
**Referensi:** P1-14 / JRN-04 · **Prioritas:** P1 · **Dependensi:** BW-008
**User story:** Sebagai manajer keuangan, saya ingin menyetujui atau menolak jurnal sebelum diposting, agar kontrol kualitas pencatatan terjaga.
**Acceptance criteria:**
- [ ] Status baru `pending-approval`; submit dari draft
- [ ] Approve → `posted` (update saldo); Reject → kembali `draft` + alasan wajib
- [ ] Hanya user dengan izin approve yang melihat tombol approve
- [ ] Notifikasi/badge untuk jurnal menunggu approval di dashboard
- [ ] Audit trail: submit/approve/reject tercatat

---

## 8. Sprint 5 — Multi-user: Role, Entitas, Arus Kas, Search

### BW-025 · Role-Based Access (Admin/Akuntan/Viewer) — 8 SP
**Referensi:** P2-16 / SYS-03 · **Prioritas:** P2 · **Dependensi:** BW-024
**User story:** Sebagai admin, saya ingin mengelola pengguna dengan peran berbeda, agar akses ke data keuangan aman.
**Acceptance criteria:**
- [ ] Role: admin (penuh), accountant (entri + approval), viewer (read-only)
- [ ] CRUD user + assign role (halaman Pengaturan → Pengguna)
- [ ] Guard di semua modul: viewer tidak bisa membuat/edit/menghapus jurnal (tombol disabled)
- [ ] Role tercermin di profil & permission (`GET /auth/me`)

### BW-026 · Multi-Entitas (Akuntan Multi-Klien) — 5 SP
**Referensi:** P1 / SYS-02 · **Prioritas:** P1 · **Dependensi:** BW-025
**User story:** Sebagai akuntan freelance, saya ingin berpindah antar perusahaan klien, agar semua laporan klien terkelola dalam satu aplikasi.
**Acceptance criteria:**
- [ ] Entity selector di sidebar; switch → seluruh data berganti (COA, jurnal, laporan)
- [ ] Halaman Pengaturan → Perusahaan: ubah nama, mata uang (IDR), awal tahun fiskal
- [ ] Isolasi data antar entitas (tidak ada data bocor antar klien)
- [ ] Header laporan menampilkan nama entitas aktif

### BW-027 · Pencarian Global (Top Bar) — 3 SP
**Referensi:** P1-11 · **Prioritas:** P1 · **Dependensi:** BW-009
**User story:** Sebagai pengguna, saya ingin mencari jurnal dan akun dari satu kotak pencarian, agar cepat menemukan apa pun.
**Acceptance criteria:**
- [ ] Pencarian dari top bar (debounce 300ms) mencakup jurnal (no. bukti, deskripsi) & akun (kode, nama)
- [ ] Hasil terkelompok per tipe; klik → navigasi ke entitas terkait
- [ ] Empty state: "Tidak ditemukan hasil untuk '{{KEYWORD}}'"

### BW-028 · Laporan Arus Kas (Metode Tidak Langsung) — 8 SP
**Referensi:** P2-15 / RPT-04 · **Prioritas:** P2 · **Dependensi:** BW-016, BW-017
**User story:** Sebagai manajer keuangan, saya ingin melihat arus kas per aktivitas, agar tahu dari mana kas masuk dan keluar.
**Acceptance criteria:**
- [ ] Metode tidak langsung: laba bersih → penyesuaian non-kas → perubahan modal kerja
- [ ] 3 seksi: Operasi, Investasi, Pendanaan
- [ ] Mapping grup akun → aktivitas (dikonfigurasi di Pengaturan)
- [ ] Konsistensi: kas akhir = kas awal + arus kas bersih (unit test)

### BW-029 · States Menyeluruh: Loading, Empty, Error, Edge Cases — 5 SP
**Referensi:** PRD §12 · **Prioritas:** P0 · **Dependensi:** semua modul
**User story:** Sebagai pengguna, saya ingin aplikasi memberi umpan balik yang jelas di setiap kondisi, agar tidak bingung saat error atau data kosong.
**Acceptance criteria:**
- [ ] Skeleton/spinner di semua modul saat loading
- [ ] Empty states sesuai spesifikasi PRD §12.2 (dengan CTA yang relevan)
- [ ] Error banner jaringan + tombol "Muat Ulang"; toast error server
- [ ] Edge cases: periode tertutup, saldo tidak balance, akun non-aktif, double-click, hari libur (warning info)
- [ ] Aksesibilitas dasar: keyboard navigation, focus states, label aria pada ikon

---

## 9. Sprint 6 — Advanced & Polish

### BW-030 · Performance: Virtual Scrolling 10.000 Baris — 8 SP
**Referensi:** NFR / TRD §5 · **Prioritas:** P0 · **Dependensi:** BW-009, BW-011
**User story:** Sebagai pengguna dengan data besar, saya ingin daftar jurnal tetap lancar walau ribuan baris, agar tidak lemot.
**Acceptance criteria:**
- [ ] Tabel jurnal & buku besar menggunakan virtual scrolling (react-virtual)
- [ ] Render 10.000 baris < 2 detik (diukur dengan profiler)
- [ ] Scroll halus tanpa jank; sort/filter tetap responsif
- [ ] Bundle awal < 200KB gzip (code splitting per modul dipertahankan)

### BW-031 · Pembanding Laporan Antar Periode — 5 SP
**Referensi:** P2 · **Prioritas:** P2 · **Dependensi:** BW-016
**User story:** Sebagai manajer keuangan, saya ingin membandingkan laba rugi bulan ini vs bulan lalu, agar melihat tren pertumbuhan.
**Acceptance criteria:**
- [ ] Dropdown "Bandingkan dengan:" di laporan Laba Rugi (dan Neraca)
- [ ] Kolom/baris nilai periode berjalan vs pembanding + selisih
- [ ] Delta % ditampilkan di baris total

### BW-032 · Onboarding Interaktif — 5 SP
**Referensi:** BRD (time-to-first-journal < 5 menit) · **Prioritas:** P1 · **Dependensi:** BW-005
**User story:** Sebagai pengguna baru, saya ingin dipandu langkah demi langkah, agar bisa membuat jurnal pertama dalam 5 menit.
**Acceptance criteria:**
- [ ] Wizard/checklist onboarding: buat entitas → muat template COA → buat jurnal pertama
- [ ] Tooltip/spotlight pada elemen kunci di kunjungan pertama
- [ ] Progress onboarding terlihat; bisa dilewati ("Lewati")
- [ ] Setelah jurnal pertama diposting, onboarding dianggap selesai

### BW-033 · Import/Export COA Excel — 5 SP
**Referensi:** P1 / COA-03 · **Prioritas:** P1 · **Dependensi:** BW-004
**User story:** Sebagai akuntan, saya ingin mengimpor daftar akun dari Excel, agar tidak mengetik ulang akun yang sudah ada.
**Acceptance criteria:**
- [ ] Export COA → XLSX (template)
- [ ] Import XLSX dengan validasi per baris; laporan hasil: `{ imported: 38, failed: 2, errors: [{row, code, message}] }`
- [ ] Baris gagal tidak menggagalkan seluruh import
- [ ] Preview hasil import sebelum konfirmasi final

### BW-034 · Integrasi Bank (Spike + MVP Sederhana) — 13 SP
**Referensi:** P2-17 · **Prioritas:** P2 · **Dependensi:** BW-008
**User story:** Sebagai pemilik usaha, saya ingin melihat transaksi bank otomatis, agar tidak perlu mencatat manual.
**Acceptance criteria:**
- [ ] (Spike) Riset penyedia data bank (mis. integrasi via partner), dokumentasikan keputusan arsitektur
- [ ] Sambungkan akun bank → tarik transaksi → muncul sebagai jurnal draft siap posting
- [ ] Mapping rekonsiliasi: cocokkan transaksi bank dengan jurnal existing (match by nominal/tanggal)
- [ ] Fitur nonaktif (feature flag) jika integrasi belum tersedia

---

## 10. Icebox (Backlog Post-MVP)

| ID | Story | Catatan |
|----|-------|---------|
| BW-100 | Multi-currency (USD, SGD) dengan kurs harian | Menunggu keputusan pertanyaan terbuka PRD §19 |
| BW-101 | Jurnal penyesuaian akhir periode (depresiasi, accrual) | Blokir: butuh formula depresiasi |
| BW-102 | Jurnal berulang (recurring) — sewa, gaji, cicilan | High value untuk Budi |
| BW-103 | Notifikasi & reminder: tagihan jatuh tempo, periode tutup | |
| BW-104 | Integrasi pajak (PPh/PPN) via partner (Klikpajak/OnlinePajak) | BRD §6 |
| BW-105 | PWA offline mode (Service Worker) | TRD constraint |
| BW-106 | Approval dua tingkat (supervisor + direktur) | |
| BW-107 | Report PDF dengan kop & tanda tangan digital | |
| BW-108 | Bahasa Inggris sebagai bahasa kedua (i18n) | |

---

## 11. Catatan Perencanaan

- **Estimasi:** total 197 SP untuk MVP. Dengan kecepatan tim ±15 SP/sprint (2–3 dev), MVP ≈ **12–14 minggu** — konsisten dengan roadmap PRD Ver 3 (Fase 1–5 + Beta).
- **Urutan wajib:** Sprint 1–2 adalah jalur kritis; Sprint 3–4 boleh tumpang tindih jika tim backend lebih dulu menyiapkan API.
- **Tech debt watch:** BW-029 (states) sengaja ditempatkan di akhir agar konsisten, tapi pola empty/error state harus dibuat standar sejak BW-003 (shared components).
- **Ketergantungan eksternal:** BW-034 (bank) & BW-104 (pajak) memerlukan keputusan partnership sebelum sprint dimulai.
- **Kriteria rilis:** semua story P0 selesai + DoD terpenuhi + Beta closed 50 user tanpa error finansial (error rate jurnal < 0,5%).

---

*Backlog ini diturunkan dari PRD Ver 3 (modul §8, aturan bisnis §10, kriteria penerimaan §17, roadmap §18) dan API contract (API - Accounting.md). Estimasi SP perlu dikalibrasi dengan tim di planning poker sprint pertama.*
