# Changelog — Appsheet Accounting Journal

Semua perubahan penting dicatat di sini. Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/), versi mengikuti [Semantic Versioning](https://semver.org/).

## [v0.1.0] — 2026-08-15

### Ringkasan

Rilis pertama — prototipe fungsional aplikasi akuntansi *double-entry* lengkap dengan **mock API server** (kontrak REST sesuai `API - Accounting.md`), **modul pelaporan live**, **autentikasi + refresh token**, **mode offline dengan sinkronisasi antrian**, dan **CI 3-job paralel**. Semua laporan dihitung dari jurnal yang di-posting; identitas akuntansi (debit = kredit, Aset = Kewajiban + Ekuitas) dijaga dan diuji otomatis.

---

### Fitur

**Prototipe (Vite + React + Tailwind) — `prototype-accounting/`**
- **Autentikasi sungguhan**: login email/password (`POST /auth/login`), **refresh token otomatis** saat 401, logout membersihkan sesi lokal, sesi dipersist lintas reload
- **Dashboard**: 4 kartu saldo live (Aset / Utang / Modal / Laba Bruto), grafik Laba Rugi 6 bulan, peringatan, jurnal terbaru
- **Jurnal**: entri jurnal auto-balance (debit = kredit), nomor bukti otomatis (BKM/BKK/JKM/JKK/JV), filter status + kata kunci, **posting** → saldo akun & laporan ter-update live
- **Approval workflow**: draft → submit → *Menunggu Approval* → **approve** (langsung posted) / **reject** (kembali draft), audit trail terekam di server
- **Buku Besar**: saldo berjalan per akun (Saldo Awal → transaksi → Saldo Akhir), navigasi periode
- **Laba Rugi**: Pendapatan − Beban = Laba/Rugi Bersih, live dari jurnal posted, navigasi periode
- **Neraca Lajur** & **Neraca**: indikator keseimbangan **✓ Seimbang (Debit = Kredit)** dan **✓ Seimbang (Aset = Kewajiban + Ekuitas)**, live dari API dengan fallback offline
- **Mode offline penuh**: banner + indikator *"Data dari cache · sinkron terakhir X"*, **antrian sinkronisasi localStorage** (operasi dibuat saat offline otomatis di-push begitu koneksi pulih), **polling koneksi berkala** (cek `GET /health` tiap 10 detik → banner offline hilang otomatis saat server kembali, tanpa klik)
- **Persistensi & migrasi per-version**: state tersimpan di localStorage, format di-upgrade via `MIGRATIONS[v]` (jurnal pengguna **tidak pernah hilang** saat seed di-refresh), toast pemberitahuan migrasi
- **Reset data demo**: modal konfirmasi (rincian yang dihapus) — saat online memanggil `POST /admin/reset` di server mock **dan** membersihkan localStorage sekaligus; akses cepat dari dropdown avatar user
- **Branding**: tema biru `#2596BE`, nama *Appsheet Accounting Journal*, entitas *PT. Kreasi Inovasi Estetika*

**Mock API server (Express) — `mock-api/`**
- Seluruh endpoint kontrak `API - Accounting.md`: auth, chart of accounts, jurnal (CRUD + post/reverse/submit/approve/reject), Buku Besar, Laba Rugi, Neraca Lajur, Neraca, dashboard, admin (reset / seed-bulk)
- **Logika akuntansi nyata**: posting meng-update saldo akun, reverse menghasilkan pasangan net-0, validasi balance + periode tertutup (`PERIOD_CLOSED`), error envelope konsisten (`{ error: { code, message } }`)
- **Seed** Maret 2026 (baseline QA Test Plan §2.3) + **seed:extra** jurnal lintas bulan Jan–Feb (saldo berantai 60 → 40 → 64 → 91jt)
- Persistence JSON opsional (flag `MOCK_API_PERSIST`), reset seed via `POST /admin/reset`

**Otomasi & dokumentasi**
- **CI GitHub Actions** (`.github/workflows/ci.yml`): 3 job **paralel** — unit prototipe (Vitest), integration mock API (Vitest + Supertest), E2E Playwright (chromium + firefox) — berjalan di setiap push/PR
- Dokumen: PRD Ver 3, API contract + OpenAPI 3.0 (`openapi.yaml`), skema PostgreSQL, QA Test Plan (137 test case + CSV/XLSX), template GitHub issue (bug/feature/story), slide deck & executive summary (ID + EN)

### Cakupan Test

| Suite | Lokasi | Jumlah | Cakupan |
|-------|--------|--------|---------|
| **Unit + integration prototipe** | `prototype-accounting/` | **168 test** | Logika akuntansi (auto-balance, posting, reverse), Buku Besar (saldo berjalan), Laba Rugi, Neraca & Neraca Lajur (identitas A = K+E, debit = kredit), migrasi persist per-version, refresh token, polling koneksi, antrian offline, rehidrasi localStorage penuh, indikator sinkronisasi |
| **Property-based (fast-check)** | `prototype-accounting/src/lib/ledger.property.test.ts` | 6 property | Invarian akuntansi untuk jurnal acak: total debit = kredit selalu, reverse pasangan **net-0 per akun** (bukan hanya total) |
| **Integration mock API** | `mock-api/` | **91 test** | Baseline angka QA §2.3, error envelope semua endpoint (409/422/401/403), seed:extra lintas bulan (Buku Besar rantai 60→40→64→91 + Pendapatan 130→160→208→233, Laba Rugi YTD 57/59/26), periode tertutup, **kedaluwarsa token terjadwal (TTL runtime)** |
| **E2E Playwright** | `e2e/` | **38 test** | RG-01..RG-19: posting → reverse, approval workflow, Buku Besar/Laba Rugi/Neraca/Neraca Lajur dari API, offline → fallback & reconnect (RG-12, RG-17) + **auto-reconnect polling tanpa klik (RG-18)** + **TTL terjadwal → auto-refresh sesi aktif tanpa reload (RG-19)**, performa 10.000 jurnal, restart & persistensi, mobile 320px, alur auth (RG-13..16), lintas browser (chromium + firefox) |

Semua suite hijau dan berjalan otomatis di CI setelah setiap push.

### Cara Menjalankan

Persyaratan: **Node.js ≥ 22** (Vite 8), npm.

```bash
# 1) Instal dependensi tiap sub-proyek
cd mock-api && npm ci && cd ..
cd prototype-accounting && npm ci && cd ..
cd e2e && npm ci && npx playwright install chromium firefox && cd ..

# 2) Jalankan dev terpadu (mock API :4000 + prototipe Vite :5173 bersamaan)
npm run dev

#    Atau terpisah:
#      cd mock-api && npm run dev
#      cd prototype-accounting && npm run dev

# 3) Buka prototipe
#    http://localhost:5173  → login demo: rina@estetikakreasi.co.id / password123

# Test — satu perintah menjalankan KETIGA suite sekaligus (paralel)
npm test                      # mock-api Supertest (91) + prototype unit/MSW (168) + E2E RG-01..RG-19 (38)
# Per-suite:
npm run test:mock-api         # integration test Vitest + Supertest
npm run test:prototype        # unit + integration MSW (Vitest)
npm run test:e2e              # E2E Playwright RG-01..RG-19
```

**Cara login demo** (mock API): akun admin tersedia di seed — email `rina@estetikakreasi.co.id`, password `password123` (lihat `mock-api/src/data.js`).

**Reset data**: tombol *"Reset ke data demo"* (Pengaturan atau dropdown avatar) mereset localStorage **dan** server mock (`POST /admin/reset`) sekaligus; atau `cd mock-api && npm run reset` untuk server saja.

**Struktur repo**:
```
├── docs/                      # PRD, API contract, OpenAPI, skema DB, QA, slide (dokumen)
├── mock-api/                  # Express mock API (port 4000) + integration test
├── prototype-accounting/      # Prototipe React (Vite + Tailwind, port 5173) + unit test
├── e2e/                       # Playwright RG-01..RG-19 + konfigurasi webServer
├── scripts/dev.mjs            # Dev terpadu: mock API + Vite bersamaan
├── scripts/test-all.mjs       # Test terpadu: 3 suite sekaligus (npm test)
└── .github/workflows/ci.yml   # CI paralel (unit / integration / e2e)
```

<!-- Versi berikutnya -->

[unreleased]: https://github.com/appsheetindonesia/Accounting-Software/compare/v0.1.0...HEAD
[v0.1.0]: https://github.com/appsheetindonesia/Accounting-Software/releases/tag/v0.1.0
