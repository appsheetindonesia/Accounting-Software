# API Contract — Appsheet Accounting Journal (Draft)
### REST API Contract · Selaras dengan PRD Ver 3 & TRD

---

## Dokumen Informasi

| Field | Nilai |
|-------|-------|
| **Produk** | Appsheet Accounting Journal |
| **Versi API** | v1 |
| **Base URL** | `https://api.appsheetaccountingjournal.com/v1` |
| **Format** | JSON (UTF-8), `Content-Type: application/json` |
| **Status** | Draft untuk review backend |
| **Sumber** | PRD Ver 3 - Accounting, TRD - Accounting |

---

## 1. Konvensi Umum

### 1.1 Autentikasi
- Semua endpoint (kecuali `/auth/login` dan `/auth/refresh`) wajib menyertakan:
  ```
  Authorization: Bearer <access_token>
  ```
- Access token: JWT, masa berlaku 24 jam. Refresh token: POST `/auth/refresh` → pair baru.
- Multi-tenant: header `X-Entity-Id` wajib pada semua request yang menyentuh data keuangan. Default diambil dari profile user jika tidak disertakan.

### 1.2 Response Envelope
```json
// Sukses
{ "data": { ... }, "meta": { "page": 1, "pageSize": 50, "total": 320, "totalPages": 7 } }

// Error
{ "error": { "code": "JOURNAL_UNBALANCED", "message": "Total debit dan kredit harus sama",
             "details": [ { "field": "lines", "message": "Selisih: Rp1.000.000" } ] } }
```

### 1.3 Pagination & Filter (konvensi query param)
- Pagination: `?page=1&pageSize=50` (default page=1, pageSize=50, max 200)
- Filter tanggal: `startDate` / `endDate` (ISO `YYYY-MM-DD`) atau `period` (`YYYY-MM`)
- Filter status: `status=draft|posted|reversed|pending-approval` (bisa comma-separated)
- Pencarian: `keyword` (partial match, case-insensitive, debounce di client 300ms)
- Sorting: `sort=-date` (tanda minus = DESC), whitelist kolom per endpoint

### 1.4 Format Nilai
- Semua nominal dalam **IDR**, dikirim sebagai `number` (rupiah, maks 2 desimal)
- Tanggal/waktu: ISO 8601 (`2026-03-15T10:00:00Z`); tanggal saja: `2026-03-15`
- Kode akun: string `{{GOL}}-{{NOMOR}}` (contoh `1-1100`)

### 1.5 Status Code Umum

| Code | Arti | Kapan |
|------|------|-------|
| 200 | OK | GET/PUT/PATCH sukses |
| 201 | Created | POST sukses |
| 204 | No Content | DELETE sukses |
| 400 | Bad Request | Parameter/body tidak valid secara format |
| 401 | Unauthorized | Token invalid/expired. Kode `UNAUTHORIZED` (tanpa token/user tak dikenal) atau `TOKEN_EXPIRED` (access token basi → client refresh otomatis lalu retry, tanpa redirect) |
| 403 | Forbidden | Role tidak punya akses → toast "Tidak memiliki akses" |
| 404 | Not Found | Resource tidak ditemukan |
| 409 | Conflict | Data konflik (versi lama, duplikat nomor bukti) → refresh halaman |
| 422 | Unprocessable | Validasi bisnis gagal → mapping ke field form |
| 429 | Too Many Requests | Rate limit (30 req/menit/endpoint/user) |
| 500 | Internal Server Error | Kesalahan server |

---

## 2. Auth & Pengguna

> **Kedaluwarsa access token terjadwal** (mock): token `mock.<userId>.<issuedAt>` hanya valid selama **TTL** — default 3600 detik, diubah lewat env `MOCK_ACCESS_TTL=<detik>` (mis. `10` = 10 detik untuk demo). Request dengan token basi → **401 `TOKEN_EXPIRED`**; klien otomatis `POST /auth/refresh` → retry request asli (tanpa reload). `POST /admin/expire-tokens` (dev-only) memaksa semua token lama basi seketika (untuk uji deterministik); `POST /admin/reset` mengembalikan ke normal.

### 2.1 POST `/auth/login`
Login dengan email & password.

**Request:**
```json
{ "email": "rina@estetikakreasi.co.id", "password": "*****" }
```

**Response 200:**
```json
{
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "expiresIn": 86400,
    "user": { "id": "user-001", "name": "Rina", "email": "rina@estetikakreasi.co.id",
              "role": "admin", "entityId": "ent-001" }
  }
}
```
**Error:** 401 `INVALID_CREDENTIALS` · 422 `VALIDATION_ERROR` (email/password kosong)

