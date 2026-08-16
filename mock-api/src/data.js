// ============================================================
// Data mock — konsisten dengan prototipe (prototype-accounting)
// & PRD Ver 3 §9 (data structure) / §16 (mock data).
// Buku disusun agar SEIMBANG:
//   Total Aset (557) = Utang (150) + Modal (363) + Laba YTD (44)
// ============================================================

export const entities = [
  { id: 'ent-001', name: 'PT. Kreasi Inovasi Estetika', code: 'KI-001', address: 'Jl. Sudirman No. 45, Jakarta', isActive: true, createdAt: '2025-01-01T00:00:00Z' },
  { id: 'ent-002', name: 'CV Karya Mandiri', code: 'KM-002', address: 'Jl. Diponegoro No. 12, Bandung', isActive: true, createdAt: '2025-06-01T00:00:00Z' },
]

// ============================================================
// ENTITAS KEDUA — CV Karya Mandiri (ent-002)
// Data demo multi-tenant untuk entity switcher: COA + jurnal KECIL
// tapi bisa dibedakan (nama akun & deskripsi ber-label CV/ent-002).
// Id akun SAMA dengan ent-001 (1-1100, 4-1000, 5-1000) — dua entitas
// boleh punya COA sendiri; isolasi via entityId (server memfilter
// account/jurnal per X-Entity-Id), bukan via id unik global.
// Konsisten dengan fixture ent-002 di MSW handlers prototipe.
// ============================================================
export const ent2Accounts = [
  { id: '1-1100', code: '1-1100', name: 'Kas CV Karya Mandiri', type: 'asset', group: 'current_asset', category: 'Kas & Bank', normalBalance: 'debit', baseBalance: 25_000_000, parentId: null, isHeader: false, isActive: true, description: 'Kas tunai operasional CV Karya Mandiri' },
  { id: '4-1000', code: '4-1000', name: 'Pendapatan Jasa CV', type: 'revenue', group: 'revenue', category: 'Pendapatan', normalBalance: 'credit', baseBalance: 10_000_000, parentId: null, isHeader: false, isActive: true, description: 'Pendapatan jasa konsultasi CV Karya Mandiri' },
  { id: '5-1000', code: '5-1000', name: 'Beban Gaji CV', type: 'expense', group: 'operating_expense', category: 'Beban Operasional', normalBalance: 'debit', baseBalance: 5_000_000, parentId: null, isHeader: false, isActive: true, description: 'Gaji karyawan CV Karya Mandiri' },
]

const ent2Line = (id, accountId, debit, credit, description) => {
  const account = ent2Accounts.find((a) => a.id === accountId)
  return {
    id,
    accountId,
    accountCode: account.code,
    accountName: account.name,
    debit,
    credit,
    description,
  }
}

export const ent2Journals = [
  {
    id: 'JNL-2026-03-001', transactionNumber: 'BKM-2026-03-0001', date: '2026-03-06',
    description: 'Penerimaan jasa CV Karya Mandiri (ent-002)',
    lines: [
      ent2Line('e2-1', '1-1100', 8_000_000, 0, 'Penerimaan tunai'),
      ent2Line('e2-2', '4-1000', 0, 8_000_000, 'Pendapatan jasa'),
    ],
    status: 'posted', version: 1, createdBy: 'user-001', createdAt: '2026-03-06T09:00:00Z', postedAt: '2026-03-06T09:02:00Z',
    auditTrail: [
      { userId: 'user-001', action: 'create', timestamp: '2026-03-06T09:00:00Z' },
      { userId: 'user-001', action: 'post', timestamp: '2026-03-06T09:02:00Z' },
    ],
    attachments: [],
  },
  {
    id: 'JNL-2026-03-002', transactionNumber: 'BKK-2026-03-0002', date: '2026-03-11',
    description: 'Pembayaran gaji CV Karya Mandiri (ent-002)',
    lines: [
      ent2Line('e2-3', '5-1000', 3_000_000, 0, 'Gaji karyawan'),
      ent2Line('e2-4', '1-1100', 0, 3_000_000, 'Pembayaran tunai'),
    ],
    status: 'posted', version: 1, createdBy: 'user-001', createdAt: '2026-03-11T10:00:00Z', postedAt: '2026-03-11T10:02:00Z',
    auditTrail: [
      { userId: 'user-001', action: 'create', timestamp: '2026-03-11T10:00:00Z' },
      { userId: 'user-001', action: 'post', timestamp: '2026-03-11T10:02:00Z' },
    ],
    attachments: [],
  },
]

