# Color Palette — Appsheet Accounting Journal

**Referensi desain warna untuk semua modul** — Light + Dark Mode.
Brand utama: **`#2596BE`** (biru). Sumber kebenaran implementasi: `prototype-accounting/src/index.css` (Tailwind v4 `@theme`).

---

## 1. Prinsip & aksesibilitas

| Prinsip | Aturan |
|---------|--------|
| **Brand di tangan kanan** | Biru `#2596BE` untuk aksi utama, elemen aktif, dan identitas — bukan untuk teks isi |
| **Kontras (WCAG 2.1 AA)** | Teks isi ≥ 4.5:1 · Teks besar/UI ≥ 3:1. Lihat §9 untuk nilai aktual tiap pasangan |
| **Teks di atas biru** | Jangan tulis teks kecil di atas `#2596BE` murni (2.9:1). Pakai `primary-dark`/`primary-700` sebagai warna teks, atau putih **bold** untuk tombol |
| **Warna bukan satu-satunya sinyal** | Status selalu didampingi label teks (Draft/Posted/…), bukan hanya warna |
| **Dark mode** | Jangan menyalin hex light ke dark — terang-balik dengan hue sama, gunakan tint (400/300) untuk teks |

---

## 2. Token — lokasi definisi

Definisi nyata (light): `prototype-accounting/src/index.css` blok `@theme`.
Dark mode (usulan §8): tambahkan blok `.dark { … }` atau `@media (prefers-color-scheme: dark)` di file yang sama.
Tipe komponen: `bg-<token>`, `text-<token>`, `border-<token>`, opasitas via `/10` `/15` `/5`.

---

## 3. Brand — skala Primary (biru `#2596BE`)

Skala 50–900 diturunkan dari `#2596BE` (H≈196°, S≈67%, L≈45%) dan konsisten dengan token yang sudah ada
(`primary` = 500, `primary-light` = 400, `primary-dark` = 700).

| Token | Hex | Pemakaian |
|-------|-----|-----------|
| `primary-50`  | `#ECF8FC` | Latar tint sangat halus (mis. panel ringkas) |
| `primary-100` | `#D2EEF7` | Latar tint, ikon non-aktif |
| `primary-200` | `#A8DEF0` | Border tint, progress bar |
| `primary-300` | `#74C9E6` | **Teks biru di dark mode**, ikon |
| `primary-400` = `primary-light` | `#4FB3D8` | Hover tombol, aksen kartu, teks Posted di light |
| **`primary-500` = `primary`** | **`#2596BE`** | **Warna brand**: tombol utama, item aktif, logo, link |
| `primary-600` | `#1E82A6` | Aktif/pressed tombol, border focus |
| **`primary-700` = `primary-dark`** | **`#1A6985`** | **Teks biru di light mode** (kontras AA), hover sidebar |
| `primary-800` | `#17586F` | Teks biru gelap, judul kecil |
| `primary-900` | `#144A5D` | Header brand di permukaan gelap |

**Aturan pakai:**
- Tombol solid → `bg-primary text-white font-semibold` · hover `bg-primary-light` · active `bg-primary-600`
- Item aktif sidebar → `border-l-[3px] border-primary bg-primary/10 text-primary`
- Link & teks aksen (light) → `text-primary-dark` (bukan `primary`) agar ≥ 4.5:1
- Badge tint → `bg-primary/10` + teks `text-primary` (badge besar, aman)

---

## 4. Surface & latar

| Token | Light | Dark | Pemakaian |
|-------|-------|------|-----------|
| `canvas` | `#F8FAFC` | `#0F172A` | Latar halaman / app shell |
| `surface` | `#FFFFFF` | `#1E293B` | Kartu, modal, sidebar, tabel |
| `surface-hover` | `#F1F5F9` | `#334155` | Hover baris/kartu, input focus bg |
| `surface-overlay` | `#FFFFFF` (90%) | `#1E293B` (95%) | Dropdown, popover, tooltip |
| `scrim` | `rgba(15,23,42,.4)` | `rgba(2,6,23,.6)` | Overlay modal (backdrop gelap) |

---

## 5. Teks — skala Ink

