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
node scripts/dev.mjs --no-persist        # tanpa persistence (seed di-reset tiap boot)

# Sama lewat npm dari root (package.json root):
npm run dev / dev:extra / dev:reset / dev:no-persist
```

Persistence mock API default **AKTIF** → saat keduanya hidup, state tersimpan (jurnal yang
diposting) dimuat, bukan di-reset. Untuk loop dev seed-segar, pakai `--reset` atau `MOCK_API_PERSIST=0`.

Jika mock API mati, prototipe otomatis masuk **mode offline**: banner di bawah top bar + footer "Offline · Data dari cache (sinkron X)", data dari localStorage/seed, mutasi tetap jalan lokal. **Banner hilang otomatis** begitu server kembali (polling `GET /health` tiap 10 detik → `init()` otomatis, auto-login demo bila sesi `local.demo`); tombol "Coba lagi" tetap ada sebagai pemicu manual. **Indikator refresh token** di footer (ikon + tooltip "Sesi diperbarui otomatis · baru saja") menampilkan kapan access token terakhir di-refresh otomatis (401 → `POST /auth/refresh`) — transparan, in-memory (hilang saat reload/sesi baru). Banner menampilkan **indikator keaslian data**: `Data dari cache · sinkron terakhir 10 menit lalu` (waktu sinkron terakhir dicatat di `lastSyncedAt` saat login/init/flush sukses, dipersist lintas reload — migrasi v5; kalau belum pernah sinkron: `Data demo lokal · belum pernah tersinkron`).

**Migrasi seed & rehidrasi localStorage:** persist memakai **migrasi PER-VERSION** (`MIGRATIONS[v]` di `src/store/persist.ts`, dari versi tersimpan → `CURRENT_VERSION=5`): v1→v2 menambah field `source` pada jurnal, v2→v3 menambah akun seed **1-1500 Kas Kecil** (base 0, seimbang), v3→v4 antrian offline, v4→v5 `lastSyncedAt`; langkah akhir me-refresh seed (jurnal seed diganti nilai terbaru, **jurnal buatan pengguna bertahan**). Upgrade versi menembak handler → **toast "Data lokal dimigrasi ke versi baru (vX → v5) — N jurnal pengguna dipertahankan"** agar user tahu statenya tidak hilang. Dibuktikan test integrasi `src/store/rehydration.test.ts` (rehidrasi penuh lewat localStorage NYATA: upgrade + toast, sesi/antrian bertahan, round-trip save→storage→reload, storage korup aman) + unit per-version & handler di `persist.test.ts`.

**Sinkronisasi antrian offline:** saat server mati, semua operasi jurnal (buat/posting/reverse/delete/submit/approve/reject) selain diterapkan lokal juga **masuk antrian** (`offlineQueue`, dipersist di localStorage — tidak hilang saat reload; versi persist v4). Begitu koneksi pulih — deteksi otomatis via **polling koneksi berkala** (`App.tsx`: cek `GET /health` tiap **10 detik**, tanpa auth; `api.health()` + aksi store `pollConnection`; no-op saat online) yang memanggil `init({ silent: true })` ulang sendiri **tanpa user menekan "Coba lagi"** — antrian di-*flush* ke API berurutan (id lokal di-remap ke id server, urutan dijaga) lalu state di-rekonsiliasi dari server. Banner offline menampilkan jumlah operasi yang menunggu; saat sinkron berjalan muncul banner "Menyinkronkan…". Operasi yang ditolak server (mis. periode tertutup) dikeluarkan dari antrian dengan toast error; jaringan putus di tengah flush membuat sisa operasi tetap antri untuk percobaan berikutnya.

Base URL API bisa diubah lewat env `VITE_API_URL` (default `http://localhost:4000`).

Build, lint & test:

```bash
npm run build
npm run lint
npm test          # Vitest — unit (akuntansi, Buku Besar/Laba Rugi/Neraca/Neraca Lajur, migrasi persist per-version, refresh token, polling koneksi, antrian offline, rehidrasi localStorage) + property-based (fast-check) + integration MSW (168 test)
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
- **Pengaturan**: tombol **"Reset ke data demo"** membuka modal konfirmasi (rincian yang dihapus: jurnal lokal, antrian offline, status server) — saat online memanggil `POST /admin/reset` di mock API **dan** membersihkan localStorage, jadi satu klik mereset lokal + server sekaligus; saat offline hanya reset lokal (toast mengabari server tidak ikut ter-reset)
- **Akses cepat reset dari halaman mana pun**: klik **avatar user** (top bar) → dropdown berisi info akun + **Pengaturan** / **Reset data demo** (membuka modal konfirmasi yang sama) / **Keluar

## Lapisan API (async fetch — `API - Accounting.md`)

- `src/api/client.ts` — wrapper `fetch`: envelope `{ data }` / `{ error: { code, message } }`, bearer JWT, header `X-Entity-Id`, `ApiError`, deteksi gagal jaringan, **refresh token otomatis** (401 → POST /auth/refresh, dedupe paralel → retry; refresh gagal → handler sesi berakhir). `setAuth(null, null, null)` (logout) **membersihkan token + entityId** — sesi berikutnya tidak membocorkan tenant lama
- `src/api/index.ts` — endpoint typed: auth (login, logout), akun, jurnal (create/post/reverse/delete), dashboard (summary/trend/recent/alerts), buku besar, laba rugi, neraca lajur, neraca + normalisasi ke tipe lokal
- `src/hooks/useApiFetch.ts` — fetch async dengan gate koneksi (hindari 401 saat token belum siap), loading, fallback offline
- `src/store/useStore.ts` — halaman login sungguhan: `login(email, password)` → `POST /auth/login` (token + user dipersist, reload tidak login ulang), `logout()`, `loginOffline()` (data demo tanpa server); `init()` hanya memulihkan sesi tersimpan; semua mutasi (save/post/reverse/delete) memanggil API saat online, fallback lokal saat offline
- **Lupa password** (`components/ForgotPasswordPage.tsx`): link "Lupa password?" di halaman login → form email → `POST /auth/forgot-password` (tanpa auth). Mock API mengembalikan hint password (mode demo) + arahan "hubungi admin" untuk produksi; email tak terdaftar → `USER_NOT_FOUND` dengan petunjuk hubungi admin
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
