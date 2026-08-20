// @vitest-environment happy-dom
// Hanya file ini yang memakai DOM (download membuat elemen <a>). File test
// lain di src/api tetap di environment Node.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { download, setAuth } from './client'

const BASE_URL = 'http://localhost:4000'

describe('download — unduhan via navigasi anchor (export PDF/XLSX)', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>
  let appendSpy: ReturnType<typeof vi.spyOn>
  let removeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    setAuth(null, null, null)
    vi.unstubAllGlobals()
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    appendSpy = vi.spyOn(document.body, 'appendChild')
    removeSpy = vi.spyOn(document.body, 'removeChild')
  })

  afterEach(() => {
    clickSpy.mockRestore()
    appendSpy.mockRestore()
    removeSpy.mockRestore()
  })

  const clickedAnchor = () => appendSpy.mock.calls[0]?.[0] as HTMLAnchorElement | undefined

  it('membuat anchor dengan href lengkap (query + token + entity), download kosong, lalu click & remove', async () => {
    setAuth('mock.t', 'ent-001', 'r1')

    await download('/exports/reports/income-statement', { format: 'pdf', period: '2026-03' })

    const a = clickedAnchor()
    expect(a).toBeDefined()
    expect(a!.href).toBe(
      `${BASE_URL}/exports/reports/income-statement?format=pdf&period=2026-03&token=mock.t&entity=ent-001`,
    )
    expect(a!.download).toBe('')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    // Elemen dibersihkan dari DOM setelah diklik
    expect(removeSpy).toHaveBeenCalledTimes(1)
    expect(removeSpy.mock.calls[0][0]).toBe(a)
    expect(a!.isConnected).toBe(false)
  })

  it('tanpa sesi aktif → href TANPA ?token= dan ?entity=', async () => {
    await download('/exports/ledger/1-1100', { format: 'xlsx', period: '2026-02' })

    expect(clickedAnchor()!.href).toBe(`${BASE_URL}/exports/ledger/1-1100?format=xlsx&period=2026-02`)
  })

  it('nilai query undefined / string kosong di-skip dari URL', async () => {
    setAuth('mock.t', 'ent-001', 'r1')

    await download('/exports/reports/balance-sheet', { format: 'pdf', period: '', extra: undefined })

    const href = clickedAnchor()!.href
    expect(href).not.toContain('period=')
    expect(href).not.toContain('extra=')
    expect(href).toContain('format=pdf')
    expect(href).toContain('token=mock.t')
  })

  it('endpoint Buku Besar per akun: path akun + format + periode + auth', async () => {
    setAuth('mock.t', 'ent-001', 'r1')

    await download('/exports/ledger/1-1100', { format: 'pdf', period: '2026-03' })

    expect(clickedAnchor()!.href).toBe(
      `${BASE_URL}/exports/ledger/1-1100?format=pdf&period=2026-03&token=mock.t&entity=ent-001`,
    )
  })

  it('endpoint Buku Besar dengan rentang custom: start & end menggantikan period', async () => {
    setAuth('mock.t', 'ent-001', 'r1')

    await download('/exports/ledger/1-1100', { format: 'xlsx', start: '2026-03-01', end: '2026-03-15' })

    expect(clickedAnchor()!.href).toBe(
      `${BASE_URL}/exports/ledger/1-1100?format=xlsx&start=2026-03-01&end=2026-03-15&token=mock.t&entity=ent-001`,
    )
  })
})