export const users = [
  { id: 'user-001', name: 'Rina', email: 'rina@estetikakreasi.co.id', password: 'password123', role: 'admin', entityId: 'ent-001', isActive: true, createdAt: '2025-01-01T00:00:00Z' },
  { id: 'user-002', name: 'Dimas', email: 'dimas@estetikakreasi.co.id', password: 'password123', role: 'accountant', entityId: 'ent-001', isActive: true, createdAt: '2025-01-02T00:00:00Z' },
  { id: 'user-003', name: 'Budi', email: 'budi@estetikakreasi.co.id', password: 'password123', role: 'viewer', entityId: 'ent-001', isActive: true, createdAt: '2025-01-03T00:00:00Z' },
]

// Role → izin (sama dengan FRD §role & API §2.4 /auth/me)
export const rolePermissions = {
  admin: ['account.write', 'journal.write', 'journal.approve', 'report.read', 'period.manage', 'user.manage', 'entity.manage', 'export.read'],
  accountant: ['account.write', 'journal.write', 'report.read', 'export.read'],
  viewer: ['report.read', 'export.read'],
}

// Chart of Accounts — PT. Kreasi Inovasi Estetika (PRD Ver 3 §16, API §4)
// baseBalance = saldo awal (opening, sebelum transaksi Maret 2026).
// parentId null = akun level atas; isHeader = akun grup (tidak diinput jurnal).
export const accounts = [
  { id: '1-1000', code: '1-1000', name: 'Aktiva Lancar', type: 'asset', group: 'current_asset', category: 'Kas & Bank', normalBalance: 'debit', baseBalance: 0, parentId: null, isHeader: true, isActive: true, description: 'Grup aset lancar' },
  { id: '1-1100', code: '1-1100', name: 'Kas Besar', type: 'asset', group: 'current_asset', category: 'Kas & Bank', normalBalance: 'debit', baseBalance: 60_000_000, parentId: '1-1000', isHeader: false, isActive: true, description: 'Kas tunai operasional' },
  { id: '1-1200', code: '1-1200', name: 'Bank BCA 123456', type: 'asset', group: 'current_asset', category: 'Kas & Bank', normalBalance: 'debit', baseBalance: 380_000_000, parentId: '1-1000', isHeader: false, isActive: true, description: 'Rekening giro operasional' },
  { id: '1-1300', code: '1-1300', name: 'Piutang Usaha', type: 'asset', group: 'current_asset', category: 'Piutang', normalBalance: 'debit', baseBalance: 100_000_000, parentId: '1-1000', isHeader: false, isActive: true, description: 'Piutang dari pelanggan' },
  { id: '1-1400', code: '1-1400', name: 'Perlengkapan Kantor', type: 'asset', group: 'current_asset', category: 'Aktiva Lancar', normalBalance: 'debit', baseBalance: 5_000_000, parentId: '1-1000', isHeader: false, isActive: true, description: 'ATK dan perlengkapan' },
  { id: '2-1000', code: '2-1000', name: 'Utang Usaha', type: 'liability', group: 'current_liability', category: 'Utang Lancar', normalBalance: 'credit', baseBalance: 105_000_000, parentId: null, isHeader: false, isActive: true, description: 'Utang ke pemasok' },
  { id: '3-1000', code: '3-1000', name: 'Modal Pemilik', type: 'equity', group: 'equity', category: 'Modal', normalBalance: 'credit', baseBalance: 363_000_000, parentId: null, isHeader: false, isActive: true, description: 'Modal disetor pemilik' },
  { id: '4-1000', code: '4-1000', name: 'Pendapatan Jasa', type: 'revenue', group: 'revenue', category: 'Pendapatan', normalBalance: 'credit', baseBalance: 130_000_000, parentId: null, isHeader: false, isActive: true, description: 'Pendapatan jasa konsultasi' },
  { id: '5-1000', code: '5-1000', name: 'Beban Gaji', type: 'expense', group: 'operating_expense', category: 'Beban Operasional', normalBalance: 'debit', baseBalance: 40_000_000, parentId: null, isHeader: false, isActive: true, description: 'Gaji karyawan' },
  { id: '5-2000', code: '5-2000', name: 'Beban Sewa', type: 'expense', group: 'operating_expense', category: 'Beban Operasional', normalBalance: 'debit', baseBalance: 8_000_000, parentId: null, isHeader: false, isActive: true, description: 'Sewa kantor' },
  { id: '5-3000', code: '5-3000', name: 'Beban Operasional', type: 'expense', group: 'operating_expense', category: 'Beban Operasional', normalBalance: 'debit', baseBalance: 3_000_000, parentId: null, isHeader: false, isActive: true, description: 'Beban operasional lain' },
  { id: '5-4000', code: '5-4000', name: 'Beban Penyusutan', type: 'expense', group: 'operating_expense', category: 'Beban Operasional', normalBalance: 'debit', baseBalance: 2_000_000, parentId: null, isHeader: false, isActive: true, description: 'Penyusutan aset tetap' },
]

