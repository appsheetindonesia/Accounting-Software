// Helper bersama untuk suite regresi RG-01..RG-19.
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'

export const API_BASE = 'http://localhost:4000'
export const DEMO = { email: 'rina@bukuwarung.com', password: 'password123' }

export const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` })

/** Reset state mock API ke seed awal (Maret 2026) — setara restart server in-memory. */
export async function resetServer(request: APIRequestContext) {
  const res = await request.post(`${API_BASE}/admin/reset`, { data: {} })
  expect(res.ok()).toBeTruthy()
}

/** Login demo admin dan kembalikan accessToken (mock.user-001.*). */
export async function loginToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: DEMO })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  return body.data.accessToken as string
}

/**
 * Login akun demo melalui UI (halaman login tampil karena sesi kosong).
 * Dipakai gotoOnline & RG-11 (context manual 320px).
 */
export async function loginViaUi(page: Page) {
  await page.getByLabel('Email').fill(DEMO.email)
  await page.getByLabel('Password').fill(DEMO.password)
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
}

/**
 * Muat halaman dan tunggu koneksi online + data API (footer status).
 * Login wajib sejak fitur login (POST /auth/login) — jika halaman login
 * tampil (sesi kosong), masuk dengan akun demo melalui UI.
 */
export async function gotoOnline(page: Page) {
  await page.goto('/')
  const email = page.getByLabel('Email')
  if (await email.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await loginViaUi(page)
  }
  await expect(page.locator('footer')).toContainText('Online · Mock API', { timeout: 20_000 })
}

/** Buka modal entri jurnal dari sidebar, kembalikan Locator dialog. */
export async function openJournalModal(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Buat Jurnal' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Entri jurnal baru' })
  await expect(dialog).toBeVisible()
  return dialog
}

/**
 * Isi jurnal seimbang di modal: baris 1 debit = amount, baris 2 kredit = amount.
 * Baris default modal: 1-1100 Kas Besar (debit) / 4-1000 Pendapatan Jasa (kredit).
 */
export async function fillBalancedJournal(dialog: Locator, amount = '10000000', description = 'Jurnal E2E regresi') {
  await dialog.getByPlaceholder('Keterangan transaksi...').fill(description)
  const amounts = dialog.locator('input[inputmode="numeric"]')
  await amounts.nth(0).fill(amount) // baris 1 → debit
  await amounts.nth(3).fill(amount) // baris 2 → kredit
  await expect(dialog.getByText('Jurnal seimbang (Debit = Kredit)')).toBeVisible()
}

/** Kumpulkan uncaught page errors (bukan console noise) untuk asersi akhir. */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

/** Navigasi sidebar ke halaman bernama (label tombol sidebar, match eksak). */
export async function gotoNav(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click()
}
