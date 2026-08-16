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
//   RG-20 SESSION_EXPIRED                    → refresh token kedaluwarsa DI SERVER
//                                          (POST /admin/expire-refresh-tokens) →
//                                          refresh gagal 401 SESSION_EXPIRED →
//                                          modal "Sesi Berakhir" + login ulang wajib
//   RG-21 RATE_LIMITED (retry pulih)          → ambang 1 req/endpoint
//                                          (POST /admin/set-rate-limit) → 429 →
//                                          retry otomatis klien → sukses TANPA error
//   RG-22 RATE_LIMITED (tetap diblokir)       → 429 ×3 → toast "Terlalu banyak
//                                          permintaan" + jurnal TIDAK tersimpan
//
// Berbeda dengan regression.spec.ts (yang auto-login di beforeEach),
// spec ini menguji halaman LOGIN — sesi dimulai kosong tiap test.
// ============================================================
import { test, expect } from '@playwright/test'
import { DEMO, fillBalancedJournal, gotoNav, gotoOnline, loginViaUi, openJournalModal, resetServer, watchPageErrors } from './helpers'

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

test('RG-20 SESSION_EXPIRED: refresh token kedaluwarsa di server → modal "Sesi Berakhir" + login ulang wajib', async ({ page }) => {
  const errors = watchPageErrors(page)
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-cleared')) {
      localStorage.clear()
      sessionStorage.setItem('e2e-cleared', '1')
    }
  })

  // Login normal → sesi aktif (access + refresh token valid)
  await gotoOnline(page)
  const real = await storedTokens(page)
  expect(real?.accessToken).toMatch(/^mock\.user-001\./)
  expect(real?.refreshToken).toBeTruthy()

  // Refresh token di-KEDALUWARSAKAN server-side secara deterministik
  // (POST /admin/expire-refresh-tokens — tanpa restart / menunggu TTL):
  // sesi login asli dihapus → POST /auth/refresh berikutnya → 401 SESSION_EXPIRED.
  const exp = await page.request.post('http://localhost:4000/admin/expire-refresh-tokens')
  expect(exp.ok()).toBeTruthy()

  // Access token ikut dibasi (seperti RG-15/16) supaya request berikutnya
  // memicu alur 401 → refresh → refresh gagal SESSION_EXPIRED.
  await overwriteTokens(page, { access: 'mock.user-001.1', refresh: real!.refreshToken })

  // Reload → /auth/me 401 TOKEN_EXPIRED → POST /auth/refresh 401 SESSION_EXPIRED
  // → logout otomatis + modal "Sesi Berakhir" (bukan sekadar error inline)
  await page.reload()

  // Modal "Sesi Berakhir" tampil (role=dialog, aria-label="Sesi berakhir")
  const dialog = page.getByRole('dialog', { name: 'Sesi berakhir' })
  await expect(dialog).toBeVisible()
  await expect(page.getByText('Sesi Berakhir', { exact: true })).toBeVisible()
  await expect(page.getByText(/refresh token kedaluwarsa atau tidak valid/)).toBeVisible()

  // Logout otomatis sudah terjadi: token sesi dibersihkan dari localStorage
  const cleared = await storedTokens(page)
  expect(cleared?.accessToken).toBeNull()

  // "Masuk kembali" menutup modal → halaman LOGIN (login ulang wajib)
  await page.getByRole('button', { name: 'Masuk kembali' }).click()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Appsheet Accounting Journal' })).toBeVisible()
  await expect(page.getByText('Sesi berakhir. Silakan login kembali.')).toBeVisible()
  // Dashboard TIDAK tampil sebelum login ulang
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0)

  // Login ulang → sesi BARU aktif (token baru, dashboard + footer Online)
  await loginViaUi(page)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.locator('footer')).toContainText('Online · Mock API', { timeout: 20_000 })
  const newTokens = await storedTokens(page)
  expect(newTokens?.accessToken).toMatch(/^mock\.user-001\./)
  expect(newTokens?.accessToken).not.toBe(real?.accessToken)

  expect(errors).toEqual([])
})