// Template COA UKM PSAK (API §4.6)
export const coaTemplate = {
  id: 'ukm-psak-2026',
  name: 'COA UKM PSAK (2026)',
  accounts: [
    { code: '1-1000', name: 'Aktiva Lancar', type: 'asset', group: 'current_asset', category: 'Kas & Bank', normalBalance: 'debit', parentId: null, isHeader: true },
    { code: '1-1100', name: 'Kas Besar', type: 'asset', group: 'current_asset', category: 'Kas & Bank', normalBalance: 'debit', parentId: '1-1000', isHeader: false },
    { code: '1-1200', name: 'Bank', type: 'asset', group: 'current_asset', category: 'Kas & Bank', normalBalance: 'debit', parentId: '1-1000', isHeader: false },
    { code: '2-1000', name: 'Utang Usaha', type: 'liability', group: 'current_liability', category: 'Utang Lancar', normalBalance: 'credit', parentId: null, isHeader: false },
    { code: '3-1000', name: 'Modal Pemilik', type: 'equity', group: 'equity', category: 'Modal', normalBalance: 'credit', parentId: null, isHeader: false },
    { code: '4-1000', name: 'Pendapatan Jasa', type: 'revenue', group: 'revenue', category: 'Pendapatan', normalBalance: 'credit', parentId: null, isHeader: false },
    { code: '5-1000', name: 'Beban Operasional', type: 'expense', group: 'operating_expense', category: 'Beban Operasional', normalBalance: 'debit', parentId: null, isHeader: false },
  ],
}

const line = (id, accountId, debit, credit, description) => {
  const account = accounts.find((a) => a.id === accountId)
  return {
    id,
    accountId,
    accountCode: account.code,
    accountName: account.name,
    debit,
    credit,
    description,
  }
}

