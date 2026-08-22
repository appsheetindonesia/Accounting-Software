/**
 * Database Adapter — abstraction layer untuk PostgreSQL vs in-memory.
 *
 * Saat storageMode === 'postgresql': jalankan query SQL nyata.
 * Saat storageMode === 'local': gunakan data in-memory (seperti sebelumnya).
 *
 * Semua fungsi mengembalikan data dalam format yang SAMA dengan
 * endpoint sekarang — caller tidak perlu tahu backend-nya.
 */

import pg from 'pg'

const { Pool } = pg

/** @type {import('pg').Pool | null} */
let pool = null
let poolConfigKey = null

/**
 * Pastikan pool aktif untuk config tertentu.
 * Jika config berubah, pool lama di-destroy.
 */
function ensurePool(cfg) {
  if (!cfg || cfg.storageMode !== 'postgresql') {
    if (pool) { pool.end().catch(() => {}); pool = null; poolConfigKey = null }
    return null
  }
  const key = JSON.stringify({ host: cfg.host, port: cfg.port, database: cfg.database, schema: cfg.schema, username: cfg.username, password: cfg.password })
  if (pool && poolConfigKey === key) return pool
  if (pool) { pool.end().catch(() => {}); pool = null }
  const user = encodeURIComponent(cfg.username || 'postgres')
  const pass = encodeURIComponent(cfg.password || '')
  const host = encodeURIComponent(cfg.host || 'localhost')
  const port = cfg.port || '5432'
  const db = encodeURIComponent(cfg.database || 'accounting_db')
  const schema = cfg.schema || 'public'
  let connStr = `postgresql://${user}${pass ? ':' + pass : ''}@${host}:${port}/${db}?sslmode=disable`
  if (schema !== 'public') connStr += `&search_path=${schema}`
  pool = new Pool({ connectionString: connStr, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, ssl: false })
  pool.on('error', (err) => console.error('[DB-Adapter] Pool error:', err.message))
  poolConfigKey = key
  console.log(`[DB-Adapter] Pool created: ${cfg.username}@${cfg.host}:${cfg.port}/${cfg.database}`)
  return pool
}

/**
 * Jalankan query. Mengembalikan { rows }.
 */
async function query(sql, params = [], cfg = null) {
  const p = ensurePool(cfg)
  if (!p) throw new Error('PostgreSQL not configured')
  return p.query(sql, params)
}

/**
 * Cek apakah mode PostgreSQL aktif.
 */
export function isPgMode(db) {
  return db?.dbConfig?.storageMode === 'postgresql'
}

/**
 * Jalankan query langsung ke PostgreSQL dengan config tertentu.
 * Berguna untuk endpoint admin yang butuh query ad-hoc.
 */
export async function queryPg(sql, params = [], cfg = null) {
  return query(sql, params, cfg)
}

// ================================================================
// AUTH
// ================================================================

export async function findUserByEmail(email, db) {
  if (!isPgMode(db)) {
    return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase())
  }
  const { rows } = await query('SELECT id, email, name, password_hash, is_active FROM app.users WHERE email = $1', [email], db.dbConfig)
  const u = rows[0]
  if (!u) return null
  return { id: u.id, email: u.email, name: u.name, passwordHash: u.password_hash, isActive: u.is_active }
}

export async function updateUserLogin(userId, db) {
  if (!isPgMode(db)) return
  await query('UPDATE app.users SET last_login_at = now() WHERE id = $1', [userId], db.dbConfig)
}

export async function findSession(refreshToken, db) {
  if (!isPgMode(db)) {
    const userId = db.sessions.get(refreshToken)
    return userId ? { userId, token: refreshToken } : null
  }
  // Cari via hash sederhana (di produksi pakai bcrypt)
  const { rows } = await query(
    "SELECT id, user_id, expires_at, revoked_at FROM app.sessions WHERE refresh_token_hash = $1 AND revoked_at IS NULL",
    [refreshToken], db.dbConfig
  )
  return rows[0] ? { userId: rows[0].user_id, token: refreshToken, expiresAt: rows[0].expires_at } : null
}

export async function createSession(userId, refreshToken, expiresAt, db) {
  if (!isPgMode(db)) {
    db.sessions.set(refreshToken, userId)
    return
  }
  await query(
    'INSERT INTO app.sessions (user_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, refreshToken, expiresAt], db.dbConfig
  )
}

export async function revokeSession(refreshToken, db) {
  if (!isPgMode(db)) {
    db.sessions.delete(refreshToken)
    return
  }
  await query("UPDATE app.sessions SET revoked_at = now() WHERE refresh_token_hash = $1", [refreshToken], db.dbConfig)
}

export async function revokeAllUserSessions(userId, db) {
  if (!isPgMode(db)) {
    for (const [token, uid] of db.sessions) {
      if (uid === userId) db.sessions.delete(token)
    }
    return
  }
  await query("UPDATE app.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId], db.dbConfig)
}

export async function getUserMemberships(userId, db) {
  if (!isPgMode(db)) {
    const members = (db.entity_members || []).filter((m) => m.userId === userId)
    return members.map((m) => ({
      entityId: m.entityId,
      entityName: db.entities.find((e) => e.id === m.entityId)?.name || '',
      role: m.role,
      isDefault: m.isDefault,
    }))
  }
  const { rows } = await query(
    `SELECT em.entity_id, e.name AS entity_name, em.role, em.is_default
     FROM app.entity_members em
     JOIN app.entities e ON e.id = em.entity_id
     WHERE em.user_id = $1`,
    [userId], db.dbConfig
  )
  return rows.map((r) => ({
    entityId: r.entity_id,
    entityName: r.entity_name,
    role: r.role,
    isDefault: r.is_default,
  }))
}

// ================================================================
// ACCOUNTS
// ================================================================

export async function getAccounts(entityId, db) {
  if (!isPgMode(db)) {
    return db.accounts.filter((a) => a.entityId === entityId)
  }
  const { rows } = await query(
    'SELECT id, code, name, type, category, normal_balance AS "normalBalance", parent_id AS "parentId", is_active AS "isActive", description, version FROM app.accounts WHERE entity_id = $1 ORDER BY code',
    [toPgEntity(entityId)], db.dbConfig
  )
  return rows
}

export async function getAccountById(id, entityId, db) {
  if (!isPgMode(db)) {
    return db.accounts.find((a) => a.id === id && a.entityId === entityId)
  }
  const { rows } = await query(
    'SELECT id, code, name, type, category, normal_balance AS "normalBalance", parent_id AS "parentId", is_active AS "isActive", description, version FROM app.accounts WHERE id = $1 AND entity_id = $2',
    [id, toPgEntity(entityId)], db.dbConfig
  )
  return rows[0]
}

export async function createAccount(data, db) {
  if (!isPgMode(db)) {
    const id = `acc-${String(++db.seq.line).padStart(3, '0')}`
    const account = { id, entityId: data.entityId, code: data.code, name: data.name, type: data.type, category: data.category, normalBalance: data.normalBalance, parentId: data.parentId || null, isActive: true, description: data.description || '', version: 0 }
    db.accounts.push(account)
    return account
  }
  const { rows } = await query(
    `INSERT INTO app.accounts (entity_id, code, name, type, category, normal_balance, parent_id, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, code, name, type, category, normal_balance AS "normalBalance", parent_id AS "parentId", is_active AS "isActive", description, version`,
    [toPgEntity(data.entityId), data.code, data.name, data.type, data.category, data.normalBalance, data.parentId || null, data.description || ''],
    db.dbConfig
  )
  return rows[0]
}

export async function updateAccount(id, entityId, data, db) {
  if (!isPgMode(db)) {
    const idx = db.accounts.findIndex((a) => a.id === id && a.entityId === entityId)
    if (idx === -1) return null
    db.accounts[idx] = { ...db.accounts[idx], ...data, version: (db.accounts[idx].version || 0) + 1 }
    return db.accounts[idx]
  }
  const sets = []
  const params = []
  let i = 1
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue
    const col = key === 'normalBalance' ? 'normal_balance' : key === 'parentId' ? 'parent_id' : key === 'isActive' ? 'is_active' : key
    sets.push(`${col} = $${i++}`)
    params.push(val)
  }
  sets.push(`version = version + 1`)
  params.push(id, toPgEntity(entityId))
  const { rows } = await query(
    `UPDATE app.accounts SET ${sets.join(', ')} WHERE id = $${i++} AND entity_id = $${i}
     RETURNING id, code, name, type, category, normal_balance AS "normalBalance", parent_id AS "parentId", is_active AS "isActive", description, version`,
    params, db.dbConfig
  )
  return rows[0]
}