### 2.2 POST `/auth/refresh`
**Request:** `{ "refreshToken": "eyJhbGciOi..." }`
**Response 200:** `{ "data": { "accessToken": "...", "refreshToken": "...", "expiresIn": 86400 } }`
**Error:** 401 `INVALID_REFRESH_TOKEN` · 401 `SESSION_EXPIRED` (client tampilkan modal "Sesi berakhir")

### 2.3 POST `/auth/logout`
Revoke refresh token. **Request:** `{ "refreshToken": "..." }` · **Response 204**

### 2.4 GET `/auth/me`
Profile + izin role.
**Response 200:**
```json
{
  "data": {
    "user": { "id": "user-001", "name": "Rina", "email": "rina@estetikakreasi.co.id",
              "role": "admin", "entityId": "ent-001" },
    "permissions": ["account.write", "journal.write", "journal.approve", "report.read", "period.manage"],
    "activePeriod": { "id": "fp-2026-03", "name": "Maret 2026", "isOpen": true }
  }
}
```

### 2.5 POST `/auth/forgot-password`
Lupa password (tanpa auth). Di produksi mengirim tautan reset ke email; di **mock** info akun dikembalikan langsung (mode demo) + arahan hubungi admin.
**Request:** `{ "email": "rina@estetikakreasi.co.id" }`
**Response 200:**
```json
{
  "data": {
    "email": "rina@estetikakreasi.co.id",
    "name": "Rina",
    "role": "admin",
    "expiresIn": 900,
    "message": "Permintaan reset diterima (mode demo).",
    "hint": "Demo mock: password akun ini adalah \"password123\"",
    "note": "Di lingkungan produksi, tautan reset dikirim ke email Anda. Untuk prototipe, hubungi admin untuk reset manual."
  }
}
```
**Error:** 404 `USER_NOT_FOUND` (email tidak terdaftar) · 422 `VALIDATION_ERROR` (email kosong)

### 2.6 POST `/auth/change-password`
**Request:** `{ "currentPassword": "...", "newPassword": "..." }` · **Response 204**
**Error:** 422 `WEAK_PASSWORD` · 401 `INVALID_PASSWORD`

### 2.7 Users & Role (P2)
| Method | Endpoint | Deskripsi | Response |
|--------|----------|-----------|----------|
| GET | `/users?entityId=&role=&page=` | Daftar user entitas | 200 `{ data: AppUser[], meta }` |
| POST | `/users` | Undang user baru | 201 `{ data: AppUser }` |
| GET | `/users/{id}` | Detail user | 200 `{ data: AppUser }` |
| PUT | `/users/{id}` | Update profil/role | 200 `{ data: AppUser }` |
| PATCH | `/users/{id}/deactivate` | Non-aktifkan (soft delete) | 204 |

**Request POST /users:**
```json
{ "name": "Budi", "email": "budi@estetikakreasi.co.id", "role": "accountant" }
```
**Error:** 409 `EMAIL_EXISTS` · 403 `FORBIDDEN` (hanya admin)

---

## 3. Entitas (Multi-Tenant, P1)

### 3.1 GET `/entities`
Daftar entitas milik user (akuntan freelance punya banyak).
**Response 200:**
```json
{ "data": [ { "id": "ent-001", "name": "PT. Kreasi Inovasi Estetika", "currency": "IDR",
              "fiscalYearStart": "01-01", "createdAt": "2025-01-01T00:00:00Z" } ], "meta": {} }
```

### 3.2 POST `/entities`
**Request:** `{ "name": "Toko Berkah", "currency": "IDR", "fiscalYearStart": "01-01" }`
**Response 201:** `{ "data": { "id": "ent-002", ... } }`

### 3.3 GET/PUT `/entities/{id}` · POST `/entities/{id}/activate`
- GET → 200 `{ data: Entity }`
- PUT → update nama/currency/fiscalYearStart → 200
- POST activate → set entitas aktif untuk user → 200 `{ data: { activeEntityId } }`

---

## 4. Chart of Accounts

### 4.1 GET `/accounts`
Daftar akun, flat atau tree.

**Query params:** `?tree=true&activeOnly=true&keyword=&type=asset&page=`

**Response 200 (tree=true):**
```json
{
  "data": {
    "accounts": [
      { "id": "1-1000", "code": "1-1000", "name": "Aktiva Lancar", "type": "asset",
        "group": "current_asset", "category": "Kas & Bank", "normalBalance": "debit",
        "balance": 593000000, "isActive": true, "parentId": null,
        "children": [
          { "id": "1-1100", "code": "1-1100", "name": "Kas Besar", "type": "asset",
            "group": "current_asset", "category": "Kas & Bank", "normalBalance": "debit",
            "balance": 58000000, "isActive": true, "parentId": "1-1000", "children": [] }
        ] }
    ],
    "totals": { "asset": 1093000000, "liability": 120000000, "equity": 593000000 }
  }
}
```
**Error:** 401 `UNAUTHORIZED` · 403 `FORBIDDEN`

