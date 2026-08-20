# Appsheet Accounting Journal

Sistem akuntansi **PT. Kreasi Inovasi Estetika** — prototipe web (React + Vite) dengan mock API, katalog API (OpenAPI), dokumen spesifikasi, dan suite pengujian lintas lapisan (unit, integration, E2E).

## Status CI

[![CI (Unit + Integration + E2E)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/ci.yml/badge.svg)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/ci.yml)
[![Build & Deploy prototipe ke GitHub Pages](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/pages.yml/badge.svg)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/pages.yml)
[![E2E Playwright (chromium + firefox)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/e2e.yml/badge.svg)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/e2e.yml)
[![Docker Build](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/docker.yml/badge.svg)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/docker.yml)

> **Status badge Pages:** Workflow `pages.yml` dilengkapi pre-flight guard —
> jika GitHub Pages belum diaktifkan (mis. repo privat di plan Free), step
> **Configure** dan **Deploy** di-skip otomatis dengan pesan petunjuk enablement
> yang jelas di log, bukan gagal merah. Workflow tetap hijau. Setelah Pages
> diaktifkan di Settings → Pages (Source: GitHub Actions), push berikutnya
> langsung deploy. Untuk repo privat di plan Free, Pages hanya tersedia di
> paket berbayar — alternatif: jadikan repo public atau deploy ke provider
> lain (Netlify/Vercel/Cloudflare via `deploy-static.yml`).

### Laporan per tahap (debug CI)

Job `test` di `ci.yml` berjalan sebagai **matrix per tahap** — unit test prototipe dan
integration test mock API dieksekusi paralel di runner terpisah. Setiap tahap menulis
laporan **JUnit** (`<dir>/test-results/junit.xml`, di-ignore git) dan meng-uploadnya sebagai
artifact saat gagal, dengan nama per tahap (`junit-unit-prototipe`, `junit-integration-mock-api`)
agar debug cukup mengunduh satu artifact tanpa membuka ulang seluruh log.

Riwayat perubahan & catatan rilis: **[CHANGELOG.md](CHANGELOG.md)**

## Struktur