test('RG-21 RATE_LIMITED: 429 dengan ambang rendah → retry otomatis → request pulih TANPA error', async ({ page }) => {
  const errors = watchPageErrors(page)
  await page.addInitScript(() => localStorage.clear())

  // Login normal (sesi aktif, token valid)
  await page.goto('/')
  await loginViaUi(page)
  await expect(page.locator('footer')).toContainText('Online · Mock API', { timeout: 20_000 })

  // Ambang SANGAT rendah: max 1 request per endpoint. set-rate-limit juga
  // mengosongkan bucket → hitungan deterministik dimulai dari sini.
  const setLimit = await page.request.post('http://localhost:4000/admin/set-rate-limit', {
    data: { max: 1, windowMs: 60000 },
  })
  expect(setLimit.ok()).toBeTruthy()

  // Pantau POST /journals (path sama tiap simpan → bucket yang sama)
  const journalStatuses: number[] = []
  page.on('response', (res) => {
    if (res.url().endsWith('/journals') && res.request().method() === 'POST') journalStatuses.push(res.status())
  })

  // Simpan jurnal #1 → 200 (bucket 1) → toast sukses
  const dialog1 = await openJournalModal(page)
  await fillBalancedJournal(dialog1, '10000000', 'RG-21 jurnal pertama')
  await dialog1.getByRole('button', { name: 'Simpan Draft' }).click()
  await expect(page.getByRole('status')).toContainText('Jurnal disimpan sebagai draft')

  // Simpan jurnal #2 → 429 (bucket 2 > 1, Retry-After ~60s) → klien retry
  // (jeda = Retry-After, dibatasi cap 5 detik). Segera naikkan ambang +
  // kosongkan bucket → retry klien berhasil (201 Created).
  const blocked = page.waitForResponse(
    (res) => res.url().endsWith('/journals') && res.request().method() === 'POST' && res.status() === 429,
    { timeout: 15_000 },
  )
  const retried = page.waitForResponse(
    (res) => res.url().endsWith('/journals') && res.request().method() === 'POST' && res.status() === 201,
    { timeout: 20_000 },
  )
  const dialog2 = await openJournalModal(page)
  await fillBalancedJournal(dialog2, '5000000', 'RG-21 jurnal kedua — retry')
  await dialog2.getByRole('button', { name: 'Simpan Draft' }).click()
  await blocked
  const raised = await page.request.post('http://localhost:4000/admin/set-rate-limit', {
    data: { max: 1000, windowMs: 60000 },
  })
  expect(raised.ok()).toBeTruthy()
  await retried // retry klien (setelah +800ms) berhasil 201

  // Retry berhasil: TANPA pesan 'Terlalu banyak permintaan'; bukti jaringan
  // 429 terjadi lalu retry 201; kedua jurnal tersimpan (8 seed + 2 = 10).
  await expect(page.getByText(/Terlalu banyak permintaan/)).toHaveCount(0)
  expect(journalStatuses).toEqual([201, 429, 201]) // #1 → 429 → retry #2
  await gotoNav(page, 'Jurnal')
  await expect(page.getByText('10 entri jurnal')).toBeVisible({ timeout: 10_000 })
  // Sesi tetap aktif
  await expect(page.locator('footer')).toContainText('Online · Mock API')
  expect(errors).toEqual([])
})

test('RG-22 RATE_LIMITED: 429 berulang (ambang rendah) → toast "Terlalu banyak permintaan" + jurnal tidak tersimpan', async ({ page }) => {
  const errors = watchPageErrors(page)
  await page.addInitScript(() => localStorage.clear())

  await page.goto('/')
  await loginViaUi(page)
  await expect(page.locator('footer')).toContainText('Online · Mock API', { timeout: 20_000 })

  // Ambang 1 + bucket kosong → simpan berikutnya kena 429 (retry ikut gagal)
  const setLimit = await page.request.post('http://localhost:4000/admin/set-rate-limit', {
    data: { max: 1, windowMs: 60000 },
  })
  expect(setLimit.ok()).toBeTruthy()

  // Simpan #1 → 200 (bucket 1) → toast sukses
  const dialog1 = await openJournalModal(page)
  await fillBalancedJournal(dialog1, '10000000', 'RG-22 jurnal pertama')
  await dialog1.getByRole('button', { name: 'Simpan Draft' }).click()
  await expect(page.getByRole('status')).toContainText('Jurnal disimpan sebagai draft')

  // Simpan #2 → 429 (Retry-After ~60s, cap klien 5s) → retry 5s → 429 →
  // retry 5s → 429 → toast error (total ±10s)
  const statuses: number[] = []
  page.on('response', (res) => {
    if (res.url().endsWith('/journals') && res.request().method() === 'POST') statuses.push(res.status())
  })
  const dialog2 = await openJournalModal(page)
  await fillBalancedJournal(dialog2, '2000000', 'RG-22 jurnal kedua — diblokir')
  await dialog2.getByRole('button', { name: 'Simpan Draft' }).click()

  // Pesan 'Terlalu banyak permintaan' tampil (retry habis → ApiError RATE_LIMITED)
  await expect(page.getByRole('status')).toContainText('Terlalu banyak permintaan', { timeout: 20_000 })
  // Bukti jaringan: 3 percobaan (1 asli + 2 retry), semuanya 429
  expect(statuses).toHaveLength(3)
  expect(statuses.every((s) => s === 429)).toBe(true)
  // Jurnal #2 TIDAK tersimpan: daftar jurnal tetap 9 entri (8 seed + jurnal #1)
  await gotoNav(page, 'Jurnal')
  await expect(page.getByText('9 entri jurnal')).toBeVisible()
  await expect(page.getByText('BKM-2026-03-0010', { exact: true })).toHaveCount(0)
  // Sesi tetap aktif (429 ≠ logout)
  await expect(page.locator('footer')).toContainText('Online · Mock API')
  expect(errors).toEqual([])
})