### 4.2 POST `/accounts`
**Request:**
```json
{ "code": "1-1500", "name": "Kas Kecil", "type": "asset", "group": "current_asset",
  "category": "Kas & Bank", "normalBalance": "debit", "parentId": "1-1000",
  "description": "Kas kecil untuk operasional", "isActive": true }
```
**Response 201:** `{ "data": { "id": "1-1500", "code": "1-1500", ..., "balance": 0 } }`
**Error:**
- 409 `ACCOUNT_CODE_EXISTS` — "Kode akun sudah digunakan"
- 422 `INVALID_CODE_FORMAT` — "Format kode {{GOL}}-{{NOMOR}}"
- 422 `INVALID_PARENT` — "Akun induk tidak ditemukan atau non-aktif"

### 4.3 PUT `/accounts/{id}`
Update nama, kategori, deskripsi, parent, normalBalance, group.
**Response 200:** `{ "data": Account }`
**Error:** 404 `ACCOUNT_NOT_FOUND` · 409 `ACCOUNT_CODE_EXISTS`

### 4.4 DELETE `/accounts/{id}`
Soft delete (isActive=false) — hard delete hanya jika saldo 0 & tanpa sub-akun.
**Response 204**
**Error:**
- 409 `ACCOUNT_HAS_CHILDREN` — "Akun induk tidak bisa dihapus jika memiliki sub-akun aktif"
- 409 `ACCOUNT_HAS_BALANCE` — "Akun memiliki saldo; non-aktifkan saja"

### 4.5 PATCH `/accounts/{id}/activate` · `/deactivate`
**Response 200:** `{ "data": { "id": "1-1500", "isActive": false } }`

### 4.6 POST `/accounts/template`
Muat template COA UKM PSAK (menimpa hanya jika COA kosong; jika sudah ada → mode merge).
**Request:** `{ "templateId": "ukm-psak-2026", "mode": "replace" | "merge" }`
**Response 201:**
```json
{ "data": { "created": 42, "skipped": 3, "accounts": [ Account ] } }
```
**Error:** 409 `ACCOUNTS_EXIST` (mode replace saat COA tidak kosong, perlu konfirmasi)

### 4.7 POST `/accounts/import` (P1)
`multipart/form-data`, field `file` (xlsx). Validasi per baris.
**Response 200:**
```json
{ "data": { "imported": 38, "failed": 2,
            "errors": [ { "row": 12, "code": "1-9999", "message": "Kode duplikat" } ] } }
```

### 4.8 GET `/accounts/export`
**Query:** `?format=xlsx` · **Response 200:** file binary + `Content-Disposition: attachment; filename="chart-of-accounts.xlsx"`

---

## 5. Jurnal

### 5.1 GET `/journals`
Daftar jurnal dengan filter & pagination.

**Query params:** `?startDate=2026-03-01&endDate=2026-03-31&accountId=1-1100&status=posted&keyword=sewa&sort=-date&page=1&pageSize=50`

**Response 200:**
```json
{
  "data": {
    "journals": [
      { "id": "JNL-2026-03-001", "transactionNumber": "BKM-2026-03-0001",
        "date": "2026-03-15T10:00:00Z", "description": "Penerimaan pembayaran jasa konsultasi dari PT Maju Sejahtera",
        "status": "posted", "totalDebit": 25000000, "totalCredit": 25000000,
        "createdBy": "user-001", "createdAt": "2026-03-15T10:05:00Z",
        "approvedBy": "user-002", "approvedAt": "2026-03-15T11:00:00Z",
        "hasAttachment": true,
        "lines": [
          { "id": "line-1", "accountId": "1-1100", "accountCode": "1-1100",
            "accountName": "Kas Besar", "debit": 25000000, "credit": 0, "description": "Penerimaan tunai" },
          { "id": "line-2", "accountId": "4-1000", "accountCode": "4-1000",
            "accountName": "Pendapatan Jasa", "debit": 0, "credit": 25000000, "description": "Pendapatan jasa konsultasi" }
        ] }
    ],
    "totals": { "debit": 125000000, "credit": 125000000, "difference": 0 }
  },
  "meta": { "page": 1, "pageSize": 50, "total": 320, "totalPages": 7 }
}
```
**Catatan:** `totals.difference` = selisih debit-kredit seluruh hasil filter (debug & footer tabel).

### 5.2 POST `/journals`
Buat jurnal baru (default status `draft`, atau `pending-approval` jika `submitForApproval: true`).

