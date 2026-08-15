// ============================================================
// RG-13..RG-16 — Alur login & refresh token (E2E)
// Dijalankan terhadap MOCK API (localhost:4000) + prototipe Vite (:5173).
//
//   RG-13 login gagal (password salah)  → error INVALID_CREDENTIALS di UI
//   RG-14 login benar                   → masuk ke Dashboard (footer Online)
//   RG-15 access token korup            → 401 → POST /auth/refresh → pulih
//                                         (sesi aktif, TANPA login ulang)
//   RG-16 refresh token gagal           → sesi berakhir → kembali ke login
//   RG-17 reconnect offline              → server mati → banner + data lokal →
//                                          server hidup → Coba lagi → online
//                                          (auto-login demo, token asli tersimpan)
//   RG-18 auto-reconnect polling          → server mati → banner offline → server
//                                          hidup → banner hilang SENDIRI dalam
//                                          ~10 detik (GET /health tiap 10s),
//                                          TANPA klik "Coba lagi"
//   RG-19 TTL terjadwal (N detik)          → access token basi SESUAI WAKTU →
//                                          auto-refresh di sesi AKTIF tanpa reload
//                                          (401 → POST /auth/refresh → retry → 200)
//
// Berbeda dengan regression.spec.ts (yang auto-login di beforeEach),
// spec ini menguji halaman LOGIN — sesi dimulai kosong tiap test.
// ============================================================
import { test, expect } from '@playwright/test'
import { DEMO, gotoOnline, loginViaUi, resetServer, watchPageErrors } from './helpers'

const STORAGE_KEY = 'appsheet-accounting-v1'
const BAD_PASSWORD = 'password-salah'

// Ambil token sesi aktif dari localStorage (hasil login via UI)
async function storedTokens(page: { evaluate: (fn: (key: string) => unknown, arg: string) => Promise<unknown> }) {
  return (await page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return { accessToken: parsed.state.accessToken, refreshToken: parsed.state.refreshToken }
  }, STORAGE_KEY)) as { accessToken: string; refreshToken: string } | null
}

// Timpa access/refresh token di localStorage (sisanya dipertahankan)
async function overwriteTokens(page: { evaluate: (fn: (args: { key: string; access: string; refresh: string }) => void, arg: { key: string; access: string; refresh: string }) => Promise<void> }, tokens: { access: string; refresh: string }) {
  await page.evaluate(({ key, access, refresh }) => {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!raw) return
    raw.state.accessToken = access
    raw.state.refreshToken = refresh
    localStorage.setItem(key, JSON.stringify(raw))
  }, { key: STORAGE_KEY, ...tokens })
}

test.beforeEach(async ({ request }) => {
  // State server deterministik (seed Maret 2026) — tanpa login (sesi kosong).
  await resetServer(request)
})

test('RG-13 Login gagal: password salah → error ditampilkan, tetap di halaman login', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')

  // Halaman login tampil (sesi kosong)
  await expect(page.getByLabel('Email')).toBeVisible()

  await page.getByLabel('Email').fill(DEMO.email)
  await page.getByLabel('Password').fill(BAD_PASSWORD)
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()

  // Error dari mock API (401 INVALID_CREDENTIALS) tampil di UI
  await expect(page.getByText('Email atau password salah')).toBeVisible()

  // Tetap di halaman login — Dashboard TIDAK tampil
  await expect(page.getByRole('heading', { name: 'Appsheet Accounting Journal' })).toBeVisible()
  await expect(page.getByText('Total Aset', { exact: true })).toHaveCount(0)
  // Form masih bisa dipakai ulang (error tidak menutup halaman)
  await expect(page.getByLabel('Password')).toBeVisible()
})

test('RG-14 Login benar: kredensial valid → masuk ke Dashboard', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')

  await loginViaUi(page)

  // Masuk: Dashboard tampil + footer Online
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.locator('footer')).toContainText('Online · Mock API', { timeout: 20_000 })
  await expect(page.getByText('Total Aset', { exact: true }).first()).toBeVisible()
})

