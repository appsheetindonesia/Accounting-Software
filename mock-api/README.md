# Mock API Server — Appsheet Accounting Journal

Implementasi **semua endpoint** di `API - Accounting.md` dengan **logika akuntansi nyata**
(double-entry), siap dipakai pengembangan frontend tanpa backend asli.

- **Stack:** Node.js + Express 5 (tanpa database — state in-memory, **persistence JSON opsional**)
- **Port:** `4000` (override dengan env `MOCK_API_PORT`)
- **Base URL:** `http://localhost:4000`

## Menjalankan

```bash
cd mock-api
npm install        # sekali saja
npm start          # atau: npm run dev (auto-restart saat edit file)
```

Health check: `http://localhost:4000/health`

## Dev terpadu (mock API + Vite bersamaan)

Dari **root repo**, jalankan keduanya dengan satu perintah — seed di-reset otomatis
begitu kedua server hidup, jadi prototipe selalu dibuka terhadap baseline yang terverifikasi:

```bash
npm install        # sekali saja di mock-api/ DAN prototype-accounting/
node scripts/dev.mjs            # seed awal (Maret 2026)
node scripts/dev.mjs --extra    # + jurnal lintas bulan (Jan–Feb 2026)

# Dari root repo — sama, lewat npm (package.json root):
npm run dev                     # = node scripts/dev.mjs
npm run dev:extra               # = node scripts/dev.mjs --extra
npm run dev:reset               # = node scripts/dev.mjs --reset
npm run dev:no-persist          # = node scripts/dev.mjs --no-persist
```

- Mock API (auto-restart saat edit file) → `http://localhost:4000`, prototipe → `http://localhost:5173`
- URL Vite terdeteksi otomatis dari output (kebal jika port 5173 sibuk → berpindah)
- `Ctrl+C` menghentikan kedua proses sekaligus (pohon proses ikut dimatikan)

## Integration test (Vitest + Supertest)

Uji endpoint terhadap **baseline angka** QA Test Plan §2.3 (seed Maret 2026).
Supertest memanggil app Express langsung — **tanpa perlu server berjalan**.

```bash
npm test          # vitest run — 83 test
npm run test:watch
```

Cakupan (`test/`):
- `api-baseline.test.js` (11) — baseline §2.3: 5 jurnal posted total 98jt = 98jt;
  Kas Besar 60 → 87jt (85/75/72/87); Pendapatan 155jt, Utang 150jt, Modal 363jt;
  Neraca 557 = 150 + 363 + 44 (isBalanced); Trial balance 668 = 668;
  Laba Rugi 155 − 111 = 44jt; dashboard 4 kartu; alert 2 draft; posting 10jt →
  saldo live (87→97, 155→165, 557→567); reverse → kembali ke baseline.
- `error-envelope.test.js` (40) — **error envelope semua endpoint** terhadap
  katalog kode error `API - Accounting.md` §13: format
  `{ error: { code, message, details? } }` tanpa field `data`; status
  401/403/409/422/404 per kategori (23 kode katalog terimplementasi terpicu;
  6 gap terdokumentasi: SESSION_EXPIRED, FILE_TOO_LARGE, UNSUPPORTED_FILE_TYPE,
  RATE_LIMITED, NO_APPROVAL_RIGHTS, INTERNAL_ERROR).
- `extra-seed.test.js` (12) — seed:extra (`withExtra: true`): muatan 15 jurnal
  (3 Jan + 4 Feb + 8 Mar), **saldo berantai Kas 60→40→64→91jt** lintas periode
  (akhir bulan N = awal bulan N+1), dan blokade periode tertutup Jan/Feb
  (POST jurnal, reverse, PUT pindah tanggal → 422 PERIOD_CLOSED).
- `token-ttl.test.js` (4) — **kedaluwarsa token terjadwal**: TTL diubah saat
  runtime (`POST /admin/set-token-ttl`), token basi sesuai WAKTU NYATA
  (tunggu > TTL → 401 TOKEN_EXPIRED), refresh → token baru valid; token lama
  tetap basi walau TTL dinaikkan (check berbasis issuedAt); reset → TTL
  kembali ke default 3600.
- `persistence.test.js` (10) — persistence JSON opsional.

## Persistence opsional (jurnal tidak hilang saat restart)

Secara **default AKTIF**: state (jurnal, akun, periode, sesi refresh token) disimpan ke file
JSON setiap kali ada mutasi sukses, dan dimuat kembali saat server start — jurnal yang sudah
diposting **tidak hilang** saat restart. File disimpan di `mock-api/.data/db.json` (ter-ignore git).