**Request:**
```json
{
  "date": "2026-03-15",
  "transactionNumber": "BKM-2026-03-0015",
  "description": "Penerimaan pembayaran dari PT ABC",
  "submitForApproval": false,
  "lines": [
    { "accountId": "1-1100", "debit": 15000000, "credit": 0, "description": "Penerimaan tunai" },
    { "accountId": "4-1000", "debit": 0, "credit": 15000000, "description": "Pendapatan jasa" }
  ]
}
```
**Response 201:**
```json
{ "data": { "id": "JNL-2026-03-042", "transactionNumber": "BKM-2026-03-0015",
            "date": "2026-03-15", "description": "Penerimaan pembayaran dari PT ABC",
            "lines": [ JournalLine ], "status": "draft",
            "createdBy": "user-001", "createdAt": "2026-03-15T14:02:00Z" } }
```
**Error:**
- 422 `JOURNAL_UNBALANCED` — "Total debit ({{D}}) dan kredit ({{K}}) harus sama. Selisih: {{S}}" (details per field)
- 422 `JOURNAL_NO_LINES` — "Jurnal harus memiliki minimal 1 debit dan 1 kredit"
- 422 `LINE_NO_ACCOUNT` — "Akun tidak aktif atau sudah dihapus"
- 422 `LINE_NEGATIVE_AMOUNT` — "Nilai debit/kredit tidak boleh negatif"
- 422 `PERIOD_CLOSED` — "Periode Maret 2026 sudah ditutup"
- 409 `TRANSACTION_NUMBER_DUPLICATE` — "Nomor bukti sudah digunakan"

### 5.3 GET `/journals/{id}`
Detail lengkap termasuk `auditTrail` dan `attachments`.
**Response 200:**
```json
{ "data": {
    "id": "JNL-2026-03-001", "transactionNumber": "BKM-2026-03-0001",
    "date": "2026-03-15T10:00:00Z", "description": "...", "status": "posted",
    "lines": [ JournalLine ], "auditTrail": [
      { "userId": "user-001", "action": "create", "timestamp": "2026-03-15T10:05:00Z" },
      { "userId": "user-001", "action": "post", "timestamp": "2026-03-15T10:06:00Z" }
    ],
    "attachments": [ { "id": "att-1", "fileName": "bukti-bkm-0015.pdf", "size": 245760,
                       "mimeType": "application/pdf", "uploadedAt": "2026-03-15T10:07:00Z" } ] } }
```

### 5.4 PUT `/journals/{id}`
Edit jurnal **draft** (atau `pending-approval` oleh pembuatnya).
**Request:** body sama dengan POST (minus `submitForApproval`). **Response 200:** `{ data: JournalEntry }`
**Error:** 409 `JOURNAL_ALREADY_POSTED` — "Jurnal sudah diposting, tidak dapat diedit" · 403 `FORBIDDEN`

### 5.5 DELETE `/journals/{id}`
Hapus hanya jurnal **draft**.
**Response 204** · **Error:** 409 `JOURNAL_ALREADY_POSTED`

### 5.6 POST `/journals/{id}/post`
Posting: validasi balance + periode terbuka → status `posted` → update saldo akun (transaksional).

**Request:** `{ "confirmPeriodWarning": true }` (opsional, jika tanggal di periode non-aktif)
**Response 200:**
```json
{ "data": { "id": "JNL-2026-03-042", "status": "posted", "postedAt": "2026-03-15T14:10:00Z",
            "affectedAccounts": [ { "accountId": "1-1100", "newBalance": 58000000 },
                                  { "accountId": "4-1000", "newBalance": 180000000 } ] } }
```
**Error:** 422 `JOURNAL_UNBALANCED` · 422 `PERIOD_CLOSED` · 409 `ALREADY_POSTED`

### 5.7 POST `/journals/{id}/reverse`
Membalik jurnal posted → membuat jurnal pembalik otomatis.

**Request:** `{ "reason": "Koreksi pencatatan 15 Maret", "postReversal": true }`
**Response 200:**
```json
{ "data": { "reversedJournalId": "JNL-2026-03-042", "status": "reversed",
            "reversalJournal": { "id": "JNL-2026-03-043",
                                 "transactionNumber": "REV-BKM-2026-03-0001",
                                 "status": "posted", "reversalOf": "JNL-2026-03-042",
                                 "lines": [ /* debit↔kredit dibalik */ ] } } }
```
**Error:** 409 `ALREADY_REVERSED` · 422 `PERIOD_CLOSED` · 404 `JOURNAL_NOT_FOUND`