// Jurnal Maret 2026 (PRD Ver 3 §16) — posted: BKM-0001, BKK-0002, BKK-0003, BKM-0004, JV-0005
// draft: BKK-0006, JV-0007 · reversed: BKM-0008
export const journals = [
  {
    id: 'JNL-2026-03-001', transactionNumber: 'BKM-2026-03-0001', date: '2026-03-05',
    description: 'Penerimaan pembayaran jasa konsultasi dari PT Maju Sejahtera',
    lines: [
      line('l1-1', '1-1100', 25_000_000, 0, 'Penerimaan tunai'),
      line('l1-2', '4-1000', 0, 25_000_000, 'Pendapatan jasa konsultasi'),
    ],
    status: 'posted', version: 1, createdBy: 'user-001', createdAt: '2026-03-05T09:10:00Z', postedAt: '2026-03-05T09:12:00Z',
    auditTrail: [
      { userId: 'user-001', action: 'create', timestamp: '2026-03-05T09:10:00Z' },
      { userId: 'user-001', action: 'post', timestamp: '2026-03-05T09:12:00Z' },
    ],
    attachments: [],
  },
  {
    id: 'JNL-2026-03-002', transactionNumber: 'BKK-2026-03-0002', date: '2026-03-07',
    description: 'Pembayaran sewa kantor bulan Maret',
    lines: [
      line('l2-1', '5-2000', 10_000_000, 0, 'Sewa kantor Maret'),
      line('l2-2', '1-1100', 0, 10_000_000, 'Pembayaran via kas'),
    ],
    status: 'posted', version: 1, createdBy: 'user-001', createdAt: '2026-03-07T13:40:00Z', postedAt: '2026-03-07T13:42:00Z',
    auditTrail: [
      { userId: 'user-001', action: 'create', timestamp: '2026-03-07T13:40:00Z' },
      { userId: 'user-001', action: 'post', timestamp: '2026-03-07T13:42:00Z' },
    ],
    attachments: [],
  },
  {
    id: 'JNL-2026-03-003', transactionNumber: 'BKK-2026-03-0003', date: '2026-03-10',
    description: 'Pembelian perlengkapan kantor',
    lines: [
      line('l3-1', '5-3000', 3_000_000, 0, 'ATK dan perlengkapan'),
      line('l3-2', '1-1100', 0, 3_000_000, 'Pembelian tunai'),
    ],
    status: 'posted', version: 1, createdBy: 'user-001', createdAt: '2026-03-10T10:20:00Z', postedAt: '2026-03-10T10:21:00Z',
    auditTrail: [
      { userId: 'user-001', action: 'create', timestamp: '2026-03-10T10:20:00Z' },
      { userId: 'user-001', action: 'post', timestamp: '2026-03-10T10:21:00Z' },
    ],
    attachments: [],
  },
  {
    id: 'JNL-2026-03-004', transactionNumber: 'BKM-2026-03-0004', date: '2026-03-12',
    description: 'Penerimaan pembayaran piutang PT ABC',
    lines: [
      line('l4-1', '1-1100', 15_000_000, 0, 'Pelunasan piutang'),
      line('l4-2', '1-1300', 0, 15_000_000, 'Piutang PT ABC'),
    ],
    status: 'posted', version: 1, createdBy: 'user-002', createdAt: '2026-03-12T15:05:00Z', postedAt: '2026-03-12T15:06:00Z',
    auditTrail: [
      { userId: 'user-002', action: 'create', timestamp: '2026-03-12T15:05:00Z' },
      { userId: 'user-002', action: 'post', timestamp: '2026-03-12T15:06:00Z' },
    ],
    attachments: [],
  },
  {
    id: 'JNL-2026-03-005', transactionNumber: 'JV-2026-03-0005', date: '2026-03-15',
    description: 'Pencatatan beban gaji karyawan Maret',
    lines: [
      line('l5-1', '5-1000', 45_000_000, 0, 'Gaji 20 karyawan'),
      line('l5-2', '2-1000', 0, 45_000_000, 'Utang gaji belum dibayar'),
    ],
    status: 'posted', version: 1, createdBy: 'user-002', createdAt: '2026-03-15T11:00:00Z', postedAt: '2026-03-15T11:02:00Z',
    auditTrail: [
      { userId: 'user-002', action: 'create', timestamp: '2026-03-15T11:00:00Z' },
      { userId: 'user-002', action: 'post', timestamp: '2026-03-15T11:02:00Z' },
    ],
    attachments: [],
  },
  {
    id: 'JNL-2026-03-006', transactionNumber: 'BKK-2026-03-0006', date: '2026-03-18',
    description: 'Pembelian peralatan kantor (menunggu approval)',
    lines: [
      line('l6-1', '5-3000', 5_000_000, 0, 'Kursi dan meja kerja'),
      line('l6-2', '1-1100', 0, 5_000_000, 'Pembelian tunai'),
    ],
    status: 'draft', version: 1, createdBy: 'user-001', createdAt: '2026-03-18T09:30:00Z',
    auditTrail: [{ userId: 'user-001', action: 'create', timestamp: '2026-03-18T09:30:00Z' }],
    attachments: [],
  },
  {
    id: 'JNL-2026-03-007', transactionNumber: 'JV-2026-03-0007', date: '2026-03-20',
    description: 'Koreksi beban listrik dan air Maret',
    lines: [
      line('l7-1', '5-3000', 2_500_000, 0, 'Tagihan listrik'),
      line('l7-2', '1-1100', 0, 2_500_000, 'Pembayaran tunai'),
    ],
    status: 'draft', version: 1, createdBy: 'user-002', createdAt: '2026-03-20T14:15:00Z',
    auditTrail: [{ userId: 'user-002', action: 'create', timestamp: '2026-03-20T14:15:00Z' }],
    attachments: [],
  },
  {
    id: 'JNL-2026-03-008', transactionNumber: 'BKM-2026-03-0008', date: '2026-03-22',
    description: 'Penerimaan pendapatan lain (dibatalkan)',
    lines: [
      line('l8-1', '1-1100', 2_000_000, 0, 'Penerimaan lain'),
      line('l8-2', '4-1000', 0, 2_000_000, 'Pendapatan lain'),
    ],
    status: 'reversed', version: 1, createdBy: 'user-002', createdAt: '2026-03-22T08:00:00Z', postedAt: '2026-03-22T08:02:00Z', reversedAt: '2026-03-22T08:10:00Z', reversalOf: 'REV-BKM-2026-03-0008',
    auditTrail: [
      { userId: 'user-002', action: 'create', timestamp: '2026-03-22T08:00:00Z' },
      { userId: 'user-002', action: 'post', timestamp: '2026-03-22T08:02:00Z' },
      { userId: 'user-002', action: 'reverse', timestamp: '2026-03-22T08:10:00Z' },
    ],
    attachments: [],
  },
]