test('RG-15 Token korup: access token basi → auto-refresh → sesi pulih tanpa login ulang', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-cleared')) {
      localStorage.clear()
      sessionStorage.setItem('e2e-cleared', '1')
    }
  })

  // Login normal → dapat token valid + refresh token tersimpan
  await gotoOnline(page)
  const real = await storedTokens(page)
  expect(real?.accessToken).toMatch(/^mock\.user-001\./)
  expect(real?.refreshToken).toBeTruthy()

  // Korup ACCESS token saja (issuedAt = 1ms epoch → sangat basi), refresh tetap valid
  await overwriteTokens(page, { access: 'mock.user-001.1', refresh: real!.refreshToken })

  // Reload → init() → /auth/me 401 TOKEN_EXPIRED → POST /auth/refresh → retry
  await page.reload()

  // Sesuai pulih: Dashboard tampil, footer Online — TANPA login ulang
  await expect(page.locator('footer')).toContainText('Online · Mock API', { timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByText('Total Aset', { exact: true }).first()).toBeVisible()

  // Transparansi: indikator refresh muncul (token benar-benar di-refresh)
  const refreshed = await storedTokens(page)
  expect(refreshed?.accessToken).not.toBe('mock.user-001.1')
  expect(refreshed?.accessToken).toMatch(/^mock\.user-001\./)
  await expect(page.locator('footer').getByTitle(/Sesi diperbarui otomatis/)).toBeVisible()
})

test('RG-16 Refresh gagal: access + refresh token basi → sesi berakhir → kembali ke login', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-cleared')) {
      localStorage.clear()
      sessionStorage.setItem('e2e-cleared', '1')
    }
  })

  // Login normal → korup KEDUA token (access basi + refresh tidak dikenal)
  await gotoOnline(page)
  const real = await storedTokens(page)
  expect(real?.refreshToken).toBeTruthy()
  await overwriteTokens(page, { access: 'mock.user-001.1', refresh: 'refresh-token-basi' })

  // Reload → /auth/me 401 → refresh gagal (INVALID_REFRESH_TOKEN) → sesi berakhir
  await page.reload()

  // Kembali ke halaman login dengan pesan "Sesi berakhir"
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByText('Sesi berakhir. Silakan login kembali.')).toBeVisible()
  // Dashboard TIDAK tampil
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0)
})

test('RG-17 Reconnect offline: server mati → banner + data lokal → server hidup → Coba lagi → online', async ({ page }) => {
  const errors = watchPageErrors(page)
  await page.addInitScript(() => localStorage.clear())

  // 1) Server "mati": blokir semua request ke mock API (route-level, tanpa
  //    mematikan proses — pola sama dengan RG-12).
  await page.route('**://localhost:4000/**', (route) => route.abort())
  await page.goto('/')

  // Sesi kosong → halaman login; masuk OFFLINE dengan data demo (tanpa server)
  await expect(page.getByLabel('Email')).toBeVisible()
  await page.getByRole('button', { name: /Masuk offline dengan data demo/ }).click()

  // 2) Banner offline + data LOKAL tampil, tanpa crash
  await expect(page.locator('footer')).toContainText('Offline · Data demo lokal')
  await expect(page.getByText(/Jalankan npm start/)).toBeVisible()
  await expect(page.getByText('Total Aset', { exact: true })).toBeVisible()
  // Sesi offline memakai token lokal 'local.demo' (bukan token server)
  const offline = await storedTokens(page)
  expect(offline?.accessToken).toBe('local.demo')

  // 3) Server "hidup" kembali
  await page.unroute('**://localhost:4000/**')

  // 4) "Coba lagi" → AUTO-LOGIN demo → kembali online. (Retry otomatis 2s
  //    bisa mendahului klik — abaikan bila tombol sudah hilang; hasil sama.)
  await page.getByRole('button', { name: 'Coba lagi' }).click({ timeout: 5_000 }).catch(() => {})
  await expect(page.locator('footer')).toContainText('Online · Mock API', { timeout: 20_000 })
  await expect(page.getByText(/Jalankan npm start/)).toHaveCount(0) // banner hilang
  // Token server ASLI tersimpan (auto-login demo menggantikan 'local.demo')
  const online = await storedTokens(page)
  expect(online?.accessToken).toMatch(/^mock\.user-001\./)
  expect(online?.accessToken).not.toBe('local.demo')
  expect(errors).toEqual([])
})

