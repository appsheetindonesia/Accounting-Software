# Sprint Board — GitHub Projects (Appsheet Accounting Journal)
### Panduan setup Projects v2 + contoh board · Sumber: Backlog - Accounting.md

---

## 1. Cara Membuat Board

1. Buka repo → tab **Projects** → **New project** → pilih template **"Board"** (atau "Table")
2. Nama project: **"Appsheet Accounting — Sprint Board"**
3. Project dihubungkan ke repo `appsheetindonesia/Accounting-Software`

### Field yang disiapkan (custom fields)
| Field | Tipe | Nilai |
|-------|------|-------|
| **Status** | Single select (bawaan) | `Backlog`, `Ready`, `In Progress`, `In Review`, `Done` |
| **Sprint** | Iteration | Sprint 1 (2 minggu) s/d Sprint 6 |
| **Priority** | Single select | `P0`, `P1`, `P2` |
| **Estimasi (SP)** | Number | 1–13 (Fibonacci) |

### Label issue yang dipakai
```
story          enhancement     bug
priority:P0    priority:P1     priority:P2
sprint-1       sprint-2        sprint-3
sprint-4       sprint-5        sprint-6
```
> Buat label sekali lewat Settings → Labels (atau `gh label create`). Template issue sudah menetapkan label dasar; label sprint/prioritas ditambahkan saat issue dibuat.

---

## 2. Contoh Board (Sprint 1)

```
┌───────────────┬───────────────┬───────────────┬───────────────┬──────────────┐
│ Backlog       │ Ready         │ In Progress   │ In Review     │ Done         │
├───────────────┼───────────────┼───────────────┼───────────────┼──────────────┤
│ AAJ-011 Filter │ AAJ-002 Nav    │ AAJ-006 Form   │ AAJ-009 Daftar │              │
│ AAJ-012 Periode│ AAJ-003 COA    │ Jurnal (8SP)  │ Jurnal (5SP)  │              │
│ AAJ-013 Edit   │ AAJ-004 CRUD   │               │               │              │
│ AAJ-014 Kartu  │ AAJ-005 Templ. │               │               │              │
│ AAJ-015 Tren   │ AAJ-007 No.    │               │               │              │
│               │ AAJ-008 Posting│               │               │              │
│               │ AAJ-010 Buku   │               │               │              │
├───────────────┼───────────────┼───────────────┼───────────────┼──────────────┤
│ Sprint 2+     │ Siap dikerjakan│ Sedang dikerjakan │ Sudah ada PR / review QA │
│ (lihat §5)    │ (sudah clear) │ (assignee + label sprint)  │                  │
└───────────────┴───────────────┴───────────────┴───────────────┴──────────────┘
```

**Alur harian:**
1. Story yang siap dikerjakan dipindah `Backlog → Ready` (memenuhi Definition of Ready, Backlog §1)
2. Saat mulai dikerjakan: `Ready → In Progress` + assignee + label `sprint-N`
3. Saat PR dibuka: `In Progress → In Review` (link PR otomatis via "linked pull request")
4. Setelah QA lulus & merge: `In Review → Done` (pastikan Definition of Done, Backlog §2)

---

## 3. Views yang Disarankan

| View | Layout | Kegunaan |
|------|--------|----------|
| **Board by Status** | Board | Papan utama tim (status kolom) |
| **Sprint Board** | Board, grouped by `Sprint` | Lihat semua sprint sekaligus |
| **Backlog Table** | Table | Urutkan/saring seluruh backlog (prioritas, SP, dependensi) |
| **Timeline** | Timeline | Lihat urutan pengerjaan & dependensi antar story |

---

## 4. Automation (opsional tapi disarankan)

Buat workflow di **Project → Workflows**:
- **Item added to project** → set Status `Backlog`
- **When issue is closed** → set Status `Done`
- **When linked pull request merged** → set Status `Done`
- **When a new issue with label `bug`** → set Status `Ready` (bug diprioritaskan)

---

## 5. Import Backlog (34 Story)

### Opsi A — Import CSV (paling cepat)
1. Buka project → menu ⋯ → **Import from CSV** → pilih `gh-projects/backlog-import.csv`
2. Mapping otomatis: `Title → Judul`, `Body → Deskripsi`, `Priority → field Priority`, `Status → field Status`, `Labels → label issue`
3. Setelah import, isi field **Sprint (Iteration)** per story lewat tampilan Table (pilih kolom Sprint → pilih periode 2 minggu)

### Opsi B — Buat issue lewat GitHub CLI
```bash
# contoh satu story
gh issue create \
  --repo appsheetindonesia/Accounting-Software \
  --title "AAJ-006 · Form Entri Jurnal (Multi-Line, Auto-Balance)" \
  --label "story,priority:P0,sprint-1" \
  --body "**User story:** Sebagai pemilik usaha, saya ingin mencatat transaksi dengan beberapa baris debit/kredit, agar jurnal selalu balance otomatis.

**Acceptance Criteria:**
- [ ] Form: tanggal, no. bukti (auto), deskripsi, baris (akun, debit, kredit)
- [ ] Debit XOR kredit per baris; nilai negatif ditolak
- [ ] Total debit = kredit live; tombol Posting non-aktif sampai balance
- [ ] Tambah/hapus baris dinamis; minimal 1 debit + 1 kredit"
```

### Opsi C — Import issues + masukkan ke project
1. Buat semua issue dari Backlog (manual atau script)
2. Di project: **Add items** → pilih issue yang diinginkan (bisa pilih banyak sekaligus)
3. Atur field Sprint/Priority/Estimasi di tampilan Table

---

## 6. Pembagian Sprint (dari Backlog - Accounting.md)

| Sprint | Fokus | Story | Total SP |
|--------|-------|-------|----------|
| **Sprint 1** | Foundation: Layout, COA, Jurnal Dasar | AAJ-001 – AAJ-009 | 48 |
| **Sprint 2** | Buku Besar, Filter, Periode, Dashboard | AAJ-010 – AAJ-015 | 36 |
| **Sprint 3** | Pelaporan: Laba Rugi, Neraca, Neraca Lajur | AAJ-016 – AAJ-019 | 24 |
| **Sprint 4** | Quality: Export, Reverse, Lampiran, Approval | AAJ-020 – AAJ-024 | 26 |
| **Sprint 5** | Multi-user: Role, Entitas, Arus Kas, Search | AAJ-025 – AAJ-029 | 27 |
| **Sprint 6** | Advanced & Polish | AAJ-030 – AAJ-034 | 36 |
| **Total MVP** | | **34 story** | **197 SP** |

**Catatan:** estimasi kecepatan tim 2–3 developer ±15 SP/sprint → MVP ≈ 12–14 minggu.

---

## 7. DoR / DoD di Board

Tempel ringkasan ini di deskripsi project (tab Readme project):

> **Definition of Ready:** story memiliki user story jelas, AC testable, dependensi teridentifikasi, mock/API contract tersedia, desain direview.
> **Definition of Done:** typecheck & lint lolos, unit test logika keuangan ≥80%, semua AC terverifikasi QA, responsif 320px+, Bahasa Indonesia + format IDR konsisten, tidak ada regresi.
> **Kriteria rilis MVP:** semua story P0 selesai + beta 50 user tanpa error finansial (error rate < 0,5%).