// ============================================================
// SEED TAMBAHAN — jurnal lintas bulan (Januari & Februari 2026)
// OPSIONAL: hanya dimuat lewat `npm run seed:extra` atau
// POST /admin/reset { "withExtra": true }.
// Periode Jan/Feb sudah DITUTUP → semua jurnal berstatus posted.
// Seed default (Maret 2026) TIDAK diubah → baseline yang sudah
// diverifikasi (Aset 557 = Utang 150 + Modal 363 + Laba 44)
// tetap utuh saat memakai seed biasa.
// ============================================================
export const extraJournals = [
  {
    id: 'JNL-2026-01-001', transactionNumber: 'BKM-2026-01-0001', date: '2026-01-05',
    description: 'Penerimaan jasa konsultasi Januari (PT Sinar Abadi)',
    lines: [
      line('lx1-1', '1-1100', 30_000_000, 0, 'Penerimaan tunai'),
      line('lx1-2', '4-1000', 0, 30_000_000, 'Pendapatan jasa konsultasi'),
    ],
    status: 'posted', version: 1, createdBy: 'user-001', createdAt: '2026-01-05T09:10:00Z', postedAt: '2026-01-05T09:12:00Z',
    auditTrail: [
      { userId: 'user-001', action: 'create', timestamp: '2026-01-05T09:10:00Z' },
      { userId: 'user-001', action: 'post', timestamp: '2026-01-05T09:12:00Z' },
    ],
    attachments: [],
  },
  {
    id: 'JNL-2026-01-002', transactionNumber: 'BKK-2026-01-0002', date: '2026-01-08',
    description: 'Pembayaran sewa kantor Januari',
    lines: [
      line('lx2-1', '5-2000', 10_000_000, 0, 'Sewa kantor Januari'),
      line('lx2-2', '1-1100', 0, 10_000_000, 'Pembayaran via kas'),
    ],
    status: 'posted', version: 1, createdBy: 'user-001', createdAt: '2026-01-08T13:40:00Z', postedAt: '2026-01-08T13:42:00Z',
    auditTrail: [
      { userId: 'user-001', action: 'create', timestamp: '2026-01-08T13:40:00Z' },
      { userId: 'user-001', action: 'post', timestamp: '2026-01-08T13:42:00Z' },
    ],
    attachments: [],
  },
  {
    id: 'JNL-2026-01-003', transactionNumber: 'BKK-2026-01-0003', date: '2026-01-20',
    description: 'Pembayaran gaji karyawan Januari',
    lines: [
      line('lx3-1', '5-1000', 40_000_000, 0, 'Gaji 20 karyawan'),
      line('lx3-2', '1-1100', 0, 40_000_000, 'Pembayaran via kas'),
    ],
    status: 'posted', version: 1, createdBy: 'user-001', createdAt: '2026-01-20T11:00:00Z', postedAt: '2026-01-20T11:02:00Z',
    auditTrail: [
      { userId: 'user-001', action: 'create', timestamp: '2026-01-20T11:00:00Z' },
      { userId: 'user-001', action: 'post', timestamp: '2026-01-20T11:02:00Z' },
    ],
    attachments: [],
  },
  {
    id: 'JNL-2026-02-001', transactionNumber: 'BKM-2026-02-0001', date: '2026-02-03',
    description: 'Penerimaan jasa konsultasi Februari (PT Mitra Nusantara)',
    lines: [
      line('lx4-1', '1-1100', 28_000_000, 0, 'Penerimaan tunai'),
      line('lx4-2', '4-1000', 0, 28_000_000, 'Pendapatan jasa konsultasi'),
    ],
    status: 'posted', version: 1, createdBy: 'user-002', createdAt: '2026-02-03T09:30:00Z', postedAt: '2026-02-03T09:33:00Z',
    auditTrail: [
      { userId: 'user-002', action: 'create', timestamp: '2026-02-03T09:30:00Z' },
      { userId: 'user-002', action: 'post', timestamp: '2026-02-03T09:33:00Z' },
    ],
    attachments: [],
  },
  {
    id: 'JNL-2026-02-002', transactionNumber: 'BKK-2026-02-0002', date: '2026-02-10',
    description: 'Pembayaran listrik dan air Februari',
    lines: [
      line('lx5-1', '5-3000', 4_000_000, 0, 'Tagihan listrik & air'),
      line('lx5-2', '1-1100', 0, 4_000_000, 'Pembayaran via kas'),
    ],
    status: 'posted', version: 1, createdBy: 'user-002', createdAt: '2026-02-10T14:00:00Z', postedAt: '2026-02-10T14:02:00Z',
    auditTrail: [
      { userId: 'user-002', action: 'create', timestamp: '2026-02-10T14:00:00Z' },
      { userId: 'user-002', action: 'post', timestamp: '2026-02-10T14:02:00Z' },
    ],
    attachments: [],
  },
  {
    id: 'JNL-2026-02-003', transactionNumber: 'BKK-2026-02-0003', date: '2026-02-20',
    description: 'Utang gaji karyawan Februari (belum dibayar)',
    lines: [
      line('lx6-1', '5-1000', 42_000_000, 0, 'Gaji 20 karyawan'),
      line('lx6-2', '2-1000', 0, 42_000_000, 'Utang gaji Februari'),
    ],
    status: 'posted', version: 1, createdBy: 'user-001', createdAt: '2026-02-20T10:45:00Z', postedAt: '2026-02-20T10:47:00Z',
    auditTrail: [
      { userId: 'user-001', action: 'create', timestamp: '2026-02-20T10:45:00Z' },
      { userId: 'user-001', action: 'post', timestamp: '2026-02-20T10:47:00Z' },
    ],
    attachments: [],
  },
  {
    id: 'JNL-2026-02-004', transactionNumber: 'JV-2026-02-0004', date: '2026-02-25',
    description: 'Pendapatan jasa diakui — tagihan belum dibayar (PT Graha Persada)',
    lines: [
      line('lx7-1', '1-1300', 20_000_000, 0, 'Piutang usaha'),
      line('lx7-2', '4-1000', 0, 20_000_000, 'Pendapatan jasa konsultasi'),
    ],
    status: 'posted', version: 1, createdBy: 'user-002', createdAt: '2026-02-25T15:20:00Z', postedAt: '2026-02-25T15:22:00Z',
    auditTrail: [
      { userId: 'user-002', action: 'create', timestamp: '2026-02-25T15:20:00Z' },
      { userId: 'user-002', action: 'post', timestamp: '2026-02-25T15:22:00Z' },
    ],
    attachments: [],
  },
]

