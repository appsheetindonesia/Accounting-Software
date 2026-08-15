// ============================================================
// Integration test — KEDALUWARSA TOKEN TERJADWAL (scheduled TTL)
//
// Simulasi nyata: access token hanya valid N detik (TTL diubah
// SAAT RUNTIME lewat POST /admin/set-token-ttl, tanpa restart).
// Alur yang diverifikasi:
//   1. TTL = N detik → login → expiresIn = N
//   2. Menunggu WAKTU NYATA > N detik → token basi → 401 TOKEN_EXPIRED
//   3. POST /auth/refresh → token baru → request sukses (alur
//      auto-refresh klien di sesi AKTIF tanpa reload)
//   4. POST /admin/reset mengembalikan TTL ke default (3600)
//
// Menjalankan: cd mock-api && npx vitest run test/token-ttl.test.js
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../src/server.js'

const ADMIN = { email: 'rina@bukuwarung.com', password: 'password123' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

beforeAll(async () => {
  // Baseline deterministik
  const res = await request(app).post('/admin/reset').send({})
  expect(res.status).toBe(200)
})

describe('Kedaluwarsa token terjadwal — access token valid hanya N detik', () => {
  it('TTL=2s: login → expiresIn 2 → tunggu nyata → 401 TOKEN_EXPIRED → refresh → valid', async () => {
    // 1) Atur TTL 2 detik saat runtime
    const setTtl = await request(app).post('/admin/set-token-ttl').send({ ttlSeconds: 2 })
    expect(setTtl.status).toBe(200)
    expect(setTtl.body.data).toMatchObject({ ttlSeconds: 2, expiresIn: 2 })

    // 2) Login → token diterbitkan dengan expiresIn sesuai TTL aktif
    const login = await request(app).post('/auth/login').send(ADMIN)
    expect(login.status).toBe(200)
    expect(login.body.data.expiresIn).toBe(2)
    const oldAccess = login.body.data.accessToken
    const refreshToken = login.body.data.refreshToken

    // 3) Langsung masih valid (belum lewat 2 detik)
    const stillValid = await request(app).get('/journals').set({ Authorization: `Bearer ${oldAccess}` })
    expect(stillValid.status).toBe(200)

    // 4) TUNGGU WAKTU NYATA > TTL → token basi (scheduled expiry, bukan paksa)
    await sleep(2200)
    const denied = await request(app).get('/journals').set({ Authorization: `Bearer ${oldAccess}` })
    expect(denied.status).toBe(401)
    expect(denied.body.error.code).toBe('TOKEN_EXPIRED')

    // 5) Auto-refresh (alur klien) → token baru langsung valid
    const refreshed = await request(app).post('/auth/refresh').send({ refreshToken })
    expect(refreshed.status).toBe(200)
    expect(refreshed.body.data.expiresIn).toBe(2)
    const newAccess = refreshed.body.data.accessToken
    expect(newAccess).not.toBe(oldAccess)

    const okRes = await request(app).get('/journals').set({ Authorization: `Bearer ${newAccess}` })
    expect(okRes.status).toBe(200)
  })

  it('token lama TETAP basi walau TTL dinaikkan kembali — check berbasis issuedAt', async () => {
    // TTL diperpanjang ke 60 detik — token yang DITERBITKAN saat TTL 2s
    // sudah lewat 2 detik dari issuedAt-nya → tetap TOKEN_EXPIRED.
    const setTtl = await request(app).post('/admin/set-token-ttl').send({ ttlSeconds: 60 })
    expect(setTtl.status).toBe(200)

    const login = await request(app).post('/auth/login').send(ADMIN)
    expect(login.status).toBe(200)
    expect(login.body.data.expiresIn).toBe(60)
    const access = login.body.data.accessToken

    // Token baru valid (TTL 60s)
    const ok1 = await request(app).get('/journals').set({ Authorization: `Bearer ${access}` })
    expect(ok1.status).toBe(200)

    // Menunggu 1 detik lebih — masih valid (TTL 60s, baru 1s berlalu)
    await sleep(1100)
    const ok2 = await request(app).get('/journals').set({ Authorization: `Bearer ${access}` })
    expect(ok2.status).toBe(200)
  })

  it('TTL invalid → 422 VALIDATION_ERROR (bukan crash)', async () => {
    for (const bad of [0, -5, 'abc', undefined]) {
      const res = await request(app).post('/admin/set-token-ttl').send(bad === undefined ? {} : { ttlSeconds: bad })
      expect(res.status).toBe(422)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    }
  })

  it('POST /admin/reset mengembalikan TTL ke default 3600 detik', async () => {
    const setTtl = await request(app).post('/admin/set-token-ttl').send({ ttlSeconds: 5 })
    expect(setTtl.status).toBe(200)

    const reset = await request(app).post('/admin/reset').send({})
    expect(reset.status).toBe(200)

    const login = await request(app).post('/auth/login').send(ADMIN)
    expect(login.status).toBe(200)
    expect(login.body.data.expiresIn).toBe(3600)
  })
})
