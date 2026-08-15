import type { Account, JournalEntry, TrendPoint } from '../types'

// Chart of Accounts — PT Maju Jaya (PRD Ver 3 §16)
export const mockAccounts: Account[] = [
  { id: '1-1100', code: '1-1100', name: 'Kas Besar', type: 'asset', category: 'Kas & Bank', normalBalance: 'debit', baseBalance: 50_000_000, isActive: true },
  { id: '1-1200', code: '1-1200', name: 'Bank BCA 123456', type: 'asset', category: 'Kas & Bank', normalBalance: 'debit', baseBalance: 380_000_000, isActive: true },
  { id: '1-1300', code: '1-1300', name: 'Piutang Usaha', type: 'asset', category: 'Piutang', normalBalance: 'debit', baseBalance: 100_000_000, isActive: true },
  { id: '1-1400', code: '1-1400', name: 'Perlengkapan Kantor', type: 'asset', category: 'Aktiva Lancar', normalBalance: 'debit', baseBalance: 5_000_000, isActive: true },
  { id: '2-1000', code: '2-1000', name: 'Utang Usaha', type: 'liability', category: 'Utang Lancar', normalBalance: 'credit', baseBalance: 105_000_000, isActive: true },
  { id: '3-1000', code: '3-1000', name: 'Modal Pemilik', type: 'equity', category: 'Modal', normalBalance: 'credit', baseBalance: 500_000_000, isActive: true },
  { id: '4-1000', code: '4-1000', name: 'Pendapatan Jasa', type: 'revenue', category: 'Pendapatan', normalBalance: 'credit', baseBalance: 130_000_000, isActive: true },
  { id: '5-1000', code: '5-1000', name: 'Beban Gaji', type: 'expense', category: 'Beban Operasional', normalBalance: 'debit', baseBalance: 40_000_000, isActive: true },
  { id: '5-2000', code: '5-2000', name: 'Beban Sewa', type: 'expense', category: 'Beban Operasional', normalBalance: 'debit', baseBalance: 8_000_000, isActive: true },
  { id: '5-3000', code: '5-3000', name: 'Beban Operasional', type: 'expense', category: 'Beban Operasional', normalBalance: 'debit', baseBalance: 3_000_000, isActive: true },
  { id: '5-4000', code: '5-4000', name: 'Beban Penyusutan', type: 'expense', category: 'Beban Operasional', normalBalance: 'debit', baseBalance: 1_500_000, isActive: true },
]