### 5.8 Approval Workflow (P1)
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/journals/{id}/submit` | draft → `pending-approval` |
| POST | `/journals/{id}/approve` | `pending-approval` → `posted` (update saldo) |
| POST | `/journals/{id}/reject` | → kembali `draft` + `rejectionReason` |

**Response approve 200:** `{ data: { status: "posted", approvedBy: "user-002", approvedAt: "..." } }`
**Error:** 403 `NO_APPROVAL_RIGHTS` (role viewer/accountant tanpa izin) · 409 `INVALID_STATUS_TRANSITION`

### 5.9 Lampiran (P1)
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/journals/{id}/attachments` | Upload `multipart/form-data` field `file` (jpg/png/pdf, max 5MB, max 5 file) → 201 |
| GET | `/journals/{id}/attachments/{attId}` | Download file |
| DELETE | `/journals/{id}/attachments/{attId}` | Hapus (hanya jika belum posted) → 204 |

**Error upload:** 422 `FILE_TOO_LARGE` · 422 `UNSUPPORTED_FILE_TYPE` · 409 `JOURNAL_ALREADY_POSTED`

### 5.10 GET `/journals/next-number`
Ambil nomor bukti berikutnya untuk preview di form.
**Query:** `?prefix=BKM&period=2026-03`
**Response 200:** `{ "data": { "transactionNumber": "BKM-2026-03-0016" } }`

---

## 6. Buku Besar (General Ledger)

### 6.1 GET `/ledger/accounts/{accountId}`
Buku besar satu akun per periode, dengan saldo berjalan.

**Query:** `?period=2026-03` (wajib) · `?includeOpening=true` (default)

**Response 200:**
```json
{ "data": {
    "accountId": "1-1100", "accountCode": "1-1100", "accountName": "Kas Besar",
    "period": "2026-03", "openingBalance": 50000000, "closingBalance": 55000000,
    "entries": [
      { "journalEntryId": "JNL-2026-03-001", "date": "2026-03-10",
        "reference": "BKK-2026-03-0008", "description": "Bayar sewa April",
        "debit": 0, "credit": 10000000, "balance": 55000000 },
      { "journalEntryId": "JNL-2026-03-002", "date": "2026-03-15",
        "reference": "BKM-2026-03-0001", "description": "Penerimaan dari PT ABC",
        "debit": 15000000, "credit": 0, "balance": 65000000 }
    ] } }
```
**Catatan:** saldo berjalan dihitung dari openingBalance + transaksi terurut tanggal. `closingBalance` adalah saldo akhir periode.
**Error:** 404 `ACCOUNT_NOT_FOUND` · 422 `INVALID_PERIOD`

### 6.2 GET `/ledger`
Rekap saldo semua akun per periode (data baku untuk Neraca Lajur / filter akun).
**Query:** `?period=2026-03`
**Response 200:**
```json
{ "data": { "period": "2026-03",
    "accounts": [ { "accountId": "1-1100", "accountCode": "1-1100",
                    "accountName": "Kas Besar", "openingBalance": 50000000,
                    "totalDebit": 15000000, "totalCredit": 10000000,
                    "closingBalance": 55000000 } ] } }
```

---

## 7. Neraca Lajur (Trial Balance)

### 7.1 GET `/reports/trial-balance`
**Query:** `?period=2026-03`
**Response 200:**
```json
{ "data": {
    "type": "trial-balance", "period": { "start": "2026-03-01", "end": "2026-03-31" },
    "generatedAt": "2026-03-31T23:59:00Z", "currency": "IDR",
    "lines": [
      { "accountId": "1-1100", "accountCode": "1-1100", "accountName": "Kas Besar",
        "debit": 58000000, "credit": 0 },
      { "accountId": "4-1000", "accountCode": "4-1000", "accountName": "Pendapatan Jasa",
        "debit": 0, "credit": 155000000 }
    ],
    "totals": { "debit": 638000000, "credit": 638000000, "isBalanced": true } } }
```
**Error:** 422 `NO_DATA` — "Belum ada transaksi di periode ini" (200 dengan lines kosong juga diterima; client tampilkan empty state)

---

## 8. Laporan Keuangan

### 8.1 GET `/reports/income-statement`
**Query:** `?period=2026-03&compareTo=2026-02` (compareTo opsional, P2)

