/**
 * PostgreSQL connection pool — lazy init, singleton.
 *
 * Pool dibuat saat POST /settings/db-config pertama dengan storageMode === 'postgresql'.
 * SELECT 1 dilakukan di endpoint test-connection untuk memverifikasi koneksi.
 * Pool di-destroy saat:
 *   - storageMode berubah ke 'local'
 *   - config berubah (host/port/database/schema/username/password berubah)
 *   - server berhenti (SIGTERM/SIGINT)
 */

import pg from 'pg'

const { Pool } = pg

/** @type {import('pg').Pool | null} */
let pool = null

/** @type {object | null} — config terakhir yang dipakai untuk membuat pool */
let lastConfig = null

/**
 * Buat connection string PostgreSQL dari config object.
 * Format: postgresql://username:password@host:port/database?schema=xxx
 */
export function buildConnectionString(cfg) {
  const user = encodeURIComponent(cfg.username || 'postgres')
  const pass = encodeURIComponent(cfg.password || '')
  const host = encodeURIComponent(cfg.host || 'localhost')
  const port = cfg.port || '5432'
  const db = encodeURIComponent(cfg.database || 'accounting_db')
  const schema = cfg.schema || 'public'

  let url = `postgresql://${user}${pass ? ':' + pass : ''}@${host}:${port}/${db}`
  const params = []
  params.push('sslmode=disable')
  if (schema !== 'public') {
    params.push(`search_path=${schema}`)
  }
  if (params.length) url += `?${params.join('&')}`
  return url
}

/**
 * Buat atau kembalikan pool yang sudah ada.
 * Jika config berubah, pool lama di-destroy dulu.
 */
export function getPool(cfg) {
  if (!cfg || cfg.storageMode !== 'postgresql') {
    destroyPool()
    return null
  }

  // Cek apakah config berubah
  const configKey = JSON.stringify({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    schema: cfg.schema,
    username: cfg.username,
    password: cfg.password,
  })

  if (pool && lastConfig === configKey) {
    return pool
  }

  // Config berubah — destroy pool lama, buat baru
  destroyPool()

  const connectionString = buildConnectionString(cfg)
  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: false,
  })
  lastConfig = configKey

  // Error handler — jangan biarkan unhandled error crash server
  pool.on('error', (err) => {
    console.error('[DB] Pool error:', err.message)
  })

  console.log(`[DB] Pool created: ${cfg.username}@${cfg.host}:${cfg.port}/${cfg.database}`)
  return pool
}

/**
 * Hancurkan pool yang sedang aktif.
 */
export function destroyPool() {
  if (pool) {
    pool.end().catch((err) => {
      console.error('[DB] Error destroying pool:', err.message)
    })
    console.log('[DB] Pool destroyed')
    pool = null
    lastConfig = null
  }
}

/**
 * Health check — SELECT 1.
 * Mengembalikan { ok, message, latencyMs } atau melempar error.
 */
export async function checkConnection(cfg) {
  const p = getPool(cfg)
  if (!p) {
    return { ok: false, message: 'Pool tidak tersedia', latencyMs: 0 }
  }

  const start = Date.now()
  try {
    const result = await p.query('SELECT 1 AS ok')
    const latencyMs = Date.now() - start
    if (result.rows[0]?.ok === 1) {
      return { ok: true, message: `Koneksi ke ${cfg.database}@${cfg.host}:${cfg.port} berhasil`, latencyMs }
    }
    return { ok: false, message: 'Response tidak valid', latencyMs }
  } catch (err) {
    const latencyMs = Date.now() - start
    return { ok: false, message: `Gagal: ${err.message}`, latencyMs }
  }
}

/**
 * Jalankan query SELECT 1 tanpa membuat pool permanen.
 * Dipakai oleh test-connection yang tidak perlu menyimpan pool.
 */
export async function testQuery(cfg) {
  const connectionString = buildConnectionString(cfg)
  const tempPool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
    ssl: false,
  })

  const start = Date.now()
  try {
    const result = await tempPool.query('SELECT 1 AS ok')
    const latencyMs = Date.now() - start
    await tempPool.end()
    if (result.rows[0]?.ok === 1) {
      return { ok: true, message: `Koneksi ke ${cfg.database}@${cfg.host}:${cfg.port} berhasil`, latencyMs }
    }
    return { ok: false, message: 'Response tidak valid', latencyMs }
  } catch (err) {
    const latencyMs = Date.now() - start
    await tempPool.end().catch(() => {})
    return { ok: false, message: `Gagal: ${err.message}`, latencyMs }
  }
}

/**
 * Dapatkan status pool saat ini.
 */
export function getPoolStatus() {
  return {
    active: pool !== null,
    totalCount: pool?.totalCount ?? 0,
    idleCount: pool?.idleCount ?? 0,
    waitingCount: pool?.waitingCount ?? 0,
  }
}
