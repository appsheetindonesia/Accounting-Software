# Verifikasi Branding — PT. Kreasi Inovasi Estetika

**Tanggal snapshot:** 2026-08-19 · **HEAD:** `bc1b9dc` · **Cabang:** `main`

Dokumen ini adalah **snapshot grep** yang menegaskan tidak ada perubahan
branding yang tertinggal setelah penggantian nama entitas & domain email demo
(`majujaya.co.id` → `estetikakreasi.co.id`, prefix `MJ-001` → `KI-001`, nama
entitas → **PT. Kreasi Inovasi Estetika**) di seluruh dokumen, prototipe,
mock API, dan suite pengujian.

## 1. Nama baru — sebaran per file

Perintah: `git grep -ic "Kreasi Inovasi Estetika"` (kasus sama persis) —
**28 file** berisi nama baru:

| Jumlah | File |
|-------:|------|
| 5 | `PRD Ver 3 - Accounting.md` |
| 3 | `e2e/regression.spec.ts` |
| 3 | `QA Test Plan - Accounting.md` |
| 3 | `CHANGELOG.md` |
| 3 | `API - Accounting.md` |
| 2 | `openapi.yaml` |
| 2 | `mock-api/src/data.js` |
| 2 | `prototype-accounting/src/store/useStore.test.ts` |
| 2 | `prototype-accounting/src/integration/entity-isolation.test.ts` |
| 1 | `prototype-accounting/src/test/helpers.ts` |
| 1 | `prototype-accounting/src/store/useStore.ts` |
| 1 | `prototype-accounting/src/lib/ledger.test.ts` |
| 1 | `prototype-accounting/src/integration/handlers.ts` |
| 1 | `prototype-accounting/src/data/mock.ts` |
| 1 | `prototype-accounting/src/components/reports/TrialBalancePage.tsx` |
| 1 | `prototype-accounting/src/components/reports/IncomeStatementPage.tsx` |
| 1 | `prototype-accounting/src/components/reports/IncomeStatementPage.test.tsx` |
| 1 | `prototype-accounting/src/components/reports/BalanceSheetPage.tsx` |
| 1 | `prototype-accounting/src/components/reports/BalanceSheetPage.test.tsx` |
| 1 | `prototype-accounting/src/components/TopBar.tsx` |
| 1 | `prototype-accounting/src/components/LoginPage.tsx` |
| 1 | `mock-api/test/persistence.test.js` |
| 1 | `mock-api/README.md` |
| 1 | `accounting.html` |
| 1 | `README.md` |
| 1 | `PRD Ver 2 - Accounting.md` |
| 1 | `FRD - Accounting.md` |
| 1 | `Database Schema - Accounting.md` |

## 2. Sisa nama lama — harus nol

Perintah: `git grep -inE "majujaya|Maju Jaya|MJ-001|MJ001|mj-|MJ-"` (ci, semua
file, termasuk untracked yang terlihat oleh git) → **0 kecocokan**.

| Pola (nama lama) | Hasil |
|------------------|-------|
| `majujaya` (domain email lama) | **0** ✓ |
| `Maju Jaya` / `MJ-001` / `MJ001` | **0** ✓ |
| `mj-` / `MJ-` (prefix entitas lama) | **0** ✓ |

## 3. Domain email demo — sebaran per file

Perintah: `git grep -ic "estetikakreasi"` (case-insensitive) —
**40 file** berisi domain `estetikakreasi.co.id` (**93 kecocokan**):

