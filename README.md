# Appsheet Accounting Journal

Sistem akuntansi **PT. Kreasi Inovasi Estetika** — prototipe web (React + Vite) dengan mock API, katalog API (OpenAPI), dokumen spesifikasi, dan suite pengujian lintas lapisan (unit, integration, E2E).

## Status CI

[![CI (Unit + Integration + E2E)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/ci.yml/badge.svg)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/ci.yml)
[![Verifikasi penuh (unit + e2e, manual)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/e2e.yml/badge.svg)](https://github.com/appsheetindonesia/Accounting-Software/actions/workflows/e2e.yml)

> Repo ini privat — badge hanya tampil bagi pengguna yang punya akses.

## Struktur

| Folder | Isi |
|--------|-----|
| `prototype-accounting/` | Prototipe web (React + TypeScript + Vite + Zustand), unit test Vitest + MSW |
| `mock-api/` | Mock API Express (persistence, auth + refresh token, error envelope, rate limit), integration test Vitest + Supertest |
| `e2e/` | E2E Playwright RG-01..RG-19 (chromium + firefox) |
| `scripts/` | Skrip dev terpadu (`dev.mjs`) & agregat test (`test-all.mjs`) |
| Dokumen `*.md` | BRD, PRD, FRD, API contract, Database Schema, QA Test Plan, dll. |
| `.github/workflows/` | CI (`ci.yml`), verifikasi manual (`e2e.yml`), deploy GitHub Pages (`pages.yml`) |

## Menjalankan

```bash
npm install        # install dependensi tiap sub-proyek
npm run dev        # mock API + Vite sekali jalan (scripts/dev.mjs)
npm test           # ketiga suite: mock-api + prototype + e2e (paralel)
```

Detail lebih lanjut ada di README masing-masing sub-proyek (`mock-api/`, `prototype-accounting/`, `e2e/`).
