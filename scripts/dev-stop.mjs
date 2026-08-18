// ============================================================
// Hentikan dev stack dengan satu perintah:
//
//   npm run dev:stop          # baca .dev/dev.pid → kill semua → hapus file
//
// Mencocokkan scripts/dev.mjs: stack ditulis sebagai pohon proses
// (dev.mjs → npm run dev → mock-api / Vite). PID file menyimpan PID
// induk dev.mjs + daftar child langsungnya; file ini mematikan
// seluruh pohon (taskkill /T di Windows, process group di POSIX)
// lalu menghapus PID file agar tidak tertinggal basi.
//
// Aman dipanggil berulang: PID file hilang → pesan "tidak ada
// stack berjalan" + exit 0 (idempotent).
// ============================================================
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PID_FILE = path.join(root, '.dev', 'dev.pid')

function isAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Matikan satu proses + seluruh pohon turunannya (lintas platform). */
function killTree(pid) {
  if (!isAlive(pid)) return false
  if (process.platform === 'win32') {
    // Windows: taskkill /T mematikan seluruh pohon (induk + turunan).
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    return true
  }
  // POSIX: dev.mjs spawn child sebagai process group leader (detached),
  // jadi kill group negatif menjangkau seluruh turunan.
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      /* sudah mati */
    }
  }
  return true
}

async function main() {
  if (!fs.existsSync(PID_FILE)) {
    console.log('[dev:stop] Tidak ada .dev/dev.pid — dev stack tidak sedang berjalan.')
    console.log('[dev:stop] (Jalankan `npm run dev` dulu; hentikan dengan perintah ini.)')
    process.exit(0)
  }

  let pidFile
  try {
    pidFile = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'))
  } catch {
    console.warn(`[dev:stop] PID file (${PID_FILE}) korup — hapus manual lalu coba lagi.`)
    process.exit(1)
  }

  const mainPid = pidFile.pid
  const childPids = Array.isArray(pidFile.children) ? pidFile.children : []
  const apiPort = pidFile.apiPort ?? 4000

  if (!isAlive(mainPid) && childPids.every((p) => !isAlive(p))) {
    console.log(`[dev:stop] PID ${mainPid ?? '(kosong)'} sudah tidak berjalan — membersihkan PID file basi.`)
    fs.rmSync(PID_FILE, { force: true })
    process.exit(0)
  }

  console.log(`[dev:stop] Menghentikan dev stack (PID ${mainPid ?? '-'}${childPids.length ? ` + ${childPids.length} child` : ''})…`)

  // 1) Matikan induk + pohon (dev.mjs akan menjalankan cleanup shutdown-nya).
  killTree(mainPid)
  // 2) Pastikan child yang tersisa ikut mati (jika induk sudah sempat hilang).
  for (const pid of childPids) killTree(pid)

  // 3) Tunggu sebentar lalu verifikasi; bila masih ada yang hidup, force-kill.
  await new Promise((r) => setTimeout(r, 800))
  const survivors = [mainPid, ...childPids].filter((p) => isAlive(p))
  for (const pid of survivors) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    } else {
      try { process.kill(-pid, 'SIGKILL') } catch {
        try { process.kill(pid, 'SIGKILL') } catch { /* sudah mati */ }
      }
    }
  }

  fs.rmSync(PID_FILE, { force: true })

  const left = [mainPid, ...childPids].filter((p) => isAlive(p))
  if (left.length) {
    console.warn(`[dev:stop] ⚠️  ${left.length} proses masih hidup (PID ${left.join(', ')}) — periksa task manager.`)
    process.exit(1)
  }

  console.log(`[dev:stop] ✅ Dev stack dihentikan. PID file dihapus.`)
  console.log(`[dev:stop]    (mock API :${apiPort} · Vite — port kini bebas)`)
  process.exit(0)
}

main()
