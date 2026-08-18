# Verifikasi Branding — PT. Kreasi Inovasi Estetika

**Tanggal snapshot:** 2026-08-18 · **HEAD:** `f61736a` · **Cabang:** `main`

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

## 3. Kesimpulan

Tidak ada perubahan branding yang tertinggal: nama baru **PT. Kreasi Inovasi
Estetika** terpasang konsisten di 28 file (dokumen spesifikasi, prototipe UI,
mock API, suite E2E, openapi, dan artefak HTML), dan seluruh varian nama lama
sudah hilang. Snapshot ini diambil dari isi *tracked* di HEAD — perubahan
branding berikutnya wajib memperbarui dokumen ini bersama commit-nya.
