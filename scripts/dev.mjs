// ============================================================
// Dev terpadu — jalankan mock API + prototipe Vite bersamaan.
//
//   node scripts/dev.mjs                     # seed awal (Maret 2026)
//   node scripts/dev.mjs --extra             # seed + jurnal lintas bulan (Jan–Feb 2026)
//   node scripts/dev.mjs --reset             # paksa reset seed walau persistence aktif
//   MOCK_API_PERSIST=0 node scripts/dev.mjs  # tanpa persistence (in-memory, reset tiap boot)
//   npm run dev:stop                         # hentikan stack (baca .dev/dev.pid)
//
// PID file: menulis .dev/dev.pid (JSON berisi PID proses ini + child)
// agar `npm run dev:stop` (scripts/dev-stop.mjs) bisa mematikan seluruh
// pohon proses dengan satu perintah — tanpa harus menebak PID lewat
// netstat/tasklist. File dihapus otomatis saat shutdown (Ctrl+C / error).
//
// Alur:
//   1. Spawn mock API (npm run dev — auto-restart saat edit file)
//   2. Spawn prototipe (npm run dev — Vite)
//   3. Tunggu KEDUA-nya hidup (API /health OK + Vite siap)
//   4. Reset seed otomatis (POST /admin/reset) — prototipe selalu
//      dibuka terhadap baseline yang terverifikasi. Reset hanya
//      dijalankan saat persistence NONAKTIF (MOCK_API_PERSIST=0) atau
//      flag --reset diberikan — jika persistence aktif, state tersimpan
//      (jurnal yang diposting sebelumnya) dimuat, tidak di-reset.
//   5. SAMA SETIAP KALI mock API di-restart oleh `node --watch` (file
//      server berubah): deteksi baris "Restarting" di output, tunggu
//      /health OK kembali, lalu jalankan ulang logika reset yang sama
//      → seed baseline tidak hilang walau kode server diedit.
//   6. Ctrl+C menghentikan kedua proses (pohon proses ikut dimatikan)
//
// Catatan: `node --watch` di mock API memuat ulang state dari file
// persist (jika aktif) saat file server berubah — data tidak hilang;
// tanpa persist, seed dijalankan ulang otomatis seperti boot.
// ============================================================

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MOCK_API_DIR = path.join(root, 'mock-api')
const PROTOTYPE_DIR = root

const API_PORT = Number(process.env.MOCK_API_PORT) || 4000
const API_HEALTH_URL = `http://localhost:${API_PORT}/health`
const withExtra = process.argv.includes('--extra')
const forceReset = process.argv.includes('--reset')
const noPersist = process.argv.includes('--no-persist')
// --no-persist: nonaktifkan persistence (state in-memory, reset tiap boot)
// dan teruskan ke child (mock API) via env.
if (noPersist) process.env.MOCK_API_PERSIST = '0'
// API §1.5: mock API default rate limit 30 req/menit per endpoint. Untuk
// dev lokal & E2E (yang me-reuse server ini, lihat playwright.config.ts)
// naikkan ambang agar klik manual & suite regresi tidak kena throttle.
// Untuk menguji RATE_LIMITED, jalankan mock API langsung (cd mock-api && npm start)
// tanpa env ini.
if (process.env.MOCK_RATE_MAX === undefined) process.env.MOCK_RATE_MAX = '100000'
// Sama dengan parsing di mock-api/src/persistence.js
const persistOn = !['0', 'false', 'off', 'no', 'n', 'disabled'].includes(
  String(process.env.MOCK_API_PERSIST ?? '1').trim().toLowerCase(),
)

const children = new Set()
let shuttingDown = false

// ------------------------------------------------------------
// PID file — .dev/dev.pid (JSON) agar `npm run dev:stop` bisa
// mematikan seluruh pohon proses dengan satu perintah.
// ------------------------------------------------------------
const PID_FILE = path.join(root, '.dev', 'dev.pid')

function writePidFile() {
  // JANGAN menimpa PID file milik instance lain yang masih hidup — kalau
  // dua `npm run dev` jalan bersamaan, file harus tetap menunjuk stack
  // PERTAMA (agar `npm run dev:stop` mematikan yang benar, bukan yang baru
  // lahir lalu bentrok port). Instance kedua cukup di-warn di main().
  try {
    if (fs.existsSync(PID_FILE)) {
      const prev = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'))
      if (prev.pid && prev.pid !== process.pid) {
        let alive = false
        try { process.kill(prev.pid, 0); alive = true } catch { /* sudah mati */ }
        if (alive) return // file milik stack lain yang hidup → jangan sentuh
      }
    }
  } catch { /* korup → timpa */ }
  try {
    fs.mkdirSync(path.dirname(PID_FILE), { recursive: true })
    fs.writeFileSync(
      PID_FILE,
      JSON.stringify(
        {
          pid: process.pid,
          apiPort: API_PORT,
          startedAt: new Date().toISOString(),
          children: [...children].map((c) => c.pid),
        },
        null,
        2,
      ),
    )
  } catch (err) {
    console.error(`[dev] ⚠️  Gagal menulis PID file: ${err.message}`)
  }
}