test('RG-18 Auto-reconnect: polling /health tiap 10 detik → banner offline hilang SENDIRI saat server kembali (tanpa klik)', async ({ page }) => {
  const errors = watchPageErrors(page)
  await page.addInitScript(() => localStorage.clear())

  // 1) Server "mati": blokir request ke mock API (route-level, tanpa mematikan proses)
  await page.route('**://localhost:4000/**', (route) => route.abort())
  await page.goto('/')

  // Masuk offline dengan data demo
  await expect(page.getByLabel('Email')).toBeVisible()
  await page.getByRole('button', { name: /Masuk offline dengan data demo/ }).click()

  // 2) Banner offline + data LOKAL tampil
  await expect(page.locator('footer')).toContainText('Offline · Data demo lokal')
  await expect(page.getByText(/Jalankan npm start/)).toBeVisible()
  expect((await storedTokens(page))?.accessToken).toBe('local.demo')

  // 3) Server "hidup" kembali — TANPA menekan tombol apa pun
  await page.unroute('**://localhost:4000/**')

  // 4) Polling koneksi (GET /health tiap 10 detik) mendeteksi server hidup →
  //    auto-login demo → banner offline hilang SENDIRI (timeout besar:
  //    poll pertama bisa terjadi hingga ~10 detik setelah unroute + init).
  await expect(page.locator('footer')).toContainText('Online · Mock API', { timeout: 40_000 })
  await expect(page.getByText(/Jalankan npm start/)).toHaveCount(0) // banner hilang tanpa klik

  // Token server ASLI tersimpan (auto-login demo menggantikan 'local.demo')
  const online = await storedTokens(page)
  expect(online?.accessToken).toMatch(/^mock\.user-001\./)
  expect(online?.accessToken).not.toBe('local.demo')
  expect(errors).toEqual([])
})

test('RG-19 TTL terjadwal: access token basi setelah N detik → auto-refresh di sesi AKTIF tanpa reload', async ({ page }) => {
  const errors = watchPageErrors(page)
  await page.addInitScript(() => localStorage.clear())

  // Login normal → token valid (TTL default 3600s)
  await page.goto('/')
  await loginViaUi(page)
  await expect(page.locator('footer')).toContainText('Online · Mock API', { timeout: 20_000 })
  const before = await storedTokens(page)
  expect(before?.accessToken).toMatch(/^mock\.user-001\./)

  // Simulasi KEDALUWARSA TERJADWAL: ubah TTL ke 2 detik SAAT RUNTIME
  // (POST /admin/set-token-ttl, tanpa restart). Token yang diterbitkan saat
  // login akan basi 2 detik setelah issuedAt-nya — bukan dipaksa via epoch.
  const ttl = await page.request.post('http://localhost:4000/admin/set-token-ttl', {
    data: { ttlSeconds: 2 },
  })
  expect(ttl.ok()).toBeTruthy()

  // Tunggu WAKTU NYATA > TTL — token kini basi, tanpa reload / logout apapun
  await page.waitForTimeout(3000)

  // Pantau respons jaringan: GET /ledger harus 401 dulu, lalu retry 200
  const ledgerStatuses: number[] = []
  page.on('response', (res) => {
    if (res.url().includes('/ledger/accounts/')) ledgerStatuses.push(res.status())
  })

  // Aksi di sesi AKTIF: navigasi ke Buku Besar memicu fetch → token basi 401
  // → klien auto-refresh (POST /auth/refresh) → retry berhasil
  await page.getByRole('button', { name: 'Buku Besar' }).click()
  await expect(page.getByRole('heading', { name: 'Buku Besar' })).toBeVisible()
  await expect(page.getByText('Saldo Akhir').first()).toBeVisible({ timeout: 15_000 })

  // Sesi TETAP aktif tanpa login ulang: footer Online + indikator refresh tampil
  await expect(page.locator('footer')).toContainText('Online · Mock API')
  await expect(page.locator('footer').getByTitle(/Sesi diperbarui otomatis/)).toBeVisible()

  // Token di localStorage SUDAH DIGANTI (auto-refresh menyimpan token baru)
  const after = await storedTokens(page)
  expect(after?.accessToken).toMatch(/^mock\.user-001\./)
  expect(after?.accessToken).not.toBe(before?.accessToken)

  // Bukti jaringan: 401 TOKEN_EXPIRED terjadi lalu retry 200 (auto-refresh)
  expect(ledgerStatuses).toContain(401)
  expect(ledgerStatuses).toContain(200)
  expect(errors).toEqual([])
})
