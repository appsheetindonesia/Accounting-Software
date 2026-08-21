#!/usr/bin/env node
/**
 * Jalankan migration secara manual ke PostgreSQL.
 *
 * Usage:
 *   DATABASE_URL="postgresql://user:pass@host:port/db" node mock-api/run-migration.js
 *
 * Script ini akan:
 *   1. Koneksi ke PostgreSQL
 *   2. Cek tabel app.entities — jika belum ada, jalankan full 001_init.sql
 *   3. Cek tabel app.settings — jika belum ada, buat tabel + seed default
 *   4. Laporan hasilnya
 */

import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const { Pool } = pg
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function run() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('❌ DATABASE_URL tidak diset. Contoh:')
    console.error('   DATABASE_URL="postgresql://user:pass@host:5432/dbname?sslmode=disable" node mock-api/run-migration.js')
    process.exit(1)
  }

  const pool = new Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 15000,
    ssl: false,
  })

  try {
    // 1. Test koneksi
    console.log('🔗 Menghubungkan ke PostgreSQL...')
    const start = Date.now()
    await pool.query('SELECT 1')
    console.log(`✅ Koneksi berhasil (${Date.now() - start}ms)`)

    // 2. Cek tabel app.entities
    const { rows: entityCheck } = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'app' AND table_name = 'entities') AS exists"
    )
    const hasEntities = entityCheck[0]?.exists

    // 3. Cek tabel app.settings
    const { rows: settingsCheck } = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'app' AND table_name = 'settings') AS exists"
    )
    const hasSettings = settingsCheck[0]?.exists

    console.log(`\n📋 Status tabel:`)
    console.log(`   app.entities  : ${hasEntities ? '✅ ada' : '❌ belum ada'}`)
    console.log(`   app.settings  : ${hasSettings ? '✅ ada' : '❌ belum ada'}`)

    // 4. Jalankan migration sesuai kebutuhan
    if (!hasEntities) {
      // Full migration — jalankan 001_init.sql
      console.log('\n🚀 Menjalankan full migration 001_init.sql...')
      const sqlPath = join(__dirname, 'migrations', '001_init.sql')
      const sql = readFileSync(sqlPath, 'utf-8')
      await pool.query(sql)
      console.log('✅ Full migration berhasil — semua tabel, views, functions, triggers, dan seed data sudah dibuat')
    } else if (!hasSettings) {
      // Tabel entities sudah ada tapi app.settings belum — buat saja tabel settings
      console.log('\n🔧 Tabel entities sudah ada. Membuat app.settings + seed...')

      const settingsSql = `
        CREATE TABLE IF NOT EXISTS app.settings (
            key         TEXT PRIMARY KEY,
            value       JSONB NOT NULL,
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        INSERT INTO app.settings (key, value)
        VALUES ('dbConfig', '{"storageMode":"postgresql","tables":{"accounts":"accounts","journals":"journals","journalLines":"journal_lines","periods":"periods","users":"users","entities":"entities","sessions":"sessions","attachments":"attachments"}}'::jsonb)
        ON CONFLICT (key) DO NOTHING;
      `
      await pool.query(settingsSql)
      console.log('✅ Tabel app.settings berhasil dibuat + default dbConfig di-seed')
    } else {
      console.log('\n✅ Semua tabel sudah ada — tidak perlu migration')
    }

    // 5. Verifikasi — list semua tabel di schema app
    const { rows: tables } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'app' ORDER BY table_name"
    )
    console.log(`\n📊 Tabel di schema app (${tables.length}):`)
    for (const t of tables) {
      const { rows: count } = await pool.query(`SELECT count(*) AS n FROM app."${t.table_name}"`)
      console.log(`   ${t.table_name}: ${count[0].n} baris`)
    }

    // 6. Cek isi app.settings
    if (hasSettings || !hasEntities) {
      const { rows: settings } = await pool.query("SELECT key, value FROM app.settings")
      if (settings.length > 0) {
        console.log(`\n⚙️  app.settings:`)
        for (const s of settings) {
          console.log(`   ${s.key}: ${JSON.stringify(s.value)}`)
        }
      }
    }

    console.log('\n🎉 Migration selesai!')
  } catch (err) {
    console.error(`\n❌ Migration gagal: ${err.message}`)
    if (err.detail) console.error(`   Detail: ${err.detail}`)
    if (err.hint) console.error(`   Hint: ${err.hint}`)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

run()
