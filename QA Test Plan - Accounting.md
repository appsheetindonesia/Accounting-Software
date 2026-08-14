# QA Test Plan — Appsheet Accounting Journal
### Test Case per Modul · Data Mock · Skenario Regresi
### Sumber: Backlog - Accounting.md (BW-001 – BW-034) · PRD Ver 3 §8, §10, §17 · API - Accounting.md

---

## Dokumen Informasi

| Field | Nilai |
|-------|-------|
| **Produk** | Appsheet Accounting Journal (BukuWarung Akuntansi) |
| **Cakupan** | MVP: 34 user stories (BW-001 – BW-034), 6 sprint |
| **Lingkungan uji** | Staging (mock API `localhost:4000`) + prototipe (Vite `localhost:5173`) |
| **Browser target** | Chrome (utama) ≥ 120, Firefox ≥ 121, Safari ≥ 17; mobile 320px |
| **Tipe pengujian** | Unit (logika keuangan), Integration (API), E2E (UI), Manual exploratory |
| **Kriteria rilis** | Semua story P0 lulus + error rate jurnal < 0,5% + tidak ada severity S1/S2 terbuka |

---

## 1. Strategi & Level Pengujian

| Level | Tools | Fokus | Lokasi |
|-------|-------|-------|--------|
| **Unit** | Vitest/Jest | Formula: balance, saldo akun, laba bersih, keseimbangan neraca, nomor bukti | `src/**/*.test.ts` |
| **Integration (API)** | Supertest / curl | Mock API `localhost:4000`: validasi, status code, error envelope, transisi status | `mock-api/` |
| **E2E (UI)** | Playwright | Alur pengguna lintas modul: login → jurnal → laporan → export | `e2e/*.spec.ts` |
| **Manual / Exploratory** | Checklist ini | Visual, responsive, edge cases, aksesibilitas | — |

**Aturan umum:**
- Setiap test dimulai dari **data seed** (state mock API di-reset — restart server).
- Nominal dibandingkan **persis** (integer IDR, tanpa pembulatan).
- Error dibaca dari `{ error: { code, message, details } }` (envelope API).
- Regression test (bagian 4) dijalankan **setiap sprint** sebelum release.

---

## 2. Data Mock Master (Seed)

Data berikut dipakai semua test case. Konsisten dengan `mock-api/src/data.js` & PRD Ver 3 §16. **Reset:** restart mock API server.

### 2.1 Akun (Chart of Accounts)

| Kode | Nama | Tipe | Saldo Normal | Saldo Awal (base) | Header |
|------|------|------|--------------|-------------------|--------|
| 1-1000 | Aktiva Lancar | asset | debit | 0 | ✓ (grup) |
| 1-1100 | Kas Besar | asset | debit | 60.000.000 | |
| 1-1200 | Bank BCA 123456 | asset | debit | 380.000.000 | |
| 1-1300 | Piutang Usaha | asset | debit | 100.000.000 | |
| 1-1400 | Perlengkapan Kantor | asset | debit | 5.000.000 | |
| 2-1000 | Utang Usaha | liability | credit | 105.000.000 | |
| 3-1000 | Modal Pemilik | equity | credit | 363.000.000 | |
| 4-1000 | Pendapatan Jasa | revenue | credit | 130.000.000 | |
| 5-1000 | Beban Gaji | expense | debit | 40.000.000 | |
| 5-2000 | Beban Sewa | expense | debit | 8.000.000 | |
| 5-3000 | Beban Operasional | expense | debit | 3.000.000 | |
| 5-4000 | Beban Penyusutan | expense | debit | 2.000.000 | |

### 2.2 Jurnal Maret 2026 (8 entri seed)

| ID | No. Bukti | Tgl | Deskripsi | Baris (D/K) | Status |
|----|-----------|-----|-----------|-------------|--------|
| JNL-01 | BKM-2026-03-0001 | 05 Mar | Penerimaan jasa konsultasi PT Maju Sejahtera | Kas 25jt / Pendapatan 25jt | **posted** |
| JNL-02 | BKK-2026-03-0002 | 07 Mar | Pembayaran sewa kantor Maret | Beban Sewa 10jt / Kas 10jt | **posted** |
| JNL-03 | BKK-2026-03-0003 | 10 Mar | Pembelian perlengkapan kantor | Beban Operasional 3jt / Kas 3jt | **posted** |
| JNL-04 | BKM-2026-03-0004 | 12 Mar | Penerimaan piutang PT ABC | Kas 15jt / Piutang 15jt | **posted** |
| JNL-05 | JV-2026-03-0005 | 15 Mar | Beban gaji karyawan Maret | Beban Gaji 45jt / Utang Usaha 45jt | **posted** |
| JNL-06 | BKK-2026-03-0006 | 18 Mar | Pembelian peralatan (menunggu approval) | Beban Operasional 5jt / Kas 5jt | **draft** |
| JNL-07 | JV-2026-03-0007 | 20 Mar | Koreksi beban listrik & air | Beban Operasional 2,5jt / Kas 2,5jt | **draft** |
| JNL-08 | BKM-2026-03-0008 | 22 Mar | Penerimaan pendapatan lain (dibatalkan) | Kas 2jt / Pendapatan 2jt | **reversed** |

### 2.3 Angka yang Harus Benar (Baseline)