| Env | Efek |
|-----|------|
| `MOCK_API_PERSIST=1` (default) | Persistence AKTIF — state dimuat & disimpan ke file |
| `MOCK_API_PERSIST=0` | **Nonaktifkan** — perilaku in-memory lama (reset saat restart) |
| `MOCK_API_PERSIST_FILE=<path>` | Lokasi file custom (default `.data/db.json`) |

```bash
MOCK_API_PERSIST=0 npm start        # tanpa persistence
MOCK_API_PERSIST_FILE=/tmp/state.json npm start
```

Catatan: file rusak / bentuk salah → otomatis jatuh ke seed awal (log peringatan).
`POST /admin/reset` & `POST /admin/seed-bulk` juga ikut di-persist (kecuali seed-bulk yang
sengaja dikecualikan agar file tidak membengkak dengan data uji massal RG-09).

## Reset & seed tambahan

Dua cara mengembalikan ke seed (persistence ikut di-reset juga):

| Perintah | Efek |
|----------|------|
| `npm run reset` | Reset state server yang berjalan ke **seed awal** (Maret 2026) — tanpa restart |
| `npm run seed:extra` | Muat **seed + jurnal lintas bulan** (Januari & Februari 2026, periode tertutup) |
| `MOCK_API_PERSIST=0 npm start` | Tanpa persistence → restart otomatis kembali ke seed awal |

Keduanya memanggil `POST /admin/reset` (dev-only, tanpa auth) di `http://localhost:4000`.
Contoh pemakaian: setelah pengujian QA lewat API, `npm run reset` membersihkan jurnal uji
agar angka kembali ke baseline yang terverifikasi, tanpa mematikan server.

Endpoint dev lain: `POST /admin/seed-bulk {count}` (maks 50.000) — seed massal jurnal
seimbang untuk uji performa (RG-09); `POST /admin/expire-tokens` — paksa semua access
token yang diterbitkan sebelumnya kedaluwarsa (uji deterministik tanpa menunggu TTL;
di-reset oleh `POST /admin/reset`); `POST /admin/set-token-ttl {ttlSeconds}` — ubah
TTL access token SAAT RUNTIME (tanpa restart) untuk simulasi **kedaluwarsa terjadwal**:
token yang diterbitkan sebelumnya basi N detik setelah issuedAt-nya (dipakai E2E
RG-19; di-reset oleh `POST /admin/reset`). Reset memakai `structuredClone` agar
mutasi runtime (tutup periode, reverse, edit akun) tidak mencemari seed.

**Kedaluwarsa access token terjadwal**: token `mock.<userId>.<issuedAt>` hanya valid
`MOCK_ACCESS_TTL` detik (default 3600). Demo cepat: `MOCK_ACCESS_TTL=10 npm run dev` →
token basi dalam 10 detik → klien prototipe otomatis `POST /auth/refresh` → retry request
(tanpa reload; lihat `prototype-accounting/src/api/client.ts`). Untuk simulasi tanpa
restart, `POST /admin/set-token-ttl {ttlSeconds: N}` mengubah TTL runtime — token
yang diterbitkan sebelum panggilan ikut basi N detik setelah issuedAt-nya.

Multi-tenant: jurnal kini membawa `entityId` (dari `X-Entity-Id`, default entitas user);
`GET /journals` memfilter berdasarkan entitas aktif — dipakai RG-05 di suite E2E.

## Login demo

| Peran | Email | Password |
|-------|-------|----------|
| Admin | `rina@bukuwarung.com` | `password123` |
| Akuntan | `dimas@estetikakreasi.co.id` | `password123` |
| Viewer | `budi@estetikakreasi.co.id` | `password123` |

Semua endpoint (kecuali `/auth/login` & `/auth/refresh`) butuh
`Authorization: Bearer mock.<userId>` — token didapat dari `POST /auth/login`.
Multi-tenant: header `X-Entity-Id` (default dari profil user).

```bash
# Contoh alur cepat
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"rina@bukuwarung.com","password":"password123"}'
# → { "data": { "accessToken": "mock.user-001...", ... } }

curl http://localhost:4000/journals?status=posted \
  -H "Authorization: Bearer mock.user-001.1786720000000"
```

## Endpoint yang diimplementasikan (±50)

