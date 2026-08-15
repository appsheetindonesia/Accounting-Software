# E2E Regression — Appsheet Accounting Journal

Suite **Playwright** untuk skenario regresi **RG-01 s/d RG-12** dari
`QA Test Plan - Accounting.md` §4, dijalankan terhadap **mock API**
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
npm test            # semua: RG-01..RG-12 di chromium + firefox (24 test, ±2,5 mnt)
npm run test:rg9    # cepat: hanya RG-09 di chromium
npm run test:headed # dengan browser terlihat
npm run test:ui     # Playwright UI mode
npm run report      # buka laporan HTML (playwright-report/)
```

Playwright otomatis menyalakan mock API + Vite (atau memakai instance yang
sudah berjalan). Setiap test me-reset state server ke seed (`POST /admin/reset`)
dan **login demo melalui UI** (`rina@bukuwarung.com` / `password123`, wajib sejak
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

## CI (GitHub Actions)

Workflow terpadu `.github/workflows/ci.yml` menjalankan pipeline **berurutan**
di **setiap push / pull request** (ubuntu-latest, Node 22):

1. **Unit test prototipe** (Vitest, `prototype-accounting`) — 84 test
2. **Integration test mock API** (Vitest + Supertest, `mock-api`) — 73 test
   (baseline angka §2.3, error envelope vs katalog §13, seed:extra,
   persistence)
3. **E2E Playwright RG-01..RG-12** (chromium + firefox) — 24 test

Jika salah satu tahap gagal, pipeline berhenti (tahap berikutnya tidak
jalan). Playwright menyalakan mock API + Vite sendiri via `webServer` (CI →
`reuseExistingServer` dimatikan). `MOCK_API_PERSIST=0` dipasang di env CI agar
state in-memory murni dan deterministik. Artefak `playwright-report/`
(selalu) dan `test-results/` (saat gagal) di-upload sebagai artifact.

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