| Metrik | Nilai | Sumber |
|--------|-------|--------|
| Total jurnal posted | 98.000.000 debit = 98.000.000 kredit | 5 jurnal posted |
| **Saldo Kas Besar (Maret)** | **87.000.000** (60 + 25 − 10 − 3 + 15) | buku besar |
| **Saldo Pendapatan Jasa (Maret)** | **155.000.000** (130 + 25) | buku besar |
| **Total Aset (Neraca per 31 Mar)** | **557.000.000** | Kas 87 + Bank 380 + Piutang 85 + Perlengkapan 5 |
| **Utang Usaha** | **150.000.000** (105 + 45) | — |
| **Modal** | **363.000.000** | — |
| **Laba berjalan** | **44.000.000** (155 − 111) | Pendapatan − beban |
| **Keseimbangan neraca** | Aset 557 = Utang 150 + Modal 363 + Laba 44 | ✓ balanced |
| **Trial balance Maret** | debit 668jt = kredit 668jt | isBalanced = true |
| Laba Rugi Maret | Pendapatan 155jt − Beban 111jt = **Laba bersih 44jt** | — |
| Alert draft jurnal | 2 (JNL-06, JNL-07) | dashboard |

### 2.4 Pengguna & Entitas

| Email | Peran | Entitas |
|-------|-------|---------|
| rina@bukuwarung.com | admin | PT Maju Jaya (ent-001) |
| dimas@majujaya.co.id | accountant | PT Maju Jaya |
| budi@majujaya.co.id | viewer | PT Maju Jaya |
| (opsional) | — | CV Karya Mandiri (ent-002) — untuk BW-026 |

Periode: Maret 2026 = aktif & terbuka; Januari & Februari 2026 = tertutup.

---

## 3. Test Case per Modul

> ID: `TC-<MODUL>-<NOMOR>` · Kolom "AC" = acceptance criteria terkait (BW-xxx) · Severity: S1 kritis / S2 mayor / S3 minor / S4 kosmetik

### 3.1 Layout & Navigasi (BW-001, BW-002)

| ID | Test Case | Langkah | Hasil Diharapkan | AC | Sev |
|----|-----------|---------|------------------|----|-----|
| TC-LAY-01 | Render layout lengkap | Buka aplikasi sebagai Rina | Top bar 64px (logo+nama, search, notif, profil), sidebar 280px 9 modul + "+ Buat Jurnal", bottom bar 32px (versi, periode, koneksi) | BW-001 | S1 |
| TC-LAY-02 | Navigasi 9 modul | Klik tiap item sidebar | Rute berfungsi, item aktif `bg-primary/10` + border-left 3px, URL berubah, lazy loading tanpa error | BW-001/002 | S1 |
| TC-LAY-03 | Sidebar collapsible | Klik toggle | 280px ↔ 64px (ikon saja); state tersimpan; hover `bg-slate-100` | BW-001/002 | S3 |
| TC-LAY-04 | Submenu Laporan Lain | Klik "Laporan Lain" | Expand/collapse submenu; item anak tampil | BW-002 | S3 |
| TC-LAY-05 | Responsive | Resize 1440 / 768 / 375 / 320px | Desktop penuh; tablet sidebar collapse; mobile drawer; tidak ada horizontal scroll | BW-001 | S2 |
| TC-LAY-06 | Tema & font | Inspeksi CSS | Hijau `#0D5C3D` (primary), Inter + JetBrains Mono aktif | BW-001 | S3 |
| TC-LAY-07 | Quick action Buat Jurnal | Klik "+ Buat Jurnal" di sidebar | Navigasi ke form jurnal baru, periode = periode aktif | BW-002 | S2 |

### 3.2 Chart of Accounts (BW-003, BW-004, BW-005, BW-033)

| ID | Test Case | Langkah | Hasil Diharapkan | AC | Sev |
|----|-----------|---------|------------------|----|-----|
| TC-COA-01 | Tree view 5 tipe | Buka modul COA | Tree dengan 5 tipe akun, indentasi bertingkat, expand/collapse per grup, ikon + badge tipe, baris berisi kode+nama+saldo IDR | BW-003 | S1 |
| TC-COA-02 | Saldo akun akurat | Bandingkan saldo tree vs buku besar | Kas Besar = 87.000.000; akun header (1-1000) = jumlah anak 557jt | BW-003 | S1 |
| TC-COA-03 | Empty state COA | Reset data tanpa template, buka COA | "Chart of Account masih kosong. Buat akun pertama Anda." + CTA Muat Template | BW-003 | S3 |
| TC-COA-04 | Loading skeleton | Simulasi delay API | Skeleton 5 baris saat loading | BW-003 | S3 |
| TC-COA-05 | Buat akun valid | Form tambah: `1-1500` Kas Kecil, asset, debit, parent 1-1000 | 201; akun muncul di tree di bawah parent, saldo 0 | BW-004 | S1 |
| TC-COA-06 | Kode duplikat | Buat akun kode `1-1100` | Toast 409 "Kode akun sudah digunakan"; form tetap terbuka | BW-004 | S2 |
| TC-COA-07 | Format kode invalid | Kode `abc` / `11x00` | "Format kode tidak valid" (422 `INVALID_CODE_FORMAT`) | BW-004 | S2 |
| TC-COA-08 | Hapus akun ber-anak | Coba hapus 1-1000 (punya 4 anak aktif) | Diblokir 409 "Akun induk tidak bisa dihapus jika memiliki sub-akun aktif" | BW-004 | S2 |
| TC-COA-09 | Hapus akun ber-saldo | Coba hapus 1-1100 (saldo 87jt) | Warning konfirmasi; hanya bisa dinonaktifkan (409 `ACCOUNT_HAS_BALANCE`) | BW-004 | S2 |
| TC-COA-10 | Non-aktifkan akun | Deactivate 1-1400 | Status non-aktif; tidak muncul di dropdown akun jurnal | BW-004 | S2 |
| TC-COA-11 | Saldo tidak editable | Buka form edit akun | Tidak ada field saldo; saldo hanya berubah via jurnal | BW-004 | S2 |
| TC-COA-12 | Muat template PSAK | Klik "Muat Template UKM PSAK" (COA kosong) | ≥40 akun standar ter-muat; toast "Template berhasil dimuat"; tree menampilkan akun baru | BW-005 | S1 |
| TC-COA-13 | Template saat COA terisi | COA terisi → muat template | Dialog konfirmasi replace vs merge; replace tanpa konfirmasi → 409 `ACCOUNTS_EXIST` | BW-005 | S2 |
| TC-COA-14 | Export COA Excel | Klik export → XLSX | File `chart-of-accounts.xlsx` terunduh; header rapi; nilai angka | BW-033 | S2 |
| TC-COA-15 | Import COA dengan error baris | Upload XLSX berisi 1 baris duplikat | Laporan `{ imported, failed, errors: [{row, code, message}] }`; baris gagal tidak menggagalkan seluruh import; preview sebelum konfirmasi | BW-033 | S2 |