| Token | Light | Dark | Pemakaian |
|-------|-------|------|-----------|
| `ink` | `#1E293B` | `#F1F5F9` | Teks utama, judul, angka |
| `ink-soft` | `#64748B` | `#94A3B8` | Teks sekunder, metadata, keterangan |
| `ink-faint` | `#94A3B8` | `#64748B` | Placeholder, label non-penting, timestamp |
| `ink-disabled` | `#CBD5E1` | `#475569` | Elemen nonaktif (tombol disabled) |
| `on-primary` | `#FFFFFF` | `#FFFFFF` | Teks di atas tombol solid brand |

**Aturan:** judul halaman `text-ink font-bold` · nilai nominal pakai kelas `.num` (font mono + tabular-nums).

---

## 6. Garis & border

| Token | Light | Dark | Pemakaian |
|-------|-------|------|-----------|
| `line` | `#E2E8F0` | `#334155` | Border kartu/tabel/input default |
| `line-strong` | `#CBD5E1` | `#475569` | Border input aktif, header tabel, dividen tegas |
| `line-focus` | `#2596BE` | `#4FB3D8` | Ring focus (`ring-2 ring-primary/60`) |

---

## 7. Semantik — status, hasil, debit/kredit

| Token | Light | Dark | Pemakaian |
|-------|-------|------|-----------|
| `ok` | `#10B981` | `#34D399` | Sukses, saldo sehat, indikator online, **kredit** |
| `bad` | `#EF4444` | `#F87171` | Error, saldo negatif, hapus, **reversed**, offline |
| `warn` | `#F59E0B` | `#FBBF24` | Peringatan, draft, akun `accent` (delta chart) |
| `info` | `#3B82F6` | `#60A5FA` | Informasi, tautan, **debit** |
| `debit` | `#3B82F6` | `#60A5FA` | Kolom debit (tabel jurnal/buku besar) |
| `credit` | `#10B981` | `#34D399` | Kolom kredit |
| `accent` | `#F59E0B` | `#FBBF24` | Aksen chart/trend, delta naik |

> **Konvensi debit/kredit:** debit selalu biru, kredit selalu hijau — di semua modul (Jurnal, Buku Besar, Neraca Lajur) agar mata tidak perlu belajar ulang per layar.

**Teks semantik di light** (untuk kontras ≥ 4.5:1 bila teks kecil):
- teks "ok/credit" → gunakan `#059669` (emerald-600) · teks "bad" → `#DC2626` (red-600) · teks "warn" → `#B45309` (amber-700) · teks "info/debit" → `#2563EB` (blue-600).
- Hex terang (400) hanya untuk isian latar/ikon besar, bukan teks isi.

---

## 8. Status jurnal — badge (map ke `StatusBadge.tsx`)

| Status | Light (bg / teks) | Dark (bg / teks) |
|--------|-------------------|------------------|
| `draft` | `warn/15` / `#B45309` | `warn/15` / `#FBBF24` |
| `pending-approval` | `#7C3AED/15` / `#6D28D9` | `#7C3AED/15` / `#A78BFA` |
| `posted` | `ok/15` / `primary-light (#4FB3D8)` | `ok/15` / `#34D399` |
| `reversed` | `bad/10` / `#EF4444` | `bad/10` / `#F87171` |

Gaya badge: `rounded-full px-2 py-0.5 text-[11px] font-semibold`.

---

## 9. Badge peran user (map ke `ROLE_BADGE` di `lib/permissions.ts`)

| Role | Light (bg / teks) | Dark (bg / teks) |
|------|-------------------|------------------|
| Admin | `primary/10` / `text-primary` | `primary/15` / `#74C9E6` |
| Akuntan | `#7C3AED/10` / `#6D28D9` | `#7C3AED/15` / `#A78BFA` |
| Viewer | `ink-faint/10` / `ink-soft` | `white/10` / `#94A3B8` |

---

## 10. Peta modul → token