| Modul | Endpoint | Logika nyata |
|-------|----------|--------------|
| **Auth & Users** | login, refresh, logout, me, change-password, **forgot-password** (mock: hint + arahan admin), CRUD user (P2) | Role → permissions (`/auth/me`), soft-delete user |
| **Entitas** | CRUD + activate | Multi-tenant via `X-Entity-Id` |
| **COA** | CRUD, tree view, template PSAK, import/export, activate/deactivate | Validasi format kode `GOL-NOMOR`, duplikat 409, header akun, saldo turunan |
| **Jurnal** | CRUD, post, reverse, submit/approve/reject, attachments, next-number | **Validasi balance (422)**, periode tertutup (422), nomor duplikat (409), optimistic lock If-Match (409), **posting update saldo**, **reverse membuat jurnal pembalik (net 0)** |
| **Buku Besar** | per akun + rekap semua akun | Saldo berjalan dari opening + transaksi, saldo = base + efek jurnal posted |
| **Laporan** | Neraca Lajur, Laba Rugi, Neraca (asOf), Arus Kas | Trial balance **isBalanced**, neraca seimbang, laba bersih = pendapatan − beban |
| **Periode** | CRUD, activate, close | Close periode + aksi jurnal draft (`post-all`/`delete-all`/`keep`), blokir entri di periode tertutup |
| **Dashboard** | summary, trend, recent-journals, alerts | Kartu saldo + delta, alert draft jurnal / periode belum ditutup |
| **Export** | PDF/XLSX per laporan, COA | Content-Disposition + payload placeholder |
| **Search** | global lintas jurnal & akun | Partial match case-insensitive |

## Konvensi respons (persis `API - Accounting.md`)

```json
// Sukses
{ "data": { ... }, "meta": { "page": 1, "pageSize": 50, "total": 8, "totalPages": 1 } }

// Error
{ "error": { "code": "JOURNAL_UNBALANCED", "message": "Total debit (100000) dan kredit (90000) harus sama. Selisih: 10000",
             "details": [ { "field": "lines", "message": "Selisih: Rp10.000" } ] } }
```

Katalog error: `VALIDATION_ERROR`, `INVALID_CREDENTIALS`, `UNAUTHORIZED`, `FORBIDDEN`,
`NOT_FOUND`, `JOURNAL_UNBALANCED`, `JOURNAL_NO_LINES`, `LINE_NEGATIVE_AMOUNT`,
`LINE_NO_ACCOUNT`, `LINE_HEADER_ACCOUNT`, `JOURNAL_ALREADY_POSTED`, `ALREADY_REVERSED`,
`INVALID_STATUS_TRANSITION`, `TRANSACTION_NUMBER_DUPLICATE`, `ACCOUNT_CODE_EXISTS`,
`ACCOUNT_HAS_CHILDREN`, `ACCOUNT_HAS_BALANCE`, `INVALID_CODE_FORMAT`, `PERIOD_CLOSED`,
`PERIOD_ALREADY_CLOSED`, `PERIOD_EXISTS`, `DRAFT_ACTION_REQUIRED`, `DATA_CONFLICT`,
`NO_APPROVAL_RIGHTS`, `EMAIL_EXISTS`, `UNSUPPORTED_FORMAT`, `NO_DATA`, dll.

## Data mock (konsisten dengan prototipe & PRD Ver 3 §16)

- **Entitas:** PT. Kreasi Inovasi Estetika (aktif), CV Karya Mandiri
- **COA:** 12 akun (Aset, Utang, Modal, Pendapatan, Beban) + template COA UKM PSAK
- **Jurnal Maret 2026:** 8 jurnal (5 posted, 2 draft, 1 reversed) — total posted 98jt debit/kredit
- **Jurnal lintas bulan (opsional, `npm run seed:extra`):** 7 jurnal tambahan — Januari (3: BKM, BKK sewa, BKK gaji) & Februari (4: BKM, BKK listrik, BKK gaji, JV piutang), semua posted di periode tertutup; berguna untuk menguji navigasi periode, saldo awal buku besar, dan laporan lintas bulan. Saldo berantai Kas: 60 → 40 (Jan) → 64 (Feb) → 91jt (Mar)
- **Periode:** Januari–Maret 2026 (Maret aktif & terbuka)

**Keseimbangan buku** (diverifikasi):
- Aset 557jt = Utang 150jt + Modal 363jt + Laba berjalan 44jt
- Trial balance Maret: debit = kredit = 668jt
- Posting jurnal → saldo akun & laporan ter-update; reverse → kembali ke kondisi semula (net 0)

## Integrasi ke frontend

```ts
// Contoh fetch dengan token dari store auth
const res = await fetch(`${API_BASE}/journals?status=posted&page=1`, {
  headers: { Authorization: `Bearer ${token}` },
})
const { data, meta } = await res.json() // { journals, totals } + meta
```

Catatan:
- State **in-memory** — reset dengan `npm run reset` (tanpa restart) atau restart server.
- File `mock-api.log` dibuat saat `npm start` — tambahkan ke `.gitignore` jika perlu.
- Untuk mocking di browser (tanpa server), lihat `openapi.yaml` di root sebagai referensi skema.

## Verifikasi

```bash
curl http://localhost:4000/health
# {"data":{"status":"ok","journals":8,"accounts":12}}
```