### 3.3 Jurnal — Form & Entri (BW-006, BW-007)

| ID | Test Case | Langkah | Hasil Diharapkan | AC | Sev |
|----|-----------|---------|------------------|----|-----|
| TC-JRN-01 | Form lengkap | Buka "+ Buat Jurnal" | Field: tanggal, no. bukti (auto), deskripsi, baris (dropdown akun, deskripsi, debit, kredit); akun dropdown hanya aktif | BW-006 | S1 |
| TC-JRN-02 | Auto-balance footer | Ketik debit 10jt baris 1 | Footer total live; debit≠kredit → pesan "Total debit (10.000.000) dan kredit (0) harus sama. Selisih: 10.000.000" | BW-006 | S1 |
| TC-JRN-03 | Tombol Posting non-aktif | Form belum balance | Tombol Posting disabled | BW-006 | S1 |
| TC-JRN-04 | Debit XOR kredit | Isi debit & kredit di baris sama | Ditolak (422 `LINE_BOTH_SIDES`); salah satu wajib 0 | BW-006 | S2 |
| TC-JRN-05 | Nilai negatif | Ketik debit −5.000 | Ditolak (422 `LINE_NEGATIVE_AMOUNT`) | BW-006 | S2 |
| TC-JRN-06 | Minimal 1D+1K | Simpan dengan 1 baris saja | Gagal (422 `JOURNAL_NO_LINES`); minimal 1 debit + 1 kredit | BW-006 | S2 |
| TC-JRN-07 | Tambah/hapus baris | Klik + baris / hapus baris | Baris dinamis bertambah/berkurang; total live ter-update | BW-006 | S3 |
| TC-JRN-08 | Format IDR saat ketik | Ketik 15000000 | Muncul 15.000.000 otomatis; Tab/Enter menambah baris | BW-006 | S3 |
| TC-JRN-09 | Akun non-aktif tidak muncul | Cari akun yang di-deactivate | Tidak tampil di dropdown | BW-006 | S2 |
| TC-JRN-10 | No. bukti auto-format | Buka form baru periode 2026-03 prefix BKM | `BKM-2026-03-0009` (dari `GET /journals/next-number`); format `{{PREFIX}}-{{TAHUN}}-{{BULAN}}-{{NOMOR}}` | BW-007 | S1 |
| TC-JRN-11 | No. bukti manual + duplikat | Ketik `BKM-2026-03-0001` manual | Error "Nomor bukti sudah digunakan" (409 `TRANSACTION_NUMBER_DUPLICATE`) | BW-007 | S2 |
| TC-JRN-12 | Unik per periode | Next-number periode 2026-04 | Mulai dari `-0001` (nomor tidak nyambung antar periode) | BW-007 | S2 |

### 3.4 Jurnal — Simpan, Posting, Edit, Hapus (BW-008, BW-009, BW-013)

| ID | Test Case | Langkah | Hasil Diharapkan | AC | Sev |
|----|-----------|---------|------------------|----|-----|
| TC-JRN-20 | Simpan draft | Isi jurnal balance → Simpan Draft | Status `draft`; **saldo tidak berubah**; tidak muncul di laporan; toast "Jurnal disimpan sebagai draft" | BW-008 | S1 |
| TC-JRN-21 | Posting jurnal 10jt | Buat & posting: Kas 10jt / Pendapatan 10jt (BKM-2026-03-0009) | Status `posted`; Kas 87→97jt; Pendapatan 155→165jt (cek COA & dashboard); toast "Jurnal berhasil diposting" | BW-008 | S1 |
| TC-JRN-22 | Posting periode tertutup | Buat jurnal tgl 2026-02-15 (Februari tertutup) → Posting | Diblokir "Periode Februari 2026 sudah ditutup" (422 `PERIOD_CLOSED`) | BW-008 | S1 |
| TC-JRN-23 | Draft editable & hapus | Edit draft JNL-07 → simpan; hapus draft JNL-06 | Edit berhasil tanpa ubah saldo; hapus dengan dialog "Yakin ingin menghapus jurnal ini?" → hilang dari daftar | BW-008/013 | S1 |
| TC-JRN-24 | Posted read-only | Buka jurnal posted JNL-01 | Form terkunci (disabled); tombol edit disabled + tooltip | BW-008/013 | S2 |
| TC-JRN-25 | Double-click submit | Klik Posting 2× cepat | Tombol disabled + "Menyimpan..."; hanya 1 jurnal dibuat | BW-008 | S2 |
| TC-JRN-26 | Tabel daftar jurnal | Buka modul Jurnal | Kolom Tgl/No. Bukti/Keterangan (line-item dikelompokkan)/Debit/Kredit; badge status Draft(slate)/Posted(green)/Reversed(red) | BW-009 | S1 |
| TC-JRN-27 | Footer agregat | Periksa footer daftar | Total debit = total kredit = 98.000.000 (seed), selisih 0 | BW-009 | S1 |
| TC-JRN-28 | Expand detail baris | Klik expand jurnal | Detail + line-items + lampiran (placeholder); aksi Lihat Detail/Edit/Posting/Reverse/Hapus sesuai status | BW-009 | S3 |
| TC-JRN-29 | Empty state jurnal | Filter sehingga kosong / entitas baru | "Belum ada transaksi. Mulai catat jurnal pertama Anda!" + CTA | BW-009 | S3 |
| TC-JRN-30 | Audit trail | Buka detail JNL-01 | Riwayat create (Rina 09:10), post (Rina 09:12) dengan user+timestamp; edit draft menambah entry `update` | BW-013 | S2 |
| TC-JRN-31 | Edit draft via If-Match lama | Buka tab lain, edit draft, lalu edit lagi dengan versi lama (simulasi 409) | 409 `DATA_CONFLICT` "Data sudah diubah oleh pengguna lain. Muat ulang halaman." | BW-013 | S3 |