export async function deleteAccount(id, entityId, db) {
  if (!isPgMode(db)) {
    const idx = db.accounts.findIndex((a) => a.id === id && a.entityId === entityId)
    if (idx === -1) return false
    db.accounts.splice(idx, 1)
    return true
  }
  const { rowCount } = await query(
    'DELETE FROM app.accounts WHERE id = $1 AND entity_id = $2',
    [id, toPgEntity(entityId)], db.dbConfig
  )
  return rowCount > 0
}

export async function toggleAccountActive(id, entityId, isActive, db) {
  if (!isPgMode(db)) {
    const account = db.accounts.find((a) => a.id === id && a.entityId === entityId)
    if (!account) return null
    account.isActive = isActive
    return account
  }
  const { rows } = await query(
    'UPDATE app.accounts SET is_active = $1, version = version + 1 WHERE id = $2 AND entity_id = $3 RETURNING id, code, name, type, category, normal_balance AS "normalBalance", parent_id AS "parentId", is_active AS "isActive", description, version',
    [isActive, id, toPgEntity(entityId)], db.dbConfig
  )
  return rows[0]
}

export async function importAccounts(accountsList, db) {
  if (!isPgMode(db)) {
    const results = { imported: 0, errors: [] }
    for (const a of accountsList) {
      try {
        await createAccount(a, db)
        results.imported++
      } catch (err) {
        results.errors.push({ code: a.code, error: err.message })
      }
    }
    return results
  }
  // PostgreSQL: bulk insert dalam satu transaksi
  const client = await pool.connect()
  const results = { imported: 0, errors: [] }
  try {
    await client.query('BEGIN')
    for (const a of accountsList) {
      try {
        await client.query(
          `INSERT INTO app.accounts (entity_id, code, name, type, category, normal_balance, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [toPgEntity(a.entityId), a.code, a.name, a.type, a.category, a.normalBalance, a.description || '']
        )
        results.imported++
      } catch (err) {
        results.errors.push({ code: a.code, error: err.message })
      }
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  return results
}

// ================================================================
// JOURNALS
// ================================================================

export async function getJournals(entityId, { periodId, status, keyword, page = 1, limit = 20 } = {}, db) {
  if (!isPgMode(db)) {
    let list = db.journals.filter((j) => j.entityId === entityId)
    if (periodId) list = list.filter((j) => j.periodId === periodId)
    if (status) list = list.filter((j) => j.status === status)
    if (keyword) {
      const kw = keyword.toLowerCase()
      list = list.filter((j) => j.description?.toLowerCase().includes(kw) || j.number?.toLowerCase().includes(kw))
    }
    const total = list.length
    const start = (page - 1) * limit
    const items = list.slice(start, start + limit).map((j) => ({
      ...j,
      lines: (db.journalLines || []).filter((l) => l.journalId === j.id),
    }))
    return { items, total, page, limit }
  }
  // PostgreSQL
  const conditions = ['j.entity_id = $1']
  const params = [toPgEntity(entityId)]
  let i = 2
  if (periodId) { conditions.push(`j.period_id = $${i++}`); params.push(periodId) }
  if (status) { conditions.push(`j.status = $${i++}`); params.push(status) }
  if (keyword) { conditions.push(`(j.description ILIKE $${i} OR j.transaction_number ILIKE $${i})`); params.push(`%${keyword}%`); i++ }
  const where = conditions.join(' AND ')
  // Count
  const countRes = await query(`SELECT count(*)::int AS total FROM app.journals j WHERE ${where}`, params, db.dbConfig)
  const total = countRes.rows[0].total
  // Items
  const offset = (page - 1) * limit
  const { rows: items } = await query(
    `SELECT j.id, j.transaction_number AS number, j.journal_date AS "journalDate", j.description, j.status,
            j.created_by AS "createdBy", j.created_at AS "createdAt", j.posted_at AS "postedAt",
            j.posted_by AS "postedBy", j.approved_by AS "approvedBy", j.approved_at AS "approvedAt",
            j.rejection_reason AS "rejectionReason", j.reversal_of_id AS "reversalOfId",
            u.name AS "createdByName",
            (SELECT jsonb_agg(jsonb_build_object(
              'id', jl.id, 'accountId', jl.account_id, 'debit', jl.debit, 'credit', jl.credit, 'description', jl.description
            )) FROM app.journal_lines jl WHERE jl.journal_id = j.id) AS lines
     FROM app.journals j
     LEFT JOIN app.users u ON u.id = j.created_by
     WHERE ${where}
     ORDER BY j.journal_date DESC, j.created_at DESC
     LIMIT $${i++} OFFSET $${i}`,
    [...params, limit, offset], db.dbConfig
  )
  return { items, total, page, limit }
}

export async function getJournalById(id, entityId, db) {
  if (!isPgMode(db)) {
    const j = db.journals.find((j) => j.id === id && j.entityId === entityId)
    if (!j) return null
    return {
      ...j,
      lines: (db.journalLines || []).filter((l) => l.journalId === j.id),
      attachments: (db.attachments || []).filter((a) => a.journalId === j.id),
    }
  }
  const { rows } = await query(
    `SELECT j.*, u.name AS "createdByName", u.email AS "createdByEmail",
            pu.name AS "postedByName", au.name AS "approvedByName"
     FROM app.journals j
     LEFT JOIN app.users u ON u.id = j.created_by
     LEFT JOIN app.users pu ON pu.id = j.posted_by
     LEFT JOIN app.users au ON au.id = j.approved_by
     WHERE j.id = $1 AND j.entity_id = $2`,
    [id, entityId], db.dbConfig
  )
  if (!rows[0]) return null
  const j = rows[0]
  const { rows: lines } = await query(
    'SELECT id, account_id AS "accountId", debit, credit, description FROM app.journal_lines WHERE journal_id = $1',
    [id], db.dbConfig
  )
  const { rows: attachments } = await query(
    'SELECT id, file_name AS "fileName", mime_type AS "mimeType", size_bytes AS "sizeBytes", uploaded_at AS "uploadedAt" FROM app.attachments WHERE journal_id = $1',
    [id], db.dbConfig
  )
  return { ...j, lines, attachments }
}

export async function createJournal(data, db) {
  if (!isPgMode(db)) {
    const id = `jrn-${String(++db.seq.journal).padStart(3, '0')}`
    const journal = {
      id, entityId: data.entityId, periodId: data.periodId, number: data.number,
      journalDate: data.journalDate, description: data.description, status: data.status || 'draft',
      createdBy: data.createdBy, createdAt: new Date().toISOString(),
      reversalOfId: data.reversalOfId || null,
    }
    db.journals.push(journal)
    if (data.lines) {
      if (!db.journalLines) db.journalLines = []
      for (const line of data.lines) {
        db.journalLines.push({ id: `ln-${String(++db.seq.line).padStart(3, '0')}`, journalId: id, accountId: line.accountId, debit: line.debit || 0, credit: line.credit || 0, description: line.description || '' })
      }
    }
    return journal
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Generate nomor bukti
    const prefix = data.number?.split('-')[0] || 'JV'
    const numRes = await client.query(
      `INSERT INTO app.journal_sequences (entity_id, period_id, prefix, last_number)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (entity_id, period_id, prefix)
       DO UPDATE SET last_number = app.journal_sequences.last_number + 1
       RETURNING last_number`,
      [data.entityId, data.periodId, prefix]
    )
    const nextNum = numRes.rows[0].last_number
    const periodRes = await client.query('SELECT start_date FROM app.fiscal_periods WHERE id = $1', [data.periodId])
    const periodDate = periodRes.rows[0]?.start_date
    const txnNumber = `${prefix}-${String(periodDate).slice(0, 7).replace('-', '')}-${String(nextNum).padStart(4, '0')}`

    const { rows: [journal] } = await client.query(
      `INSERT INTO app.journals (entity_id, period_id, transaction_number, journal_date, description, status, created_by, reversal_of_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, transaction_number AS number, journal_date AS "journalDate", description, status, created_by AS "createdBy", created_at AS "createdAt"`,
      [data.entityId, data.periodId, txnNumber, data.journalDate, data.description, data.status || 'draft', data.createdBy, data.reversalOfId || null]
    )

    if (data.lines?.length) {
      for (const line of data.lines) {
        await client.query(
          'INSERT INTO app.journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1, $2, $3, $4, $5)',
          [journal.id, line.accountId, line.debit || 0, line.credit || 0, line.description || '']
        )
      }
    }

    await client.query('COMMIT')
    return { ...journal, lines: data.lines || [] }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function updateJournal(id, entityId, data, db) {
  if (!isPgMode(db)) {
    const idx = db.journals.findIndex((j) => j.id === id && j.entityId === entityId)
    if (idx === -1) return null
    db.journals[idx] = { ...db.journals[idx], ...data }
    return db.journals[idx]
  }
  const sets = []
  const params = []
  let i = 1
  if (data.description) { sets.push(`description = $${i++}`); params.push(data.description) }
  if (data.journalDate) { sets.push(`journal_date = $${i++}`); params.push(data.journalDate) }
  if (data.status) { sets.push(`status = $${i++}`); params.push(data.status) }
  if (sets.length === 0) return null
  params.push(id, entityId)
  const { rows } = await client_query(
    `UPDATE app.journals SET ${sets.join(', ')}, version = version + 1, updated_at = now()
     WHERE id = $${i++} AND entity_id = $${i}
     RETURNING id, transaction_number AS number, journal_date AS "journalDate", description, status`,
    params, db.dbConfig
  )
  return rows[0]
}

export async function deleteJournal(id, entityId, db) {
  if (!isPgMode(db)) {
    const idx = db.journals.findIndex((j) => j.id === id && j.entityId === entityId)
    if (idx === -1) return false
    db.journals.splice(idx, 1)
    if (db.journalLines) db.journalLines = db.journalLines.filter((l) => l.journalId !== id)
    return true
  }
  const { rowCount } = await query(
    'DELETE FROM app.journals WHERE id = $1 AND entity_id = $2 AND status = $3',
    [id, entityId, 'draft'], db.dbConfig
  )
  return rowCount > 0
}

export async function postJournal(id, entityId, userId, db) {
  if (!isPgMode(db)) {
    const j = db.journals.find((j) => j.id === id && j.entityId === entityId)
    if (!j) return null
    j.status = 'posted'
    j.postedAt = new Date().toISOString()
    j.postedBy = userId
    return j
  }
  const { rows } = await query(
    `UPDATE app.journals SET status = 'posted', posted_at = now(), posted_by = $1, version = version + 1
     WHERE id = $2 AND entity_id = $3 AND status IN ('draft', 'pending_approval')
     RETURNING id, transaction_number AS number, status, posted_at AS "postedAt"`,
    [userId, id, entityId], db.dbConfig
  )
  return rows[0]
}

export async function reverseJournal(id, entityId, userId, reason, db) {
  if (!isPgMode(db)) {
    const j = db.journals.find((j) => j.id === id && j.entityId === entityId)
    if (!j) return null
    j.status = 'reversed'
    // Buat jurnal pembalik
    const reversal = {
      id: `jrn-${String(++db.seq.journal).padStart(3, '0')}`,
      entityId, periodId: j.periodId, number: `REV-${j.number}`,
      journalDate: new Date().toISOString().slice(0, 10),
      description: `Pembalikan: ${j.description}`, status: 'posted',
      postedAt: new Date().toISOString(), postedBy: userId,
      createdBy: userId, createdAt: new Date().toISOString(),
      reversalOfId: id,
    }
    db.journals.push(reversal)
    return reversal
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [orig] } = await client.query(
      'SELECT id, entity_id, period_id, transaction_number, description FROM app.journals WHERE id = $1 AND entity_id = $2 AND status = $3',
      [id, entityId, 'draft'], db.dbConfig
    )
    if (!orig) throw new Error('JOURNAL_NOT_FOUND_OR_NOT_DRAFT')
    // Generate nomor reversal
    const { rows: numRes } = await client.query(
      `INSERT INTO app.journal_sequences (entity_id, period_id, prefix, last_number)
       VALUES ($1, $2, 'REV', 1)
       ON CONFLICT (entity_id, period_id, prefix)
       DO UPDATE SET last_number = app.journal_sequences.last_number + 1
       RETURNING last_number`,
      [toPgEntity(entityId), orig.period_id]
    )
    const periodRes = await client.query('SELECT start_date FROM app.fiscal_periods WHERE id = $1', [orig.period_id])
    const periodDate = periodRes.rows[0]?.start_date
    const revNumber = `REV-${String(periodDate).slice(0, 7).replace('-', '')}-${String(numRes.rows[0].last_number).padStart(4, '0')}`

    // Update original ke reversed
    await client.query(
      "UPDATE app.journals SET status = 'reversed', version = version + 1 WHERE id = $1",
      [id]
    )

    // Buat jurnal pembalik
    const { rows: [reversal] } = await client.query(
      `INSERT INTO app.journals (entity_id, period_id, transaction_number, journal_date, description, status, created_by, posted_by, posted_at, reversal_of_id)
       VALUES ($1, $2, $3, CURRENT_DATE, $4, 'posted', $5, $5, now(), $6)
       RETURNING id, transaction_number AS number, status`,
      [toPgEntity(entityId), orig.period_id, revNumber, `Pembalikan: ${orig.description}`, userId, id]
    )

    // Copy lines (debit ↔ credit)
    await client.query(
      `INSERT INTO app.journal_lines (journal_id, account_id, debit, credit, description)
       SELECT $1, account_id, credit, debit, 'Pembalikan otomatis'
       FROM app.journal_lines WHERE journal_id = $2`,
      [reversal.id, id]
    )

    await client.query('COMMIT')
    return reversal
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function submitJournal(id, entityId, db) {
  if (!isPgMode(db)) {
    const j = db.journals.find((j) => j.id === id && j.entityId === entityId)
    if (!j) return null
    j.status = 'pending_approval'
    return j
  }
  const { rows } = await query(
    "UPDATE app.journals SET status = 'pending_approval', version = version + 1 WHERE id = $1 AND entity_id = $2 AND status = 'draft' RETURNING id, status",
    [id, entityId], db.dbConfig
  )
  return rows[0]
}

export async function approveJournal(id, entityId, userId, db) {
  if (!isPgMode(db)) {
    const j = db.journals.find((j) => j.id === id && j.entityId === entityId)
    if (!j) return null
    j.status = 'posted'
    j.approvedBy = userId
    j.approvedAt = new Date().toISOString()
    j.postedAt = new Date().toISOString()
    j.postedBy = userId
    return j
  }
  const { rows } = await query(
    `UPDATE app.journals SET status = 'posted', approved_by = $1, approved_at = now(), posted_by = $1, posted_at = now(), version = version + 1
     WHERE id = $2 AND entity_id = $3 AND status = 'pending_approval'
     RETURNING id, status`,
    [userId, id, entityId], db.dbConfig
  )
  return rows[0]
}

export async function rejectJournal(id, entityId, reason, db) {
  if (!isPgMode(db)) {
    const j = db.journals.find((j) => j.id === id && j.entityId === entityId)
    if (!j) return null
    j.status = 'draft'
    j.rejectionReason = reason
    return j
  }
  const { rows } = await query(
    `UPDATE app.journals SET status = 'draft', rejection_reason = $1, version = version + 1
     WHERE id = $2 AND entity_id = $3 AND status = 'pending_approval'
     RETURNING id, status, rejection_reason AS "rejectionReason"`,
    [reason, id, entityId], db.dbConfig
  )
  return rows[0]
}

// ================================================================
// PERIODS
// ================================================================

export async function getPeriods(entityId, db) {
  if (!isPgMode(db)) {
    return db.periods.filter((p) => p.entityId === entityId)
  }
  const { rows } = await query(
    'SELECT id, name, month, year, start_date AS "startDate", end_date AS "endDate", is_open AS "isOpen", is_active AS "isActive" FROM app.fiscal_periods WHERE entity_id = $1 ORDER BY start_date',
    [toPgEntity(entityId)], db.dbConfig
  )
  return rows
}

export async function getCurrentPeriod(entityId, db) {
  if (!isPgMode(db)) {
    return db.periods.find((p) => p.entityId === entityId && p.isActive)
  }
  const { rows } = await query(
    'SELECT id, name, month, year, start_date AS "startDate", end_date AS "endDate", is_open AS "isOpen" FROM app.fiscal_periods WHERE entity_id = $1 AND is_active = true',
    [toPgEntity(entityId)], db.dbConfig
  )
  return rows[0]
}

export async function activatePeriod(id, entityId, db) {
  if (!isPgMode(db)) {
    for (const p of db.periods) {
      if (p.entityId === entityId) p.isActive = p.id === id
    }
    return db.periods.find((p) => p.id === id)
  }
  await query('UPDATE app.fiscal_periods SET is_active = false WHERE entity_id = $1', [toPgEntity(entityId)], db.dbConfig)
  const { rows } = await query(
    'UPDATE app.fiscal_periods SET is_active = true, updated_at = now() WHERE id = $1 AND entity_id = $2 RETURNING id, name, is_active AS "isActive"',
    [id, toPgEntity(entityId)], db.dbConfig
  )
  return rows[0]
}

export async function closePeriod(id, entityId, draftAction, userId, db) {
  if (!isPgMode(db)) {
    const p = db.periods.find((p) => p.id === id && p.entityId === entityId)
    if (!p) return null
    p.isOpen = false
    return p
  }
  const { rows } = await query(
    "UPDATE app.fiscal_periods SET is_open = false, updated_at = now() WHERE id = $1 AND entity_id = $2 AND is_open = true RETURNING id, name, is_open AS \"isOpen\"",
    [id, toPgEntity(entityId)], db.dbConfig
  )
  return rows[0]
}

// ================================================================
// REPORTS (views)
// ================================================================

export async function getTrialBalance(entityId, periodId, db) {
  if (!isPgMode(db)) {
    // In-memory: filter jurnal posted di periode
    const periodJournals = db.journals.filter((j) => j.entityId === entityId && j.periodId === periodId && j.status === 'posted')
    const lines = (db.journalLines || []).filter((l) => periodJournals.some((j) => j.id === l.journalId))
    const map = new Map()
    for (const l of lines) {
      const acct = db.accounts.find((a) => a.id === l.accountId)
      if (!acct) continue
      const key = l.accountId
      if (!map.has(key)) map.set(key, { accountId: l.accountId, code: acct.code, name: acct.name, type: acct.type, normalBalance: acct.normalBalance, debit: 0, credit: 0 })
      const entry = map.get(key)
      entry.debit += l.debit
      entry.credit += l.credit
    }
    return Array.from(map.values())
  }
  const { rows } = await query(
    `SELECT account_id AS "accountId", code, name, type, normal_balance AS "normalBalance",
            sum(debit) AS debit, sum(credit) AS credit
     FROM app.v_trial_balance
     WHERE entity_id = $1 AND period_id = $2
     GROUP BY account_id, code, name, type, normal_balance`,
    [toPgEntity(entityId), periodId], db.dbConfig
  )
  return rows
}

export async function getIncomeStatement(entityId, periodId, compareToPeriodId, db) {
  if (!isPgMode(db)) {
    const result = { revenue: [], expenses: [], totalRevenue: 0, totalExpenses: 0 }
    const periodJournals = db.journals.filter((j) => j.entityId === entityId && j.periodId === periodId && j.status === 'posted')
    const lines = (db.journalLines || []).filter((l) => periodJournals.some((j) => j.id === l.journalId))
    for (const l of lines) {
      const acct = db.accounts.find((a) => a.id === l.accountId)
      if (!acct) continue
      if (acct.type === 'revenue') {
        result.revenue.push({ accountId: l.accountId, code: acct.code, name: acct.name, amount: l.credit - l.debit })
        result.totalRevenue += l.credit - l.debit
      } else if (acct.type === 'expense') {
        result.expenses.push({ accountId: l.accountId, code: acct.code, name: acct.name, amount: l.debit - l.credit })
        result.totalExpenses += l.debit - l.credit
      }
    }
    result.netIncome = result.totalRevenue - result.totalExpenses
    return result
  }
  const { rows } = await query(
    `SELECT account_id AS "accountId", code, name, type,
            sum(credit - debit) AS amount
     FROM app.v_trial_balance
     WHERE entity_id = $1 AND period_id = $2 AND type IN ('revenue', 'expense')
     GROUP BY account_id, code, name, type`,
    [toPgEntity(entityId), periodId], db.dbConfig
  )
  const revenue = rows.filter((r) => r.type === 'revenue').map((r) => ({ ...r, amount: Number(r.amount) }))
  const expenses = rows.filter((r) => r.type === 'expense').map((r) => ({ ...r, amount: Number(r.amount) }))
  return {
    revenue, expenses,
    totalRevenue: revenue.reduce((s, r) => s + r.amount, 0),
    totalExpenses: expenses.reduce((s, r) => s + r.amount, 0),
    netIncome: revenue.reduce((s, r) => s + r.amount, 0) - expenses.reduce((s, r) => s + r.amount, 0),
  }
}

export async function getBalanceSheet(entityId, asOf, db) {
  if (!isPgMode(db)) {
    const result = { assets: [], liabilities: [], equity: [], totalAssets: 0, totalLiabilities: 0, totalEquity: 0 }
    const postedJournals = db.journals.filter((j) => j.entityId === entityId && j.status === 'posted' && j.journalDate <= asOf)
    const lines = (db.journalLines || []).filter((l) => postedJournals.some((j) => j.id === l.journalId))
    for (const l of lines) {
      const acct = db.accounts.find((a) => a.id === l.accountId)
      if (!acct || !['asset', 'liability', 'equity'].includes(acct.type)) continue
      const bal = acct.normalBalance === 'debit' ? (l.debit - l.credit) : (l.credit - l.debit)
      const entry = { accountId: l.accountId, code: acct.code, name: acct.name, type: acct.type, category: acct.category, balance: bal }
      if (acct.type === 'asset') { result.assets.push(entry); result.totalAssets += bal }
      else if (acct.type === 'liability') { result.liabilities.push(entry); result.totalLiabilities += bal }
      else { result.equity.push(entry); result.totalEquity += bal }
    }
    return result
  }
  const { rows } = await query(
    `SELECT account_id AS "accountId", code, name, type, category,
            sum(CASE WHEN normal_balance = 'debit' THEN debit - credit ELSE credit - debit END) AS balance
     FROM app.v_trial_balance tb
     JOIN app.accounts a ON a.id = tb.account_id
     WHERE tb.entity_id = $1 AND a.type IN ('asset', 'liability', 'equity')
     GROUP BY account_id, code, name, type, category`,
    [toPgEntity(entityId)], db.dbConfig
  )
  const assets = rows.filter((r) => r.type === 'asset').map((r) => ({ ...r, balance: Number(r.balance) }))
  const liabilities = rows.filter((r) => r.type === 'liability').map((r) => ({ ...r, balance: Number(r.balance) }))
  const equity = rows.filter((r) => r.type === 'equity').map((r) => ({ ...r, balance: Number(r.balance) }))
  return {
    assets, liabilities, equity,
    totalAssets: assets.reduce((s, r) => s + r.balance, 0),
    totalLiabilities: liabilities.reduce((s, r) => s + r.balance, 0),
    totalEquity: equity.reduce((s, r) => s + r.balance, 0),
  }
}

export async function getCashFlow(entityId, periodId, db) {
  if (!isPgMode(db)) {
    // Sederhana: kelompokkan berdasarkan tipe akun
    const periodJournals = db.journals.filter((j) => j.entityId === entityId && j.periodId === periodId && j.status === 'posted')
    const lines = (db.journalLines || []).filter((l) => periodJournals.some((j) => j.id === l.journalId))
    return { operating: [], investing: [], financing: [], totalOperating: 0, totalInvesting: 0, totalFinancing: 0 }
  }
  const { rows } = await query(
    `SELECT cf.category, cf.activity,
            sum(CASE WHEN a.normal_balance = 'debit' THEN jl.debit - jl.credit ELSE jl.credit - jl.debit END) AS amount
     FROM app.journal_lines jl
     JOIN app.journals j ON j.id = jl.journal_id
     JOIN app.accounts a ON a.id = jl.account_id
     JOIN app.cash_flow_mapping cf ON cf.entity_id = j.entity_id AND cf.category = a.category
     WHERE j.entity_id = $1 AND j.period_id = $2 AND j.status = 'posted'
     GROUP BY cf.category, cf.activity`,
    [toPgEntity(entityId), periodId], db.dbConfig
  )
  const operating = rows.filter((r) => r.activity === 'operating')
  const investing = rows.filter((r) => r.activity === 'investing')
  const financing = rows.filter((r) => r.activity === 'financing')
  return {
    operating, investing, financing,
    totalOperating: operating.reduce((s, r) => s + Number(r.amount), 0),
    totalInvesting: investing.reduce((s, r) => s + Number(r.amount), 0),
    totalFinancing: financing.reduce((s, r) => s + Number(r.amount), 0),
  }
}

// ================================================================
// LEDGER (Buku Besar)
// ================================================================

export async function getLedger(entityId, accountId, { startDate, endDate } = {}, db) {
  if (!isPgMode(db)) {
    const postedJournals = db.journals.filter((j) => j.entityId === entityId && j.status === 'posted')
    let lines = (db.journalLines || []).filter((l) => l.accountId === accountId && postedJournals.some((j) => j.id === l.journalId))
    if (startDate) lines = lines.filter((l) => { const j = postedJournals.find((j) => j.id === l.journalId); return j && j.journalDate >= startDate })
    if (endDate) lines = lines.filter((l) => { const j = postedJournals.find((j) => j.id === l.journalId); return j && j.journalDate <= endDate })
    return lines.map((l) => {
      const j = postedJournals.find((j) => j.id === l.journalId)
      return { ...l, journalDate: j?.journalDate, number: j?.number, description: j?.description }
    })
  }
  const conditions = ['j.entity_id = $1', 'jl.account_id = $2', "j.status = 'posted'"]
  const params = [toPgEntity(entityId), accountId]
  let i = 3
  if (startDate) { conditions.push(`j.journal_date >= $${i++}`); params.push(startDate) }
  if (endDate) { conditions.push(`j.journal_date <= $${i++}`); params.push(endDate) }
  const { rows } = await query(
    `SELECT jl.id, jl.debit, jl.credit, jl.description AS "lineDescription",
            j.journal_date AS "journalDate", j.transaction_number AS number, j.description
     FROM app.journal_lines jl
     JOIN app.journals j ON j.id = jl.journal_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY j.journal_date, j.created_at`,
    params, db.dbConfig
  )
  return rows
}

// ================================================================
// DASHBOARD
// ================================================================

export async function getDashboardSummary(entityId, periodId, db) {
  if (!isPgMode(db)) {
    const periodJournals = db.journals.filter((j) => j.entityId === entityId && j.periodId === periodId && j.status === 'posted')
    const lines = (db.journalLines || []).filter((l) => periodJournals.some((j) => j.id === l.journalId))
    let totalDebit = 0, totalCredit = 0
    for (const l of lines) { totalDebit += l.debit; totalCredit += l.credit }
    return { totalDebit, totalCredit, journalCount: periodJournals.length }
  }
  const { rows } = await query(
    `SELECT sum(debit) AS total_debit, sum(credit) AS total_credit, count(DISTINCT j.id)::int AS journal_count
     FROM app.journal_lines jl
     JOIN app.journals j ON j.id = jl.journal_id
     WHERE j.entity_id = $1 AND j.period_id = $2 AND j.status = 'posted'`,
    [toPgEntity(entityId), periodId], db.dbConfig
  )
  return { totalDebit: Number(rows[0].total_debit) || 0, totalCredit: Number(rows[0].total_credit) || 0, journalCount: rows[0].journal_count }
}

export async function getRecentJournals(entityId, limit = 5, db) {
  if (!isPgMode(db)) {
    return db.journals
      .filter((j) => j.entityId === entityId)
      .sort((a, b) => (b.journalDate || '').localeCompare(a.journalDate || ''))
      .slice(0, limit)
  }
  const { rows } = await query(
    `SELECT j.id, j.transaction_number AS number, j.journal_date AS "journalDate", j.description, j.status,
            j.created_at AS "createdAt", u.name AS "createdByName", j.rejection_reason AS "rejectionReason"
     FROM app.journals j
     LEFT JOIN app.users u ON u.id = j.created_by
     WHERE j.entity_id = $1
     ORDER BY j.journal_date DESC, j.created_at DESC
     LIMIT $2`,
    [toPgEntity(entityId), limit], db.dbConfig
  )
  return rows
}

// ================================================================
// SEARCH
// ================================================================

export async function search(entityId, q, db) {
  if (!isPgMode(db)) {
    const kw = q.toLowerCase()
    const results = []
    for (const j of db.journals.filter((j) => j.entityId === entityId)) {
      if (j.description?.toLowerCase().includes(kw) || j.number?.toLowerCase().includes(kw)) {
        results.push({ type: 'journal', id: j.id, title: j.number, subtitle: j.description })
      }
    }
    for (const a of db.accounts.filter((a) => a.entityId === entityId)) {
      if (a.code.toLowerCase().includes(kw) || a.name.toLowerCase().includes(kw)) {
        results.push({ type: 'account', id: a.id, title: a.code, subtitle: a.name })
      }
    }
    return results.slice(0, 20)
  }
  const { rows } = await query(
    `(SELECT 'journal' AS type, id, transaction_number AS title, description AS subtitle
      FROM app.journals WHERE entity_id = $1 AND (transaction_number ILIKE $2 OR description ILIKE $2))
     UNION ALL
     (SELECT 'account', id, code, name FROM app.accounts WHERE entity_id = $1 AND (code ILIKE $2 OR name ILIKE $2))
     LIMIT 20`,
    [toPgEntity(entityId), `%${q}%`], db.dbConfig
  )
  return rows
}

// ================================================================
// EXPORT
// ================================================================

export async function exportAccounts(entityId, db) {
  if (!isPgMode(db)) {
    return db.accounts.filter((a) => a.entityId === entityId).map((a) => ({
      Kode: a.code, Nama: a.name, Tipe: a.type, Kategori: a.category, 'Saldo Normal': a.normalBalance, Status: a.isActive ? 'Aktif' : 'Non-aktif',
    }))
  }
  const { rows } = await query(
    `SELECT code AS "Kode", name AS "Nama", type AS "Tipe", category AS "Kategori",
            normal_balance AS "Saldo Normal", CASE WHEN is_active THEN 'Aktif' ELSE 'Non-aktif' END AS "Status"
     FROM app.accounts WHERE entity_id = $1 ORDER BY code`,
    [toPgEntity(entityId)], db.dbConfig
  )
  return rows
}

export async function exportLedger(entityId, accountId, { startDate, endDate } = {}, db) {
  const lines = await getLedger(entityId, accountId, { startDate, endDate }, db)
  return lines.map((l) => ({
    Tanggal: l.journalDate || '', Nomor: l.number || '', Deskripsi: l.description || l.lineDescription || '',
    Debit: l.debit || 0, Kredit: l.credit || 0,
  }))
}

// ================================================================
// ENTITIES
// ================================================================

export async function getEntities(db) {
  if (!isPgMode(db)) return db.entities
  const { rows } = await query('SELECT id, name, currency, fiscal_month AS "fiscalMonth", fiscal_day AS "fiscalDay" FROM app.entities ORDER BY name', [], db.dbConfig)
  return rows
}

export async function getEntityById(id, db) {
  if (!isPgMode(db)) return db.entities.find((e) => e.id === id)
  const { rows } = await query('SELECT id, name, currency, fiscal_month AS "fiscalMonth", fiscal_day AS "fiscalDay" FROM app.entities WHERE id = $1', [id], db.dbConfig)
  return rows[0]
}

// ================================================================
// USERS
// ================================================================

export async function getUsers(db) {
  if (!isPgMode(db)) return db.users
  const { rows } = await query('SELECT id, email, name, is_active AS "isActive", created_at AS "createdAt" FROM app.users ORDER BY name', [], db.dbConfig)
  return rows
}

export async function getUserById(id, db) {
  if (!isPgMode(db)) return db.users.find((u) => u.id === id)
  const { rows } = await query('SELECT id, email, name, is_active AS "isActive", created_at AS "createdAt" FROM app.users WHERE id = $1', [id], db.dbConfig)
  return rows[0]
}

export async function updateUser(id, data, db) {
  if (!isPgMode(db)) {
    const idx = db.users.findIndex((u) => u.id === id)
    if (idx === -1) return null
    db.users[idx] = { ...db.users[idx], ...data }
    return db.users[idx]
  }
  const sets = []
  const params = []
  let i = 1
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue
    const col = key === 'isActive' ? 'is_active' : key
    sets.push(`${col} = $${i++}`)
    params.push(val)
  }
  if (sets.length === 0) return null
  params.push(id)
  const { rows } = await query(
    `UPDATE app.users SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, email, name, is_active AS "isActive"`,
    params, db.dbConfig
  )
  return rows[0]
}

export async function createUser(data, db) {
  if (!isPgMode(db)) {
    const id = `usr-${String(++db.seq.user).padStart(3, '0')}`
    const user = { id, email: data.email, name: data.name, isActive: true, createdAt: new Date().toISOString() }
    db.users.push(user)
    return user
  }
  const { rows } = await query(
    'INSERT INTO app.users (email, name) VALUES ($1, $2) RETURNING id, email, name, is_active AS "isActive"',
    [data.email, data.name], db.dbConfig
  )
  return rows[0]
}

// ================================================================
// PERSISTENCE (save state — hanya untuk in-memory mode)
// ================================================================

export function getInMemoryState(db) {
  return db
}

// ================================================================
// SYNC — Load data dari PostgreSQL ke in-memory arrays
// ================================================================

// ================================================================
// JOURNAL PERSIST BRIDGE — server.js format → PostgreSQL
// Server.js membangun journal dengan ID "JNL-YYYY-MM-NNNN" (string),
// tapi PG pakai UUID. Fungsi di bawah menerima format server.js,
// lalu INSERT ke PG dengan UUID baru + return PG id agar server.js
// bisa update in-memory id supaya konsisten.
// ================================================================

/**
 * Cari period_id dari tanggal jurnal.
 * Cari fiscal_periods yang range tanggalnya mencakup journalDate.
 */
async function findPeriodIdForDate(entityId, journalDate, dbConfig) {
  const { rows } = await query(
    `SELECT id FROM app.fiscal_periods
     WHERE entity_id = $1 AND start_date <= $2 AND end_date >= $2
     ORDER BY start_date DESC LIMIT 1`,
    [toPgEntity(entityId), journalDate], dbConfig
  )
  return rows[0]?.id || null
}

/**
 * Persist journal dari server.js ke PostgreSQL.
 * Menerima journal object yang sudah dibangun server.js (dengan id JNL-xxx),
 * lalu INSERT ke PG dengan UUID id baru + insert journal_lines.
 * Return: { pgId } — UUID generated oleh PG, supaya server.js bisa
 * update in-memory id agar konsisten dengan PG.
 */
export async function persistJournalToPg(journal, db) {
  if (!isPgMode(db)) return null
  // Map in-memory entity ID → PG UUID
  const pgEntId = mapMemEntityToPg(journal.entityId)
  // Cari period_id dari tanggal jurnal (pakai entity UUID asli di PG)
  const periodId = await findPeriodIdForDate(pgEntId, journal.date, db.dbConfig)
  if (!periodId) {
    console.warn(`[DB-Adapter] No fiscal period found for date ${journal.date}, entity ${pgEntId}`)
  }
  // Map createdBy user ID → PG user UUID
  let pgCreatedBy = null
  if (journal.createdBy) {
    // The in-memory user ID format is 'user-001'. Find matching PG user.
    try {
      const { rows: users } = await query('SELECT id FROM app.users LIMIT 1', [], db.dbConfig)
      pgCreatedBy = users[0]?.id || null
    } catch { /* ignore */ }
  }
  // Insert journal
  const { rows: [pgJournal] } = await query(
    `INSERT INTO app.journals (entity_id, period_id, transaction_number, journal_date, description, status, created_by, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      pgEntId,
      periodId || '00000000-0000-0000-0000-000000000000',
      journal.transactionNumber,
      journal.date,
      journal.description,
      journal.status || 'draft',
      pgCreatedBy,
      journal.version || 1,
    ],
    db.dbConfig
  )
  // Insert lines — map account IDs from in-memory to PG
  if (journal.lines?.length) {
    for (const line of journal.lines) {
      // Find PG account ID (accounts in db.accounts have mapped entity ID)
      const pgAccountId = await findPgAccountId(line.accountId, db.dbConfig)
      await query(
        'INSERT INTO app.journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1, $2, $3, $4, $5)',
        [pgJournal.id, pgAccountId || line.accountId, line.debit || 0, line.credit || 0, line.description || ''],
        db.dbConfig
      )
    }
  }
  return { pgId: pgJournal.id }
}

/**
 * Update journal di PostgreSQL (edit sebelum post).
 * Update description, date, status + replace lines.
 */
export async function updateJournalInPg(pgId, journalData, db) {
  if (!isPgMode(db)) return null
  const pgEntId = mapMemEntityToPg(journalData.entityId)
  const periodId = await findPeriodIdForDate(pgEntId, journalData.date, db.dbConfig)
  await query(
    `UPDATE app.journals SET description = $1, journal_date = $2, status = $3, period_id = $4, version = version + 1
     WHERE id = $5`,
    [journalData.description, journalData.date, journalData.status || 'draft', periodId, pgId],
    db.dbConfig
  )
  // Replace lines — map account IDs
  await query('DELETE FROM app.journal_lines WHERE journal_id = $1', [pgId], db.dbConfig)
  if (journalData.lines?.length) {
    for (const line of journalData.lines) {
      const pgAccountId = await findPgAccountId(line.accountId, db.dbConfig)
      await query(
        'INSERT INTO app.journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1, $2, $3, $4, $5)',
        [pgId, pgAccountId || line.accountId, line.debit || 0, line.credit || 0, line.description || ''],
        db.dbConfig
      )
    }
  }
  return true
}

/**
 * Hapus journal dari PostgreSQL (hanya draft/pending-approval).
 */
export async function deleteJournalFromPg(pgId, db) {
  if (!isPgMode(db)) return false
  const { rowCount } = await query(
    "DELETE FROM app.journals WHERE id = $1 AND status IN ('draft', 'pending-approval')",
    [pgId], db.dbConfig
  )
  return rowCount > 0
}

/**
 * Patch status journal di PostgreSQL (post/reverse/submit/approve/reject).
 * Ini lebih ringan dari persistJournalToPg — hanya update kolom status + audit.
 */
export async function patchJournalStatusInPg(pgId, updates, db) {
  if (!isPgMode(db)) return null
  const sets = ['version = version + 1']
  const params = []
  let idx = 1
  if (updates.status) { sets.push(`status = $${idx++}`); params.push(updates.status) }
  if (updates.postedAt) { sets.push(`posted_at = $${idx++}`); params.push(updates.postedAt) }
  if (updates.postedBy) { sets.push(`posted_by = $${idx++}`); params.push(updates.postedBy) }
  if (updates.approvedBy) { sets.push(`approved_by = $${idx++}`); params.push(updates.approvedBy) }
  if (updates.approvedAt) { sets.push(`approved_at = $${idx++}`); params.push(updates.approvedAt) }
  if (updates.rejectionReason) { sets.push(`rejection_reason = $${idx++}`); params.push(updates.rejectionReason) }
  if (updates.reversedAt) { sets.push(`updated_at = now()`) }
  params.push(pgId)
  const { rowCount } = await query(
    `UPDATE app.journals SET ${sets.join(', ')} WHERE id = $${idx}`,
    params, db.dbConfig
  )
  return rowCount > 0
}

/**
 * Persist reversal journal + reverse original ke PostgreSQL.
 */
export async function persistReversalToPg(originalPgId, reversalJournal, db) {
  if (!isPgMode(db)) return null
  const pgEntId = mapMemEntityToPg(reversalJournal.entityId)
  const periodId = await findPeriodIdForDate(pgEntId, reversalJournal.date, db.dbConfig)
  // Mark original as reversed
  await query(
    "UPDATE app.journals SET status = 'reversed', version = version + 1 WHERE id = $1",
    [originalPgId], db.dbConfig
  )
  // Insert reversal journal
  const { rows: [pgReversal] } = await query(
    `INSERT INTO app.journals (entity_id, period_id, transaction_number, journal_date, description, status, created_by, posted_by, posted_at, reversal_of_id, version)
     VALUES ($1, $2, $3, $4, $5, 'posted', $6, $6, now(), $7, 1)
     RETURNING id`,
    [
      reversalJournal.entityId,
      periodId || '00000000-0000-0000-0000-000000000000',
      reversalJournal.transactionNumber,
      reversalJournal.date,
      reversalJournal.description,
      reversalJournal.createdBy,
      originalPgId,
    ],
    db.dbConfig
  )
  // Copy lines (debit ↔ credit)
  await query(
    `INSERT INTO app.journal_lines (journal_id, account_id, debit, credit, description)
     SELECT $1, account_id, credit, debit, 'Pembalikan otomatis'
     FROM app.journal_lines WHERE journal_id = $2`,
    [pgReversal.id, originalPgId],
    db.dbConfig
  )
  return { pgId: pgReversal.id }
}

/**
 * Jalankan query langsung ke PostgreSQL dengan config tertentu.
 * Berguna untuk endpoint admin yang butuh query ad-hoc.
 */

// ---- Entity ID Mapping ----
// PG uses UUID entity IDs (from migration seed), in-memory uses 'ent-001'.
// This mapping bridges the two formats so all code works correctly.
let pgEntityId = null    // UUID from PG: 'a0eebc99-...'
let memEntityId = 'ent-001' // in-memory entity ID

/** Get the PG UUID for the primary entity. */
export function getPgEntityId() { return pgEntityId }

/** Get the in-memory entity ID for the primary entity. */
export function getMemEntityId() { return memEntityId }

/** Map a PG entity UUID to in-memory entity ID. */
export function mapPgEntityToMem(pgId) {
  if (pgId === pgEntityId) return memEntityId
  return pgId // unknown entity — pass through
}

/** Map an in-memory entity ID to PG entity UUID. */
export function mapMemEntityToPg(memId) {
  if (memId === memEntityId && pgEntityId) return pgEntityId
  return memId // unknown entity — pass through
}

/** Helper: convert in-memory entity ID to PG UUID for SQL WHERE clauses. */
function toPgEntity(entityId) {
  return mapMemEntityToPg(entityId)
}

// ---- Smart periodic sync: track row counts ----
let lastTableCounts = null

/**
 * Quick COUNT query pada tabel kunci — hanya 4 queries, <5ms di PG.
 * Return: { accounts: 15, journals: 10, users: 3, periods: 3 }
 */
export async function checkTableCounts(db) {
  if (!isPgMode(db)) return null
  try {
    const { rows } = await query(
      `SELECT
        (SELECT COUNT(*)::int FROM app.accounts) AS accounts,
        (SELECT COUNT(*)::int FROM app.journals) AS journals,
        (SELECT COUNT(*)::int FROM app.users) AS users,
        (SELECT COUNT(*)::int FROM app.fiscal_periods) AS periods,
        (SELECT COUNT(*)::int FROM app.journal_lines) AS lines`,
      [], db.dbConfig
    )
    return rows[0]
  } catch {
    return null
  }
}

/**
 * Compare current counts dengan last known counts.
 * Return true jika ADA perubahan (insert/update/delete).
 */
export function hasCountsChanged(currentCounts) {
  if (!currentCounts) return false
  if (!lastTableCounts) return true // pertama kali — sync
  const changed =
    currentCounts.accounts !== lastTableCounts.accounts ||
    currentCounts.journals !== lastTableCounts.journals ||
    currentCounts.users !== lastTableCounts.users ||
    currentCounts.periods !== lastTableCounts.periods ||
    currentCounts.lines !== lastTableCounts.lines
  return changed
}

/**
 * Update last known counts setelah sync berhasil.
 */
export function updateLastCounts(counts) {
  lastTableCounts = counts ? { ...counts } : null
}

/**
 * Sync semua data dari PostgreSQL ke db.accounts, db.journals, db.users,
 * db.entities, db.periods.
 * Dipanggil SETELAH migration berhasil, sehingga semua endpoint yang
 * masih baca dari in-memory (entityAccounts, entityJournals, computeBalances)
 * tetap jalan.
 */
export async function syncDataFromPg(db) {
  if (!isPgMode(db)) return null
  try {
    // 1. Discover PG entity UUID and store mapping
    const { rows: entityRows } = await query(
      'SELECT id, name FROM app.entities ORDER BY name LIMIT 1',
      [], db.dbConfig
    )
    if (entityRows.length > 0) {
      pgEntityId = entityRows[0].id
      console.log(`[DB] Entity mapping: PG ${pgEntityId} → in-memory ${memEntityId}`)
    }
    // Update entities list — map PG UUID to in-memory ID for consistency
    db.entities = entityRows.map((e) => ({
      ...e,
      id: mapPgEntityToMem(e.id),
    }))

    // 2. Sync accounts — map PG entity_id to in-memory entity ID
    const { rows: acctRows } = await query(
      `SELECT id, code, name, type, category,
              normal_balance AS "normalBalance",
              parent_id AS "parentId",
              is_active AS "isActive",
              is_header AS "isHeader",
              description,
              base_balance AS "baseBalance",
              entity_id AS "entityId",
              version
       FROM app.accounts ORDER BY code`,
      [], db.dbConfig
    )
    // Map PG entity UUID → in-memory entity ID
    const mappedAccounts = acctRows.map((a) => ({
      ...a,
      entityId: mapPgEntityToMem(a.entityId),
    }))
    // Only overwrite if PG has data — don't wipe in-memory seed
    if (mappedAccounts.length > 0) {
      db.accounts = mappedAccounts
    }
    console.log(`[DB] Accounts synced: ${db.accounts.length} (${acctRows.length} from PG)`)

    // 3. Sync journals + lines — DON'T wipe if PG is empty
    const { rows: journalRows } = await query(
      `SELECT id, entity_id AS "entityId",
              transaction_number AS "transactionNumber",
              journal_date AS "date", description, status,
              reversal_of_id AS "reversalOfId",
              period_id AS "periodId",
              created_at AS "createdAt",
              created_by AS "createdBy",
              posted_at AS "postedAt",
              posted_by AS "postedBy"
       FROM app.journals WHERE entity_id IS NOT NULL ORDER BY journal_date`,
      [], db.dbConfig
    )
    for (const j of journalRows) {
      const { rows: lines } = await query(
        `SELECT id, journal_id AS "journalId",
                account_id AS "accountId",
                debit, credit, description
         FROM app.journal_lines WHERE journal_id = $1`,
        [j.id], db.dbConfig
      )
      j.lines = lines
      j.attachments = []
      j.entityId = mapPgEntityToMem(j.entityId)
    }
    if (journalRows.length > 0) {
      // PG has journals — use PG data (mapped)
      db.journals = journalRows
      console.log(`[DB] Journals synced from PG: ${journalRows.length}`)
    } else if (db.journals.length > 0) {
      // PG is empty but in-memory has journals — seed them to PG
      console.log(`[DB] PG journals empty, seeding ${db.journals.length} in-memory journals to PG...`)
      await seedJournalsToPg(db)
    }
    console.log(`[DB] Journals final: ${db.journals.length}`)

    // 4. Sync users — map entity IDs if needed
    const { rows: userRows } = await query(
      'SELECT id, email, name, is_active AS "isActive" FROM app.users',
      [], db.dbConfig
    )
    db.users = userRows

    // 5. Sync periods — map PG entity_id to in-memory entity ID
    const { rows: periodRows } = await query(
      `SELECT id, entity_id AS "entityId", name, month, year,
              start_date AS "startDate", end_date AS "endDate",
              is_open AS "isOpen", is_active AS "isActive"
       FROM app.fiscal_periods`,
      [], db.dbConfig
    )
    db.periods = periodRows.map((p) => ({
      ...p,
      entityId: mapPgEntityToMem(p.entityId),
    }))

    console.log(`[DB] Synced from PostgreSQL: ${db.accounts.length} akun, ${db.journals.length} jurnal, ${db.users.length} user, ${db.entities.length} entitas`)
    return { accounts: db.accounts.length, journals: db.journals.length }
  } catch (err) {
    console.error('[DB] syncDataFromPg error:', err.message)
    return null
  }
}

/**
 * Seed in-memory journals ke PostgreSQL.
 * Dipanggil saat PG journals = 0 tapi in-memory punya data.
 */
export async function seedJournalsToPg(db) {
  if (!isPgMode(db) || !pgEntityId) return
  const memId = memEntityId
  let seeded = 0
  for (const j of db.journals) {
    if (j.entityId !== memId) continue
    // Skip jika sudah ada di PG (cek by transaction_number)
    try {
      const { rows: existing } = await query(
        'SELECT id FROM app.journals WHERE transaction_number = $1',
        [j.transactionNumber], db.dbConfig
      )
      if (existing.length > 0) continue
    } catch { /* tabel mungkin belum ada */ continue }

    // Cari period_id — use PG entity UUID, not in-memory ID
    const periodId = await findPeriodIdForDate(pgEntityId, j.date, db.dbConfig)
    // Cari PG user ID dari createdBy
    let pgUserId = null
    if (j.createdBy) {
      try {
        const { rows: u } = await query('SELECT id FROM app.users LIMIT 1', [], db.dbConfig)
        pgUserId = u[0]?.id || null
      } catch { /* ignore */ }
    }
    try {
      const { rows: [pgJournal] } = await query(
        `INSERT INTO app.journals (entity_id, period_id, transaction_number, journal_date, description, status, created_by, posted_by, posted_at, reversal_of_id, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          pgEntityId,
          periodId || '00000000-0000-0000-0000-000000000000',
          j.transactionNumber,
          j.date,
          j.description,
          j.status || 'draft',
          pgUserId,
          j.status === 'posted' ? pgUserId : null,
          j.postedAt || null,
          j.reversalOfId || null,
          j.version || 1,
        ],
        db.dbConfig
      )
      // Insert lines
      if (j.lines?.length) {
        for (const ln of j.lines) {
          // Map accountId from in-memory format to PG account ID
          const acct = db.accounts.find((a) => a.entityId === memId && (a.id === ln.accountId || a.code === ln.accountId))
          const pgAcctId = acct?.id || ln.accountId
          // Check if pgAcctId is a UUID (PG) or in-memory format
          const isPgAcct = typeof pgAcctId === 'string' && /^[0-9a-f]{8}-/.test(pgAcctId)
          await query(
            'INSERT INTO app.journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1, $2, $3, $4, $5)',
            [pgJournal.id, isPgAcct ? pgAcctId : (await findPgAccountId(pgAcctId, db.dbConfig)) || pgAcctId, ln.debit || 0, ln.credit || 0, ln.description || ''],
            db.dbConfig
          )
        }
      }
      seeded++
    } catch (err) {
      console.warn(`[DB] Failed to seed journal ${j.transactionNumber}: ${err.message}`)
    }
  }
  if (seeded > 0) console.log(`[DB] Seeded ${seeded} journals from in-memory to PostgreSQL`)
}

/** Find PG account ID by in-memory ID or code. */
async function findPgAccountId(inMemIdOrCode, dbConfig) {
  try {
    // Try by code first (e.g. '1-1100')
    const { rows } = await query(
      'SELECT id FROM app.accounts WHERE code = $1 OR id = $1 LIMIT 1',
      [inMemIdOrCode], dbConfig
    )
    return rows[0]?.id || null
  } catch {
    return null
  }
}

/**
 * Seed SEMUA data in-memory ke PostgreSQL sekaligus.
 * Berguna saat pertama kali koneksi PG — push accounts, journals, periods, users.
 * Returns summary object.
 */
export async function seedAllToPg(db) {
  if (!isPgMode(db) || !pgEntityId) {
    return { ok: false, error: 'PostgreSQL tidak aktif atau entity belum ditemukan' }
  }
  const memId = memEntityId
  const pgId = pgEntityId
  const summary = { accounts: 0, journals: 0, periods: 0, users: 0, errors: [] }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. SEED ACCOUNTS (skip jika sudah ada by code)
    for (const a of db.accounts) {
      if (a.entityId !== memId) continue
      try {
        const { rows: existing } = await client.query(
          'SELECT id FROM app.accounts WHERE code = $1 LIMIT 1', [a.code]
        )
        if (existing.length > 0) continue // sudah ada, skip
        await client.query(
          `INSERT INTO app.accounts (entity_id, code, name, type, category, normal_balance, parent_id, description, is_active, base_balance)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [pgId, a.code, a.name, a.type, a.category, a.normalBalance,
           a.parentId || null, a.description || '', a.isActive !== false, a.baseBalance || 0]
        )
        summary.accounts++
      } catch (err) {
        summary.errors.push({ table: 'accounts', code: a.code, error: err.message })
      }
    }
    if (summary.accounts > 0) console.log(`[DB] seedAll: ${summary.accounts} accounts inserted`)

    // 2. SEED PERIODS (skip jika sudah ada by name)
    for (const p of db.periods) {
      try {
        const { rows: existing } = await client.query(
          'SELECT id FROM app.fiscal_periods WHERE name = $1 AND entity_id = $2 LIMIT 1',
          [p.name, pgId]
        )
        if (existing.length > 0) continue
        await client.query(
          `INSERT INTO app.fiscal_periods (entity_id, name, month, year, start_date, end_date, is_open, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [pgId, p.name, p.month, p.year, p.startDate, p.endDate, p.isOpen !== false, p.isActive !== false]
        )
        summary.periods++
      } catch (err) {
        summary.errors.push({ table: 'fiscal_periods', name: p.name, error: err.message })
      }
    }
    if (summary.periods > 0) console.log(`[DB] seedAll: ${summary.periods} periods inserted`)

    // 3. SEED USERS (skip jika sudah ada by email)
    for (const u of db.users) {
      try {
        const { rows: existing } = await client.query(
          'SELECT id FROM app.users WHERE email = $1 LIMIT 1', [u.email]
        )
        if (existing.length > 0) continue
        await client.query(
          `INSERT INTO app.users (email, name, is_active)
           VALUES ($1, $2, $3)`,
          [u.email, u.name, u.isActive !== false]
        )
        summary.users++
      } catch (err) {
        summary.errors.push({ table: 'users', email: u.email, error: err.message })
      }
    }
    if (summary.users > 0) console.log(`[DB] seedAll: ${summary.users} users inserted`)

    // 4. SEED JOURNALS (skip jika sudah ada by transaction_number)
    // Re-fetch PG account map setelah accounts di-seed
    const { rows: pgAccts } = await client.query('SELECT id, code FROM app.accounts')
    const codeToPgId = Object.fromEntries(pgAccts.map((a) => [a.code, a.id]))

    for (const j of db.journals) {
      if (j.entityId !== memId) continue
      try {
        const { rows: existing } = await client.query(
          'SELECT id FROM app.journals WHERE transaction_number = $1 LIMIT 1',
          [j.transactionNumber]
        )
        if (existing.length > 0) continue
        // Find period_id
        const periodId = await findPeriodIdForDate(pgId, j.date, db.dbConfig)
        // Find PG user ID
        let pgUserId = null
        try {
          const { rows: u } = await client.query('SELECT id FROM app.users LIMIT 1')
          pgUserId = u[0]?.id || null
        } catch { /* ignore */ }

        const { rows: [pgJournal] } = await client.query(
          `INSERT INTO app.journals (entity_id, period_id, transaction_number, journal_date, description, status, created_by, posted_by, posted_at, reversal_of_id, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id`,
          [pgId, periodId || '00000000-0000-0000-0000-000000000000', j.transactionNumber,
           j.date, j.description, j.status || 'draft', pgUserId,
           j.status === 'posted' ? pgUserId : null, j.postedAt || null,
           j.reversalOfId || null, j.version || 1]
        )
        // Insert lines
        if (j.lines?.length) {
          for (const ln of j.lines) {
            const pgAcctId = codeToPgId[ln.accountId] || codeToPgId[ln.accountCode] || ln.accountId
            const isUuid = typeof pgAcctId === 'string' && /^[0-9a-f]{8}-/.test(pgAcctId)
            const finalAcctId = isUuid ? pgAcctId : (codeToPgId[ln.accountId] || codeToPgId[ln.accountCode] || null)
            if (!finalAcctId) continue // skip jika akun tidak ditemukan di PG
            await client.query(
              'INSERT INTO app.journal_lines (journal_id, account_id, debit, credit, description) VALUES ($1, $2, $3, $4, $5)',
              [pgJournal.id, finalAcctId, ln.debit || 0, ln.credit || 0, ln.description || '']
            )
          }
        }
        summary.journals++
      } catch (err) {
        summary.errors.push({ table: 'journals', number: j.transactionNumber, error: err.message })
      }
    }
    if (summary.journals > 0) console.log(`[DB] seedAll: ${summary.journals} journals inserted`)

    await client.query('COMMIT')
    console.log(`[DB] seedAll complete:`, summary)
  } catch (err) {
    await client.query('ROLLBACK')
    summary.errors.push({ table: 'transaction', error: err.message })
    console.error('[DB] seedAll rolled back:', err.message)
  } finally {
    client.release()
  }
  return { ok: summary.errors.length === 0, ...summary }
}
