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
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const { Pool } = pg
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** Flag: sudah jalankan migration di sesi ini? */
let migrationRan = false

/** @type {import('pg').Pool | null} */
let pool = null

/** @type {object | null} — config terakhir yang dipakai untuk membuat pool */
let lastConfig = null

/**
 * Parse DATABASE_URL (PostgreSQL connection string) ke config object.
 * Format: postgresql://user:password@host:port/database?sslmode=disable&search_path=schema
 * Return null jika url kosong/invalid.
 */
export function parseDatabaseUrl(url) {
  if (!url || typeof url !== 'string') return null
  try {
    const parsed = new URL(url)
    const params = Object.fromEntries(parsed.searchParams)
    return {
      storageMode: 'postgresql',
      host: parsed.hostname || 'localhost',
      port: parsed.port || '5432',
      database: (parsed.pathname || '/accounting_db').replace(/^\//, ''),
      username: decodeURIComponent(parsed.username) || 'postgres',
      password: decodeURIComponent(parsed.password) || '',
      schema: params.search_path || params.schema || 'public',
    }
  } catch {
    return null
  }
}

/**
 * Default table names — dipakai saat dbConfig di-derive dari DATABASE_URL.
 */
const DEFAULT_TABLES = {
  accounts: 'accounts',
  journals: 'journals',
  journalLines: 'journal_lines',
  periods: 'periods',
  users: 'users',
  entities: 'entities',
  sessions: 'sessions',
  attachments: 'attachments',
}

/**
 * Ambil config LENGKAP dari env DATABASE_URL. Dipanggil saat startup.
 * Mengembalikan dbConfig lengkap termasuk default tables,
 * sehingga PostgreSQL mode aktif otomatis tanpa perlu persist file.
 */
export function getConfigFromEnv() {
  const url = process.env.DATABASE_URL
  const parsed = parseDatabaseUrl(url)
  if (!parsed) return null
  return { ...parsed, tables: DEFAULT_TABLES }
}

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

  // Auto-migration: jalankan 001_init.sql jika tabel belum ada
  if (!migrationRan) {
    migrationRan = true
    runMigration(pool).catch((err) => {
      console.error('[DB] Migration error (non-fatal):', err.message)
    })
  }

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
    let hint = err.message
    if (err.code === 'ENOTFOUND') {
      hint = `Hostname '${cfg.host}' tidak ditemukan. Jika PostgreSQL berjalan di Docker di server remote, gunakan IP address server atau 'localhost' (jika port di-mapping), bukan nama service Docker '${cfg.host}'`
    } else if (err.code === 'ECONNREFUSED') {
      hint = `Koneksi ditolak di ${cfg.host}:${cfg.port}. Pastikan PostgreSQL berjalan dan port ${cfg.port} terbuka dari komputer Anda`
    } else if (err.code === 'ETIMEDOUT') {
      hint = `Koneksi timeout ke ${cfg.host}:${cfg.port}. Pastikan firewall mengizinkan koneksi ke port PostgreSQL`
    }
    return { ok: false, message: `Gagal: ${hint}`, latencyMs }
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

// ================================================================
// AUTO-MIGRATION
// ================================================================

/**
 * Jalankan migration SQL jika tabel belum ada.
 * Dipanggil otomatis saat pool pertama kali dibuat.
 */
export async function runMigration(poolOrConfig) {
  // Bisa menerima pool instance atau config object
  let poolInstance = poolOrConfig
  let tempPool = null
  if (poolOrConfig && poolOrConfig.storageMode) {
    // Config object — buat temp pool
    const connStr = buildConnectionString(poolOrConfig)
    tempPool = new Pool({ connectionString: connStr, max: 1, connectionTimeoutMillis: 10000, ssl: false })
    poolInstance = tempPool
  }
  try {
    // Cek tabel kritis
    const { rows: entityCheck } = await poolInstance.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'app' AND table_name = 'entities') AS exists"
    )
    const { rows: settingsCheck } = await poolInstance.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'app' AND table_name = 'settings') AS exists"
    )
    const hasEntities = entityCheck[0]?.exists
    const hasSettings = settingsCheck[0]?.exists

    if (!hasEntities) {
      // Full migration — jalankan 001_init.sql
      console.log('[DB] Menjalankan full migration 001_init.sql...')
      const sqlPath = join(__dirname, '..', 'migrations', '001_init.sql')
      const sql = readFileSync(sqlPath, 'utf-8')
      await poolInstance.query(sql)
      console.log('[DB] Migration berhasil — semua tabel, views, functions, triggers, dan seed data sudah dibuat')
    } else if (!hasSettings) {
      // Partial migration — entities ada tapi settings belum
      console.log('[DB] Tabel entities sudah ada, membuat app.settings + seed + fix close_period...')
      await poolInstance.query(`
        CREATE TABLE IF NOT EXISTS app.settings (
            key         TEXT PRIMARY KEY,
            value       JSONB NOT NULL,
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        INSERT INTO app.settings (key, value)
        VALUES ('dbConfig', '{"storageMode":"postgresql","tables":{"accounts":"accounts","journals":"journals","journalLines":"journal_lines","periods":"periods","users":"users","entities":"entities","sessions":"sessions","attachments":"attachments"}}'::jsonb)
        ON CONFLICT (key) DO NOTHING;
      `)
      // Fix close_period function yang mungkin punya bug 'undeclared variable r'
      await poolInstance.query(`
        CREATE OR REPLACE FUNCTION app.close_period(p_period_id UUID, p_draft_action TEXT, p_user_id UUID)
            RETURNS app.fiscal_periods LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
        DECLARE
            v_period   app.fiscal_periods;
            v_drafts   INT;
            r          RECORD;
        BEGIN
            SELECT * INTO v_period FROM app.fiscal_periods WHERE id = p_period_id FOR UPDATE;
            IF NOT FOUND THEN RAISE EXCEPTION 'PERIOD_NOT_FOUND'; END IF;
            SELECT count(*) INTO v_drafts FROM app.journals
             WHERE period_id = p_period_id AND status = 'draft';
            IF v_drafts > 0 AND p_draft_action IS NULL THEN
                RAISE EXCEPTION 'DRAFT_ACTION_REQUIRED: masih ada % jurnal draft', v_drafts;
            END IF;
            IF p_draft_action = 'post-all' THEN
                FOR r IN SELECT id FROM app.journals WHERE period_id = p_period_id AND status = 'draft'
                LOOP
                    PERFORM app.post_journal(r.id, p_user_id);
                END LOOP;
            ELSIF p_draft_action = 'delete-all' THEN
                DELETE FROM app.journals WHERE period_id = p_period_id AND status = 'draft';
            END IF;
            UPDATE app.fiscal_periods SET is_open = false, updated_at = now()
             WHERE id = p_period_id RETURNING * INTO v_period;
            RETURN v_period;
        END;
        $$;
      `)
      console.log('[DB] app.settings + fix close_period berhasil')
    } else {
      // Semua tabel sudah ada — tambah kolom is_header jika belum ada
      const { rows: ihCheck } = await poolInstance.query(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'accounts' AND column_name = 'is_header') AS exists"
      )
      if (!ihCheck[0]?.exists) {
        console.log('[DB] Menjalankan migration 002 — menambah kolom is_header...')
        const sql002 = readFileSync(join(__dirname, '..', 'migrations', '002_add_is_header.sql'), 'utf-8')
        await poolInstance.query(sql002)
        console.log('[DB] Migration 002 berhasil — kolom is_header ditambahkan')
      }
      // Fix close_period jika belum punya variabel r
      console.log('[DB] Semua tabel sudah ada — fix close_period jika perlu...')
      await poolInstance.query(`
        CREATE OR REPLACE FUNCTION app.close_period(p_period_id UUID, p_draft_action TEXT, p_user_id UUID)
            RETURNS app.fiscal_periods LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
        DECLARE
            v_period   app.fiscal_periods;
            v_drafts   INT;
            r          RECORD;
        BEGIN
            SELECT * INTO v_period FROM app.fiscal_periods WHERE id = p_period_id FOR UPDATE;
            IF NOT FOUND THEN RAISE EXCEPTION 'PERIOD_NOT_FOUND'; END IF;
            SELECT count(*) INTO v_drafts FROM app.journals
             WHERE period_id = p_period_id AND status = 'draft';
            IF v_drafts > 0 AND p_draft_action IS NULL THEN
                RAISE EXCEPTION 'DRAFT_ACTION_REQUIRED: masih ada % jurnal draft', v_drafts;
            END IF;
            IF p_draft_action = 'post-all' THEN
                FOR r IN SELECT id FROM app.journals WHERE period_id = p_period_id AND status = 'draft'
                LOOP
                    PERFORM app.post_journal(r.id, p_user_id);
                END LOOP;
            ELSIF p_draft_action = 'delete-all' THEN
                DELETE FROM app.journals WHERE period_id = p_period_id AND status = 'draft';
            END IF;
            UPDATE app.fiscal_periods SET is_open = false, updated_at = now()
             WHERE id = p_period_id RETURNING * INTO v_period;
            RETURN v_period;
        END;
        $$;
      `)
      console.log('[DB] close_period function updated')
    }
  } catch (err) {
    // Jangan crash server — migration bisa dijalankan manual
    console.error('[DB] Migration error:', err.message)
    throw err
  } finally {
    if (tempPool) await tempPool.end().catch(() => {})
  }
}