### 3.5 Buku Besar (BW-010)

| ID | Test Case | Langkah | Hasil Diharapkan | AC | Sev |
|----|-----------|---------|------------------|----|-----|
| TC-GL-01 | Buku besar Kas Besar Maret | Buka Buku Besar → 1-1100, periode 2026-03 | Header kode+nama+periode; 4 baris + Saldo Awal 60jt + Saldo Akhir 87jt; saldo berjalan: 85 / 75 / 72 / 87 | BW-010 | S1 |
| TC-GL-02 | Saldo awal & akhir | Periksa baris pertama & terakhir | Baris "Saldo Awal" (60jt) & footer "Saldo Akhir" (87jt) | BW-010 | S1 |
| TC-GL-03 | Hanya posted yang muncul | Cek jurnal draft JNL-06/07 di semua buku besar | Tidak muncul (draft tidak mempengaruhi buku besar) | BW-010 | S1 |
| TC-GL-04 | Nav periode | Klik prev/next periode | Periode berganti, data re-fetch; periode Jan/Feb tetap bisa dibaca | BW-010 | S3 |
| TC-GL-05 | Klik Ref → detail | Klik ref BKM-2026-03-0001 | Buka detail jurnal sumber | BW-010 | S3 |
| TC-GL-06 | Rekap semua akun | Buka `/ledger` rekap | Semua akun dengan opening, total D/K, closing; header tidak muncul | BW-010 | S2 |

### 3.6 Filter, Pencarian, Pencarian Global (BW-011, BW-027)

| ID | Test Case | Langkah | Hasil Diharapkan | AC | Sev |
|----|-----------|---------|------------------|----|-----|
| TC-FLT-01 | Filter tanggal | Rentang 01–10 Mar | Hanya jurnal JNL-01/02/03; footer agregat mengikuti filter | BW-011 | S1 |
| TC-FLT-02 | Filter status multi | status=posted,draft | 5 posted + 2 draft tampil; reversed tidak | BW-011 | S2 |
| TC-FLT-03 | Filter akun | accountId=1-1100 | Hanya jurnal yang menyentuh Kas Besar (JNL-01,02,03,04) | BW-011 | S2 |
| TC-FLT-04 | Kombinasi filter | status=posted & keyword=sewa | Hanya JNL-02 (BKK-0002 sewa, posted) | BW-011 | S2 |
| TC-FLT-05 | Keyword debounce | Ketik "sewa" | Setelah 300ms hasil = 1 jurnal; empty state "Tidak ditemukan jurnal dengan kata kunci 'xyz'" | BW-011 | S3 |
| TC-FLT-06 | URL search params | Filter lalu refresh | Filter tersimpan di URL (`?period=&status=`), re-render sama | BW-011 | S3 |
| TC-SRC-01 | Search top bar | Ketik "bkm" | Hasil jurnal (no. bukti) & akun (kode/nama); terkelompok per tipe; klik → navigasi | BW-027 | S2 |
| TC-SRC-02 | Search empty | Ketik "zzz" | "Tidak ditemukan hasil untuk 'zzz'" | BW-027 | S3 |

### 3.7 Periode Fiskal (BW-012, BW-019)

| ID | Test Case | Langkah | Hasil Diharapkan | AC | Sev |
|----|-----------|---------|------------------|----|-----|
| TC-PER-01 | Daftar periode | Pengaturan → Periode | Bulan/tahun/rentang/status; Maret aktif terbuka; Jan & Feb terkunci; badge "Terkunci" | BW-012 | S1 |
| TC-PER-02 | Satu periode aktif | Klik activate April | April jadi aktif; Maret tidak; default entri jurnal baru = April | BW-012 | S1 |
| TC-PER-03 | Tutup periode + draft | Tutup Maret dengan dialog | Dialog konfirmasi + pilihan post-all / delete-all / keep; `handledDrafts` sesuai aksi | BW-012 | S1 |
| TC-PER-04 | Tutup tanpa konfirmasi draft | Maret masih punya 2 draft → tutup tanpa pilih aksi | 422 `DRAFT_ACTION_REQUIRED` "Masih ada jurnal draft; pilih aksi terlebih dahulu" | BW-012 | S2 |
| TC-PER-05 | Blokir setelah tutup | Tutup Maret → buat/posting jurnal Maret | Diblokir di semua modul dengan warning jelas; laporan Maret tetap bisa dibaca | BW-012 | S1 |
| TC-PER-06 | Tutup 2× | Tutup periode yang sudah tertutup | 409 `PERIOD_ALREADY_CLOSED` | BW-012 | S3 |
| TC-PER-07 | Selektor global | Ganti periode di sidebar → buka Laba Rugi/Neraca/Buku Besar/Dashboard | Semua modul re-fetch & re-render sesuai periode; URL `?period=2026-03`; bisa di-share | BW-019 | S1 |

