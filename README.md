# Appsheet Accounting Journal

Sistem akuntansi **PT. Kreasi Inovasi Estetika** — prototipe web (React + Vite) dengan mock API, katalog API (OpenAPI), dokumen spesifikasi, dan suite pengujian lintas lapisan (unit, integration, E2E).

## Status CI

[![CI (Unit + Integration + E2E)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/ci.yml/badge.svg)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/ci.yml)
[![Build & Deploy prototipe ke GitHub Pages](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/pages.yml/badge.svg)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/pages.yml)
[![Verifikasi penuh (unit + e2e, manual)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/e2e.yml/badge.svg)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/e2e.yml)

> Repo ini privat — badge hanya tampil bagi pengguna yang punya akses.

> **Status badge Pages (saat ini merah/gagal):** GitHub Pages belum diaktifkan.
> Repo privat di plan Free tidak mendukung Pages (API mengembalikan `422 Your
> current plan does not support GitHub Pages`), sehingga step Configure di
> `pages.yml` gagal dan deploy tidak berjalan. Perbaikan: aktifkan Pages via
> Settings → Pages (repo privat butuh paket berbayar) atau jadikan repo public,
> lalu push ulang.

### Laporan per tahap (debug CI)

Job `test` di `ci.yml` berjalan sebagai **matrix per tahap** — unit test prototipe dan
integration test mock API dieksekusi paralel di runner terpisah. Setiap tahap menulis
laporan **JUnit** (`<dir>/test-results/junit.xml`, di-ignore git) dan meng-uploadnya sebagai
artifact saat gagal, dengan nama per tahap (`junit-unit-prototipe`, `junit-integration-mock-api`)
agar debug cukup mengunduh satu artifact tanpa membuka ulang seluruh log.

## Struktur

| Folder | Isi |
|--------|-----|
| `prototype-accounting/` | Prototipe web (React + TypeScript + Vite + Zustand), unit test Vitest + MSW |
| `mock-api/` | Mock API Express (persistence, auth + refresh token, error envelope, rate limit), integration test Vitest + Supertest |
| `e2e/` | E2E Playwright RG-01..RG-22 (chromium + firefox) |
| `scripts/` | Skrip dev terpadu (`dev.mjs` + `dev-stop.mjs`) & agregat test (`test-all.mjs`) |
| Dokumen `*.md` | Semua spesifikasi — lihat [Dokumentasi](#dokumentasi) |
| `.github/workflows/` | CI (`ci.yml`), verifikasi manual (`e2e.yml`), deploy GitHub Pages (`pages.yml`) |

## Dokumentasi

Daftar isi semua dokumen spesifikasi di repo ini — navigasi cepat ke dokumen
manapun tanpa harus membuka isi folder:

| Dokumen | Isi |
|---------|-----|
| [Executive Summary - Accounting.md](<Executive Summary - Accounting.md>) | Ringkasan eksekutif produk (Bahasa Indonesia) |
| [Executive Summary EN - Accounting.md](<Executive Summary EN - Accounting.md>) | Executive summary (English) |
| [Pitch Deck - Accounting.md](<Pitch Deck - Accounting.md>) | Deck presentasi produk |
| [BRD - Accounting.md](<BRD - Accounting.md>) | Business Requirements Document — kebutuhan bisnis & kompetitor |
| [FRD - Accounting.md](<FRD - Accounting.md>) | Functional Requirements Document — kebutuhan fungsional |
| [PRD Ver 1- Accounting.md](<PRD Ver 1- Accounting.md>) | Product Requirements Document v1 |
| [PRD Ver 2 - Accounting.md](<PRD Ver 2 - Accounting.md>) | Product Requirements Document v2 |
| [PRD Ver 3 - Accounting.md](<PRD Ver 3 - Accounting.md>) | Product Requirements Document v3 (terbaru) |
| [TRD - Accounting.md](<TRD - Accounting.md>) | Technical Requirements Document |
| [API - Accounting.md](<API - Accounting.md>) | Kontrak REST API (server mock + klien) |
| [Database Schema - Accounting.md](<Database Schema - Accounting.md>) | Skema database & aturan integritas |
| [Color Palette - Accounting.md](<Color Palette - Accounting.md>) | Desain sistem warna, kontras & aksesibilitas |
| [Backlog - Accounting.md](<Backlog - Accounting.md>) | Backlog produk (user story, prioritas, estimasi SP) |
| [GitHub Projects - Accounting.md](<GitHub Projects - Accounting.md>) | Konfigurasi GitHub Projects / import backlog |
| [QA Test Plan - Accounting.md](<QA Test Plan - Accounting.md>) | Rencana pengujian QA + artefak hasil (CSV/XLSX) |
| [CHANGELOG.md](CHANGELOG.md) | Catatan rilis per versi |

## Menjalankan

```bash
npm install        # install dependensi tiap sub-proyek
npm run dev        # mock API + Vite sekali jalan (scripts/dev.mjs)
npm run dev:stop   # hentikan stack — baca .dev/dev.pid, kill seluruh pohon proses
npm test           # ketiga suite: mock-api + prototype + e2e (paralel)
```

`dev.mjs` menulis `.dev/dev.pid` (PID induk + child) saat stack hidup dan
menghapusnya saat berhenti — jadi `npm run dev:stop` mematikan mock API + Vite
sekaligus tanpa harus menebak PID lewat netstat/tasklist. Varian seed:
`npm run dev:extra` (jurnal lintas bulan), `dev:reset` (seed segar walau
persistence aktif), `dev:no-persist` (in-memory, reset tiap boot).

Detail lebih lanjut ada di README masing-masing sub-proyek (`mock-api/`, `prototype-accounting/`, `e2e/`).

## Pre-commit QA (hook lokal)

Agar perubahan `QA Test Plan - Accounting.md` tanpa regenerasi artefak CSV/XLSX
tertolak sebelum commit, aktifkan hook pre-commit sekali per clone:

```bash
scripts/hooks/install.sh          # aktifkan (core.hooksPath)
scripts/hooks/install.sh --uninstall   # nonaktifkan
```

Hook memakai `core.hooksPath` absolut, jadi selalu sinkron dengan isi repo
(tanpa menyalin ke `.git/hooks`). Saat file terkait QA di-stage, ia menjalankan
`scripts/check-qa-sync.py`; commit lain tidak kena dampak (langsung skip).
Perbaikan saat ditolak: `python scripts/generate-qa-test-cases.py`, lalu commit
hasilnya bersama perubahan QA Test Plan.