**Response 200:**
```json
{ "data": {
    "id": "RPT-2026-03-001", "type": "income-statement",
    "entity": { "id": "ent-001", "name": "PT. Kreasi Inovasi Estetika" },
    "period": { "start": "2026-03-01", "end": "2026-03-31" },
    "generatedAt": "2026-03-31T23:59:00Z", "currency": "IDR",
    "sections": [
      { "title": "PENDAPATAN", "subtotal": 155000000,
        "lines": [
          { "accountCode": "4-1000", "accountName": "Pendapatan Jasa",
            "amount": 150000000, "indentLevel": 2, "isBold": false, "isTotal": false },
          { "accountCode": "", "accountName": "Total Pendapatan",
            "amount": 155000000, "indentLevel": 1, "isBold": true, "isTotal": true }
        ] },
      { "title": "BEBAN", "subtotal": 62000000, "lines": [ ReportLine ] }
    ],
    "netIncome": 93000000 } }
```

### 8.2 GET `/reports/balance-sheet`
Disajikan **per tanggal** (`asOf`), bukan per periode.

**Query:** `?asOf=2026-03-31`
**Response 200:**
```json
{ "data": {
    "id": "RPT-2026-03-002", "type": "balance-sheet",
    "entity": { "id": "ent-001", "name": "PT. Kreasi Inovasi Estetika" },
    "asOf": "2026-03-31", "generatedAt": "2026-03-31T23:59:00Z", "currency": "IDR",
    "sections": [
      { "title": "ASET", "subtotal": 1093000000,
        "lines": [
          { "accountCode": "1-1000", "accountName": "Aktiva Lancar", "amount": 593000000, "indentLevel": 1 },
          { "accountCode": "1-1100", "accountName": "  Kas Besar", "amount": 58000000, "indentLevel": 2 }
        ] },
      { "title": "KEWAJIBAN & EKUITAS", "subtotal": 1093000000, "lines": [ ReportLine ] }
    ],
    "totalAssets": 1093000000, "totalLiabilitiesEquity": 1093000000, "isBalanced": true } }
```

### 8.3 GET `/reports/cash-flow` (P2)
**Query:** `?period=2026-03&method=indirect`
**Response 200:**
```json
{ "data": {
    "id": "RPT-2026-03-003", "type": "cash-flow",
    "period": { "start": "2026-03-01", "end": "2026-03-31" },
    "sections": [
      { "title": "ARUS KAS DARI AKTIVITAS OPERASI", "subtotal": 15000000, "lines": [ ReportLine ] },
      { "title": "ARUS KAS DARI AKTIVITAS INVESTASI", "subtotal": -20000000, "lines": [ ReportLine ] },
      { "title": "ARUS KAS DARI AKTIVITAS PENDANAAN", "subtotal": 5000000, "lines": [ ReportLine ] }
    ],
    "netCashFlow": 0, "beginningCash": 50000000, "endingCash": 50000000 } }
```

### 8.4 GET `/reports/{id}`
Ambil laporan tersimpan (jika laporan disimpan saat generate). **Response 200:** `{ data: FinancialReport }`

---

## 9. Periode Fiskal

### 9.1 GET `/periods`
**Query:** `?year=2026&includeClosed=true`
**Response 200:**
```json
{ "data": { "periods": [
    { "id": "fp-2026-01", "name": "Januari 2026", "month": 1, "year": 2026,
      "startDate": "2026-01-01", "endDate": "2026-01-31",
      "isOpen": false, "isActive": false, "previousPeriodId": "fp-2025-12" },
    { "id": "fp-2026-03", "name": "Maret 2026", "month": 3, "year": 2026,
      "startDate": "2026-03-01", "endDate": "2026-03-31",
      "isOpen": true, "isActive": true, "previousPeriodId": "fp-2026-02" }
  ] } }
```

### 9.2 POST `/periods`
Buka periode baru.
**Request:** `{ "month": 4, "year": 2026, "activate": true }`
**Response 201:** `{ "data": FiscalPeriod }`
**Error:** 409 `PERIOD_EXISTS` · 422 `PERIOD_OUT_OF_RANGE` (melompati bulan kosong tanpa konfirmasi)

### 9.3 PATCH `/periods/{id}/activate`
Set periode aktif (satu-satunya). **Response 200:** `{ data: { activePeriodId: "fp-2026-04" } }`

### 9.4 PATCH `/periods/{id}/close`
Tutup periode: blokir entri baru. **Request:** `{ "confirmDraftAction": "post-all" | "delete-all" | "keep" }` — aksi atas jurnal draft yang tersisa.
**Response 200:**
```json
{ "data": { "id": "fp-2026-03", "isOpen": false,
            "handledDrafts": { "posted": 2, "deleted": 0, "kept": 1 } } }
```
**Error:** 409 `PERIOD_ALREADY_CLOSED` · 422 `DRAFT_ACTION_REQUIRED` (jika masih ada draft & belum konfirmasi)

### 9.5 GET `/periods/current`
Periode aktif sekarang. **Response 200:** `{ "data": { "id": "fp-2026-03", "name": "Maret 2026", "isOpen": true } }`

