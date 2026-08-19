// ============================================================
// Unit test — PostgreSQL connection pool (db.js)
// dan endpoint POST /settings/test-connection.
//
// Memvalidasi:
//   1. buildConnectionString — format benar untuk berbagai config.
//   2. getPool / destroyPool — lifecycle pool (create, reuse, destroy).
//   3. testQuery — SELECT 1 nyata atau error saat PostgreSQL tidak tersedia.
//   4. getPoolStatus — status pool aktif/tidak.
//   5. Endpoint test-connection — sukses & gagal via supertest.
//
// Menjalankan:  cd mock-api && npx vitest run test/db-connection.test.js
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import app from '../src/server.js'
import {
  buildConnectionString,
  getPool,
  destroyPool,
  testQuery,
  getPoolStatus,
} from '../src/db.js'

// ---- buildConnectionString ----
describe('buildConnectionString', () => {
  it('membangun URL standar dengan default', () => {
    const url = buildConnectionString({
      host: 'localhost',
      port: '5432',
      database: 'accounting_db',
      username: 'postgres',
      password: '',
    })
    expect(url).toBe('postgresql://postgres@localhost:5432/accounting_db?sslmode=disable')
  })

  it('men-encode password khusus karakter', () => {
    const url = buildConnectionString({
      host: 'db.example.com',
      port: '5433',
      database: 'my db',
      username: 'admin',
      password: 'p@ss:word!',
    })
    expect(url).toBe('postgresql://admin:p%40ss%3Aword!@db.example.com:5433/my%20db?sslmode=disable')
  })

  it('menambahkan search_path jika schema bukan public', () => {
    const url = buildConnectionString({
      host: 'localhost',
      port: '5432',
      database: 'accounting_db',
      schema: 'myschema',
      username: 'postgres',
      password: '',
    })
    expect(url).toContain('search_path=myschema')
    expect(url).toContain('sslmode=disable')
  })

  it('tidak menambahkan search_path untuk schema public', () => {
    const url = buildConnectionString({
      host: 'localhost',
      port: '5432',
      database: 'accounting_db',
      schema: 'public',
      username: 'postgres',
      password: '',
    })
    expect(url).not.toContain('search_path')
  })
})

// ---- getPool / destroyPool / getPoolStatus ----
describe('getPool lifecycle', () => {
  afterEach(() => destroyPool())

  it('mengembalikan null untuk storageMode local', () => {
    const p = getPool({ storageMode: 'local', host: 'localhost', port: '5432', database: 'test' })
    expect(p).toBeNull()
    expect(getPoolStatus().active).toBe(false)
  })

  it('membuat pool untuk storageMode postgresql', () => {
    const p = getPool({
      storageMode: 'postgresql',
      host: 'localhost',
      port: '5432',
      database: 'test_db',
      schema: 'public',
      username: 'postgres',
      password: '',
    })
    expect(p).not.toBeNull()
    expect(getPoolStatus().active).toBe(true)
  })

  it('mengembalikan pool yang sama jika config tidak berubah', () => {
    const cfg = {
      storageMode: 'postgresql',
      host: 'localhost',
      port: '5432',
      database: 'test_db',
      schema: 'public',
      username: 'postgres',
      password: '',
    }
    const p1 = getPool(cfg)
    const p2 = getPool(cfg)
    expect(p1).toBe(p2) // same reference
  })

  it('membuat pool baru jika config berubah', () => {
    const cfg1 = {
      storageMode: 'postgresql',
      host: 'localhost',
      port: '5432',
      database: 'db1',
      schema: 'public',
      username: 'postgres',
      password: '',
    }
    const cfg2 = { ...cfg1, database: 'db2' }
    const p1 = getPool(cfg1)
    const p2 = getPool(cfg2)
    // Pool baru dibuat (p1 sudah di-destroy internal)
    expect(p2).not.toBeNull()
    expect(p2).not.toBe(p1)
  })

  it('destroyPool menghancurkan pool', () => {
    getPool({
      storageMode: 'postgresql',
      host: 'localhost',
      port: '5432',
      database: 'test_db',
      schema: 'public',
      username: 'postgres',
      password: '',
    })
    expect(getPoolStatus().active).toBe(true)
    destroyPool()
    expect(getPoolStatus().active).toBe(false)
  })
})

// ---- testQuery ----
describe('testQuery', () => {
  it('mengembalikan objek dengan ok, message, latencyMs', async () => {
    // PostgreSQL tidak berjalan di CI — kita test bahwa struktur response benar
    const result = await testQuery({
      storageMode: 'postgresql',
      host: 'localhost',
      port: '5432',
      database: 'nonexistent_db',
      schema: 'public',
      username: 'postgres',
      password: '',
    })
    expect(result).toHaveProperty('ok')
    expect(result).toHaveProperty('message')
    expect(result).toHaveProperty('latencyMs')
    expect(typeof result.ok).toBe('boolean')
    expect(typeof result.message).toBe('string')
    expect(typeof result.latencyMs).toBe('number')
  })

  it('ok = false saat PostgreSQL tidak tersedia', { timeout: 15000 }, async () => {
    const result = await testQuery({
      storageMode: 'postgresql',
      host: '192.0.2.1', // TEST-NET — tidak ada server
      port: '5432',
      database: 'test',
      schema: 'public',
      username: 'postgres',
      password: '',
    })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Gagal')
  })
})

// ---- Endpoint POST /settings/test-connection ----
describe('POST /settings/test-connection', () => {
  it('422 jika host/port/database kosong', async () => {
    const res = await request(app)
      .post('/settings/test-connection')
      .send({ host: '', port: '', database: '' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('mengembalikan { ok, message, latencyMs } untuk config valid', async () => {
    const res = await request(app)
      .post('/settings/test-connection')
      .send({
        host: 'localhost',
        port: '5432',
        database: 'accounting_db',
        schema: 'public',
        username: 'postgres',
        password: '',
      })
    // PostgreSQL mungkin tidak berjalan — tapi response harus tetap valid
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('ok')
    expect(res.body.data).toHaveProperty('message')
    expect(res.body.data).toHaveProperty('latencyMs')
  })

  it('tidak memerlukan auth token', async () => {
    const res = await request(app)
      .post('/settings/test-connection')
      .send({
        host: 'localhost',
        port: '5432',
        database: 'test',
      })
    // Harus 200 (bukan 401)
    expect(res.status).not.toBe(401)
    expect(res.status).toBe(200)
  })
})