### 3.8 Dashboard (BW-014, BW-015)

| ID | Test Case | Langkah | Hasil Diharapkan | AC | Sev |
|----|-----------|---------|------------------|----|-----|
| TC-DSH-01 | 4 kartu saldo | Buka Dashboard | Total Aset 557jt, Total Utang 150jt, Total Modal 363jt, Laba Bruto 44jt (IDR) | BW-014 | S1 |
| TC-DSH-02 | Delta & warna | Periksa kartu | Panah ▲/▼ + delta %; utang naik = merah, aset naik = hijau | BW-014 | S2 |
| TC-DSH-03 | Klik kartu → laporan | Klik kartu Total Aset | Navigasi ke Neraca | BW-014 | S3 |
| TC-DSH-04 | Grafik tren 6 bulan | Periksa grafik | Bar chart Okt 2025 – Mar 2026 (Recharts, lazy-loaded) | BW-015 | S2 |
| TC-DSH-05 | Jurnal terbaru 5 | Periksa panel | 5 jurnal terbaru + link "Lihat Semua" → modul Jurnal | BW-015 | S2 |
| TC-DSH-06 | Peringatan | Periksa panel alert | 2 alert: jurnal draft belum diposting (count 2), periode Februari belum ditutup (info) | BW-015 | S2 |
| TC-DSH-07 | Alert klikable | Klik alert draft jurnal | Navigasi ke tempat perbaikan (modul Jurnal filter draft) | BW-015 | S3 |
| TC-DSH-08 | Skeleton loading | Simulasi delay | Skeleton saat data dimuat, bukan spinner kosong | BW-014 | S3 |
| TC-DSH-09 | Live update setelah posting | Posting jurnal 10jt → kembali ke Dashboard | Aset 557→567jt; Laba Bruto 44→54jt | BW-014 | S1 |

### 3.9 Laporan — Laba Rugi, Neraca, Neraca Lajur (BW-016, BW-017, BW-018, BW-031)

| ID | Test Case | Langkah | Hasil Diharapkan | AC | Sev |
|----|-----------|---------|------------------|----|-----|
| TC-RPT-01 | Laba Rugi Maret | Buka laporan, periode 2026-03 | Header perusahaan+judul+periode; section PENDAPATAN (subtotal 155jt) & BEBAN (111jt); **LABA/RUGI BERSIH 44jt bold** | BW-016 | S1 |
| TC-RPT-02 | Akurasi laba bersih | Hitung ulang dari seed | 155jt − 111jt = 44jt (unit test juga) | BW-016 | S1 |
| TC-RPT-03 | Laba Rugi empty | Periode tanpa transaksi | "Belum ada transaksi di periode ini" + link buat jurnal | BW-016 | S3 |
| TC-RPT-04 | Indentasi akun | Periksa baris laporan | Indentasi sesuai hierarki; format IDR konsisten | BW-016 | S3 |
| TC-RPT-05 | Neraca per tanggal | Buka Neraca, asOf 2026-03-31 | "Per 31 Maret 2026"; section ASET & KEWAJIBAN+EKUITAS; laba berjalan di ekuitas | BW-017 | S1 |
| TC-RPT-06 | Keseimbangan neraca | Periksa indikator | Aset 557jt = Kewajiban+Ekuitas 557jt → ✓ hijau; jika dipecah saldo → ✗ merah + selisih | BW-017 | S1 |
| TC-RPT-07 | Unit test neraca | Jalankan test formula | `balance_sheet` seimbang dengan data mock | BW-017 | S1 |
| TC-RPT-08 | Neraca Lajur | Buka trial balance Maret | Semua akun (kode, nama, debit, kredit); total debit = kredit = 668jt; ✓ indikator | BW-018 | S1 |
| TC-RPT-09 | Klik baris neraca lajur | Klik Kas Besar | Navigasi ke Buku Besar akun | BW-018 | S3 |
| TC-RPT-10 | Akun saldo awal muncul | Akun tanpa transaksi tapi ber-saldo awal | Muncul di neraca lajur | BW-018 | S3 |
| TC-RPT-11 | Pembanding antar periode | Laba Rugi → "Bandingkan dengan: 2026-02" | Kolom/baris periode berjalan vs pembanding + selisih + delta % di total | BW-031 | S2 |

### 3.10 Export PDF & Excel (BW-020, BW-021)

| ID | Test Case | Langkah | Hasil Diharapkan | AC | Sev |
|----|-----------|---------|------------------|----|-----|
| TC-EXP-01 | Export PDF Laba Rugi | Export dari Laba Rugi Maret | File `Laba-Rugi-Maret-2026.pdf`; berisi kop, judul, periode, isi, footer; angka rata kanan IDR | BW-020 | S1 |
| TC-EXP-02 | Export PDF Neraca | Export Neraca per 31 Mar | `Neraca-31-Maret-2026.pdf`; isi benar | BW-020 | S2 |
| TC-EXP-03 | Export PDF Buku Besar & Jurnal | Export GL & daftar jurnal | File terunduh, format rapi | BW-020 | S2 |
| TC-EXP-04 | Progress indicator | Generate laporan besar | Progress bar saat generate (laporan tahunan) | BW-020 | S3 |
| TC-EXP-05 | Export XLSX | Export Neraca Lajur → Excel | `Neraca-Lajur-Maret-2026.xlsx`; kolom rapi; **nilai angka (bukan teks)** agar bisa dihitung | BW-021 | S2 |
| TC-EXP-06 | Konsistensi angka export | Bandingkan PDF/XLSX vs layar | Angka identik dengan laporan di layar | BW-020/021 | S1 |
| TC-EXP-07 | Export unsupported format | `format=docx` | 422 `UNSUPPORTED_FORMAT` | API | S3 |

