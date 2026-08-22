-- ============================================================
-- Migration 002: Add is_header column to app.accounts
-- Appsheet Accounting Journal — PostgreSQL 16+
-- ============================================================
-- Kolom is_header menandakan akun grup (tidak bisa diinput jurnal).
-- Di-backfill otomatis: akun yang punya child = is_header = true.

-- 1. Tambah kolom is_header jika belum ada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'accounts' AND column_name = 'is_header'
  ) THEN
    ALTER TABLE app.accounts ADD COLUMN is_header BOOLEAN NOT NULL DEFAULT false;
    RAISE NOTICE 'Kolom is_header ditambahkan ke app.accounts';
  ELSE
    RAISE NOTICE 'Kolom is_header sudah ada — skip';
  END IF;
END $$;

-- 2. Backfill: akun yang punya child (parent_id指向 ke akun ini) = header
UPDATE app.accounts a
SET is_header = true
WHERE EXISTS (
  SELECT 1 FROM app.accounts c WHERE c.parent_id = a.id
);

-- 3. Index untuk quick lookup
CREATE INDEX IF NOT EXISTS idx_accounts_is_header ON app.accounts (entity_id, is_header);