| Folder | Isi |
|--------|-----|
| `prototype-accounting/` | Prototipe web (React + TypeScript + Vite + Zustand), unit test Vitest + MSW |
| `mock-api/` | Mock API Express (persistence, auth + refresh token, error envelope, rate limit), integration test Vitest + Supertest |
| `e2e/` | E2E Playwright RG-01..RG-22 (chromium + firefox) |
| `scripts/` | Skrip dev terpadu (`dev.mjs` + `dev-stop.mjs`), agregat test (`test-all.mjs`), pemantau CI (`check-ci.ps1`), pembuat GitHub Release (`create-release.mjs`) |
| Dokumen `*.md` | Semua spesifikasi — lihat [Dokumentasi](#dokumentasi) |
| `.github/workflows/` | CI (`ci.yml` — unit+integration+lint+qa-sync), E2E Playwright (`e2e.yml`), deploy GitHub Pages (`pages.yml`) |

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
| [VERIFIKASI-BRANDING.md](VERIFIKASI-BRANDING.md) | Verifikasi konsistensi branding nama perusahaan |
| [CHANGELOG.md](CHANGELOG.md) | Catatan rilis per versi |

Dokumentasi per-modul:

| Modul | README |
|-------|--------|
| Prototipe (React + Vite) | [prototype-accounting/README.md](prototype-accounting/README.md) |
| Mock API (Express) | [mock-api/README.md](mock-api/README.md) |
| E2E Playwright | [e2e/README.md](e2e/README.md) |

## Menjalankan

```bash
npm install        # install dependensi tiap sub-proyek
npm run dev        # mock API + Vite sekali jalan (scripts/dev.mjs)
npm run dev:stop   # hentikan stack — baca .dev/dev.pid, kill seluruh pohon proses
npm test           # ketiga suite: mock-api + prototype + e2e (paralel)
npm test -- --only=e2e   # subset: mock-api | prototype | e2e
#                          (bisa digabung koma: --only=mock-api,prototype)
npm run release -- v0.4.2   # buat GitHub Release dari annotated tag
```

`dev.mjs` menulis `.dev/dev.pid` (PID induk + child) saat stack hidup dan
menghapusnya saat berhenti — jadi `npm run dev:stop` mematikan mock API + Vite
sekaligus tanpa harus menebak PID lewat netstat/tasklist. Varian seed:
`npm run dev:extra` (jurnal lintas bulan), `dev:reset` (seed segar walau
persistence aktif), `dev:no-persist` (in-memory, reset tiap boot).

### Memantau GitHub Actions tanpa curl manual

`scripts/check-ci.ps1` menampilkan status run terbaru + hasil tiap job (dan
step yang gagal) lewat REST API — token diambil otomatis dari env
`GH_TOKEN`/`GITHUB_TOKEN`, `gh auth token`, atau Git Credential Manager.

```powershell
powershell -File scripts/check-ci.ps1                    # run terbaru branch aktif
powershell -File scripts/check-ci.ps1 -Commit bc5c0ad    # run untuk commit tertentu
powershell -File scripts/check-ci.ps1 -Workflow CI -Limit 1  # filter workflow (nama run)
powershell -File scripts/check-ci.ps1 -Watch             # poll sampai semua selesai
```

### Membuat GitHub Release dari tag (satu perintah)

`scripts/create-release.mjs` membuat (atau meng-update, bila sudah ada)
GitHub Release dari **annotated tag** — catatan rilis diambil verbatim dari
pesan tag (`%(contents:subject)` → judul, `%(contents:body)` → isi), jadi
release selalu konsisten dengan apa yang tertulis di tag. Idempoten: run
ulang untuk tag yang sama meng-update release yang ada (termasuk draft),
 bukan membuat duplikat.

```bash
npm run release -- v0.4.2              # rilis tag tertentu (langsung publish)
npm run release -- v0.4.2 --draft      # draft — review dulu, baru publish manual
npm run release -- --draft             # tanpa tag → tag terakhir (git describe)
```

Auth berurutan: env `GH_TOKEN`/`GITHUB_TOKEN` → `gh auth token` → Git
Credential Manager. Repo dibaca dari `git remote`. Catatan: workflow
`release.yml` membuat draft otomatis setiap tag `v*` di-push — script ini
berguna untuk rilis manual tanpa push tag baru atau untuk mem-publish draft
(atau membuat release untuk tag yang lama).

Detail lebih lanjut ada di README masing-masing sub-proyek (`mock-api/`, `prototype-accounting/`, `e2e/`).

## Deployment

### Opsi 1: Easypanel (Recommended)

[![Docker Build](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/docker.yml/badge.svg)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/docker.yml)

Docker image otomatis di-build dan di-push ke **GitHub Container Registry (GHCR)**
setiap push ke `main`. Easypanel bisa pull image langsung tanpa build lokal.

#### Langkah 1 — Buat Service di Easypanel

1. Login ke **Easypanel** (panel.easypanel.io)
2. Klik **New Service** → pilih **Docker** (bukan Docker Compose)
3. Isi konfigurasi:

| Field | Nilai |
|-------|-------|
| Name | `accounting-app` |
| Image | `ghcr.io/appsheetindonesia/accounting-software:main` |
| Port | `3000` |
| Restart | `unless-stopped` |

#### Langkah 2 — Environment Variables (opsional)

| Variable | Default | Deskripsi |
|----------|---------|----------|
| `NODE_ENV` | `production` | Mode produksi |
| `MOCK_API_PERSIST` | `1` | Simpan data ke file (survive restart) |
| `PORT` | `3000` | Port internal container |

#### Langkah 3 — Deploy & Login

1. Klik **Deploy** → tunggu container start (~30 detik)
2. Buka URL yang diberikan Easypanel
3. Login:

| Field | Nilai |
|-------|-------|
| Email | `rina@estetikakreasi.co.id` |
| Password | `password123` |

#### Opsi Pull dari GHCR

Image tersedia di:
```
ghcr.io/appsheetindonesia/accounting-software:main
ghcr.io/appsheetindonesia/accounting-software:<sha>
ghcr.io/appsheetindonesia/accounting-software:<tag>
```

#### Opsi Build Lokal

Jika ingin build sendiri (tanpa GHCR):

```bash
docker-compose up --build
# Buka http://localhost:3000
```

### Opsi 2: Docker Compose (Self-Hosted)

```bash
# Clone repo
git clone https://github.com/appsheetindonesia/Accounting-Software.git
cd Accounting-Software

# Build & jalankan
docker-compose up --build -d

# Cek status
docker-compose ps

# Lihat logs
docker-compose logs -f app

# Stop
docker-compose down
```

### Opsi 3: GitHub Pages (Static)

Prototipe React bisa di-deploy statis ke GitHub Pages (tanpa mock API):

```bash
cd prototype-accounting
npm ci
npm run build  # output di dist/
```

Upload `dist/` ke GitHub Pages via workflow `pages.yml` (otomatis saat push ke `main`).

> **Catatan:** GitHub Pages hanya menyajikan frontend statis — mock API tidak berjalan.
> Untuk fitur lengkap (auth, CRUD, PostgreSQL), gunakan Opsi 1 atau 2.

### Koneksi PostgreSQL

Untuk menghubungkan ke database PostgreSQL nyata:

1. **Pastikan PostgreSQL accessible** dari container (host = IP public, port terbuka)
2. **Jalankan migration** di PostgreSQL:
   ```bash
   psql -h <HOST> -p <PORT> -U postgres -d <DATABASE> -f mock-api/migrations/001_init.sql
   ```
3. **Buka Pengaturan** di aplikasi → pilih mode **PostgreSQL**
4. **Isi koneksi:**

| Field | Nilai |
|-------|-------|
| Host Internal | IP address server PostgreSQL |
| Port Internal | Port PostgreSQL (default: 5432) |
| Nama Basis Data | Nama database |
| Schema | `public` (default) |
| Pengguna | `postgres` (atau user yang sesuai) |
| Kata Sandi | Password database |

5. **Test Koneksi** → harus sukses
6. **Simpan Pengaturan** → mode PostgreSQL aktif

> **Fallback:** Jika query PostgreSQL gagal (mis. tabel belum ada), aplikasi otomatis
> fallback ke in-memory data. Jalankan migration dulu untuk data persisten.

## Berkontribusi (konvensi branch & CI)

Nama branch mengikuti konvensi berikut:

| Prefix | Tujuan | Contoh |
|--------|--------|--------|
| `fitur/*` | Fitur baru (feature) | `fitur/export-buku-besar` |
| `fix/*` | Perbaikan bug | `fix/token-refresh` |

Alur kerja yang diharapkan:

1. **Branch dari `main`** dengan prefix di atas → push → CI hanya menjalankan
   unit + integration + qa-sync (cepat) via `ci.yml`; E2E penuh **tidak** berjalan.
2. **Buka pull request** ke `main` → `ci.yml` (unit+integration+lint+qa-sync)
   dan `e2e.yml` (E2E penuh RG-01..RG-22, chromium + firefox) berjalan.
3. **Merge ke `main`** → kedua workflow berjalan sekali lagi memvalidasi batch
   yang masuk; `pages.yml` men-deploy prototipe ke GitHub Pages.

Skema pemicu ini hemat waktu CI: E2E (di-shard jadi 2 job paralel) hanya
untuk jalur main/PR yang butuh verifikasi penuh, bukan tiap push branch fitur.

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