### 3.11 Reverse, Lampiran, Approval (BW-022, BW-023, BW-024)

| ID | Test Case | Langkah | Hasil Diharapkan | AC | Sev |
|----|-----------|---------|------------------|----|-----|
| TC-RVS-01 | Reverse hanya posted | Cek aksi di jurnal draft | Tombol Reverse hanya di jurnal posted; bukan hapus | BW-022 | S1 |
| TC-RVS-02 | Reverse + pratinjau | Reverse JNL-01 (Kas 25 / Pendapatan 25) | Dialog konfirmasi + pratinjau jurnal pembalik (D↔K); asal → `reversed`; pembalik auto-`posted` ref `REV-BKM-2026-03-0001` | BW-022 | S1 |
| TC-RVS-03 | Saldo kembali setelah reverse | Setelah TC-RVS-02, cek saldo | Kas 87→62jt (25jt keluar); Pendapatan 155→130jt; **pasangan asli+pembalik net 0** | BW-022 | S1 |
| TC-RVS-04 | Double reverse diblokir | Reverse jurnal yang sudah reversed | 409 `ALREADY_REVERSED`; tombol non-aktif | BW-022 | S2 |
| TC-RVS-05 | Audit trail reverse | Periksa audit trail jurnal asal | Entry `reverse` (user, timestamp) tercatat | BW-022 | S2 |
| TC-ATT-01 | Upload bukti | Upload dari form jurnal (drag-drop & klik) | jpg/png/pdf diterima; maks 5MB & 5 file; thumbnail/ikon di detail; bisa diunduh | BW-023 | S1 |
| TC-ATT-02 | File terlalu besar | Upload 6MB | Error "Ukuran file maksimal 5 MB" (422 `FILE_TOO_LARGE`) | BW-023 | S2 |
| TC-ATT-03 | Tipe tidak didukung | Upload .exe/.zip | Error "Tipe file tidak didukung" (422 `UNSUPPORTED_FILE_TYPE`) | BW-023 | S2 |
| TC-ATT-04 | Hapus lampiran posted | Coba hapus lampiran jurnal posted | Diblokir 409 `JOURNAL_ALREADY_POSTED` (hanya sebelum posted) | BW-023 | S2 |
| TC-APR-01 | Submit draft → pending | Submit JNL-07 | Status `pending-approval`; muncul di daftar & alert dashboard | BW-024 | S1 |
| TC-APR-02 | Approve → posted | Approve sebagai admin (Rina) | Status `posted`; saldo ter-update; `approvedBy`/`approvedAt` terisi | BW-024 | S1 |
| TC-APR-03 | Reject → draft + alasan | Reject dengan alasan | Kembali `draft`; alasan wajib (kosong → ditolak); `rejectionReason` tersimpan | BW-024 | S2 |
| TC-APR-04 | Izin approve | Login sebagai Dimas (accountant, tanpa approve) | Tombol approve tidak muncul (403 `NO_APPROVAL_RIGHTS` jika dipaksa) | BW-024 | S1 |
| TC-APR-05 | Badge approval | Periksa dashboard | Notifikasi/badge jurnal menunggu approval | BW-024 | S3 |
| TC-APR-06 | Transisi invalid | Approve jurnal draft (belum submit) | 409 `INVALID_STATUS_TRANSITION` | BW-024 | S2 |

### 3.12 Role & Entitas (BW-025, BW-026)

| ID | Test Case | Langkah | Hasil Diharapkan | AC | Sev |
|----|-----------|---------|------------------|----|-----|
| TC-RLE-01 | CRUD user | Admin → Pengaturan → Pengguna | Tambah/ubah/non-aktifkan user + assign role; 409 `EMAIL_EXISTS` untuk duplikat | BW-025 | S1 |
| TC-RLE-02 | Guard viewer | Login Budi (viewer) | Semua aksi tulis disabled (buat/edit/hapus jurnal); hanya baca | BW-025 | S1 |
| TC-RLE-03 | Guard akuntan | Login Dimas | Bisa entri jurnal, tidak bisa kelola user (403) | BW-025 | S2 |
| TC-RLE-04 | Permission /auth/me | Cek `GET /auth/me` tiap role | `permissions` sesuai role: admin 8 izin, accountant 4, viewer 2 | BW-025 | S2 |
| TC-RLE-05 | Switch entitas | Akuntan → dropdown entitas → CV Karya Mandiri | Seluruh data berganti (COA, jurnal, laporan); header laporan menampilkan nama entitas aktif | BW-026 | S1 |
| TC-RLE-06 | Isolasi data | Di ent-002, cari jurnal ent-001 | Tidak ada data bocor antar klien (filter `X-Entity-Id`) | BW-026 | S1 |
| TC-RLE-07 | Pengaturan perusahaan | Pengaturan → Perusahaan | Ubah nama, mata uang (IDR), awal tahun fiskal | BW-026 | S2 |

### 3.13 States, Aksesibilitas, Edge Cases (BW-029)