// ================================================================
// SETTINGS — persist dbConfig di PostgreSQL (survive restart)
// ================================================================

/**
 * Load dbConfig dari tabel app.settings.
 * Dipanggil saat startup SETELAH migration.
 * Mengembalikan null jika tabel/settings belum ada.
 */
export async function loadDbConfigFromPg(cfg) {
  let tempPool = null
  let poolInstance = pool
  if (!poolInstance && cfg?.storageMode === 'postgresql') {
    const connStr = buildConnectionString(cfg)
    tempPool = new Pool({ connectionString: connStr, max: 1, connectionTimeoutMillis: 10000, ssl: false })
    poolInstance = tempPool
  }
  if (!poolInstance) return null
  try {
    const { rows } = await poolInstance.query(
      "SELECT value FROM app.settings WHERE key = 'dbConfig'"
    )
    if (rows[0]?.value) {
      const saved = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value
      console.log('[DB] Loaded dbConfig from PostgreSQL app.settings')
      return saved
    }
  } catch (err) {
    // Tabel belum ada atau error lain — return null
    console.warn(`[DB] Could not load dbConfig from PG: ${err.message}`)
  } finally {
    if (tempPool) await tempPool.end().catch(() => {})
  }
  return null
}

/**
 * Simpan dbConfig ke tabel app.settings.
 * Dipanggil saat POST /settings/db-config.
 */
export async function saveDbConfigToPg(dbConfig, cfg) {
  let tempPool = null
  let poolInstance = pool
  if (!poolInstance && cfg?.storageMode === 'postgresql') {
    const connStr = buildConnectionString(cfg)
    tempPool = new Pool({ connectionString: connStr, max: 1, connectionTimeoutMillis: 10000, ssl: false })
    poolInstance = tempPool
  }
  if (!poolInstance) return
  try {
    await poolInstance.query(
      `INSERT INTO app.settings (key, value, updated_at)
       VALUES ('dbConfig', $1::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = now()`,
      [JSON.stringify(dbConfig)]
    )
    console.log('[DB] Saved dbConfig to PostgreSQL app.settings')
  } catch (err) {
    console.warn(`[DB] Could not save dbConfig to PG: ${err.message}`)
  } finally {
    if (tempPool) await tempPool.end().catch(() => {})
  }
}
