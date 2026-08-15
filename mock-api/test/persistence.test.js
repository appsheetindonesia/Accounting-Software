// ============================================================
// Unit test — persistence opsional (src/persistence.js)
//
// Menjalankan:  cd mock-api && npm test
// ============================================================
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isEnabled, getFilePath, loadState, saveState } from '../src/persistence.js'

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mock-api-persist-'))

const fakeDb = () => ({
  entities: [{ id: 'ent-001', name: 'PT. Kreasi Inovasi Estetika' }],
  users: [{ id: 'user-001', name: 'Rina' }],
  accounts: [{ id: '1-1100', name: 'Kas Besar' }],
  journals: [{ id: 'JNL-TEST-001', status: 'posted' }],
  periods: [{ id: 'fp-2026-03' }],
  sessions: new Map([['rt-1', { userId: 'user-001', expiresAt: 0 }]]),
  seq: { journal: 101, line: 101, attachment: 101, user: 101, entity: 101 },
})

describe('isEnabled — parsing flag MOCK_API_PERSIST', () => {
  it('default: AKTIF (persistence menyala tanpa env)', () => {
    expect(isEnabled({})).toBe(true)
  })

  it('nilai nonaktif: 0/false/off/no/n/disabled (case-insensitive)', () => {
    for (const v of ['0', 'false', 'off', 'no', 'n', 'disabled', 'FALSE', 'Off']) {
      expect(isEnabled({ MOCK_API_PERSIST: v })).toBe(false)
    }
  })

  it('nilai aktif: 1/true/on/yes', () => {
    for (const v of ['1', 'true', 'on', 'yes', 'TRUE']) {
      expect(isEnabled({ MOCK_API_PERSIST: v })).toBe(true)
    }
  })
})

describe('getFilePath — lokasi file persist', () => {
  it('default: berakhir di mock-api/.data/db.json', () => {
    expect(getFilePath({}).endsWith(path.join('.data', 'db.json'))).toBe(true)
  })

  it('MOCK_API_PERSIST_FILE meng-override lokasi', () => {
    expect(getFilePath({ MOCK_API_PERSIST_FILE: 'C:/tmp/state.json' })).toBe('C:/tmp/state.json')
  })
})

describe('saveState / loadState — roundtrip', () => {
  it('state tersimpan lalu dimuat kembali identik (termasuk sesi Map)', () => {
    const dir = tmpDir()
    const file = path.join(dir, 'db.json')
    saveState(file, fakeDb())

    const loaded = loadState(file)
    expect(loaded).toBeTruthy()
    expect(loaded.journals).toEqual([{ id: 'JNL-TEST-001', status: 'posted' }])
    expect(loaded.accounts[0].name).toBe('Kas Besar')
    expect(loaded.seq.journal).toBe(101)
    // Sesi disimpan sebagai [k, v] array → dimuat kembali jadi Map di server
    // (v = { userId, expiresAt } — API §13 SESSION_EXPIRED)
    expect(loaded.sessions).toEqual([['rt-1', { userId: 'user-001', expiresAt: 0 }]])
    expect(fs.existsSync(file)).toBe(true)
  })

  it('file tidak ada → null (tanpa lempar, fallback seed)', () => {
    expect(loadState(path.join(tmpDir(), 'nope.json'))).toBeNull()
  })

  it('file rusak (JSON invalid) → null', () => {
    const dir = tmpDir()
    const file = path.join(dir, 'db.json')
    fs.writeFileSync(file, '{ ini bukan json !!')
    expect(loadState(file)).toBeNull()
  })

  it('bentuk salah (bukan objek state) → null', () => {
    const dir = tmpDir()
    const file = path.join(dir, 'db.json')
    fs.writeFileSync(file, JSON.stringify({ foo: 'bar' }))
    expect(loadState(file)).toBeNull()
  })

  it('saveState membuat direktori induk otomatis', () => {
    const dir = tmpDir()
    const file = path.join(dir, 'deep', 'nested', 'db.json')
    saveState(file, fakeDb())
    expect(fs.existsSync(file)).toBe(true)
  })
})