function removePidFile() {
  try {
    fs.rmSync(PID_FILE, { force: true })
  } catch { /* abaikan */ }
}

// ------------------------------------------------------------
// Spawn dengan prefix output + pelacakan untuk shutdown
// ------------------------------------------------------------
function start(name, cwd, args) {
  const child = spawn('npm', ['run', ...args], {
    cwd,
    shell: true,
    detached: process.platform !== 'win32', // POSIX: process group agar bisa di-kill sekaligus
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
  })
  children.add(child)
  writePidFile() // keep .dev/dev.pid in sync saat child lahir/berhenti
  const tag = `[${name}]`
  child.stdout.on('data', (d) => process.stdout.write(`${tag} ${d}`))
  child.stderr.on('data', (d) => process.stderr.write(`${tag} ${d}`))
  child.on('exit', (code, signal) => {
    children.delete(child)
    writePidFile() // sinkronkan kembali setelah child berhenti
    if (!shuttingDown) {
      console.error(`\n[dev] ${name} berhenti (code=${code ?? 'null'}, signal=${signal ?? 'null'}) — menghentikan semua...`)
      shutdown()
    }
  })
  return child
}

// ------------------------------------------------------------
// Kill pohon proses lintas platform
// ------------------------------------------------------------
function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    } catch { /* sudah mati */ }
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch { /* sudah mati */ }
  }
}

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) killTree(child)
  removePidFile() // stack berhenti → PID file tidak boleh tertinggal basi
  setTimeout(() => process.exit(0), 300)
}

process.on('SIGINT', () => { console.log('\n[dev] Menghentikan (Ctrl+C)...'); shutdown() })
process.on('SIGTERM', () => { console.log('\n[dev] Menghentikan (SIGTERM)...'); shutdown() })

