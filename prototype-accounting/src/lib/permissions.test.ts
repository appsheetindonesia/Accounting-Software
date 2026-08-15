import { describe, expect, it } from 'vitest'
import { can, canApproveJournal, canWriteJournal, ROLE_LABELS, ROLE_PERMISSIONS } from './permissions'

describe('permissions — mirror rolePermissions mock API (data.js)', () => {
  it('ROLE_PERMISSIONS sama persis dengan mock API', () => {
    expect(ROLE_PERMISSIONS.admin).toEqual([
      'account.write', 'journal.write', 'journal.approve', 'report.read',
      'period.manage', 'user.manage', 'entity.manage', 'export.read',
    ])
    expect(ROLE_PERMISSIONS.accountant).toEqual(['account.write', 'journal.write', 'report.read', 'export.read'])
    expect(ROLE_PERMISSIONS.viewer).toEqual(['report.read', 'export.read'])
  })

  it('label bahasa Indonesia untuk ketiga peran', () => {
    expect(ROLE_LABELS).toEqual({ admin: 'Admin', accountant: 'Akuntan', viewer: 'Viewer' })
  })

  it('can() mengikuti peta izin per peran', () => {
    // Admin punya semua izin jurnal
    expect(can('admin', 'journal.write')).toBe(true)
    expect(can('admin', 'journal.approve')).toBe(true)
    // Akuntan boleh menulis tapi TIDAK approve
    expect(can('accountant', 'journal.write')).toBe(true)
    expect(can('accountant', 'journal.approve')).toBe(false)
    // Viewer read-only
    expect(can('viewer', 'journal.write')).toBe(false)
    expect(can('viewer', 'journal.approve')).toBe(false)
    expect(can('viewer', 'report.read')).toBe(true)
  })

  it('canWriteJournal: posting/reverse hanya Admin & Akuntan, TIDAK Viewer', () => {
    expect(canWriteJournal('admin')).toBe(true)
    expect(canWriteJournal('accountant')).toBe(true)
    expect(canWriteJournal('viewer')).toBe(false)
  })

  it('canApproveJournal: approve/reject hanya Admin', () => {
    expect(canApproveJournal('admin')).toBe(true)
    expect(canApproveJournal('accountant')).toBe(false)
    expect(canApproveJournal('viewer')).toBe(false)
  })

  it('role tak dikenal / null / undefined → semua false (aman)', () => {
    expect(canWriteJournal(null)).toBe(false)
    expect(canWriteJournal(undefined)).toBe(false)
    expect(canWriteJournal('superuser')).toBe(false)
    expect(canApproveJournal('superuser')).toBe(false)
    expect(can('', 'report.read')).toBe(false)
  })
})
