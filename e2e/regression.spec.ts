// ============================================================
// Skenario Regresi RG-01..RG-12 — QA Test Plan - Accounting.md §4
// Dijalankan terhadap MOCK API (localhost:4000) + prototipe Vite (:5173).
//
// Aturan main:
// - beforeEach me-reset state mock API ke seed (setara restart server
//   in-memory) + membersihkan localStorage → setiap test mulai dari
//   baseline terverifikasi: Aset 557jt = Utang 150 + Modal 363 + Laba 44.
// - Verifikasi keseimbangan buku di akhir skenario (trial balance).
// - Fitur yang belum ada UI-nya (tutup periode, search global) diuji lewat
//   lapisan API — ditandai di annotation. Export laporan sudah lewat tombol UI.
// ============================================================
import { test, expect, type Page } from '@playwright/test'
import {
  API_BASE,
  authHeaders,
  DEMO,
  fillBalancedJournal,
  gotoNav,
  gotoOnline,
  loginToken,
  loginViaUi,
  openJournalModal,
  resetServer,
  watchPageErrors,
} from './helpers'

const BASE = {
  aset: 'Rp 557.000.000',
  kas: 'Rp 87.000.000',
  laba: 'Rp 44.000.000',
  pendapatan: 'Rp 155.000.000',
  trialBalance: 668_000_000,
}

test.beforeEach(async ({ page, request }) => {
  await resetServer(request)
  await page.addInitScript(() => {
    // Bersihkan storage SEKALI per test (bukan tiap reload) — sesi login
    // harus bertahan saat page.reload() di RG-02/04 agar tetap terautentikasi.
    if (!sessionStorage.getItem('e2e-cleared')) {
      localStorage.clear()
      sessionStorage.setItem('e2e-cleared', '1')
    }
  })
  await gotoOnline(page)
  await expect(page.getByText(BASE.aset, { exact: true }).first()).toBeVisible()
})

// Membuat jurnal 10jt via UI lalu memposting-nya (dipakai RG-01/02/03/10)
async function createAndPostJournal(page: Page) {
  const dialog = await openJournalModal(page)
  await fillBalancedJournal(dialog, '10000000', 'Jurnal E2E regresi 10jt')
  await dialog.getByRole('button', { name: 'Posting' }).click()
  await expect(page.getByRole('status')).toContainText('Jurnal berhasil diposting')
}

