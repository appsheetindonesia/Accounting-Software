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

Jika mock API mati, prototipe otomatis masuk **mode offline**: banner di bawah top bar + footer "Offline · Data lokal", data dari localStorage/seed, mutasi tetap jalan lokal. Klik "Coba lagi" untuk menyambung ulang.

Base URL API bisa diubah lewat env `VITE_API_URL` (default `http://localhost:4000`).

Build, lint & test:

```bash
npm run build
npm run lint
npm test          # Vitest — logika akuntansi (33 test)
```

## Yang Bisa Dicoba

- **Dashboard**: 4 kartu saldo (live dari jurnal posted), grafik Laba Rugi 6 bulan (Recharts), peringatan, jurnal terbaru
- **Jurnal**: daftar jurnal berkelompok per entri, badge status (Draft/Posted/Reversed), filter kata kunci + status, footer total debit/kredit
- **Entri Jurnal Baru** (tombol "+ Buat Jurnal"): no. bukti auto-generate (BKM/BKK/JKM/JKK/JV), baris dinamis, validasi auto-balance (debit = kredit), Simpan Draft / Posting
- Posting jurnal → saldo akun, kartu dashboard, Buku Besar, & Laba Rugi ter-update live (logika BR-6/BR-7)
- Draft → Posting → Reverse (dari expand detail baris jurnal)
- **Buku Besar**: saldo berjalan per akun (Saldo Awal → transaksi → Saldo Akhir), selector akun, nav periode, hanya jurnal posted
- **Laba Rugi**: dihitung live dari jurnal posted (Pendapatan − Beban = Laba/Rugi Bersih), selector periode, empty state
- Modul lain (Neraca Lajur, Neraca, Arus Kas, dst.) menampilkan halaman placeholder

## Lapisan API (async fetch — `API - Accounting.md`)

- `src/api/client.ts` — wrapper `fetch`: envelope `{ data }` / `{ error: { code, message } }`, bearer JWT, header `X-Entity-Id`, `ApiError`, deteksi gagal jaringan
- `src/api/index.ts` — endpoint typed: auth (login), akun, jurnal (create/post/reverse/delete), dashboard (summary/trend/recent/alerts), buku besar, laba rugi + normalisasi ke tipe lokal
- `src/hooks/useApiFetch.ts` — fetch async dengan gate koneksi (hindari 401 saat token belum siap), loading, fallback offline
- `src/store/useStore.ts` — `init()` auto-login demo (rina@bukuwarung.com) lalu muat akun & jurnal; semua mutasi (save/post/reverse/delete) memanggil API saat online, fallback lokal saat offline; persist localStorage untuk ketahanan offline
- Dashboard, Buku Besar & Laba Rugi memakai endpoint masing-masing (bukan hitung lokal) dengan fallback lokal saat offline

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
    └── reports/          # IncomeStatementPage — laba rugi live (via API)
```
