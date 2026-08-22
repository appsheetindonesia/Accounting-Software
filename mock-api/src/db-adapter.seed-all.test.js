/**
 * Unit tests untuk seedAllToPg() — mock PostgreSQL pool.
 *
 * Kita mock 'pg' module SEBELUM import db-adapter agar Pool tidak
   * benar-benar connect ke PostgreSQL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock 'pg' module ──────────────────────────────────────────────────
const mockQuery = vi.fn()
const mockRelease = vi.fn()
const mockConnect = vi.fn().mockResolvedValue({ query: mockQuery, release: mockRelease })
const mockPoolEnd = vi.fn()

vi.mock('pg', () => {
  return {
    default: {
      Pool: vi.fn().mockImplementation(() => ({
        connect: mockConnect,
        query: mockQuery,
        end: mockPoolEnd,
        on: vi.fn(),
      })),
    },
  }
})

// ── Import AFTER mock ──────────────────────────────────────────────────
const {
  seedAllToPg,
  isPgMode,
  setEntityMapping,
  getPgEntityId,
  getMemEntityId,
} = await import('./db-adapter.js')

// ── Helpers ────────────────────────────────────────────────────────────

/** Build a minimal db object for PG mode. */
function makeDb(overrides = {}) {
  return {
    dbConfig: {
      storageMode: 'postgresql',
      host: 'localhost',
      port: '5432',
      database: 'test_db',
      schema: 'app',
      username: 'postgres',
      password: 'secret',
    },
    accounts: [
      { id: 'acc-001', entityId: 'ent-001', code: '1-1100', name: 'Kas', type: 'asset', category: 'current-asset', normalBalance: 'debit', description: 'Kas kecil' },
      { id: 'acc-002', entityId: 'ent-001', code: '2-1200', name: 'Utang Usaha', type: 'liability', category: 'current-liability', normalBalance: 'credit', description: '' },
    ],
    journals: [
      {
        id: 'jnl-001', entityId: 'ent-001', transactionNumber: 'BKM-2026-03-0001',
        date: '2026-03-01', description: 'Penerimaan kas', status: 'posted',
        createdBy: 'user-001', postedAt: '2026-03-01T09:00:00Z', version: 1,
        lines: [
          { accountId: '1-1100', debit: 1000000, credit: 0, description: 'Debit' },
          { accountId: '2-1200', debit: 0, credit: 1000000, description: 'Kredit' },
        ],
      },
    ],
    periods: [
      { id: 'per-001', entityId: 'ent-001', name: 'Maret 2026', month: 3, year: 2026, startDate: '2026-03-01', endDate: '2026-03-31', isOpen: true, isActive: true },
    ],
    users: [
      { id: 'user-001', email: 'rina@estetika.co.id', name: 'Rina', isActive: true },
    ],
    ...overrides,
  }
}

