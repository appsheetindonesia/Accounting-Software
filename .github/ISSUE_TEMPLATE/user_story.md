---
name: "📋 User Story"
about: "Story siap sprint dari Backlog - Accounting.md (format BW-xxx)"
title: "[Story] "
labels: ["story"]
assignees: []
---

<!-- Hapus baris ini: gunakan template ini untuk story baru dari Backlog - Accounting.md.
     Referensi silang: ID backlog (BW-xxx), dokumen PRD Ver 3, dan API - Accounting.md -->

## Informasi Story

| Field | Nilai |
|-------|-------|
| **ID Backlog** | BW-XXX |
| **Referensi PRD** | P0-XX / COA-XX (PRD Ver 3 §8) |
| **Sprint** | Sprint X |
| **Prioritas** | P0 / P1 / P2 |
| **Estimasi** | X SP |
| **Dependensi** | BW-XXX, BW-XXX |

## User Story

> **Sebagai** [peran, mis. pemilik usaha / akuntan],
> **saya ingin** [aksi],
> **agar** [manfaat].

## Acceptance Criteria

<!-- Checklist yang testable. Contoh dari Backlog - Accounting.md: -->

- [ ] ...
- [ ] ...
- [ ] ...

## Definition of Done

- [ ] Lolos typecheck & lint (TS strict)
- [ ] Unit test untuk logika keuangan ≥80% coverage
- [ ] Semua acceptance criteria terverifikasi QA
- [ ] Responsif desktop/tablet/mobile (320px) tanpa error layout
- [ ] Teks Bahasa Indonesia, format IDR & tanggal `dd MMMM yyyy` konsisten

## Referensi

- PRD Ver 3: [section terkait]
- API: `GET/POST ...` (API - Accounting.md)
- Skema DB: tabel `...` (Database Schema - Accounting.md)