// Periode fiskal (API §9)
export const periods = [
  { id: 'fp-2026-01', name: 'Januari 2026', month: 1, year: 2026, startDate: '2026-01-01', endDate: '2026-01-31', isOpen: false, isActive: false, previousPeriodId: null, closedAt: '2026-02-01T00:00:00Z' },
  { id: 'fp-2026-02', name: 'Februari 2026', month: 2, year: 2026, startDate: '2026-02-01', endDate: '2026-02-28', isOpen: false, isActive: false, previousPeriodId: 'fp-2026-01', closedAt: '2026-03-01T00:00:00Z' },
  { id: 'fp-2026-03', name: 'Maret 2026', month: 3, year: 2026, startDate: '2026-03-01', endDate: '2026-03-31', isOpen: true, isActive: true, previousPeriodId: 'fp-2026-02', closedAt: null },
]

// Tren Laba Rugi 6 bulan — data demo untuk dashboard (API §10.2)
export const mockTrend = [
  { period: '2025-10', label: 'Okt', revenue: 118_000_000, expenses: 52_000_000, netIncome: 66_000_000 },
  { period: '2025-11', label: 'Nov', revenue: 122_000_000, expenses: 49_000_000, netIncome: 73_000_000 },
  { period: '2025-12', label: 'Des', revenue: 135_000_000, expenses: 60_000_000, netIncome: 75_000_000 },
  { period: '2026-01', label: 'Jan', revenue: 141_000_000, expenses: 58_000_000, netIncome: 83_000_000 },
  { period: '2026-02', label: 'Feb', revenue: 148_000_000, expenses: 61_000_000, netIncome: 87_000_000 },
  { period: '2026-03', label: 'Mar', revenue: 155_000_000, expenses: 62_000_000, netIncome: 93_000_000 },
]