/** Default mock responses for a successful seed. */
function setupHappyPath() {
  // 1. Accounts — check existing (empty) → insert OK
  // 2. Periods — check existing (empty) → insert OK
  // 3. Users — check existing (empty) → insert OK
  // 4. Journals — fetch PG accounts → check existing (empty) → find period → find user → insert journal → insert lines
  mockQuery.mockImplementation(async (sql, params) => {
    // SELECT existing accounts by code
    if (sql.includes('SELECT id FROM app.accounts WHERE code =')) {
      return { rows: [] }
    }
    // SELECT existing periods
    if (sql.includes('SELECT id FROM app.fiscal_periods WHERE name =')) {
      return { rows: [] }
    }
    // SELECT existing users by email
    if (sql.includes('SELECT id FROM app.users WHERE email =')) {
      return { rows: [] }
    }
    // Fetch all PG accounts (for journal seed)
    if (sql.includes('SELECT id, code FROM app.accounts')) {
      return { rows: [{ id: 'pg-uuid-acct-1', code: '1-1100' }, { id: 'pg-uuid-acct-2', code: '2-1200' }] }
    }
    // SELECT existing journals by transaction_number
    if (sql.includes('SELECT id FROM app.journals WHERE transaction_number =')) {
      return { rows: [] }
    }
    // SELECT period by date range
    if (sql.includes('SELECT id FROM app.fiscal_periods WHERE')) {
      return { rows: [{ id: 'pg-uuid-period-1' }] }
    }
    // SELECT user for journal
    if (sql.includes('SELECT id FROM app.users LIMIT 1')) {
      return { rows: [{ id: 'pg-uuid-user-1' }] }
    }
    // INSERT accounts
    if (sql.includes('INSERT INTO app.accounts')) {
      return { rows: [] }
    }
    // INSERT periods
    if (sql.includes('INSERT INTO app.fiscal_periods')) {
      return { rows: [] }
    }
    // INSERT users
    if (sql.includes('INSERT INTO app.users')) {
      return { rows: [] }
    }
    // INSERT journals → return PG id
    if (sql.includes('INSERT INTO app.journals')) {
      return { rows: [{ id: 'pg-uuid-journal-1' }] }
    }
    // INSERT journal lines
    if (sql.includes('INSERT INTO app.journal_lines')) {
      return { rows: [] }
    }
    return { rows: [] }
  })
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('seedAllToPg()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setEntityMapping('a0eebc99-1234-5678-abcd-ef0123456789', 'ent-001')
  })

  it('returns error when PG mode is off', async () => {
    const db = makeDb({ dbConfig: { storageMode: 'local' } })
    const result = await seedAllToPg(db)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('PostgreSQL tidak aktif')
  })

  it('returns error when pgEntityId is null', async () => {
    setEntityMapping(null, 'ent-001')
    const db = makeDb()
    const result = await seedAllToPg(db)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('entity belum ditemukan')
  })

  it('seeds all data successfully (happy path)', async () => {
    setupHappyPath()
    const db = makeDb()
    const result = await seedAllToPg(db)

    expect(result.ok).toBe(true)
    expect(result.accounts).toBe(2)
    expect(result.periods).toBe(1)
    expect(result.users).toBe(1)
    expect(result.journals).toBe(1)
    expect(result.errors).toHaveLength(0)

    // Verify BEGIN + COMMIT
    expect(mockQuery).toHaveBeenCalledWith('BEGIN')
    expect(mockQuery).toHaveBeenCalledWith('COMMIT')
    expect(mockRelease).toHaveBeenCalled()
  })

  it('skips accounts that already exist (by code)', async () => {
    mockQuery.mockImplementation(async (sql) => {
      // All "check existing" queries return existing rows
      if (sql.includes('SELECT id FROM app.accounts WHERE code =')) {
        return { rows: [{ id: 'existing-uuid' }] }
      }
      if (sql.includes('SELECT id FROM app.fiscal_periods WHERE name =')) {
        return { rows: [] }
      }
      if (sql.includes('SELECT id FROM app.users WHERE email =')) {
        return { rows: [] }
      }
      if (sql.includes('SELECT id, code FROM app.accounts')) {
        return { rows: [{ id: 'existing-uuid', code: '1-1100' }] }
      }
      if (sql.includes('SELECT id FROM app.journals WHERE transaction_number =')) {
        return { rows: [] }
      }
      if (sql.includes('SELECT id FROM app.fiscal_periods WHERE')) {
        return { rows: [{ id: 'pg-uuid-period-1' }] }
      }
      if (sql.includes('SELECT id FROM app.users LIMIT 1')) {
        return { rows: [{ id: 'pg-uuid-user-1' }] }
      }
      if (sql.includes('INSERT INTO app.fiscal_periods')) return { rows: [] }
      if (sql.includes('INSERT INTO app.users')) return { rows: [] }
      if (sql.includes('INSERT INTO app.journals')) return { rows: [{ id: 'pg-uuid-journal-1' }] }
      if (sql.includes('INSERT INTO app.journal_lines')) return { rows: [] }
      return { rows: [] }
    })

    const db = makeDb()
    const result = await seedAllToPg(db)

    expect(result.accounts).toBe(0) // skipped
    expect(result.periods).toBe(1)
    expect(result.users).toBe(1)
    expect(result.journals).toBe(1)
  })

  it('skips journals that already exist (by transaction_number)', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM app.accounts WHERE code =')) return { rows: [] }
      if (sql.includes('SELECT id FROM app.fiscal_periods WHERE name =')) return { rows: [] }
      if (sql.includes('SELECT id FROM app.users WHERE email =')) return { rows: [] }
      if (sql.includes('SELECT id, code FROM app.accounts')) return { rows: [{ id: 'pg-uuid-acct-1', code: '1-1100' }] }
      if (sql.includes('SELECT id FROM app.journals WHERE transaction_number =')) {
        return { rows: [{ id: 'existing-journal-uuid' }] } // already exists
      }
      if (sql.includes('INSERT INTO app.accounts')) return { rows: [] }
      if (sql.includes('INSERT INTO app.fiscal_periods')) return { rows: [] }
      if (sql.includes('INSERT INTO app.users')) return { rows: [] }
      return { rows: [] }
    })

    const db = makeDb()
    const result = await seedAllToPg(db)

    expect(result.accounts).toBe(2)
    expect(result.periods).toBe(1)
    expect(result.users).toBe(1)
    expect(result.journals).toBe(0) // skipped — already exists
  })

  it('handles account insert errors gracefully', async () => {
    let insertCount = 0
    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM app.accounts WHERE code =')) return { rows: [] }
      if (sql.includes('SELECT id FROM app.fiscal_periods')) return { rows: [] }
      if (sql.includes('SELECT id FROM app.users')) return { rows: [] }
      if (sql.includes('INSERT INTO app.accounts')) {
        insertCount++
        if (insertCount === 1) throw new Error('duplicate key violation')
        return { rows: [] }
      }
      if (sql.includes('INSERT INTO app.fiscal_periods')) return { rows: [] }
      if (sql.includes('INSERT INTO app.users')) return { rows: [] }
      return { rows: [] }
    })

    const db = makeDb()
    const result = await seedAllToPg(db)

    // First account failed, second succeeded
    expect(result.accounts).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].table).toBe('accounts')
    expect(result.errors[0].code).toBe('1-1100')
    expect(result.errors[0].error).toContain('duplicate key')
  })

  it('ROLLBACKs on transaction-level error', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (sql === 'BEGIN') return { rows: [] }
      if (sql === 'ROLLBACK') return { rows: [] }
      if (sql === 'COMMIT') throw new Error('connection lost')
      if (sql.includes('SELECT id FROM app.accounts WHERE code =')) return { rows: [] }
      if (sql.includes('SELECT id FROM app.fiscal_periods')) return { rows: [] }
      if (sql.includes('SELECT id FROM app.users')) return { rows: [] }
      if (sql.includes('INSERT INTO app.accounts')) return { rows: [] }
      if (sql.includes('INSERT INTO app.fiscal_periods')) return { rows: [] }
      if (sql.includes('INSERT INTO app.users')) return { rows: [] }
      return { rows: [] }
    })

    const db = makeDb()
    const result = await seedAllToPg(db)

    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ table: 'transaction', error: 'connection lost' })
    )
    expect(mockQuery).toHaveBeenCalledWith('ROLLBACK')
    expect(mockRelease).toHaveBeenCalled()
  })

  it('seeds journal lines with mapped PG account IDs', async () => {
    const insertedLines = []
    mockQuery.mockImplementation(async (sql, params) => {
      if (sql.includes('SELECT id FROM app.accounts WHERE code =')) return { rows: [] }
      if (sql.includes('SELECT id FROM app.fiscal_periods WHERE name =')) return { rows: [] }
      if (sql.includes('SELECT id FROM app.users WHERE email =')) return { rows: [] }
      if (sql.includes('SELECT id, code FROM app.accounts')) {
        return { rows: [{ id: 'pg-uuid-acct-1', code: '1-1100' }, { id: 'pg-uuid-acct-2', code: '2-1200' }] }
      }
      if (sql.includes('SELECT id FROM app.journals WHERE transaction_number =')) return { rows: [] }
      if (sql.includes('SELECT id FROM app.fiscal_periods WHERE')) return { rows: [{ id: 'pg-uuid-period-1' }] }
      if (sql.includes('SELECT id FROM app.users LIMIT 1')) return { rows: [{ id: 'pg-uuid-user-1' }] }
      if (sql.includes('INSERT INTO app.accounts')) return { rows: [] }
      if (sql.includes('INSERT INTO app.fiscal_periods')) return { rows: [] }
      if (sql.includes('INSERT INTO app.users')) return { rows: [] }
      if (sql.includes('INSERT INTO app.journals')) return { rows: [{ id: 'pg-uuid-journal-1' }] }
      if (sql.includes('INSERT INTO app.journal_lines')) {
        insertedLines.push({ journalId: params[0], accountId: params[1], debit: params[2], credit: params[3] })
        return { rows: [] }
      }
      return { rows: [] }
    })

    const db = makeDb()
    const result = await seedAllToPg(db)

    expect(result.journals).toBe(1)
    expect(insertedLines).toHaveLength(2)
    // Lines should use PG UUID account IDs, not in-memory codes
    expect(insertedLines[0].accountId).toBe('pg-uuid-acct-1')
    expect(insertedLines[0].debit).toBe(1000000)
    expect(insertedLines[1].accountId).toBe('pg-uuid-acct-2')
    expect(insertedLines[1].credit).toBe(1000000)
  })

  it('skips journals from different entities', async () => {
    setupHappyPath()
    const db = makeDb({
      journals: [
        { id: 'jnl-001', entityId: 'ent-999', transactionNumber: 'BKM-2026-03-0001', date: '2026-03-01', lines: [] },
      ],
    })
    const result = await seedAllToPg(db)
    expect(result.journals).toBe(0) // different entity — skipped
  })

  it('skips accounts from different entities', async () => {
    setupHappyPath()
    const db = makeDb({
      accounts: [
        { id: 'acc-999', entityId: 'ent-999', code: '9-9999', name: 'Other', type: 'asset', category: 'other', normalBalance: 'debit' },
      ],
    })
    const result = await seedAllToPg(db)
    expect(result.accounts).toBe(0) // different entity — skipped
  })

  it('handles empty in-memory data', async () => {
    setupHappyPath()
    const db = makeDb({ accounts: [], journals: [], periods: [], users: [] })
    const result = await seedAllToPg(db)

    expect(result.ok).toBe(true)
    expect(result.accounts).toBe(0)
    expect(result.journals).toBe(0)
    expect(result.periods).toBe(0)
    expect(result.users).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('always calls client.release() even on error', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (sql === 'BEGIN') throw new Error('Pool exhausted')
      return { rows: [] }
    })

    const db = makeDb()
    const result = await seedAllToPg(db)

    expect(result.ok).toBe(false)
    expect(mockRelease).toHaveBeenCalledTimes(1)
  })

  it('skips journal lines when account not found in PG', async () => {
    // Account '2-1200' not in PG — line should be skipped (continue)
    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM app.accounts WHERE code =')) return { rows: [] }
      if (sql.includes('SELECT id FROM app.fiscal_periods WHERE name =')) return { rows: [] }
      if (sql.includes('SELECT id FROM app.users WHERE email =')) return { rows: [] }
      if (sql.includes('SELECT id, code FROM app.accounts')) {
        // Only account 1-1100 exists in PG, not 2-1200
        return { rows: [{ id: 'pg-uuid-acct-1', code: '1-1100' }] }
      }
      if (sql.includes('SELECT id FROM app.journals WHERE transaction_number =')) return { rows: [] }
      if (sql.includes('SELECT id FROM app.fiscal_periods WHERE')) return { rows: [{ id: 'pg-uuid-period-1' }] }
      if (sql.includes('SELECT id FROM app.users LIMIT 1')) return { rows: [{ id: 'pg-uuid-user-1' }] }
      if (sql.includes('INSERT INTO app.accounts')) return { rows: [] }
      if (sql.includes('INSERT INTO app.fiscal_periods')) return { rows: [] }
      if (sql.includes('INSERT INTO app.users')) return { rows: [] }
      if (sql.includes('INSERT INTO app.journals')) return { rows: [{ id: 'pg-uuid-journal-1' }] }
      if (sql.includes('INSERT INTO app.journal_lines')) return { rows: [] }
      return { rows: [] }
    })

    const db = makeDb()
    const result = await seedAllToPg(db)

    // Journal is seeded, but second line skipped (account not in PG)
    expect(result.ok).toBe(true)
    expect(result.journals).toBe(1)
  })
})
