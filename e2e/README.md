# E2E Regression — Appsheet Accounting Journal

Suite **Playwright** untuk skenario regresi **RG-01 s/d RG-19** dari
`QA Test Plan - Accounting.md` §4 (RG-13..19 = alur login, refresh token,
reconnect offline, auto-reconnect polling & kedaluwarsa TTL terjadwal),
dijalankan terhadap **mock API**
(`mock-api/`, port 4000) dan **prototipe** (`prototype-accounting/`, Vite :5173).

[![CI (Unit + Integration + E2E)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/ci.yml/badge.svg)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/ci.yml)

## Prasyarat

- Node.js ≥ 18
- Dependensi terpasang di `mock-api/` dan `prototype-accounting/` (`npm install` di masing-masing)

## Install

```bash
cd e2e
npm install
npx playwright install chromium firefox   # sekali saja (browser)
```

## Menjalankan

```bash
npm test            # semua: RG-01..RG-19 di chromium + firefox (38 test, ±4 mnt)
npm run test:rg9    # cepat: hanya RG-09 di chromium
npm run test:headed # dengan browser terlihat
npm run test:ui     # Playwright UI mode
npm run report      # buka laporan HTML (playwright-report/)
```

Playwright otomatis menyalakan mock API + Vite (atau memakai instance yang
sudah berjalan). Setiap test me-reset state server ke seed (`POST /admin/reset`)
dan **login demo melalui UI** (`rina@estetikakreasi.co.id` / `password123`, wajib sejak
fitur login) → selalu mulai dari baseline terverifikasi
(Aset 557jt = Utang 150 + Modal 363 + Laba 44).

Catatan: storage dibersihkan **sekali per test** (bukan tiap reload) agar sesi
login bertahan saat `page.reload()` (RG-02/RG-04/RG-10).

## Cakupan

| ID | Skenario | Verifikasi kunci |
|----|----------|------------------|
| RG-01 | Siklus hidup jurnal | draft → posting → hapus; saldo konsisten; edit + optimistic lock via API |
| RG-02 | Reverse menyeluruh | saldo & laporan kembali; trial balance seimbang; pasangan reversal benar |
| RG-03 | Posting → laporan → export | Laba Rugi live; **Neraca & Neraca Lajur via UI** (seimbang, 567/678jt); export PDF/XLSX via API |
| RG-04 | Tutup periode | posting diblokir (UI); **draft ter-post & laporan terbaca diverifikasi di UI** (Neraca 549,5jt seimbang) |
| RG-05 | Multi-entitas | isolasi via `X-Entity-Id` |
| RG-06 | Approval flow | **via UI**: draft → Submit → Menunggu Approval → Approve (saldo berubah) / Reject (kembali draft); audit trail via API |
| RG-07 | Filter & search | filter UI + pencarian global API konsisten |
| RG-08 | Selektor periode | footer/modal sinkron; Laba Rugi & Buku Besar re-fetch per periode |
| RG-09 | Data besar | 10.000 jurnal: pagination, < 2 detik, filter tetap benar |
| RG-10 | Restart & persistensi | reset server (≡ restart in-memory) → kembali seed; UI tanpa error |
| RG-11 | Lintas browser + mobile | suite penuh di chromium & firefox; layout 320px tanpa overflow |
| RG-12 | Error handling | server mati → banner offline + fallback lokal, tanpa crash |
| RG-13 | Login gagal | password salah → error `INVALID_CREDENTIALS` di UI, tetap di halaman login |
| RG-14 | Login benar | kredensial valid → masuk ke Dashboard, footer Online |
| RG-15 | Token korup | access token basi → 401 → auto-refresh → sesi pulih **tanpa login ulang** (indikator "Sesi diperbarui otomatis" tampil) |
| RG-16 | Refresh gagal | access + refresh token basi → sesi berakhir → kembali ke halaman login dengan pesan "Sesi berakhir" |
| RG-17 | Reconnect offline | server mati → masuk offline (banner + data lokal, token `local.demo`) → server hidup → "Coba lagi" → **auto-login demo** → online dengan token server asli |
| RG-18 | Auto-reconnect polling | server mati → banner offline → server hidup → banner hilang **SENDIRI dalam ~10 detik** (polling `GET /health` tiap 10s) **tanpa klik "Coba lagi"**, token server asli tersimpan |
| RG-19 | TTL terjadwal | access token basi setelah **N detik** (`POST /admin/set-token-ttl`) → **auto-refresh di sesi AKTIF tanpa reload**: 401 → refresh → retry 200, token baru tersimpan, indikator "Sesi diperbarui otomatis" tampil |

## CI (GitHub Actions)

Workflow terpadu `.github/workflows/ci.yml` menjalankan **3 job paralel**
di **setiap push / pull request** (ubuntu-latest, Node 22):

1. **`unit`** — unit test prototipe (Vitest, `prototype-accounting`) — 157 test
2. **`integration`** — integration test mock API (Vitest + Supertest, `mock-api`)
   — 91 test (baseline angka §2.3, error envelope vs katalog §13, seed:extra,
   persistence, TOKEN_EXPIRED, kedaluwarsa TTL terjadwal)
3. **`e2e`** — E2E Playwright RG-01..RG-19 (chromium + firefox) — 38 test

Ketiga job berjalan **sekaligus** (tidak berurutan) — unit & integration
selesai dalam hitungan detik tanpa tertahan E2E (~3 menit), dan kegagalan
satu job tidak menahan job lain. Playwright menyalakan mock API + Vite
sendiri via `webServer` (CI → `reuseExistingServer` dimatikan).
`MOCK_API_PERSIST=0` dipasang di env job `integration` & `e2e` agar state
in-memory murni dan deterministik. Artefak `playwright-report/` (selalu)
dan `test-results/` (saat gagal) di-upload sebagai artifact dari job `e2e`.

Workflow `e2e.yml` kini **manual-only** (`workflow_dispatch`) — untuk
menjalankan E2E saja tanpa pipeline penuh:

```bash
# GitHub → Actions → "E2E Regression (manual)" → Run workflow
```

## Catatan gap UI

Beberapa fitur belum ada UI-nya di prototipe dan diuji lewat lapisan API
(ditandai `annotation` di laporan): tutup periode, switch entitas, search
global, export, edit jurnal. Ketika UI-nya diimplementasikan, pindahkan
asersi tersebut ke interaksi UI.