---

## 10. Dashboard

### 10.1 GET `/dashboard/summary`
**Query:** `?period=2026-03`
**Response 200:**
```json
{ "data": {
    "cards": [
      { "key": "totalAssets", "label": "Total Aset", "value": 1093000000,
        "deltaPercent": 12.5, "deltaDirection": "up", "compareLabel": "dari bulan lalu" },
      { "key": "totalLiabilities", "label": "Total Utang", "value": 320000000,
        "deltaPercent": 3.2, "deltaDirection": "down", "compareLabel": "dari bulan lalu" },
      { "key": "totalEquity", "label": "Total Modal", "value": 593000000,
        "deltaPercent": 8.1, "deltaDirection": "up", "compareLabel": "dari bulan lalu" },
      { "key": "grossProfit", "label": "Laba Bruto", "value": 45000000,
        "deltaPercent": 15.3, "deltaDirection": "up", "compareLabel": "dari bulan lalu" }
    ] } }
```
**Catatan:** `deltaDirection`: `up` | `down` | `flat`. Naik untuk aset/laba = positif; naik untuk utang = negatif (client render warna sesuai konteks).

### 10.2 GET `/dashboard/trend`
**Query:** `?months=6&endPeriod=2026-03`
**Response 200:**
```json
{ "data": { "trend": [
    { "period": "2025-10", "revenue": 120000000, "expenses": 50000000, "netIncome": 70000000 },
    { "period": "2026-03", "revenue": 155000000, "expenses": 62000000, "netIncome": 93000000 } ] } }
```

### 10.3 GET `/dashboard/recent-journals`
**Query:** `?limit=5` · **Response 200:** `{ "data": { "journals": [ JournalEntry (ringkas) ] } }`

### 10.4 GET `/dashboard/alerts`
**Response 200:**
```json
{ "data": { "alerts": [
    { "severity": "warning", "type": "draft_journals", "message": "3 jurnal draft belum diposting", "count": 3 },
    { "severity": "info", "type": "period_not_closed", "message": "Periode Februari 2026 belum ditutup" },
    { "severity": "danger", "type": "unbalanced", "message": "Terdapat jurnal draft tidak balance", "count": 1 }
  ] } }
```

---

## 11. Export & Cetak

### 11.1 GET `/exports/reports/{reportType}`
**Query:** `?period=2026-03&format=pdf` (atau `xlsx`; balance-sheet pakai `asOf`)

| reportType | Endpoint sumber |
|------------|-----------------|
| `trial-balance` | `/reports/trial-balance` |
| `income-statement` | `/reports/income-statement` |
| `balance-sheet` | `/reports/balance-sheet` |
| `cash-flow` | `/reports/cash-flow` |
| `ledger` | `/ledger/accounts/{accountId}` (perlu `accountId`) |
| `journals` | `/journals` (perlu filter) |

**Response 200:** file binary
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="Laba-Rugi-Maret-2026.pdf"
```
**Error:** 422 `UNSUPPORTED_FORMAT` · 404 `NO_DATA`

### 11.2 GET `/exports/accounts`
**Query:** `?format=xlsx` — export COA (dipakai juga oleh modul COA).

### 11.3 GET `/exports/ledger/{accountId}` — Buku Besar per akun
**Query:**
- `?format=pdf|xlsx&period=2026-03` — periode aktif (default `2026-03`)
- `?format=pdf|xlsx&start=2026-03-01&end=2026-03-15` — **rentang tanggal custom** (keduanya wajib, format `YYYY-MM-DD`, `start <= end`); menggantikan `period`

**Response 200:** file binary dengan `Content-Disposition: attachment; filename="Buku-Besar-1-1100-2026-03-01..2026-03-15.xlsx"`
**Error:** 404 `ACCOUNT_NOT_FOUND` · 422 `UNSUPPORTED_FORMAT` / `INVALID_PERIOD` / `INVALID_DATE_RANGE`

---

## 12. Pencarian Global

### 12.1 GET `/search`
**Query:** `?q=bkm&types=journal,account&entityId=ent-001&limit=10`
**Response 200:**
```json
{ "data": { "results": [
    { "type": "journal", "id": "JNL-2026-03-001", "title": "BKM-2026-03-0001",
      "subtitle": "Penerimaan pembayaran dari PT ABC · 15 Maret 2026",
      "metadata": { "status": "posted" } },
    { "type": "account", "id": "1-1100", "title": "Kas Besar",
      "subtitle": "1-1100 · Aset", "metadata": { "balance": 58000000 } }
  ] } }
