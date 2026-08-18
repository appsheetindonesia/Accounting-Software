// ============================================================
// Test terpadu — jalankan KETIGA suite sekaligus (paralel) dengan
// SATU perintah `npm test`:
//
//   1. mock-api               — integration test Vitest + Supertest
//                               (112 test, tanpa server — app Express langsung)
//   2. prototype-accounting   — unit + integration MSW (Vitest, 286 test)
//   3. e2e                    — Playwright RG-01..RG-22 (50 test =
//                               25 skenario × chromium + firefox;
//                               webServer menyalakan mock API :4000 + Vite :5173)
//
//   npm test                   # semua suite sekaligus
//   npm run test:mock-api      # per-suite (tetap tersedia)
//   npm run test:prototype
//   npm run test:e2e
//   npm test -- --only=e2e     # subset: mock-api | prototype | e2e
//                              # (bisa juga koma: --only=mock-api,prototype)
//
// Perilaku:
//   - Paralel → total durasi ≈ suite terlama (E2E), bukan penjumlahan
//   - Output live di-prefix per suite: [mock-api] [prototype] [e2e]
//   - E2E dijalankan dengan MOCK_API_PERSIST=0 (state hermetis per run,
//     identik dengan CI) — jurnal yang diposting di dev tidak terpengaruh
//   - Exit code non-zero bila ada suite yang gagal
// ============================================================

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const allSuites = [
  { name: 'mock-api', cwd: path.join(root, 'mock-api'), env: {} },
  { name: 'prototype', cwd: path.join(root, 'prototype-accounting'), env: {} },
  // E2E: Playwright menyalakan mock API (port 4000) + Vite (5173) sendiri
  // lewat webServer. Persistence nonaktif agar run hermetis (sama dengan CI).
  { name: 'e2e', cwd: path.join(root, 'e2e'), env: { MOCK_API_PERSIST: '0' } },
]

// Parse --only=<suite> (atau daftar koma) untuk menjalankan subset suite
// tanpa mengubah perintah npm. Nilai tidak valid → error + exit 1.
const onlyArg = process.argv.find((a) => a.startsWith('--only='))
let suites = allSuites
if (onlyArg) {
  const requested = onlyArg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean)
  const valid = new Set(allSuites.map((s) => s.name))
  const unknown = requested.filter((r) => !valid.has(r))
  if (unknown.length) {
    console.error(`[test-all] Nilai --only tidak dikenal: ${unknown.join(', ')}`)
    console.error(`[test-all] Pilihan valid: ${[...valid].join(' | ')} (bisa digabung dengan koma)`)
    process.exit(1)
  }
  suites = allSuites.filter((s) => requested.includes(s.name))
  if (!suites.length) {
    console.error('[test-all] --only tidak memilih suite apa pun')
    process.exit(1)
  }
}

function runSuite(suite) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['test'], {
      cwd: suite.cwd,
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, ...suite.env },
    })
    const tag = `[${suite.name}]`
    child.stdout.on('data', (d) => process.stdout.write(`${tag} ${d}`))
    child.stderr.on('data', (d) => process.stderr.write(`${tag} ${d}`))
    child.on('error', (err) => {
      process.stderr.write(`${tag} gagal di-spawn: ${err.message}\n`)
      resolve({ name: suite.name, ok: false, note: 'spawn error' })
    })
    child.on('exit', (code, signal) => {
      resolve({ name: suite.name, ok: code === 0, note: code === 0 ? 'PASS' : `exit=${code ?? signal}` })
    })
  })
}

const started = Date.now()
const subset = onlyArg ? ` (--only=${onlyArg.slice('--only='.length)})` : ''
console.log(`[test-all] Menjalankan ${suites.length} suite${subset}: ${suites.map((s) => s.name).join(' · ')}\n`)

const results = await Promise.all(suites.map(runSuite))

const duration = ((Date.now() - started) / 1000).toFixed(1)
const allOk = results.every((r) => r.ok)

console.log('\n' + '='.repeat(70))
console.log('RINGKASAN TEST-ALL')
for (const r of results) {
  console.log(`  ${r.name.padEnd(10)} ${r.ok ? '✅ PASS' : '❌ FAIL'}  (${r.note})`)
}
console.log(`  durasi total : ${duration}s`)
console.log('='.repeat(70))

process.exit(allOk ? 0 : 1)
