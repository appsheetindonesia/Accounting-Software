# Ringkasan Eksekutif — Appsheet Accounting Journal
### Executive Summary (1 Halaman) · Agustus 2026 · Dokumen lengkap: `PRD Ver 3 - Accounting.md`

---

## 🎯 The Pitch
**Appsheet Accounting Journal** adalah aplikasi akuntansi **double-entry** untuk UKM Indonesia yang mengotomatiskan siklus pembukuan penuh: catat jurnal → buku besar → laporan keuangan — semudah mencatat di buku tulis, dalam Bahasa Indonesia, mobile-first, dan terjangkau.

**Masalah:** ±65 juta UKM Indonesia masih mencatat manual/spreadsheet — rawan error, tidak terstruktur, laporan lambat. Software existing (Accurate Rp150rb+, Jurnal Rp99rb+, Zahir Rp175rb+) terlalu mahal & kompleks untuk UMKM mikro.

**Solusi:** Double-entry dengan validasi otomatis (debit = kredit), Chart of Account standar PSAK, laporan 1 klik, istilah akuntansi Bahasa Indonesia, harga mulai **Rp50.000/bulan**.

## 👥 Target Pengguna
| Persona | Profil | Kebutuhan |
|---------|--------|-----------|
| **Rina** (35) | Pemilik toko kelontong, tanpa latar akuntansi | Catat pemasukan/pengeluaran, tahu untung-rugi bulanan |
| **Dimas** (28) | Akuntan freelance, 5–10 klien | Multi-entitas, generate laporan klien |
| **Budi** (40) | Manajer keuangan startup | Laporan real-time, approval workflow |

## 📦 Lingkup MVP (Prioritas P0)
- **Chart of Accounts** — template PSAK UKM + kustomisasi (CRUD, hierarki)
- **Jurnal Umum** — multi-line, auto-balance, draft → posting → reverse, lampiran bukti
- **Buku Besar** — otomatis dari jurnal posted, saldo berjalan
- **Laporan** — Neraca Lajur, Laba Rugi, Neraca (Arus Kas di P2)
- **Periode Fiskal** — buka/tutup periode, satu periode aktif
- **Dashboard** — ringkasan saldo, tren 6 bulan, peringatan
- **Export** PDF/Excel profesional

*Fase berikutnya (P1–P2): approval workflow, multi-user & role, multi-entitas, integrasi bank.*

## 🏆 Diferensiator
| Kompetitor | Kelemahan | Appsheet Accounting Journal |
|------------|-----------|----------------------|
| Accurate Online | Mahal, kompleks, enterprise | Terjangkau, sederhana |
| Jurnal (Mekari) | Overkill untuk UKM kecil | Fokus UKM, lebih murah |
| BukuKas / BukuWarung existing | Bukan double-entry, cash basis saja | **Double-entry penuh** |

## 📊 Tujuan Bisnis (12 Bulan)
| Metrik | Target |
|--------|--------|
| MAU | 5.000 pengguna |
| Retention bulan-3 | >60% |
| Konversi free-to-paid | 8% |
| Time-to-first-journal | <5 menit |
| Error rate jurnal | <0,5% |

**Model bisnis (freemium):** gratis untuk 1 entitas + 50 transaksi/bulan; berbayar untuk unlimited.

## 🗓️ Roadmap
| Fase | Durasi | Milestone |
|------|--------|-----------|
| 1. Foundation | 4 minggu | COA, Jurnal, Buku Besar |
| 2. Pelaporan | 3 minggu | Laba Rugi, Neraca, Trial Balance, Dashboard |
| 3. Quality & Export | 2 minggu | Export PDF/Excel, search, reverse, lampiran |
| 4. Multi-user | 3 minggu | Role, approval, multi-entitas |
| 5. Advanced | 4 minggu | Arus Kas, integrasi bank |
| Beta Closed → Launch | 2 minggu | 50 user beta → Web + Android |

## ⚠️ Risiko Utama & Mitigasi
- **Kesalahan perhitungan** (dampak tinggi) → validasi otomatis + automated testing
- **Adopsi rendah** → onboarding interaktif, tutorial, Bahasa Indonesia
- **Keamanan data finansial** → enkripsi AES-256/TLS 1.3, backup 6 jam, server Indonesia

---

## ✅ Next Steps
1. Validasi prioritas & scope MVP dengan stakeholder
2. Finalisasi jawaban pertanyaan terbuka (multi-currency, jurnal penyesuaian)
3. Kick-off Fase 1: Foundation (COA, Jurnal, Buku Besar)