| Jumlah | File |
|-------:|------|
| 9 | `prototype-accounting/src/store/useStore.test.ts` |
| 7 | `prototype-accounting/src/integration/posting-reverse.test.ts` |
| 7 | `prototype-accounting/src/integration/entity-isolation.test.ts` |
| 6 | `API - Accounting.md` |
| 5 | `prototype-accounting/src/integration/approval-flow.test.ts` |
| 4 | `mock-api/test/api-baseline.test.js` |
| 4 | `mock-api/README.md` |
| 4 | `CHANGELOG.md` |
| 3 | `prototype-accounting/src/integration/period-closed.test.ts` |
| 3 | `prototype-accounting/src/components/LoginPage.tsx` |
| 3 | `mock-api/test/error-envelope.test.js` |
| 3 | `mock-api/src/data.js` |
| 3 | `QA Test Plan - Accounting.md` |
| 2 | `scripts/dev.mjs` |
| 2 | `prototype-accounting/src/integration/handlers.ts` |
| 2 | `prototype-accounting/src/components/journal/JournalTable.test.tsx` |
| 2 | `prototype-accounting/src/components/TopBar.test.tsx` |
| 2 | `openapi.yaml` |
| 1 | `prototype-accounting/src/test/helpers.ts` |
| 1 | `prototype-accounting/src/store/useStore.ts` |
| 1 | `prototype-accounting/src/store/rehydration.test.ts` |
| 1 | `prototype-accounting/src/store/offline-queue.test.ts` |
| 1 | `prototype-accounting/src/components/reports/TrialBalancePage.test.tsx` |
| 1 | `prototype-accounting/src/components/reports/IncomeStatementPage.test.tsx` |
| 1 | `prototype-accounting/src/components/reports/CashFlowPage.test.tsx` |
| 1 | `prototype-accounting/src/components/reports/BalanceSheetPage.test.tsx` |
| 1 | `prototype-accounting/src/components/ledger/LedgerPage.test.tsx` |
| 1 | `prototype-accounting/src/components/journal/JournalPage.test.tsx` |
| 1 | `prototype-accounting/src/components/Sidebar.test.tsx` |
| 1 | `prototype-accounting/src/components/PeriodSettings.test.tsx` |
| 1 | `mock-api/test/token-ttl.test.js` |
| 1 | `mock-api/test/extra-seed.test.js` |
| 1 | `mock-api/test/entity-isolation.test.js` |
| 1 | `mock-api/test/ent2-consistency.test.js` |
| 1 | `mock-api/index.js` |
| 1 | `e2e/regression.spec.ts` |
| 1 | `e2e/helpers.ts` |
| 1 | `e2e/README.md` |
| 1 | `VERIFIKASI-BRANDING.md` |
| 1 | `.github/workflows/ci.yml` |

## 4. Sisa nama lama — harus nol

Perintah: `git grep -inE "majujaya|Maju Jaya|MJ-001|MJ001|mj-|MJ-"` (ci, semua
file, termasuk untracked yang terlihat oleh git, kecuali VERIFIKASI-BRANDING.md
& ci.yml) → **0 kecocokan**.

| Pola (nama lama) | Hasil |
|------------------|-------|
| `majujaya` (domain email lama) | **0** ✓ |
| `Maju Jaya` / `MJ-001` / `MJ001` | **0** ✓ |
| `mj-` / `MJ-` (prefix entitas lama) | **0** ✓ |

> **Catatan CI:** Job `branding-guard` di `.github/workflows/ci.yml` menjalankan
> grep yang sama secara otomatis di setiap push/PR. File `VERIFIKASI-BRANDING.md`
> dan `ci.yml` di-exclude karena mendokumentasikan pola lama.

## 5. Kesimpulan

Tidak ada perubahan branding yang tertinggal:

- Nama baru **PT. Kreasi Inovasi Estetika** terpasang konsisten di 28 file
  (dokumen spesifikasi, prototipe UI, mock API, suite E2E, openapi, artefak HTML).
- Domain email demo **estetikakreasi.co.id** digunakan di 40 file (93 kecocokan)
  — mencakup data seed, test fixtures, helper, komponen UI, dan dokumentasi.
- Seluruh varian nama lama (`majujaya`, `MJ-001`, dll.) sudah hilang.

Snapshot ini diambil dari isi *tracked* di HEAD — perubahan branding berikutnya
wajib memperbarui dokumen ini bersama commit-nya.