// ------------------------------------------------------------
test.describe('RG-01 s/d RG-04 — siklus jurnal, reverse, laporan, periode', () => {
  test('RG-01 Siklus hidup jurnal penuh: draft → posting → hapus; saldo konsisten', async ({ page, request }) => {
    // 1. Buat jurnal 10jt → SIMPAN DRAFT
    const dialog = await openJournalModal(page)
    await fillBalancedJournal(dialog, '10000000', 'RG-01 penerimaan jasa E2E')
    await dialog.getByRole('button', { name: 'Simpan Draft' }).click()
    await expect(page.getByRole('status')).toContainText('Jurnal disimpan sebagai draft')

    // 2. Draft muncul di daftar jurnal, status Draft
    await gotoNav(page, 'Jurnal')
    await expect(page.getByText('BKM-2026-03-0009', { exact: true })).toBeVisible()
    await expect(page.locator('tbody').getByText('Draft', { exact: true }).first()).toBeVisible()

    // 3. Draft TIDAK mengubah saldo: Buku Besar Kas tetap 87jt, dashboard tetap 557jt
    await gotoNav(page, 'Buku Besar')
    await expect(page.getByText(BASE.kas, { exact: true }).first()).toBeVisible()
    await gotoNav(page, 'Dashboard')
    await expect(page.getByText(BASE.aset, { exact: true }).first()).toBeVisible()

    // 4. Posting draft → saldo berubah (Kas 87→97jt, Aset 557→567jt)
    await gotoNav(page, 'Jurnal')
    const draftRow = page.locator('tbody tr', { hasText: 'BKM-2026-03-0009' }).first()
    await draftRow.getByRole('button', { name: 'Buka detail' }).click()
    await expect(page.getByText('RG-01 penerimaan jasa E2E')).toBeVisible()
    await page.getByRole('button', { name: 'Posting' }).click()
    await expect(page.getByRole('status')).toContainText('Jurnal berhasil diposting')
    await expect(page.locator('tbody').getByText('Posted', { exact: true }).first()).toBeVisible()
    await gotoNav(page, 'Dashboard')
    await expect(page.getByText('Rp 567.000.000', { exact: true }).first()).toBeVisible()
    await gotoNav(page, 'Buku Besar')
    await expect(page.getByText('Rp 97.000.000', { exact: true }).first()).toBeVisible()

    // 5. Hapus draft seed (BKK-0006) → saldo TIDAK berubah
    await gotoNav(page, 'Jurnal')
    const delRow = page.locator('tbody tr', { hasText: 'BKK-2026-03-0006' }).first()
    await delRow.getByRole('button', { name: 'Buka detail' }).click()
    await page.getByRole('button', { name: 'Hapus' }).click()
    await page.getByRole('button', { name: 'Yakin hapus?' }).click()
    await expect(page.getByRole('status')).toContainText('Jurnal draft dihapus')
    await expect(page.getByText('BKK-2026-03-0006', { exact: true })).toHaveCount(0)
    await gotoNav(page, 'Dashboard')
    await expect(page.getByText('Rp 567.000.000', { exact: true }).first()).toBeVisible()

    // 6. Edit draft via API (UI edit belum ada) + optimistic lock (If-Match)
    const token = await loginToken(request)
    const editRes = await request.put(`${API_BASE}/journals/JNL-2026-03-007`, {
      headers: { ...authHeaders(token), 'If-Match': '1' },
      data: {
        date: '2026-03-20',
        transactionNumber: 'JV-2026-03-0007',
        description: 'Koreksi beban listrik dan air Maret (diedit E2E)',
        lines: [
          { accountId: '5-3000', debit: 2_500_000, credit: 0 },
          { accountId: '1-1100', debit: 0, credit: 2_500_000 },
        ],
      },
    })
    expect(editRes.status()).toBe(200)
    const edited = (await editRes.json()).data
    expect(edited.version).toBe(2)
    expect(edited.description).toContain('diedit E2E')
    // If-Match salah → 409 DATA_CONFLICT
    const conflict = await request.put(`${API_BASE}/journals/JNL-2026-03-007`, {
      headers: { ...authHeaders(token), 'If-Match': '1' },
      data: { date: '2026-03-20', description: 'versi usang', lines: [{ accountId: '5-3000', debit: 1, credit: 0 }, { accountId: '1-1100', debit: 0, credit: 1 }] },
    })
    expect(conflict.status()).toBe(409)
    expect((await conflict.json()).error.code).toBe('DATA_CONFLICT')

    // 7. Buku tetap seimbang
    const tb = await (await request.get(`${API_BASE}/reports/trial-balance?period=2026-03`, { headers: authHeaders(token) })).json()
    expect(tb.data.totals.isBalanced).toBe(true)
  })

  test('RG-02 Reverse menyeluruh: saldo & laporan kembali, net 0', async ({ page, request }) => {
    // 1. Posting 10jt → Aset 567jt (reload: memaksa refetch dari server)
    await createAndPostJournal(page)
    await page.reload()
    await expect(page.locator('footer')).toContainText('Online · Mock API', { timeout: 20_000 })
    await expect(page.getByText('Rp 567.000.000', { exact: true }).first()).toBeVisible()

    // 2. Reverse lewat UI
    await gotoNav(page, 'Jurnal')
    const row = page.locator('tbody tr', { hasText: 'BKM-2026-03-0009' }).first()
    await row.getByRole('button', { name: 'Buka detail' }).click()
    await page.getByRole('button', { name: 'Reverse' }).click()
    await expect(page.getByRole('status')).toContainText('jurnal pembalik dibuat')

    // 3. Jurnal pembalik posted + jurnal asal reversed
    await expect(page.getByText('REV-BKM-2026-03-0009', { exact: true })).toBeVisible()
    await expect(page.locator('tbody').getByText('Reversed', { exact: true }).first()).toBeVisible()

    // 4. Saldo kembali ke baseline (Kas 87jt, Aset 557jt)
    await gotoNav(page, 'Buku Besar')
    await expect(page.getByText(BASE.kas, { exact: true }).first()).toBeVisible()
    await gotoNav(page, 'Dashboard')
    await expect(page.getByText(BASE.aset, { exact: true }).first()).toBeVisible()

    // 5. Trial balance tetap seimbang; status pasangan di server benar
    const token = await loginToken(request)
    const tb = await (await request.get(`${API_BASE}/reports/trial-balance?period=2026-03`, { headers: authHeaders(token) })).json()
    expect(tb.data.totals.isBalanced).toBe(true)
    expect(tb.data.totals.debit).toBe(BASE.trialBalance)

    // Keyword search match substring → filter eksak agar pasangan tidak tertukar
    const origRes = await (await request.get(`${API_BASE}/journals?keyword=BKM-2026-03-0009`, { headers: authHeaders(token) })).json()
    const orig = origRes.data.journals.find((j: { transactionNumber: string }) => j.transactionNumber === 'BKM-2026-03-0009')
    expect(orig.status).toBe('reversed')
    const revRes = await (await request.get(`${API_BASE}/journals?keyword=REV-BKM-2026-03-0009`, { headers: authHeaders(token) })).json()
    const rev = revRes.data.journals.find((j: { transactionNumber: string }) => j.transactionNumber === 'REV-BKM-2026-03-0009')
    expect(rev.status).toBe('posted')
    // journalBrief tidak memuat reversalOf → ambil detail penuh
    const revDetail = await (await request.get(`${API_BASE}/journals/${rev.id}`, { headers: authHeaders(token) })).json()
    expect(revDetail.data.reversalOf).toBeTruthy()
  })

  test('RG-03 Posting → laporan → export: angka konsisten, neraca seimbang', async ({ page, request }) => {
    // 1. Posting 10jt
    await createAndPostJournal(page)

    // 2. Laba Rugi UI: Pendapatan 165jt, Laba Bersih 54jt
    await gotoNav(page, 'Laba Rugi')
    await expect(page.getByText('Rp 165.000.000', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Rp 54.000.000', { exact: true }).first()).toBeVisible()

    // 3. Neraca (UI): Aset 567jt + indikator seimbang Aset = Kewajiban + Ekuitas
    await gotoNav(page, 'Neraca')
    await expect(page.getByText('✓ Seimbang (Aset = Kewajiban + Ekuitas)', { exact: true })).toBeVisible()
    await expect(page.getByText('Rp 567.000.000', { exact: true }).first()).toBeVisible()

    // 4. Neraca Lajur (UI): Debit = Kredit 678jt + indikator seimbang
    await gotoNav(page, 'Neraca Lajur')
    await expect(page.getByText('✓ Seimbang (Debit = Kredit)', { exact: true })).toBeVisible()
    await expect(page.getByText('Rp 678.000.000', { exact: true }).first()).toBeVisible()

    // 5. Export PDF & XLSX via tombol UI (Laba Rugi) — klik tombol memicu
    //    unduhan nyata browser (navigasi, auth via ?token=). Chromium: event
    //    download + nama file dari Content-Disposition server. Firefox headless
    //    (Playwright/Juggler) tidak meng-emit event download untuk respons
    //    attachment HTTP — verifikasi request export terkirim dengan token auth.
    await gotoNav(page, 'Laba Rugi')
    await expect(page.getByText('Rp 165.000.000', { exact: true }).first()).toBeVisible()

    const isFirefox = test.info().project.name === 'firefox'
    for (const [label, fmt] of [
      ['Export PDF', 'pdf'],
      ['Export XLSX', 'xlsx'],
    ] as const) {
      const reqPromise = page.waitForRequest(
        (r) =>
          r.method() === 'GET' &&
          r.url().includes('/exports/reports/income-statement') &&
          r.url().includes(`format=${fmt}`) &&
          r.url().includes('token='),
      )
      const dlPromise = isFirefox ? null : page.waitForEvent('download')
      await page.getByRole('button', { name: label }).click()
      const req = await reqPromise
      expect(req.url()).toContain('token=mock.')
      if (dlPromise) expect((await dlPromise).suggestedFilename()).toBe(`Laba-Rugi-2026-03.${fmt}`)
    }

    // Tombol export juga tersedia di halaman Neraca & Neraca Lajur
    await gotoNav(page, 'Neraca')
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export XLSX' })).toBeVisible()
    await gotoNav(page, 'Neraca Lajur')
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export XLSX' })).toBeVisible()
  })

  test('RG-04 Tutup periode: posting diblokir, laporan tetap terbaca, draft ter-post', async ({ page, request }) => {
    // 1. Tutup Maret 2026 via API dengan aksi post-all (UI tutup periode belum ada)
    test.info().annotations.push({
      type: 'Gap',
      description: 'UI tutup periode belum ada di prototipe — ditutup via API (PATCH /periods/:id/close).',
    })
    const token = await loginToken(request)
    const close = await request.patch(`${API_BASE}/periods/fp-2026-03/close`, {
      headers: authHeaders(token),
      data: { confirmDraftAction: 'post-all' },
    })
    expect(close.status()).toBe(200)
    const handled = (await close.json()).data.handledDrafts
    expect(handled.posted).toBe(2) // BKK-0006 + JV-0007

    // 2. UI: entri/posting di periode tertutup → error toast PERIOD_CLOSED
    const dialog = await openJournalModal(page)
    await fillBalancedJournal(dialog, '10000000', 'RG-04 coba posting periode tertutup')
    await dialog.getByRole('button', { name: 'Posting' }).click()
    await expect(page.getByRole('status')).toContainText('sudah ditutup')

    // 3. Reload → Jurnal UI: kedua draft seed (BKK-0006, JV-0007) kini Posted
    await page.reload()
    await expect(page.locator('footer')).toContainText('Online · Mock API', { timeout: 20_000 })
    await gotoNav(page, 'Jurnal')
    await expect(page.getByText('BKK-2026-03-0006', { exact: true })).toBeVisible()
    await expect(page.getByText('JV-2026-03-0007', { exact: true })).toBeVisible()
    await expect(page.locator('tbody').getByText('Posted', { exact: true })).toHaveCount(7)

    // 4. Laporan tetap terbaca di UI setelah periode ditutup: Neraca render,
    //    seimbang, Aset 549,5jt (Kas berkurang 7,5jt dari 2 draft yang ter-post)
    await gotoNav(page, 'Neraca')
    await expect(page.getByText('✓ Seimbang (Aset = Kewajiban + Ekuitas)', { exact: true })).toBeVisible()
    await expect(page.getByText('Rp 549.500.000', { exact: true }).first()).toBeVisible()
  })
})

// ------------------------------------------------------------
test.describe('RG-05 s/d RG-08 — entitas, approval, search, periode', () => {
  test('RG-05 Multi-entitas: data terisolasi via switch entitas di UI', async ({ page }) => {
    const entitySelect = page.getByLabel('Pilih entitas')
    // Nama entitas aktif tampil di TopBar (header) — bukan option dropdown yang hidden
    const entityLabel = page.locator('header').getByText(/PT\. Kreasi Inovasi Estetika|CV Karya Mandiri/)

    // 1. Default: ent-001 (PT. Kreasi Inovasi Estetika) → 8 jurnal di UI
    await expect(entityLabel).toHaveText('PT. Kreasi Inovasi Estetika')
    await gotoNav(page, 'Jurnal')
    await expect(page.getByText('8 entri jurnal')).toBeVisible()

    // 2. Switch ke ent-002 (CV Karya Mandiri) via dropdown sidebar →
    //    data TERISOLASI: 0 jurnal (jurnal ent-001 tidak terlihat di UI)
    await entitySelect.selectOption('ent-002')
    await expect(entityLabel).toHaveText('CV Karya Mandiri')
    await expect(page.getByText('0 entri jurnal')).toBeVisible()

    // 3. Buat jurnal 5jt via UI di ent-002 → kini 1 entri jurnal
    const dialog = await openJournalModal(page)
    await fillBalancedJournal(dialog, '5000000', 'RG-05 jurnal entitas CV Karya Mandiri')
    await dialog.getByRole('button', { name: 'Posting' }).click()
    await expect(page.getByRole('status')).toContainText('Jurnal berhasil diposting')
    await expect(page.getByText('1 entri jurnal')).toBeVisible()

    // 4. Switch balik ke ent-001 → jurnal ent-002 TIDAK terlihat, tetap 8
    await entitySelect.selectOption('ent-001')
    await expect(page.getByText('8 entri jurnal')).toBeVisible()
    await expect(page.getByText('RG-05 jurnal entitas CV Karya Mandiri', { exact: true })).not.toBeVisible()
  })

  test('RG-06 Approval flow via UI: saldo hanya berubah saat approve; reject kembali draft', async ({ page, request }) => {
    const createDraftUi = async (desc: string) => {
      const dialog = await openJournalModal(page)
      await fillBalancedJournal(dialog, '10000000', desc)
      await dialog.getByRole('button', { name: 'Simpan Draft' }).click()
      await expect(page.getByRole('status')).toContainText('disimpan sebagai draft')
    }

    // 1. Jurnal 1 (BKM-0009): buat draft via UI → submit → badge Menunggu Approval; saldo belum berubah
    await createDraftUi('RG-06 jurnal approve')
    await expect(page.getByText(BASE.aset, { exact: true }).first()).toBeVisible() // masih 557jt
    await gotoNav(page, 'Jurnal')
    await page.locator('tbody tr', { hasText: 'BKM-2026-03-0009' }).first().getByRole('button', { name: 'Buka detail' }).click()
    await page.getByRole('button', { name: 'Submit', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('diajukan untuk persetujuan')
    await expect(page.locator('tbody').getByText('Menunggu Approval', { exact: true }).first()).toBeVisible()
    await gotoNav(page, 'Dashboard')
    await expect(page.getByText(BASE.aset, { exact: true }).first()).toBeVisible() // masih 557jt (belum approve)

    // 2. Approve via UI → badge Posted; saldo berubah (Aset 557 → 567jt)
    await gotoNav(page, 'Jurnal')
    await page.locator('tbody tr', { hasText: 'BKM-2026-03-0009' }).first().getByRole('button', { name: 'Buka detail' }).click()
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('disetujui dan diposting')
    await expect(page.locator('tbody').getByText('Posted', { exact: true }).first()).toBeVisible()
    await gotoNav(page, 'Dashboard')
    await expect(page.getByText('Rp 567.000.000', { exact: true }).first()).toBeVisible()

    // 3. Jurnal 2 (BKM-0010): buat draft → submit → reject via UI (alasan WAJIB) →
    //    kembali Draft; rejectionReason tampil di detail; saldo tetap 567jt
    await createDraftUi('RG-06 jurnal reject')
    await gotoNav(page, 'Jurnal')
    await page.locator('tbody tr', { hasText: 'BKM-2026-03-0010' }).first().getByRole('button', { name: 'Buka detail' }).click()
    await page.getByRole('button', { name: 'Submit', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('diajukan untuk persetujuan')

    // Reject membuka dialog dengan alasan wajib: tombol nonaktif tanpa isi
    await page.getByRole('button', { name: 'Reject', exact: true }).click()
    const rejectDialog = page.getByRole('dialog', { name: 'Tolak jurnal' })
    await expect(rejectDialog).toBeVisible()
    await expect(rejectDialog.getByRole('button', { name: 'Reject', exact: true })).toBeDisabled()
    await rejectDialog.getByLabel('Alasan penolakan').fill('Nomor bukti tidak valid')
    await rejectDialog.getByRole('button', { name: 'Reject', exact: true }).click()

    await expect(page.getByRole('status')).toContainText('ditolak — kembali ke draft')
    await expect(page.locator('tbody').getByText('Draft', { exact: true }).first()).toBeVisible()
    // rejectionReason tampil di detail jurnal (UI)
    await expect(page.getByText('Ditolak — alasan: Nomor bukti tidak valid')).toBeVisible()

    // Reload → alasan tetap tampil (berasal dari fetch ulang, bukan hanya state lokal)
    await page.reload()
    await expect(page.locator('footer')).toContainText('Online · Mock API', { timeout: 20_000 })
    await gotoNav(page, 'Jurnal')
    await page.locator('tbody tr', { hasText: 'BKM-2026-03-0010' }).first().getByRole('button', { name: 'Buka detail' }).click()
    await expect(page.getByText('Ditolak — alasan: Nomor bukti tidak valid')).toBeVisible()

    // 4. "Simpan & Ajukan" → jurnal langsung Menunggu Approval (tanpa submit manual)
    const dialog2 = await openJournalModal(page)
    await fillBalancedJournal(dialog2, '3000000', 'RG-06 simpan & ajukan langsung')
    await dialog2.getByRole('button', { name: 'Simpan & Ajukan' }).click()
    await expect(page.getByRole('status')).toContainText('diajukan untuk persetujuan')
    await expect(page.locator('tbody').getByText('Menunggu Approval', { exact: true }).first()).toBeVisible()

    await gotoNav(page, 'Dashboard')
    await expect(page.getByText('Rp 567.000.000', { exact: true }).first()).toBeVisible() // tidak berubah

    // 5. Detail server (UI tidak menampilkan audit trail): rejectionReason + riwayat lengkap

    // 4. Detail server (UI tidak menampilkan audit trail): rejectionReason + riwayat lengkap
    const token = await loginToken(request)
    const h = authHeaders(token)
    const findId = async (no: string) => {
      const res = await (await request.get(`${API_BASE}/journals?keyword=${no}`, { headers: h })).json()
      return (res.data.journals as { id: string; transactionNumber: string }[]).find((j) => j.transactionNumber === no)!.id
    }
    const rejected = await (await request.get(`${API_BASE}/journals/${await findId('BKM-2026-03-0010')}`, { headers: h })).json()
    expect(rejected.data.status).toBe('draft')
    expect(rejected.data.rejectionReason).toBe('Nomor bukti tidak valid')
    const audited = await (await request.get(`${API_BASE}/journals/${await findId('BKM-2026-03-0009')}`, { headers: h })).json()
    const actions = audited.data.auditTrail.map((a: { action: string }) => a.action)
    for (const expected of ['create', 'submit', 'approve']) expect(actions).toContain(expected)
  })

  test('RG-07 Filter & search: filter jurnal + pencarian global konsisten', async ({ page, request }) => {
    // 1. Filter teks di halaman Jurnal (UI)
    await gotoNav(page, 'Jurnal')
    const search = page.getByPlaceholder('Cari no. bukti, keterangan, atau akun...')
    await search.fill('BKM')
    await expect(page.getByText('3 entri jurnal')).toBeVisible() // BKM-0001, 0004, 0008

    await search.fill('gaji')
    await expect(page.getByText('1 entri jurnal')).toBeVisible() // JV-0005

    // 2. Filter status Draft
    await search.fill('')
    await page.getByLabel('Status').selectOption('draft')
    await expect(page.getByText('2 entri jurnal')).toBeVisible() // BKK-0006, JV-0007

    // 3. Buka detail dari hasil filter → navigasi benar
    const row = page.locator('tbody tr', { hasText: 'JV-2026-03-0007' }).first()
    await row.getByRole('button', { name: 'Buka detail' }).click()
    await expect(page.getByText('Koreksi beban listrik dan air Maret')).toBeVisible()

    // 4. Search global via API (UI global search belum ada)
    test.info().annotations.push({
      type: 'Gap',
      description: 'Global search & filter di URL belum ada di prototipe — endpoint /search diverifikasi via API.',
    })
    const token = await loginToken(request)
    const sres = await (await request.get(`${API_BASE}/search?q=gaji`, { headers: authHeaders(token) })).json()
    expect(sres.data.results.some((r: { type: string; title: string }) => r.type === 'journal' && r.title === 'JV-2026-03-0005')).toBe(true)
  })

  test('RG-08 Selektor periode global: footer, modal, dan laporan sinkron', async ({ page }) => {
    // 1. Ganti periode global di sidebar → footer sinkron
    await page.getByLabel('Pilih periode').selectOption('2026-02')
    await expect(page.locator('footer')).toContainText('Periode: 2026-02')

    // 2. Modal jurnal ikut periode aktif
    const dialog = await openJournalModal(page)
    await expect(dialog.getByText('2026-02 · aktif')).toBeVisible()
    await dialog.getByRole('button', { name: 'Batal' }).click()

    // 3. Laba Rugi: navigasi periode sendiri (Maret 44jt → Februari 77jt)
    await gotoNav(page, 'Laba Rugi')
    await expect(page.getByText(BASE.laba, { exact: true }).first()).toBeVisible() // Maret
    await page.getByRole('button', { name: 'Periode sebelumnya' }).click()
    await expect(page.getByText('Rp 77.000.000', { exact: true }).first()).toBeVisible() // Februari

    // 4. Buku Besar: periode tanpa transaksi → saldo tetap (60jt)
    await gotoNav(page, 'Buku Besar')
    await page.getByRole('button', { name: 'Periode sebelumnya' }).click()
    await page.getByRole('button', { name: 'Periode sebelumnya' }).click()
    await expect(page.getByText('Saldo tetap Rp 60.000.000')).toBeVisible()

    // 5. Dashboard tetap fungsional setelah ganti periode
    await gotoNav(page, 'Dashboard')
    await expect(page.getByText(BASE.aset, { exact: true }).first()).toBeVisible()
  })
})

// ------------------------------------------------------------
test.describe('RG-09 s/d RG-12 — performa, restart, lintas browser, error', () => {
  test('RG-09 Data besar: 10.000 jurnal — pagination, kecepatan, filter tetap benar', async ({ page, request }) => {
    test.setTimeout(180_000)
    const token = await loginToken(request)
    const h = authHeaders(token)

    // Seed 10.000 jurnal seimbang (dev endpoint)
    const seed = await request.post(`${API_BASE}/admin/seed-bulk`, { headers: h, data: { count: 10_000 } })
    expect(seed.status()).toBe(200)
    expect((await seed.json()).data.added).toBe(10_000)

    // Respons daftar dengan pagination < 2 detik (kriteria RG-09)
    const t0 = Date.now()
    const listRes = await request.get(`${API_BASE}/journals?page=1&pageSize=200`, { headers: h })
    const ms = Date.now() - t0
    const list = await listRes.json()
    expect(list.meta.total).toBe(10_008) // 8 seed + 10.000 bulk
    expect(list.data.journals.length).toBe(200)
    expect(ms).toBeLessThan(2_000)

    // UI: reload → 200 baris termuat, tanpa error
    const errors = watchPageErrors(page)
    await page.reload()
    await expect(page.locator('footer')).toContainText('Online · Mock API', { timeout: 20_000 })
    await gotoNav(page, 'Jurnal')
    await expect(page.getByText('200 entri jurnal')).toBeVisible()

    // Filter server tetap benar pada data besar (10.000 jurnal)
    const byKeyword = await (await request.get(`${API_BASE}/journals?keyword=bulk%20%231001`, { headers: h })).json()
    expect(byKeyword.meta.total).toBe(1)
    expect(byKeyword.data.journals[0].transactionNumber).toBe('BKM-2026-03-2001') // n=1001 → nomor n+1000

    // Filter UI tetap benar: nomor bukti yang pasti ada di 200 baris pertama
    const search = page.getByPlaceholder('Cari no. bukti, keterangan, atau akun...')
    await search.fill('BKM-2026-03-5236')
    await expect(page.getByText('1 entri jurnal')).toBeVisible()
    await expect(page.getByText('BKM-2026-03-5236', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('RG-10 Restart & persistensi: reset server = kembali seed; UI tanpa error', async ({ page, request }) => {
    const errors = watchPageErrors(page)

    // 1. Posting 10jt via UI → server & UI punya 9 jurnal
    await createAndPostJournal(page)
    await gotoNav(page, 'Jurnal')
    await expect(page.getByText('BKM-2026-03-0009', { exact: true })).toBeVisible()

    // 2. "Restart" server in-memory = POST /admin/reset (setara restart)
    test.info().annotations.push({
      type: 'Dokumentasi',
      description: 'Server mock in-memory: restart ≡ POST /admin/reset (data kembali ke seed). RG-10 didokumentasikan, bukan bug.',
    })
    await resetServer(request)

    // 3. UI (tanpa reload) masih memegang 9 jurnal — state klien tidak hilang
    await expect(page.getByText('BKM-2026-03-0009', { exact: true })).toBeVisible()

    // 4. Reload → data dari server (8 jurnal), tidak ada error UI
    await page.reload()
    await expect(page.locator('footer')).toContainText('Online · Mock API', { timeout: 20_000 })
    await gotoNav(page, 'Jurnal')
    await expect(page.getByText('BKM-2026-03-0009', { exact: true })).toHaveCount(0)
    await gotoNav(page, 'Dashboard')
    await expect(page.getByText(BASE.aset, { exact: true }).first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('RG-11 Mobile 320px: layout tetap dapat dipakai tanpa overflow', async ({ browser }) => {
    // Suite penuh sudah berjalan di chromium + firefox (konfigurasi projects).
    // Di sini: verifikasi tambahan viewport mobile 320px.
    const ctx = await browser.newContext({ viewport: { width: 320, height: 640 } })
    const page = await ctx.newPage()
    await page.goto('http://localhost:5173/') // baseURL tidak berlaku untuk context manual
    await loginViaUi(page) // sesi kosong di context baru → login demo
    await expect(page.locator('footer')).toContainText('Online · Mock API', { timeout: 20_000 })
    await expect(page.getByText(BASE.aset, { exact: true }).first()).toBeVisible()

    // Navigasi tetap tersedia (sidebar ikon-only)
    await page.getByRole('button', { name: 'Jurnal', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Jurnal Umum' })).toBeVisible()

    // Tidak ada horizontal overflow dokumen
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow).toBe(false)
    await ctx.close()
  })

  test('RG-12 Error handling: server mati → banner offline + fallback, tanpa crash', async ({ page }) => {
    const errors = watchPageErrors(page)

    // Simulasi server mati: blokir semua request ke localhost:4000
    await page.route('**://localhost:4000/**', (route) => route.abort())
    await page.reload()

    // Banner offline (dengan petunjuk menjalankan) + toast error + footer
    // (indikator cache: 'Offline · Data dari cache (sinkron X)' atau
    //  'Offline · Data demo lokal' bila belum pernah sinkron)
    await expect(page.getByText(/Jalankan npm start/)).toBeVisible()
    await expect(page.getByRole('status')).toContainText('Mock API tidak terhubung')
    await expect(page.locator('footer')).toContainText('Offline · Data')

    // Dashboard tetap render dengan data lokal (bukan halaman putih)
    await expect(page.getByText('Total Aset', { exact: true })).toBeVisible()

    // Pulihkan koneksi → "Coba lagi" kembali online
    await page.unroute('**://localhost:4000/**')
    await page.getByRole('button', { name: 'Coba lagi' }).click()
    await expect(page.locator('footer')).toContainText('Online · Mock API', { timeout: 20_000 })
    expect(errors).toEqual([])
  })
})
