# E2E Regression — Appsheet Accounting Journal

Suite **Playwright** untuk skenario regresi **RG-01 s/d RG-12** dari
`QA Test Plan - Accounting.md` §4, dijalankan terhadap **mock API**
(`mock-api/`, port 4000) dan **prototipe** (`prototype-accounting/`, Vite :5173).

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
dan membersihkan localStorage → selalu mulai dari baseline terverifikasi
(Aset 557jt = Utang 150 + Modal 363 + Laba 44).

## Cakupan

| ID | Skenario | Verifikasi kunci |
|----|----------|------------------|
| RG-01 | Siklus hidup jurnal | draft → posting → hapus; saldo konsisten; edit + optimistic lock via API |
| RG-02 | Reverse menyeluruh | saldo & laporan kembali; trial balance seimbang; pasangan reversal benar |
| RG-03 | Posting → laporan → export | Laba Rugi live; neraca seimbang; export PDF/XLSX |
| RG-04 | Tutup periode | posting diblokir; draft ter-post via post-all; laporan terbaca |
| RG-05 | Multi-entitas | isolasi via `X-Entity-Id` |
| RG-06 | Approval flow | saldo berubah hanya saat approve; reject kembali draft; audit trail |
| RG-07 | Filter & search | filter UI + pencarian global API konsisten |
| RG-08 | Selektor periode | footer/modal sinkron; Laba Rugi & Buku Besar re-fetch per periode |
| RG-09 | Data besar | 10.000 jurnal: pagination, < 2 detik, filter tetap benar |
| RG-10 | Restart & persistensi | reset server (≡ restart in-memory) → kembali seed; UI tanpa error |
| RG-11 | Lintas browser + mobile | suite penuh di chromium & firefox; layout 320px tanpa overflow |
| RG-12 | Error handling | server mati → banner offline + fallback lokal, tanpa crash |

## Catatan gap UI

Beberapa fitur belum ada UI-nya di prototipe dan diuji lewat lapisan API
(ditandai `annotation` di laporan): tutup periode, approval workflow, switch
entitas, search global, export, edit jurnal. Ketika UI-nya diimplementasikan,
pindahkan asersi tersebut ke interaksi UI.
