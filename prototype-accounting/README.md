# Appsheet Accounting Journal — Prototipe Interaktif

Prototipe interaktif sesuai spesifikasi `PRD Ver 3 - Accounting.md` (tema biru #2596BE, double-entry, Bahasa Indonesia).

## Menjalankan

Prototipe butuh **mock API server** (folder `mock-api/`, port 4000) sebagai sumber data — sesuai `API - Accounting.md`:

```bash
# Terminal 1 — mock API (Express, state in-memory, seed 8 jurnal)
cd mock-api && npm install && npm start

# Terminal 2 — prototipe
cd prototype-accounting && npm install && npm run dev   # http://localhost:5173
```

**Atau satu perintah dari root repo** (mock API + Vite sekaligus):

```bash
node scripts/dev.mjs                     # http://localhost:5173 · http://localhost:4000
node scripts/dev.mjs --extra             # + jurnal lintas bulan (Jan–Feb 2026)
node scripts/dev.mjs --reset             # paksa seed segar walau persistence aktif
MOCK_API_PERSIST=0 node scripts/dev.mjs  # tanpa persistence (seed di-reset tiap boot)
```

Persistence mock API default **AKTIF** → saat keduanya hidup, state tersimpan (jurnal yang
diposting) dimuat, bukan di-reset. Untuk loop dev seed-segar, pakai `--reset` atau `MOCK_API_PERSIST=0`.

Jika mock API mati, prototipe otomatis masuk **mode offline**: banner di bawah top bar + footer "Offline · Data lokal", data dari localStorage/seed, mutasi tetap jalan lokal. Klik "Coba lagi" untuk menyambung ulang.

Base URL API bisa diubah lewat env `VITE_API_URL` (default `http://localhost:4000`).

Build, lint & test:

```bash
npm run build
npm run lint
npm test          # Vitest — unit (akuntansi, Buku Besar/Laba Rugi, migrasi persist, refresh token) + integration MSW (80 test)
```

## Yang Bisa Dicoba

- **Dashboard**: 4 kartu saldo (live dari jurnal posted), grafik Laba Rugi 6 bulan (Recharts), peringatan, jurnal terbaru
- **Jurnal**: daftar jurnal berkelompok per entri, badge status (Draft/Posted/Reversed), filter kata kunci + status, footer total debit/kredit
- **Entri Jurnal Baru** (tombol "+ Buat Jurnal"): no. bukti auto-generate (BKM/BKK/JKM/JKK/JV), baris dinamis, validasi auto-balance (debit = kredit), Simpan Draft / Posting
- Posting jurnal → saldo akun, kartu dashboard, Buku Besar, & Laba Rugi ter-update live (logika BR-6/BR-7)
- Draft → Posting → Reverse (dari expand detail baris jurnal)
- **Approval workflow**: draft → **Submit** → status *Menunggu Approval* → **Approve** (langsung posted, saldo berubah) / **Reject** (kembali draft) — dari expand detail baris jurnal; filter status baru "Menunggu Approval"; audit trail (create/submit/approve/reject) terekam di server
- **Buku Besar**: saldo berjalan per akun (Saldo Awal → transaksi → Saldo Akhir), selector akun, nav periode, hanya jurnal posted
- **Laba Rugi**: dihitung live dari jurnal posted (Pendapatan − Beban = Laba/Rugi Bersih), selector periode, empty state
- **Neraca Lajur**: trial balance live (saldo YTD per akhir periode), kolom Debit/Kredit per akun, indikator **✓ Seimbang (Debit = Kredit)**, nav periode
- **Neraca**: posisi keuangan live (section ASET & KEWAJIBAN + EKUITAS + Laba Ditahan berjalan), indikator **✓ Seimbang (Aset = Kewajiban + Ekuitas)**, "Per 31 Maret 2026", nav periode
- Modul lain (Arus Kas, Laporan Lain, Pengaturan) menampilkan halaman placeholder

## Lapisan API (async fetch — `API - Accounting.md`)

- `src/api/client.ts` — wrapper `fetch`: envelope `{ data }` / `{ error: { code, message } }`, bearer JWT, header `X-Entity-Id`, `ApiError`, deteksi gagal jaringan, **refresh token otomatis** (401 → POST /auth/refresh, dedupe paralel → retry; refresh gagal → handler sesi berakhir)
- `src/api/index.ts` — endpoint typed: auth (login, logout), akun, jurnal (create/post/reverse/delete), dashboard (summary/trend/recent/alerts), buku besar, laba rugi, neraca lajur, neraca + normalisasi ke tipe lokal
- `src/hooks/useApiFetch.ts` — fetch async dengan gate koneksi (hindari 401 saat token belum siap), loading, fallback offline
- `src/store/useStore.ts` — halaman login sungguhan: `login(email, password)` → `POST /auth/login` (token + user dipersist, reload tidak login ulang), `logout()`, `loginOffline()` (data demo tanpa server); `init()` hanya memulihkan sesi tersimpan; semua mutasi (save/post/reverse/delete) memanggil API saat online, fallback lokal saat offline
- Dashboard, Buku Besar, Laba Rugi, Neraca Lajur & Neraca memakai endpoint masing-masing (bukan hitung lokal) dengan fallback lokal saat offline

## Stack

Vite + React 19 + TypeScript + Tailwind CSS v4 + Zustand + Recharts + Lucide + date-fns + Vitest

## Struktur

```
src/
├── api/                  # Lapisan API mock: client.ts (fetch) + index.ts (endpoint typed)
├── data/mock.ts          # COA, jurnal Maret 2026, tren 6 bulan (seed/fallback, PRD §16)
├── hooks/useApiFetch.ts  # Fetch async + loading + fallback offline
├── store/useStore.ts     # Zustand: init koneksi API, mutasi async, saldo live
├── lib/                  # format.ts (IDR/tanggal) + accounting.ts (auto-balance, diuji)
└── components/
    ├── TopBar / Sidebar / BottomBar / OfflineBanner / Toast / StatusBadge / ComingSoon
    ├── dashboard/        # BalanceCards, TrendChart, RecentJournals, AlertsPanel
    ├── journal/          # JournalPage, JournalTable, JournalEntryModal
    ├── ledger/           # LedgerPage — buku besar saldo berjalan (via API)
    └── reports/          # IncomeStatementPage, TrialBalancePage, BalanceSheetPage — laporan live (via API)
```
