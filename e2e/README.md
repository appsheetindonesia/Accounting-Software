# E2E Regression — Appsheet Accounting Journal

Suite **Playwright** untuk skenario regresi **RG-01 s/d RG-22** dari
`QA Test Plan - Accounting.md` §4 (RG-13..22 = alur login, refresh token,
reconnect offline, auto-reconnect polling, kedaluwarsa TTL terjadwal,
SESSION_EXPIRED & rate limit 429), dijalankan terhadap **mock API**
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
npm test            # semua: RG-01..RG-22 di chromium + firefox (62 test, ±7 mnt)
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
| RG-03 | Posting → laporan → export | Laba Rugi live; **Neraca & Neraca Lajur via UI** (seimbang, 567/678jt); **export PDF/XLSX via tombol UI** (unduhan terpicu, nama file `Laba-Rugi-2026-03.pdf/.xlsx`) |
| RG-03b | Export Buku Besar via UI | klik Export PDF/XLSX per akun (1-1100) → respons **200** + `Content-Disposition` benar + **toast sukses** `Laporan berhasil diekspor — Buku-Besar-1-1100-2026-03.<fmt>` |
| RG-03c | Export Buku Besar rentang custom | isi rentang tanggal (start/end) di Buku Besar → export memakai `?start=&end=` → respons **200** + nama file & toast memuat `Buku-Besar-1-1100-2026-03-06..2026-03-11.<fmt>` |
| RG-03d | Klik ganda export | dblclick Export PDF di Laba Rugi → **hanya 1 request** terkirim (guard busyRef + cooldown 350ms) |
| RG-04 | Tutup periode | posting diblokir (UI); **draft ter-post & laporan terbaca diverifikasi di UI** (Neraca 549,5jt seimbang) |
| RG-05 | Multi-entitas | isolasi via `X-Entity-Id` |
| RG-06 | Approval flow | **via UI**: draft → Submit → Menunggu Approval → Approve (saldo berubah) / **Reject dengan alasan wajib** (dialog, `rejectionReason` tampil di detail); **"Simpan & Ajukan" langsung Menunggu Approval**; audit trail via API; **RG-06e NO_APPROVAL_RIGHTS**: akuntan + role cache stale → approve via antrian → toast khusus "Hanya Admin" (server 403), jurnal tetap Menunggu Approval |
| RG-07 | Filter & search | filter UI + pencarian global API konsisten |
| RG-07b | Navigasi keyboard global search | ketik query → ArrowDown/Up pindah highlight (`aria-activedescendant`/`aria-selected`) → Enter pilih → detail jurnal terbuka |
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
| RG-20 | SESSION_EXPIRED | refresh token kedaluwarsa **di server** (`POST /admin/expire-refresh-tokens`) → refresh gagal 401 `SESSION_EXPIRED` → logout otomatis + **modal "Sesi Berakhir"** → "Masuk kembali" → halaman login → **login ulang wajib** (token baru) |
| RG-20b | SESSION_EXPIRED (sesi aktif) | **tanpa reload**: `expire-tokens` + `expire-refresh-tokens` saat sesi masih aktif → fetch berikutnya 401 → auto-refresh **gagal** `SESSION_EXPIRED` → modal "Sesi Berakhir" muncul di tengah pemakaian → kembali ke login, **login ulang wajib** |
| RG-21 | RATE_LIMITED (retry pulih) | ambang **1 req/endpoint** (`POST /admin/set-rate-limit`) → 429 saat simpan jurnal → **retry otomatis klien** (+800ms) → ambang dinaikkan → retry **200**, jurnal tersimpan **tanpa error** |
| RG-22 | RATE_LIMITED (diblokir) | ambang 1 + window panjang → 429 **×3** (1 + 2 retry) → toast **"Terlalu banyak permintaan"**, jurnal **tidak tersimpan**, sesi tetap aktif |

## CI (GitHub Actions)

Workflow terpadu `.github/workflows/ci.yml` menjalankan **2 job paralel**
di **setiap push / pull request** (ubuntu-latest, Node 22):

1. **`test`** — job **matrix per-tahap**:
   - tahap **prototipe** (unit + integration, Vitest + MSW, `prototype-accounting`)
     — 170 test
   - tahap **mock API** (integration, Vitest + Supertest, `mock-api`) — 105 test
     (baseline angka §2.3, error envelope vs katalog §13, seed:extra,
     persistence, TOKEN_EXPIRED, kedaluwarsa TTL terjadwal)
2. **`e2e`** — E2E Playwright RG-01..RG-22 (chromium + firefox) — 62 test

Job `test` berjalan **sekaligus** dengan `e2e` (tidak berurutan) — unit &
integration selesai dalam hitungan detik tanpa tertahan E2E (~4 menit),
dan kegagalan satu job tidak menahan job lain. Tiap tahap matrix menulis
laporan **JUnit** (`test-results/junit.xml`) dan meng-upload-nya sebagai
artifact saat **gagal** (`junit-unit-prototipe` / `junit-integration-mock-api`)
agar debug CI lebih mudah. Playwright menyalakan mock API + Vite sendiri via
`webServer` (CI → `reuseExistingServer` dimatikan). `MOCK_API_PERSIST=0`
dipasang di env job `test` & `e2e` agar state in-memory murni dan
deterministik. Artefak `playwright-report/` (selalu) dan `test-results/`
(saat gagal) di-upload sebagai artifact dari job `e2e`.

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