| Modul / komponen | Token utama yang dipakai |
|------------------|--------------------------|
| **Login / Lupa Password** | logo tile `bg-primary`, tombol `bg-primary`→hover `primary-light`, kartu `surface`, canvas |
| **TopBar** | `surface` + `line` bawah, avatar `bg-primary/10`, badge role §9, indikator online `ok` |
| **Sidebar** | item aktif §3, tombol "+ Buat Jurnal" `bg-primary`, pill periode `primary/5` + `text-primary` |
| **Dashboard** | kartu `surface` + shadow, delta naik `ok` / turun `bad`, trend `primary` + `accent` |
| **Jurnal (form & tabel)** | debit `debit` / kredit `credit` §7, badge status §8, tombol aksi (Post `ok`, Reverse `bad`, Approve `primary`) |
| **Modal (entry / reset)** | `surface` + `shadow-modal`, scrim §4, tombol konfirmasi danger `bg-bad` |
| **Buku Besar** | saldo berjalan `ink` bold, kolom debit/kredit, opening/closing `ink-soft` |
| **Neraca Lajur** | debit=kredit `ok` saat seimbang / `bad` saat tidak, total bold `ink` |
| **Laba Rugi / Neraca** | total `ink` bold, subtotal `ink-soft`, isBalanced `ok` |
| **BottomBar** | `surface` + `line` atas, status koneksi `ok`/`bad`/`warn`, "token diperbarui" `primary` |
| **Toast** | sukses `bg-ok/10 border-ok/40 text-ok-dark` · error `bg-bad/10 border-bad/40 text-bad-dark` · warn `bg-warn/10` |
| **Chart (trend)** | bar `primary` (revenue) & `accent` (beban), grid `line` |

---

## 11. Dark mode — implementasi (contoh CSS)

Tambahkan di `prototype-accounting/src/index.css` setelah blok `@theme`:

```css
.dark {
  --color-canvas: #0f172a;
  --color-surface: #1e293b;
  --color-surface-hover: #334155;
  --color-ink: #f1f5f9;
  --color-ink-soft: #94a3b8;
  --color-ink-faint: #64748b;
  --color-line: #334155;
  --color-line-strong: #475569;
  --color-primary-light: #74c9e6; /* teks biru di dark */
  --color-ok: #34d399;
  --color-bad: #f87171;
  --color-warn: #fbbf24;
  --color-info: #60a5fa;
  --color-debit: #60a5fa;
  --color-credit: #34d399;
}
```

Aktifkan via `class="dark"` pada `<html>` atau `@media (prefers-color-scheme: dark)`.
Shadow di dark dikurangi: `--shadow-card: 0 1px 3px rgb(0 0 0 / .4)`.

---

## 12. Kontras & rekomendasi (WCAG 2.1 AA)

| Pasangan | Rasio | Status |
|----------|-------|--------|
| `#FFFFFF` di `#2596BE` (tombol) | ≈ 3.0:1 | AA teks besar/UI ✓ (wajib `font-semibold`) |
| `#1A6985` di putih (teks link) | ≈ 5.7:1 | AA teks isi ✓ |
| `#2596BE` di putih (teks kecil) | ≈ 2.9:1 | ✗ — pakai `primary-dark`/`primary-700` |
| `#4FB3D8` di putih (teks) | ≈ 1.9:1 | ✗ — hanya untuk dekorasi/hover/ikon besar |
| `#10B981` di putih (teks kredit kecil) | ≈ 2.4:1 | ✗ — pakai `#059669` untuk teks |
| `#74C9E6` di `#0F172A` (dark) | ≈ 8.4:1 | AA ✓ |
| `#F1F5F9` di `#1E293B` (dark teks) | ≈ 12.6:1 | AA ✓ |
| `#94A3B8` di `#1E293B` (dark ink-soft) | ≈ 4.9:1 | AA ✓ |

**Ringkasan:** brand `#2596BE` aman untuk isian & teks besar; untuk teks isi gunakan turunan gelap (`primary-dark`, emerald-600/red-600/amber-700/blue-600) di light, dan turunan terang (300/400) di dark.

---

## 13. Do & Don't

**Do** ✅
- Gunakan skala primary (§3) alih-alih hardcode `#2596BE` — hover/active/border/tint ikut konsisten
- Debit biru, kredit hijau di semua tabel
- Status memakai label + warna (bukan warna saja)
- Badge pakai tint `/10`–`/15` + teks gelap/terang sesuai mode

**Don't** ❌
- Jangan menulis teks isi dengan `#2596BE` murni di light (2.9:1)
- Jangan memakai hijau lama `#0D5C3D` (tema lama, sudah dihapus) atau aksen hijau lain di luar konvensi kredit/ok
- Jangan menyalin hex light ke dark tanpa menaikkan luminance
- Jangan pakai warna untuk membedakan dua hal yang hanya bisa dibedakan warna (selalu + label/ikon)