| ID | Test Case | Langkah | Hasil Diharapkan | AC | Sev |
|----|-----------|---------|------------------|----|-----|
| TC-STT-01 | Skeleton semua modul | Buka tiap modul dengan delay | Skeleton/spinner di semua modul saat loading | BW-029 | S2 |
| TC-STT-02 | Error banner jaringan | Matikan server → aksi | Error banner + tombol "Muat Ulang"; toast error server | BW-029 | S1 |
| TC-STT-03 | Edge: periode tertutup | Posting di periode tertutup | Blokir + pesan jelas (lihat TC-JRN-22) | BW-029 | S1 |
| TC-STT-04 | Edge: saldo tidak balance | Jurnal draft tidak balance | Alert dashboard "Terdapat jurnal draft tidak balance" | BW-029 | S2 |
| TC-STT-05 | Edge: akun non-aktif | Pilih akun non-aktif di form | Tidak tersedia di dropdown | BW-029 | S2 |
| TC-STT-06 | Keyboard navigation | Tab/SHIFT+Tab di form jurnal | Fokus berpindah logis; focus ring terlihat | BW-029 | S2 |
| TC-STT-07 | Label aria | Inspeksi ikon & tombol ikon | Label aria pada semua ikon; tooltip | BW-029 | S3 |
| TC-STT-08 | Edge: double-click | Submit 2× | 1 jurnal saja (lihat TC-JRN-25) | BW-029 | S2 |

### 3.14 Performance (BW-030)

| ID | Test Case | Langkah | Hasil Diharapkan | AC | Sev |
|----|-----------|---------|------------------|----|-----|
| TC-PRF-01 | Virtual scrolling | Muat 10.000 baris jurnal | Tabel & buku besar virtual-scroll; scroll halus tanpa jank | BW-030 | S1 |
| TC-PRF-02 | Render < 2 detik | Ukur dengan profiler | Render 10.000 baris < 2 detik | BW-030 | S1 |
| TC-PRF-03 | Sort/filter responsif | Filter di data besar | Tetap responsif (tidak freeze) | BW-030 | S2 |
| TC-PRF-04 | Bundle size | Ukur bundle produksi | Awal < 200KB gzip (code splitting per modul) | BW-030 | S2 |

### 3.15 Onboarding & Bank (BW-032, BW-034)

| ID | Test Case | Langkah | Hasil Diharapkan | AC | Sev |
|----|-----------|---------|------------------|----|-----|
| TC-ONB-01 | Wizard onboarding | User baru masuk | Checklist: buat entitas → muat template COA → jurnal pertama; tooltip/spotlight elemen kunci; tombol "Lewati" | BW-032 | S1 |
| TC-ONB-02 | Selesai setelah jurnal pertama | Posting jurnal pertama | Onboarding dianggap selesai; progress tersimpan | BW-032 | S2 |
| TC-ONB-03 | Time-to-first-journal | Ukur dari first login | < 5 menit (target BRD) | BW-032 | S2 |
| TC-BNK-01 | Feature flag bank | Cek menu integrasi bank tanpa partner | Fitur nonaktif (feature flag) dengan pesan jelas | BW-034 | S3 |
| TC-BNK-02 | Tarik transaksi (jika aktif) | Sambungkan akun bank | Transaksi muncul sebagai jurnal draft siap posting | BW-034 | S1 |
| TC-BNK-03 | Rekonsiliasi match | Transaksi bank vs jurnal existing | Match by nominal/tanggal; yang cocok ditandai | BW-034 | S2 |

---

## 4. Skenario Regresi (di jalankan setiap sprint sebelum release)

> Setiap skenario berakhir dengan **verifikasi keseimbangan buku** — aset = utang + modal + laba, dan trial balance seimbang. Nama file: `e2e/regression.spec.ts` (Playwright).

| ID | Skenario | Langkah Inti | Verifikasi Kunci |
|----|----------|--------------|------------------|
| **RG-01** | Siklus hidup jurnal penuh | Login → buat jurnal 10jt → draft → posting → cek saldo COA & dashboard → edit draft lain → hapus draft | Saldo Kas 87→97jt; draft tidak mengubah saldo; hapus draft tidak mengubah saldo |
| **RG-02** | Reverse menyeluruh | Posting jurnal → reverse → cek saldo & laporan | Kas kembali ke kondisi sebelum posting; trial balance tetap seimbang; jurnal asal `reversed` + pembalik `posted` |
| **RG-03** | Posting → laporan → export | Posting jurnal baru → buka Laba Rugi/Neraca/Neraca Lajur → export PDF & XLSX | Angka laporan & export konsisten dengan saldo baru; neraca seimbang |
| **RG-04** | Tutup periode | Tutup Maret (post-all draft) → coba entri/posting → buka laporan | Entri/posting diblokir; laporan tetap bisa dibaca; draft ter-post via `post-all` muncul di laporan |
| **RG-05** | Multi-entitas | Switch ke ent-002 → buat jurnal → switch balik ke ent-001 | Data terisolasi; tidak ada silang; header entitas benar |
| **RG-06** | Approval flow | Submit → approve (saldo berubah) → submit → reject (kembali draft, saldo tidak berubah) | Saldo hanya berubah saat approve; audit trail lengkap |
| **RG-07** | Filter & search lintas modul | Filter jurnal → search global → klik hasil → buka detail | Navigasi benar; filter tersimpan di URL; keyword konsisten |
| **RG-08** | Selektor periode global | Ganti periode → semua laporan re-fetch | Dashboard, Laba Rugi, Neraca, Buku Besar, Neraca Lajur sinkron |
| **RG-09** | Data besar | Muat 10.000 jurnal → scroll, filter, export | < 2 detik render, tanpa jank, angka tetap benar |
| **RG-10** | Restart & persistensi | Posting jurnal → restart server | Data kembali ke seed (in-memory) — **dokumentasikan**; tidak ada error UI setelah restart |
| **RG-11** | Regresi lintas browser | Jalankan suite E2E di Chrome + Firefox | Tidak ada perbedaan perilaku; layout mobile 320px OK |
| **RG-12** | Error handling | Server mati → semua modul | Banner error + "Muat Ulang"; tidak ada crash/halaman putih |