// ------------------------------------------------------------
// Tunggu sampai URL merespons
// ------------------------------------------------------------
async function waitForHttp(url, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && !shuttingDown) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (res.ok) return true
    } catch { /* belum siap */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

// ------------------------------------------------------------
// Deteksi URL Vite dari stdout-nya — kebal terhadap perubahan
// port otomatis (5173 sibuk → 5174) dan variasi format.
// ------------------------------------------------------------
function waitForVite(child, timeoutMs) {
  return new Promise((resolve) => {
    let out = ''
    const timer = setTimeout(() => { cleanup(); resolve(null) }, timeoutMs)
    const onData = (d) => {
      out += d
      // Vite v8 mencetak ANSI escape codes walau di-pipe — strip dulu agar
      // "Local:   http://localhost:5173/" selalu bisa di-match.
      const clean = out.replace(/\x1b\[[0-9;]*m/g, '')
      const m = clean.match(/Local:\s+(https?:\/\/localhost:\d+\/)/)
      if (m) { cleanup(); resolve(m[1]) }
    }
    const onExit = () => { cleanup(); resolve(null) }
    const cleanup = () => {
      clearTimeout(timer)
      child.stdout.off('data', onData)
      child.off('exit', onExit)
    }
    child.stdout.on('data', onData)
    child.on('exit', onExit)
  })
}

// ------------------------------------------------------------
// Reset seed otomatis — dipanggil saat KEDUA server hidup (boot)
// dan setiap kali mock API di-restart oleh `node --watch` (file
// server berubah). boot=true → tambahkan blok "Siap dipakai".
// ------------------------------------------------------------
async function resetSeed(viteUrl, { boot = true } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`http://localhost:${API_PORT}/admin/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ withExtra }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { data } = await res.json()
      console.log(`\n[dev] ✅ ${boot ? 'Kedua server hidup — seed di-reset otomatis.' : 'Mock API di-restart oleh node --watch — seed dijalankan ulang otomatis.'}`)
      console.log(`[dev]    Seed     : ${data.seed === 'extra' ? 'base + jurnal lintas bulan (Jan–Feb 2026)' : 'base (Maret 2026)'}`)
      console.log(`[dev]    Jurnal   : ${data.journals} · Akun: ${data.accounts} · Periode: ${data.periods}`)
      console.log(`[dev]    ${data.message}`)
      if (boot) {
        console.log(`\n[dev] 🚀 Siap dipakai:`)
        console.log(`[dev]    Prototipe : ${viteUrl}`)
        console.log(`[dev]    Mock API  : http://localhost:${API_PORT}/health`)
        console.log(`[dev]    Login demo: rina@estetikakreasi.co.id / password123`)
        console.log('[dev] Tekan Ctrl+C untuk menghentikan keduanya.\n')
      }
      return true
    } catch (err) {
      if (attempt === 3) {
        console.error(`[dev] ⚠️  Gagal reset seed (${err.message}) — coba manual: cd mock-api && npm run reset`)
        return false
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

// ------------------------------------------------------------
// Pantau restart `node --watch` pada mock API. Child npm TIDAK
// exit saat watch me-restart (restart di proses yang sama) →
// deteksi lewat baris "Restarting" di output, tunggu /health OK
// kembali, lalu jalankan ulang logika reset yang sama seperti boot.
// ------------------------------------------------------------
let mockApiRestarting = false
function watchMockApiRestart(api) {
  const RESTART_RE = /Restarting\s/i
  const onData = (chunk) => {
    if (mockApiRestarting || shuttingDown) return
    if (!RESTART_RE.test(String(chunk))) return
    mockApiRestarting = true
    console.log('\n[dev] 🔄 Mock API di-restart oleh node --watch — menyiapkan ulang seed...')
    ;(async () => {
      const ok = await waitForHttp(API_HEALTH_URL, 'mock API (setelah restart)', 60_000)
      if (shuttingDown || !ok) {
        mockApiRestarting = false
        return
      }
      if (persistOn && !forceReset) {
        console.log('[dev]    Persistence AKTIF — state tersimpan dimuat, seed tidak di-reset (sama seperti boot).')
      } else {
        await resetSeed(null, { boot: false })
      }
      mockApiRestarting = false
    })()
  }
  api.stdout.on('data', onData)
  api.stderr.on('data', onData)
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
async function main() {
  console.log('[dev] Menjalankan mock API + prototipe Vite bersamaan...\n')

  // Instance ganda? PID file yang masih hidup berarti stack lain berjalan —
  // beri tahu pengguna (dev:stop bisa mematikannya) tapi jangan hentikan.
  if (fs.existsSync(PID_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'))
      const alive = prev.pid && (() => {
        try { process.kill(prev.pid, 0); return true } catch { return false }
      })()
      if (alive) {
        console.warn(`[dev] ⚠️  Dev stack lain sepertinya masih berjalan (PID ${prev.pid}).`)
        console.warn(`[dev]    Hentikan dulu dengan: npm run dev:stop  — atau biarkan port bentrok.`)
      }
    } catch { /* PID file korup/basi — timpa saja */ }
  }

  const api = start('mock-api', MOCK_API_DIR, ['dev'])
  const vite = start('vite', PROTOTYPE_DIR, ['dev'])
  writePidFile() // tulis segera setelah kedua child lahir

  // Seed ulang otomatis SETIAP kali node --watch me-restart mock API,
  // bukan hanya saat boot pertama (lihat watchMockApiRestart di atas).
  watchMockApiRestart(api)

  const [apiOk, viteUrl] = await Promise.all([
    waitForHttp(API_HEALTH_URL, 'mock API', 30_000),
    waitForVite(vite, 60_000),
  ])

  if (shuttingDown) return

  if (!apiOk) {
    console.error(`[dev] ❌ Mock API tidak merespons di ${API_HEALTH_URL} — periksa log di atas.`)
    shutdown()
    return
  }
  if (!viteUrl) {
    console.error('[dev] ❌ Vite tidak menampilkan URL lokal — periksa log di atas.')
    shutdown()
    return
  }

  if (persistOn && !forceReset) {
    console.log('\n[dev] 💾 Persistence AKTIF — state tersimpan (jurnal yang diposting) akan dimuat, seed TIDAK di-reset.')
    console.log('[dev]    Mau seed segar? jalankan ulang dengan  --reset  atau  MOCK_API_PERSIST=0')
    console.log(`\n[dev] 🚀 Siap dipakai:`)
    console.log(`[dev]    Prototipe : ${viteUrl}`)
    console.log(`[dev]    Mock API  : http://localhost:${API_PORT}/health`)
    console.log(`[dev]    Login demo: rina@estetikakreasi.co.id / password123`)
    console.log('[dev] Tekan Ctrl+C untuk menghentikan keduanya.\n')
  } else {
    await resetSeed(viteUrl)
  }
}

main()