const line = (
  id: string,
  accountId: string,
  debit: number,
  credit: number,
  description?: string,
): JournalEntry['lines'][number] => {
  const account = mockAccounts.find((a) => a.id === accountId)!
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

// Jurnal Maret 2026 (PRD Ver 3 §16)
export const mockJournals: JournalEntry[] = [
  {
    id: 'JNL-2026-03-001',
    transactionNumber: 'BKM-2026-03-0001',
    date: '2026-03-05',
    description: 'Penerimaan pembayaran jasa konsultasi dari PT Maju Sejahtera',
    lines: [
      line('l1-1', '1-1100', 25_000_000, 0, 'Penerimaan tunai'),
      line('l1-2', '4-1000', 0, 25_000_000, 'Pendapatan jasa konsultasi'),
    ],
    status: 'posted',
    createdBy: 'Rina',
    createdAt: '2026-03-05T09:10:00Z',
    postedAt: '2026-03-05T09:12:00Z',
  },
  {
    id: 'JNL-2026-03-002',
    transactionNumber: 'BKK-2026-03-0002',
    date: '2026-03-07',
    description: 'Pembayaran sewa kantor bulan Maret',
    lines: [
      line('l2-1', '5-2000', 10_000_000, 0, 'Sewa kantor Maret'),
      line('l2-2', '1-1100', 0, 10_000_000, 'Pembayaran via kas'),
    ],
    status: 'posted',
    createdBy: 'Rina',
    createdAt: '2026-03-07T13:40:00Z',
    postedAt: '2026-03-07T13:42:00Z',
  },
  {
    id: 'JNL-2026-03-003',
    transactionNumber: 'BKK-2026-03-0003',
    date: '2026-03-10',
    description: 'Pembelian perlengkapan kantor',
    lines: [
      line('l3-1', '5-3000', 3_000_000, 0, 'ATK dan perlengkapan'),
      line('l3-2', '1-1100', 0, 3_000_000, 'Pembelian tunai'),
    ],
    status: 'posted',
    createdBy: 'Rina',
    createdAt: '2026-03-10T10:20:00Z',
    postedAt: '2026-03-10T10:21:00Z',
  },
  {
    id: 'JNL-2026-03-004',
    transactionNumber: 'BKM-2026-03-0004',
    date: '2026-03-12',
    description: 'Penerimaan pembayaran piutang PT ABC',
    lines: [
      line('l4-1', '1-1100', 15_000_000, 0, 'Pelunasan piutang'),
      line('l4-2', '1-1300', 0, 15_000_000, 'Piutang PT ABC'),
    ],
    status: 'posted',
    createdBy: 'Dimas',
    createdAt: '2026-03-12T15:05:00Z',
    postedAt: '2026-03-12T15:06:00Z',
  },
  {
    id: 'JNL-2026-03-005',
    transactionNumber: 'JV-2026-03-0005',
    date: '2026-03-15',
    description: 'Pencatatan beban gaji karyawan Maret',
    lines: [
      line('l5-1', '5-1000', 45_000_000, 0, 'Gaji 20 karyawan'),
      line('l5-2', '2-1000', 0, 45_000_000, 'Utang gaji belum dibayar'),
    ],
    status: 'posted',
    createdBy: 'Dimas',
    createdAt: '2026-03-15T11:00:00Z',
    postedAt: '2026-03-15T11:02:00Z',
  },
  {
    id: 'JNL-2026-03-006',
    transactionNumber: 'BKK-2026-03-0006',
    date: '2026-03-18',
    description: 'Pembelian peralatan kantor (menunggu approval)',
    lines: [
      line('l6-1', '5-3000', 5_000_000, 0, 'Kursi dan meja kerja'),
      line('l6-2', '1-1100', 0, 5_000_000, 'Pembelian tunai'),
    ],
    status: 'draft',
    createdBy: 'Rina',
    createdAt: '2026-03-18T09:30:00Z',
  },
  {
    id: 'JNL-2026-03-007',
    transactionNumber: 'JV-2026-03-0007',
    date: '2026-03-20',
    description: 'Koreksi beban listrik dan air Maret',
    lines: [
      line('l7-1', '5-3000', 2_500_000, 0, 'Tagihan listrik'),
      line('l7-2', '1-1100', 0, 2_500_000, 'Pembayaran tunai'),
    ],
    status: 'draft',
    createdBy: 'Dimas',
    createdAt: '2026-03-20T14:15:00Z',
  },
  {
    id: 'JNL-2026-03-008',
    transactionNumber: 'BKM-2026-03-0008',
    date: '2026-03-22',
    description: 'Penerimaan pendapatan lain (dibatalkan)',
    lines: [
      line('l8-1', '1-1100', 2_000_000, 0, 'Penerimaan lain'),
      line('l8-2', '4-1000', 0, 2_000_000, 'Pendapatan lain'),
    ],
    status: 'reversed',
    createdBy: 'Dimas',
    createdAt: '2026-03-22T08:00:00Z',
    postedAt: '2026-03-22T08:02:00Z',
    reversalOf: 'REV-BKM-2026-03-0008',
  },
]

// Tren Laba Rugi 6 bulan (PRD Ver 3 §8.1, dashboard)
export const mockTrend: TrendPoint[] = [
  { period: '2025-10', label: 'Okt', revenue: 118_000_000, expenses: 52_000_000, netIncome: 66_000_000 },
  { period: '2025-11', label: 'Nov', revenue: 122_000_000, expenses: 49_000_000, netIncome: 73_000_000 },
  { period: '2025-12', label: 'Des', revenue: 135_000_000, expenses: 60_000_000, netIncome: 75_000_000 },
  { period: '2026-01', label: 'Jan', revenue: 141_000_000, expenses: 58_000_000, netIncome: 83_000_000 },
  { period: '2026-02', label: 'Feb', revenue: 148_000_000, expenses: 61_000_000, netIncome: 87_000_000 },
  { period: '2026-03', label: 'Mar', revenue: 155_000_000, expenses: 62_000_000, netIncome: 93_000_000 },
]

export const periods = [
  { id: '2026-03', label: 'Maret 2026', isActive: true },
  { id: '2026-02', label: 'Februari 2026', isActive: false },
  { id: '2026-01', label: 'Januari 2026', isActive: false },
]

export const journalPrefixes = ['BKM', 'BKK', 'JKM', 'JKK', 'JV'] as const

export const accountTypeLabel: Record<Account['type'], string> = {
  asset: 'Aset',
  liability: 'Utang',
  equity: 'Modal',
  revenue: 'Pendapatan',
  expense: 'Beban',
}

// ---------------------------------------------------------------------------
// Metadata seed untuk migrasi persist (lihat src/store/persist.ts).
// NAIKKAN SEED_VERSION saat mock data berubah (tambah/hapus akun, ubah
// nominal, tambah jurnal seed) agar state lama dimigrasi — jurnal buatan
// pengguna tetap dipertahankan, tidak di-reset ke seed.
// ---------------------------------------------------------------------------
export const SEED_VERSION = 1
export const SEED_JOURNAL_IDS = mockJournals.map((j) => j.id)
export const SEED_ACCOUNT_IDS = mockAccounts.map((a) => a.id)