```

---

## 13. Katalog Kode Error

| Kode | HTTP | Pesan (contoh) |
|------|------|----------------|
| `VALIDATION_ERROR` | 422 | "Data tidak valid" + details per field |
| `UNAUTHORIZED` | 401 | "Sesi berakhir. Silakan login kembali." |
| `SESSION_EXPIRED` | 401 | "Sesi berakhir" (modal) |
| `INVALID_CREDENTIALS` | 401 | "Email atau password salah" |
| `FORBIDDEN` | 403 | "Tidak memiliki akses" |
| `NOT_FOUND` | 404 | "Data tidak ditemukan" |
| `ACCOUNT_NOT_FOUND` / `JOURNAL_NOT_FOUND` / `PERIOD_NOT_FOUND` | 404 | spesifik per resource |
| `JOURNAL_UNBALANCED` | 422 | "Total debit ({{D}}) dan kredit ({{K}}) harus sama. Selisih: {{S}}" |
| `JOURNAL_NO_LINES` | 422 | "Jurnal harus memiliki minimal 1 debit dan 1 kredit" |
| `LINE_NEGATIVE_AMOUNT` | 422 | "Nilai debit/kredit tidak boleh negatif" |
| `JOURNAL_ALREADY_POSTED` | 409 | "Jurnal sudah diposting, tidak dapat diedit" |
| `ALREADY_REVERSED` | 409 | "Jurnal sudah dibatalkan" |
| `INVALID_STATUS_TRANSITION` | 409 | "Status jurnal tidak dapat diubah ke status tersebut" |
| `TRANSACTION_NUMBER_DUPLICATE` | 409 | "Nomor bukti sudah digunakan" |
| `ACCOUNT_CODE_EXISTS` | 409 | "Kode akun sudah digunakan" |
| `ACCOUNT_HAS_CHILDREN` | 409 | "Akun induk tidak bisa dihapus jika memiliki sub-akun aktif" |
| `ACCOUNT_HAS_BALANCE` | 409 | "Akun memiliki saldo; non-aktifkan saja" |
| `PERIOD_CLOSED` | 422 | "Periode {{PERIODE}} sudah ditutup" |
| `PERIOD_ALREADY_CLOSED` | 409 | "Periode sudah ditutup" |
| `PERIOD_EXISTS` | 409 | "Periode sudah ada" |
| `DRAFT_ACTION_REQUIRED` | 422 | "Masih ada jurnal draft; pilih aksi terlebih dahulu" |
| `DATA_CONFLICT` | 409 | "Data sudah diubah oleh pengguna lain. Muat ulang halaman." (ETag/version mismatch) |
| `FILE_TOO_LARGE` | 422 | "Ukuran file maksimal 5 MB" |
| `UNSUPPORTED_FILE_TYPE` | 422 | "Tipe file tidak didukung (jpg/png/pdf)" |
| `RATE_LIMITED` | 429 | "Terlalu banyak permintaan" |
| `NO_APPROVAL_RIGHTS` | 403 | "Role Anda tidak memiliki izin approve" |
| `INTERNAL_ERROR` | 500 | "Terjadi kesalahan server. Kode: {{ERROR_CODE}}" |

---

## 14. Contoh Alur End-to-End

### Alur: Login → Cek COA → Posting Jurnal → Generate Laba Rugi

```
1. POST /auth/login
   → 200 { accessToken, user }

2. GET /accounts?tree=true&activeOnly=true
   Header: Authorization: Bearer <token>, X-Entity-Id: ent-001
   → 200 { data: { accounts: [...], totals: {...} } }

3. GET /journals/next-number?prefix=BKM&period=2026-03
   → 200 { data: { transactionNumber: "BKM-2026-03-0016" } }

4. POST /journals
   → 201 { data: { id: "JNL-2026-03-042", status: "draft" } }

5. POST /journals/JNL-2026-03-042/post
   → 200 { data: { status: "posted", affectedAccounts: [...] } }
   → Client invalidate cache /journals, /ledger, /dashboard/*, /reports/*

6. GET /reports/income-statement?period=2026-03
   → 200 { data: { sections: [...], netIncome: 93000000 } }

7. GET /exports/reports/income-statement?period=2026-03&format=pdf
   → 200 application/pdf (file download)
```

### Catatan Konsistensi (untuk frontend)
- Setelah mutasi berhasil: **invalidate query keys** terkait — `['journals']`, `['ledger']`, `['accounts']`, `['dashboard']`, `['reports']` (TanStack Query)
- Optimistic update hanya untuk jurnal draft; posting/reverse tunggu respons server
- ETag/version (`If-Match`) pada PUT untuk deteksi konflik edit (409 → refresh)

---

*Draft ini siap direview tim backend; perubahan skema/status code harus disinkronkan ulang dengan TRD dan PRD Ver 3.*