**Smoke test cepat (setiap deploy):** login → dashboard 4 kartu → 1 posting → neraca seimbang → export PDF.

---

## 5. Matriks Traceability (Ringkas)

| Sprint | Story | Test Case |
|--------|-------|-----------|
| 1 | BW-001/002 | TC-LAY-01–07 |
| 1 | BW-003 | TC-COA-01–04 |
| 1 | BW-004 | TC-COA-05–11 |
| 1 | BW-005 | TC-COA-12–13 |
| 1 | BW-006 | TC-JRN-01–09 |
| 1 | BW-007 | TC-JRN-10–12 |
| 1 | BW-008 | TC-JRN-20–25 |
| 1 | BW-009 | TC-JRN-26–29 |
| 2 | BW-010 | TC-GL-01–06 |
| 2 | BW-011 | TC-FLT-01–06 |
| 2 | BW-012 | TC-PER-01–06 |
| 2 | BW-013 | TC-JRN-30–31 |
| 2 | BW-014/015 | TC-DSH-01–09 |
| 3 | BW-016 | TC-RPT-01–04 |
| 3 | BW-017 | TC-RPT-05–07 |
| 3 | BW-018 | TC-RPT-08–10 |
| 3 | BW-019 | TC-PER-07 |
| 4 | BW-020/021 | TC-EXP-01–07 |
| 4 | BW-022 | TC-RVS-01–05 |
| 4 | BW-023 | TC-ATT-01–04 |
| 4 | BW-024 | TC-APR-01–06 |
| 5 | BW-025 | TC-RLE-01–04 |
| 5 | BW-026 | TC-RLE-05–07 |
| 5 | BW-027 | TC-SRC-01–02 |
| 5 | BW-028 | TC-CFL-01–03 (lihat di bawah) |
| 5 | BW-029 | TC-STT-01–08 |
| 6 | BW-030 | TC-PRF-01–04 |
| 6 | BW-031 | TC-RPT-11 |
| 6 | BW-032 | TC-ONB-01–03 |
| 6 | BW-033 | TC-COA-14–15 |
| 6 | BW-034 | TC-BNK-01–03 |
| — | Semua | RG-01–12 |

### Arus Kas (BW-028) — test case tambahan

| ID | Test Case | Langkah | Hasil Diharapkan | AC | Sev |
|----|-----------|---------|------------------|----|-----|
| TC-CFL-01 | 3 seksi arus kas | Buka laporan Arus Kas Maret | Seksi Operasi / Investasi / Pendanaan dengan subtotal; metode tidak langsung | BW-028 | S1 |
| TC-CFL-02 | Konsistensi kas | Cek formula | Kas akhir = kas awal + arus kas bersih (unit test) | BW-028 | S1 |
| TC-CFL-03 | Mapping grup akun | Ubah mapping di Pengaturan | Perubahan mapping tercermin di laporan | BW-028 | S2 |

---

## 6. Severity, Status, & Laporan

### 6.1 Severity

| Sev | Definisi | Contoh |
|-----|----------|--------|
| **S1 Kritis** | Saldo/laporan salah, data hilang, crash, blokir total | Salah hitung laba bersih, neraca tidak seimbang |
| **S2 Mayor** | Fitur tidak berfungsi penuh, workaround sulit | Reverse diblokir, filter salah |
| **S3 Minor** | Workaround ada, UX terganggu | Toast kurang jelas, skeleton tidak muncul |
| **S4 Kosmetik** | Visual/spacing, tanpa dampak fungsi | Warna badge, padding |

### 6.2 Status test case

`Not Run` → `In Progress` → `Pass` / `Fail` / `Blocked` (sebutkan alasan) / `N/A`

### 6.3 Format laporan bug (dipakai template issue GitHub)

```markdown
**Judul:** [MODUL] deskripsi singkat
**Severity:** S1/S2/S3/S4 · **Browser:** Chrome 126 / ...
**Langkah reproduksi:** 1. ... 2. ...
**Aktual:** ... **Ekspektasi:** ...
**Kode error API:** JOURNAL_UNBALANCED / ...
**Lampiran:** screenshot / video / log
```

---

## 7. Checklist Rilis (Release Gate)

- [ ] Semua test case P0 (S1) **Pass** — tidak ada S1/S2 terbuka
- [ ] RG-01–12 **Pass** di Chrome + Firefox
- [ ] Unit test logika keuangan ≥ 80% coverage (balance, saldo, laporan, arus kas, nomor bukti)
- [ ] Error rate jurnal (beta) < 0,5%
- [ ] Neraca seimbang & trial balance seimbang pada data seed + data hasil pengujian
- [ ] Mobile 320px & tablet tanpa error layout
- [ ] Aksesibilitas dasar: keyboard nav + focus state + label aria
- [ ] Semua story P0 backlog selesai & ditandai QA Pass

---

*Test plan ini diturunkan dari acceptance criteria di `Backlog - Accounting.md`, spesifikasi modul & aturan bisnis di `PRD Ver 3 - Accounting.md`, dan perilaku endpoint di `API - Accounting.md` / `mock-api/` (verifikasi nyata: posting 10jt → saldo berubah, reverse → kembali net 0, trial balance 668=668, neraca 557=557).*
