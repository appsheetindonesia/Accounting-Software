// ============================================================
// Persistence opsional — state mock API (jurnal, akun, periode,
// sesi refresh token, dsb.) disimpan ke file JSON agar jurnal
// yang sudah diposting tidak hilang saat server di-restart.
//
//   MOCK_API_PERSIST=1            → AKTIF (default)
//   MOCK_API_PERSIST=0            → nonaktifkan (perilaku lama:
//                                    in-memory, reset saat restart)
//   MOCK_API_PERSIST_FILE=<path>  → lokasi file
//                                    (default: mock-api/.data/db.json)
//
// File state TIDAK di-commit ke git (lihat mock-api/.gitignore).
// ============================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.data',
  'db.json',
)

// Nilai yang dianggap "nonaktifkan"
const DISABLED = new Set(['0', 'false', 'off', 'no', 'n', 'disabled'])

export function isEnabled(env = process.env) {
  const v = String(env.MOCK_API_PERSIST ?? '1').trim().toLowerCase()
  return !DISABLED.has(v)
}

export function getFilePath(env = process.env) {
  return env.MOCK_API_PERSIST_FILE || DEFAULT_FILE
}

// Muat state dari file. Mengembalikan null jika file tidak ada,
// rusak (JSON invalid), atau bentuknya tidak sesuai → pemanggil
// jatuh ke seed awal. Tidak pernah melempar.
export function loadState(file) {
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`⚠️  [persist] Gagal membaca ${file}: ${err.message} — pakai seed awal.`)
    }
    return null
  }
  try {
    const state = JSON.parse(raw)
    const okShape =
      state &&
      typeof state === 'object' &&
      Array.isArray(state.journals) &&
      Array.isArray(state.accounts) &&
      Array.isArray(state.entities) &&
      Array.isArray(state.users) &&
      Array.isArray(state.periods)
    if (!okShape) {
      console.warn(`⚠️  [persist] ${file} bentuknya tidak sesuai — abaikan, pakai seed awal.`)
      return null
    }
    return state
  } catch {
    console.warn(`⚠️  [persist] ${file} rusak (JSON tidak valid) — abaikan, pakai seed awal.`)
    return null
  }
}

// Simpan state ke file (sinkron — data mock kecil, aman untuk dev).
// Sesi (Map refreshToken→userId) disimpan sebagai array [k, v].
export function saveState(file, db) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const state = {
    version: 1,
    savedAt: new Date().toISOString(),
    entities: db.entities,
    users: db.users,
    accounts: db.accounts,
    journals: db.journals,
    periods: db.periods,
    sessions: [...db.sessions.entries()],
    seq: db.seq,
    dbConfig: db.dbConfig,
  }
  fs.writeFileSync(file, JSON.stringify(state, null, 2))
  console.log(`💾 [persist] State disimpan (${db.journals.length} jurnal) → ${file}`)
}
