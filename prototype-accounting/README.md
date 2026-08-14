# BukuWarung Akuntansi — Prototipe Interaktif

Prototipe interaktif halaman **Dashboard** dan **Jurnal** sesuai spesifikasi `PRD Ver 3 - Accounting.md` (tema hijau #0D5C3D, double-entry, Bahasa Indonesia).

## Menjalankan

```bash
npm install
npm run dev        # http://localhost:5173
```

Build & lint:

```bash
npm run build
npm run lint
```

## Yang Bisa Dicoba

- **Dashboard**: 4 kartu saldo (live dari jurnal posted), grafik Laba Rugi 6 bulan (Recharts), peringatan, jurnal terbaru
- **Jurnal**: daftar jurnal berkelompok per entri, badge status (Draft/Posted/Reversed), filter kata kunci + status, footer total debit/kredit
- **Entri Jurnal Baru** (tombol "+ Buat Jurnal"): no. bukti auto-generate (BKM/BKK/JKM/JKK/JV), baris dinamis, validasi auto-balance (debit = kredit), Simpan Draft / Posting
- Posting jurnal → saldo akun & kartu dashboard ter-update live (logika BR-6/BR-7)
- Draft → Posting → Reverse (dari expand detail baris jurnal)
- Modul lain (Buku Besar, Laba Rugi, dst.) menampilkan halaman placeholder

## Stack

Vite + React 19 + TypeScript + Tailwind CSS v4 + Zustand + Recharts + Lucide + date-fns

## Struktur

```
src/
├── data/mock.ts          # COA, jurnal Maret 2026, tren 6 bulan (PRD §16)
├── store/useStore.ts     # Zustand: jurnal, posting/reverse, saldo live
├── lib/format.ts         # Format IDR & tanggal Indonesia
└── components/
    ├── TopBar / Sidebar / BottomBar / Toast / StatusBadge / ComingSoon
    ├── dashboard/        # BalanceCards, TrendChart, RecentJournals, AlertsPanel
    └── journal/          # JournalPage, JournalTable, JournalEntryModal
```
