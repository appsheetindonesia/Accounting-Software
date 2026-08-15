# Database Schema — Appsheet Accounting Journal
### PostgreSQL 16+ · Rancangan lengkap untuk semua modul PRD Ver 3 · Agustus 2026

---

## Dokumen Informasi

| Field | Nilai |
|-------|-------|
| **Produk** | Appsheet Accounting Journal |
| **Database** | PostgreSQL 16+ |
| **Schema** | `app` (domain terpisah dari `auth`/`public`) |
| **Sumber** | PRD Ver 3 (§9, §10, §14), API - Accounting.md |
| **Status** | Draft untuk review backend DBA |

---

## 1. Keputusan Desain (dengan alasan)

| # | Keputusan | Alasan |
|---|-----------|--------|
| D-1 | **Multi-tenant kolom** `entity_id` di tiap tabel data + **Row-Level Security** | Isolasi entitas (BR-14) dijamin di level database, bukan hanya aplikasi |
| D-2 | **Nominal = `NUMERIC(18,2)`**, bukan float/double | Akurasi akuntansi: tidak ada error pembulatan floating-point (BR-12) |
| D-3 | **Saldo bukan kolom**, melainkan diturunkan dari jurnal `posted` | BR-6 & BR-7: saldo hanya berubah lewat jurnal; view `v_general_ledger` sebagai sumber kebenaran |
| D-4 | **`journal_lines` = entri buku besar** | Setiap baris jurnal menyentuh satu akun; saldo berjalan dihitung via window function |
| D-5 | **UUID** untuk PK (bukan serial) | Aman dari enumerasi, cocok untuk sync/distributed |
| D-6 | **`citext` untuk email** | Unik case-insensitive tanpa lower() manual |
| D-7 | **Soft delete** (`is_active`/`deleted_at`) untuk akun & jurnal | Audit trail tetap utuh; akun ber-saldo hanya dinonaktifkan |
| D-8 | **Optimistic locking** via kolom `version` | Deteksi konflik edit (409 di API) |
| D-9 | **Nomor bukti via tabel sequence** `journal_sequences` | Atomic `INSERT ... ON CONFLICT` agar nomor unik & tanpa race condition |
| D-10 | **Validasi balance di trigger DEFERRABLE** | Debit = kredit dijamin di level DB untuk multi-row insert |
| D-11 | **Fungsi posting/reverse = `SECURITY DEFINER`** | Posting lintas tabel (jurnal + audit) tetap satu transaksi atomik |
| D-12 | **Laporan tersimpan** (`reports.data JSONB`) | Snapshot laporan saat generate; konsisten untuk export ulang |

---

## 2. ERD Ringkas

```
┌──────────────┐ 1      N ┌──────────────┐ 1      N ┌──────────────────┐
│   entities   │──────────│ fiscal_periods│──────────│    journals      │
│              │          │              │          │                  │
└──────────────┘          └──────────────┘          └────────┬─────────┘
       │ 1                        │ 1                       │ 1
       │                          │                         │ N
       │ N                        │ N                       ▼
┌──────────────┐            ┌──────────────┐          ┌──────────────────┐
│ entity_members│           │  accounts    │──────────│  journal_lines   │
│ (user+role)  │            │ (tree,parent)│ 1      N │ (debit/credit)   │
└──────────────┘            └──────────────┘          └────────┬─────────┘
       │ N                                                      │ N
       │                                                        1
┌──────────────┐                                       ┌──────────────┐
│    users     │◄──────────────────────────────────────│ attachments  │
└──────────────┘                                       └──────────────┘
       │ 1
       │ N
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   sessions   │     │  audit_logs  │     │   reports    │
└──────────────┘     └──────────────┘     └──────────────┘

Tabel pendukung: journal_sequences (nomor bukti), account_balances (denormalisasi opsional)
```

---

## 3. DDL — Extensions & Enum

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- email case-insensitive
-- opsional untuk pencarian fuzzy: CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS app;

-- ===== Enum =====
CREATE TYPE app.account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
CREATE TYPE app.normal_balance AS ENUM ('debit', 'credit');
CREATE TYPE app.journal_status AS ENUM ('draft', 'posted', 'reversed', 'pending_approval');
CREATE TYPE app.user_role AS ENUM ('admin', 'accountant', 'viewer');
CREATE TYPE app.audit_action AS ENUM ('create', 'update', 'post', 'reverse', 'approve', 'reject', 'delete');
CREATE TYPE app.report_type AS ENUM ('balance-sheet', 'income-statement', 'cash-flow', 'trial-balance');
```

---

## 4. DDL — Master & Keamanan

```sql
-- ===== Entitas (multi-tenant) =====
CREATE TABLE app.entities (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 200),
    currency         CHAR(3) NOT NULL DEFAULT 'IDR' CHECK (currency ~ '^[A-Z]{3}$'),
    fiscal_month     SMALLINT NOT NULL DEFAULT 1 CHECK (fiscal_month BETWEEN 1 AND 12),
    fiscal_day       SMALLINT NOT NULL DEFAULT 1 CHECK (fiscal_day BETWEEN 1 AND 31),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Pengguna =====
CREATE TABLE app.users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           CITEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
    password_hash   TEXT,                    -- NULL bila SSO
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at   TIMESTAMPTZ
);

-- ===== Keanggotaan entitas + role (P2 multi-user) =====
CREATE TABLE app.entity_members (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id     UUID NOT NULL REFERENCES app.entities(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    role          app.user_role NOT NULL DEFAULT 'viewer',
    is_default    BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (entity_id, user_id)
);

-- Satu default per user
CREATE UNIQUE INDEX uq_entity_members_one_default
    ON app.entity_members (user_id) WHERE is_default;

-- ===== Sesi / refresh token =====
CREATE TABLE app.sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL UNIQUE,   -- simpan hash, bukan token mentah
    expires_at         TIMESTAMPTZ NOT NULL,
    revoked_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at       TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user ON app.sessions (user_id) WHERE revoked_at IS NULL;
```

---

## 5. DDL — Periode Fiskal & Chart of Accounts

```sql
-- ===== Periode fiskal =====
CREATE TABLE app.fiscal_periods (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id          UUID NOT NULL REFERENCES app.entities(id) ON DELETE CASCADE,
    name               TEXT NOT NULL,             -- "Maret 2026"
    month              SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year               SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    start_date         DATE NOT NULL,
    end_date           DATE NOT NULL,
    is_open            BOOLEAN NOT NULL DEFAULT true,
    is_active          BOOLEAN NOT NULL DEFAULT false,
    previous_period_id UUID REFERENCES app.fiscal_periods(id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (entity_id, month, year),
    CHECK (end_date >= start_date)
);

-- Satu periode aktif per entitas (BR-13)
CREATE UNIQUE INDEX uq_one_active_period
    ON app.fiscal_periods (entity_id) WHERE is_active;

CREATE INDEX idx_fiscal_periods_entity
    ON app.fiscal_periods (entity_id, start_date);

-- ===== Chart of Accounts (hierarki tree) =====
CREATE TABLE app.accounts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id      UUID NOT NULL REFERENCES app.entities(id) ON DELETE CASCADE,
    code           TEXT NOT NULL CHECK (code ~ '^[0-9]+-[0-9]+$'),   -- "1-1100"
    name           TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
    type           app.account_type NOT NULL,
    category       TEXT NOT NULL,                 -- "Kas & Bank" (grup tampilan)
    normal_balance app.normal_balance NOT NULL,
    parent_id      UUID REFERENCES app.accounts(id) ON DELETE RESTRICT,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    description    TEXT,
    version        INT NOT NULL DEFAULT 0,        -- optimistic lock (D-8)
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (entity_id, code)
);

CREATE INDEX idx_accounts_entity_tree ON app.accounts (entity_id, parent_id);
CREATE INDEX idx_accounts_entity_type ON app.accounts (entity_id, type);
-- pencarian nama: CREATE INDEX idx_accounts_name_trgm ON app.accounts USING gin (name gin_trgm_ops);
```

---

## 6. DDL — Jurnal, Baris, Lampiran, Audit

```sql
-- ===== Jurnal =====
CREATE TABLE app.journals (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id          UUID NOT NULL REFERENCES app.entities(id) ON DELETE CASCADE,
    period_id          UUID NOT NULL REFERENCES app.fiscal_periods(id),
    transaction_number TEXT NOT NULL,             -- "BKM-2026-03-0001" (D-9)
    journal_date       DATE NOT NULL,
    description        TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
    status             app.journal_status NOT NULL DEFAULT 'draft',
    reversal_of_id     UUID REFERENCES app.journals(id),
    created_by         UUID NOT NULL REFERENCES app.users(id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    posted_at          TIMESTAMPTZ,
    posted_by          UUID REFERENCES app.users(id),
    approved_by        UUID REFERENCES app.users(id),
    approved_at        TIMESTAMPTZ,
    rejection_reason   TEXT,
    version            INT NOT NULL DEFAULT 0,    -- optimistic lock (D-8)
    UNIQUE (entity_id, transaction_number),       -- BR-5 unik per entitas
    CHECK (journal_date >= '2000-01-01')
);

CREATE INDEX idx_journals_entity_date  ON app.journals (entity_id, journal_date DESC);
CREATE INDEX idx_journals_entity_status ON app.journals (entity_id, status);
CREATE INDEX idx_journals_period       ON app.journals (period_id);

-- ===== Baris jurnal (= entri buku besar, D-4) =====
CREATE TABLE app.journal_lines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id  UUID NOT NULL REFERENCES app.journals(id) ON DELETE CASCADE,
    account_id  UUID NOT NULL REFERENCES app.accounts(id),
    debit       NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit      NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    description TEXT,
    -- BR-9: debit XOR credit per baris; tidak boleh baris kosong
    CHECK ((debit > 0) <> (credit > 0)),
    CHECK (debit + credit > 0)
);

CREATE INDEX idx_journal_lines_journal ON app.journal_lines (journal_id);
CREATE INDEX idx_journal_lines_account ON app.journal_lines (account_id);

-- ===== Lampiran bukti (P1) =====
CREATE TABLE app.attachments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id  UUID NOT NULL REFERENCES app.journals(id) ON DELETE CASCADE,
    entity_id   UUID NOT NULL REFERENCES app.entities(id) ON DELETE CASCADE,  -- untuk RLS
    file_name   TEXT NOT NULL,
    mime_type   TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf')),
    size_bytes  BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),  -- maks 5 MB
    storage_key TEXT NOT NULL,              -- kunci objek di S3/MinIO
    uploaded_by UUID NOT NULL REFERENCES app.users(id),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attachments_journal ON app.attachments (journal_id);

-- ===== Audit trail (BR-4) =====
CREATE TABLE app.audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    entity_id   UUID,
    journal_id  UUID,
    account_id  UUID,
    user_id     UUID,
    action      app.audit_action NOT NULL,
    changes     JSONB,                       -- { field: { from, to } } untuk update
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_entity_time ON app.audit_logs (entity_id, created_at DESC);
CREATE INDEX idx_audit_journal     ON app.audit_logs (journal_id);
```

---

## 7. DDL — Sequence Nomor Bukti & Laporan

```sql
-- ===== Sequence nomor bukti (D-9): atomic, tanpa race condition =====
CREATE TABLE app.journal_sequences (
    entity_id    UUID NOT NULL REFERENCES app.entities(id) ON DELETE CASCADE,
    period_id    UUID NOT NULL REFERENCES app.fiscal_periods(id) ON DELETE CASCADE,
    prefix       TEXT NOT NULL CHECK (prefix ~ '^[A-Z]{3}$'),   -- BKM/BKK/JKM/JKK/JV
    last_number  INT NOT NULL DEFAULT 0 CHECK (last_number >= 0),
    PRIMARY KEY (entity_id, period_id, prefix)
);

-- ===== Laporan tersimpan (D-12) =====
CREATE TABLE app.reports (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id    UUID NOT NULL REFERENCES app.entities(id) ON DELETE CASCADE,
    type         app.report_type NOT NULL,
    period_start DATE,
    period_end   DATE,
    as_of        DATE,                        -- khusus balance-sheet
    data         JSONB NOT NULL,              -- snapshot sections + subtotal
    currency     CHAR(3) NOT NULL DEFAULT 'IDR',
    created_by   UUID REFERENCES app.users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_entity ON app.reports (entity_id, created_at DESC);
```

---

## 8. Row-Level Security (Isolasi Multi-Tenant)

```sql
-- Helper: entity aktif dari session (di-set middleware per request)
CREATE OR REPLACE FUNCTION app.current_entity_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE AS
$$
    SELECT NULLIF(current_setting('app.entity_id', true), '')::uuid;
$$;

-- Helper: user aktif
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE AS
$$
    SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

-- Pola umum tiap tabel data (contoh: accounts)
ALTER TABLE app.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_accounts ON app.accounts
    USING (entity_id = app.current_entity_id())
    WITH CHECK (entity_id = app.current_entity_id());

ALTER TABLE app.fiscal_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_periods ON app.fiscal_periods
    USING (entity_id = app.current_entity_id())
    WITH CHECK (entity_id = app.current_entity_id());

ALTER TABLE app.journals ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_journals ON app.journals
    USING (entity_id = app.current_entity_id())
    WITH CHECK (entity_id = app.current_entity_id());

ALTER TABLE app.journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_lines ON app.journal_lines
    USING (EXISTS (SELECT 1 FROM app.journals j
                   WHERE j.id = journal_id AND j.entity_id = app.current_entity_id()));

ALTER TABLE app.attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_attachments ON app.attachments
    USING (entity_id = app.current_entity_id())
    WITH CHECK (entity_id = app.current_entity_id());

ALTER TABLE app.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_audit ON app.audit_logs
    USING (entity_id = app.current_entity_id());

ALTER TABLE app.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_reports ON app.reports
    USING (entity_id = app.current_entity_id())
    WITH CHECK (entity_id = app.current_entity_id());

-- Users/sessions: aman via membership (bukan RLS tenant)
ALTER TABLE app.entity_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_own ON app.entity_members
    USING (user_id = app.current_user_id() OR app.current_user_id() IN (
        SELECT m.user_id FROM app.entity_members m
        WHERE m.entity_id = entity_id AND m.role = 'admin'));

-- Catatan: role check (viewer read-only) dilakukan di lapisan aplikasi
-- + policy terpisah bila perlu: viewer hanya SELECT, admin SELECT/INSERT/UPDATE/DELETE.
```

---

## 9. Fungsi & Trigger

```sql
-- ===== 9.1 updated_at otomatis =====
CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_accounts_touch BEFORE UPDATE ON app.accounts
    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_journals_touch BEFORE UPDATE ON app.journals
    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_periods_touch BEFORE UPDATE ON app.fiscal_periods
    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_entities_touch BEFORE UPDATE ON app.entities
    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ===== 9.2 Validasi balance jurnal (BR-1) =====
-- Dipanggil trigger DEFERRABLE di akhir statement, aman untuk multi-row insert.
CREATE OR REPLACE FUNCTION app.validate_journal_balance_for(p_journal_id uuid)
    RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_debit     NUMERIC(18,2);
    v_credit    NUMERIC(18,2);
    v_has_debit boolean;
    v_has_credit boolean;
BEGIN
    SELECT COALESCE(sum(debit), 0), COALESCE(sum(credit), 0),
           bool_or(debit > 0), bool_or(credit > 0)
      INTO v_debit, v_credit, v_has_debit, v_has_credit
      FROM app.journal_lines WHERE journal_id = p_journal_id;

    IF NOT (v_has_debit AND v_has_credit) THEN
        RAISE EXCEPTION 'JOURNAL_NO_LINES: minimal 1 debit dan 1 kredit (journal %)', p_journal_id
            USING ERRCODE = 'P0001';
    END IF;
    IF v_debit <> v_credit THEN
        RAISE EXCEPTION 'JOURNAL_UNBALANCED: debit % != kredit % (journal %)', v_debit, v_credit, p_journal_id
            USING ERRCODE = 'P0001';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_validate_balance() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    PERFORM app.validate_journal_balance_for(COALESCE(NEW.journal_id, OLD.journal_id));
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE CONSTRAINT TRIGGER trg_journal_balance
    AFTER INSERT OR UPDATE OR DELETE ON app.journal_lines
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION app.trg_validate_balance();

-- ===== 9.3 Generate nomor bukti (BR-5, D-9) =====
CREATE OR REPLACE FUNCTION app.generate_transaction_number(
    p_entity_id UUID, p_period_id UUID, p_prefix TEXT
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_next    INT;
    v_period  TEXT;
BEGIN
    INSERT INTO app.journal_sequences (entity_id, period_id, prefix, last_number)
    VALUES (p_entity_id, p_period_id, p_prefix, 1)
    ON CONFLICT (entity_id, period_id, prefix)
    DO UPDATE SET last_number = app.journal_sequences.last_number + 1
    RETURNING last_number INTO v_next;

    SELECT to_char(start_date, 'YYYY-MM') INTO v_period
      FROM app.fiscal_periods WHERE id = p_period_id;

    RETURN p_prefix || '-' || v_period || '-' || lpad(v_next::text, 4, '0');
END;
$$;

-- ===== 9.4 Posting (draft → posted, BR-3/BR-6) =====
-- SECURITY DEFINER: melewati RLS, tapi memvalidasi entity_id secara eksplisit.
CREATE OR REPLACE FUNCTION app.post_journal(p_journal_id UUID, p_user_id UUID)
    RETURNS app.journals LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
    v_journal app.journals;
    v_open    boolean;
BEGIN
    SELECT * INTO v_journal FROM app.journals WHERE id = p_journal_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'JOURNAL_NOT_FOUND'; END IF;

    IF v_journal.status NOT IN ('draft', 'pending_approval') THEN
        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: status %', v_journal.status;
    END IF;

    SELECT is_open INTO v_open FROM app.fiscal_periods WHERE id = v_journal.period_id;
    IF NOT v_open THEN
        RAISE EXCEPTION 'PERIOD_CLOSED: periode % ditutup', v_journal.period_id;
    END IF;

    PERFORM app.validate_journal_balance_for(p_journal_id);

    UPDATE app.journals
       SET status = 'posted', posted_at = now(), posted_by = p_user_id, updated_at = now(),
           version = version + 1
     WHERE id = p_journal_id
     RETURNING * INTO v_journal;

    INSERT INTO app.audit_logs (entity_id, journal_id, user_id, action)
    VALUES (v_journal.entity_id, p_journal_id, p_user_id, 'post');

    RETURN v_journal;
END;
$$;

-- ===== 9.5 Reverse (BR-11): buat jurnal pembalik otomatis =====
CREATE OR REPLACE FUNCTION app.reverse_journal(p_journal_id UUID, p_user_id UUID, p_reason TEXT)
    RETURNS app.journals LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
    v_original app.journals;
    v_period   app.fiscal_periods;
    v_reversal app.journals;
    v_number   TEXT;
BEGIN
    SELECT * INTO v_original FROM app.journals WHERE id = p_journal_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'JOURNAL_NOT_FOUND'; END IF;
    IF v_original.status <> 'posted' THEN
        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: hanya posted yang bisa di-reverse';
    END IF;
    IF v_original.reversal_of_id IS NOT NULL THEN
        RAISE EXCEPTION 'ALREADY_REVERSED';
    END IF;

    SELECT * INTO v_period FROM app.fiscal_periods WHERE id = v_original.period_id;
    IF NOT v_period.is_open THEN
        RAISE EXCEPTION 'PERIOD_CLOSED';
    END IF;

    v_number := app.generate_transaction_number(v_original.entity_id,
                                                v_original.period_id,
                                                'REV');

    INSERT INTO app.journals (entity_id, period_id, transaction_number, journal_date,
                              description, status, reversal_of_id, created_by,
                              created_at, posted_at, posted_by)
    VALUES (v_original.entity_id, v_original.period_id, v_number, CURRENT_DATE,
            'Pembalikan: ' || v_original.description, 'posted',
            v_original.id, p_user_id, now(), now(), p_user_id)
    RETURNING * INTO v_reversal;

    INSERT INTO app.journal_lines (journal_id, account_id, debit, credit, description)
    SELECT v_reversal.id, account_id, credit, debit, 'Pembalikan otomatis'
      FROM app.journal_lines WHERE journal_id = p_journal_id;

    UPDATE app.journals
       SET status = 'reversed', updated_at = now(), version = version + 1
     WHERE id = p_journal_id;

    INSERT INTO app.audit_logs (entity_id, journal_id, user_id, action, changes)
    VALUES (v_original.entity_id, p_journal_id, p_user_id, 'reverse',
            jsonb_build_object('reason', p_reason, 'reversal_id', v_reversal.id));

    RETURN v_reversal;
END;
$$;

-- ===== 9.6 Tutup periode (BR-3): blokir entri baru =====
CREATE OR REPLACE FUNCTION app.close_period(p_period_id UUID, p_draft_action TEXT, p_user_id UUID)
    RETURNS app.fiscal_periods LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
    v_period   app.fiscal_periods;
    v_drafts   INT;
BEGIN
    SELECT * INTO v_period FROM app.fiscal_periods WHERE id = p_period_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PERIOD_NOT_FOUND'; END IF;

    SELECT count(*) INTO v_drafts FROM app.journals
     WHERE period_id = p_period_id AND status = 'draft';

    IF v_drafts > 0 AND p_draft_action IS NULL THEN
        RAISE EXCEPTION 'DRAFT_ACTION_REQUIRED: masih ada % jurnal draft', v_drafts;
    END IF;

    IF p_draft_action = 'post-all' THEN
        FOR r IN SELECT id FROM app.journals WHERE period_id = p_period_id AND status = 'draft'
        LOOP
            PERFORM app.post_journal(r.id, p_user_id);
        END LOOP;
    ELSIF p_draft_action = 'delete-all' THEN
        DELETE FROM app.journals WHERE period_id = p_period_id AND status = 'draft';
    END IF;

    UPDATE app.fiscal_periods SET is_open = false, updated_at = now()
     WHERE id = p_period_id RETURNING * INTO v_period;

    RETURN v_period;
END;
$$;
```

---

## 10. View — Buku Besar & Laporan (Sumber Kebenaran)

```sql
-- ===== 10.1 Buku besar: saldo berjalan per akun (D-3, D-4) =====
CREATE OR REPLACE VIEW app.v_general_ledger AS
SELECT
    a.entity_id,
    jl.account_id,
    a.code          AS account_code,
    a.name          AS account_name,
    j.id            AS journal_id,
    j.transaction_number,
    j.journal_date,
    jl.description,
    jl.debit,
    jl.credit,
    sum(CASE WHEN a.normal_balance = 'debit'
             THEN jl.debit - jl.credit
             ELSE jl.credit - jl.debit END)
        OVER (PARTITION BY jl.account_id
              ORDER BY j.journal_date, j.created_at, jl.id
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance
FROM app.journal_lines jl
JOIN app.journals j ON j.id = jl.journal_id
JOIN app.accounts a ON a.id = jl.account_id
WHERE j.status = 'posted';

-- ===== 10.2 Neraca lajur per periode =====
CREATE OR REPLACE VIEW app.v_trial_balance AS
SELECT
    j.entity_id,
    j.period_id,
    jl.account_id,
    a.code,
    a.name,
    sum(jl.debit)  AS debit,
    sum(jl.credit) AS credit
FROM app.journal_lines jl
JOIN app.journals j ON j.id = jl.journal_id
JOIN app.accounts a ON a.id = jl.account_id
WHERE j.status = 'posted'
GROUP BY j.entity_id, j.period_id, jl.account_id, a.code, a.name;

-- ===== 10.3 Laba rugi per periode (aktivitas periode berjalan) =====
CREATE OR REPLACE VIEW app.v_income_statement AS
SELECT
    entity_id,
    period_id,
    account_id,
    code,
    name,
    type,
    CASE WHEN type IN ('revenue') THEN COALESCE(credit - debit, 0) ELSE 0 END AS revenue_amount,
    CASE WHEN type IN ('expense') THEN COALESCE(debit - credit, 0) ELSE 0 END AS expense_amount
FROM app.v_trial_balance
WHERE type IN ('revenue', 'expense');

-- ===== 10.4 Neraca per tanggal (saldo kumulatif s.d. tanggal) =====
CREATE OR REPLACE VIEW app.v_balance_sheet AS
SELECT
    a.entity_id,
    a.id       AS account_id,
    a.code,
    a.name,
    a.type,
    a.category,
    sum(CASE WHEN a.normal_balance = 'debit'
             THEN jl.debit - jl.credit
             ELSE jl.credit - jl.debit END) AS balance
FROM app.accounts a
LEFT JOIN app.journal_lines jl
       ON jl.account_id = a.id
LEFT JOIN app.journals j
       ON j.id = jl.journal_id AND j.status = 'posted' AND j.journal_date <= CURRENT_DATE
WHERE a.type IN ('asset', 'liability', 'equity')
GROUP BY a.entity_id, a.id, a.code, a.name, a.type, a.category;

-- ===== 10.5 Arus kas (metode tidak langsung, P2) =====
-- Basis: laba bersih + penyesuaian non-kas + perubahan modal kerja.
-- Implementasi penuh memakai mapping akun → aktivitas (tabel app.cash_flow_mapping).
CREATE TABLE app.cash_flow_mapping (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id    UUID NOT NULL REFERENCES app.entities(id) ON DELETE CASCADE,
    category     TEXT NOT NULL,          -- grup akun dari accounts.category
    activity     TEXT NOT NULL CHECK (activity IN ('operating', 'investing', 'financing')),
    UNIQUE (entity_id, category)
);
```

---

## 11. Indeks — Ringkasan

| Tabel | Indeks | Tujuan |
|-------|--------|--------|
| `journals` | `(entity_id, journal_date DESC)` | Daftar jurnal per periode (paling sering diakses) |
| `journals` | `(entity_id, status)` | Filter status (draft/posted) |
| `journals` | `(period_id)` | Agregasi laporan per periode |
| `journals` | UNIQUE `(entity_id, transaction_number)` | BR-5: nomor unik |
| `journal_lines` | `(journal_id)` | Detail jurnal + FK cascade |
| `journal_lines` | `(account_id)` | Buku besar per akun |
| `accounts` | UNIQUE `(entity_id, code)` | Kode akun unik per entitas |
| `accounts` | `(entity_id, parent_id)` | Tree COA |
| `accounts` | `(entity_id, type)` | Filter tipe (laporan) |
| `fiscal_periods` | UNIQUE `(entity_id)` WHERE is_active | BR-13 satu periode aktif |
| `fiscal_periods` | `(entity_id, start_date)` | Pencarian periode |
| `audit_logs` | `(entity_id, created_at DESC)` | Audit trail |
| `sessions` | UNIQUE `refresh_token_hash` | Refresh token cepat |
| `journal_sequences` | PK `(entity_id, period_id, prefix)` | Nomor bukti atomik |

**Catatan performa:**
- Laporan dengan data besar: gunakan `MATERIALIZED VIEW` untuk `v_trial_balance` + refresh terjadwal/trigger, atau query windowing langsung (cukup untuk < 100rb baris)
- Pencarian teks: aktifkan `pg_trgm` (GIN) pada `accounts.name` & `journals.description` bila perlu
- Partisi `journals` per tahun (`PARTITION BY RANGE (journal_date)`) untuk skala 1 juta+ baris — post-MVP

---

## 12. Catatan Migrasi & Operasional

1. **Versi migrasi**: gunakan tooling migrasi (Flyway/Liquibase/`node-pg-migrate`); setiap file DDL diberi nomor urut (`001_init.sql`, `002_...`)
2. **Order pembuatan**: extensions → schema → enum → tabel master (entities/users) → tabel data → views → fungsi/trigger → RLS (aktifkan RLS di akhir, setelah data seed)
3. **Seed awal**: 1 entitas demo "PT Maju Jaya", 1 admin user, periode Januari–Maret 2026, template COA PSAK UKM (40+ akun)
4. **RLS aktif per koneksi**: middleware API memanggil `SELECT set_config('app.entity_id', $1, true)` dan `set_config('app.user_id', $2, true)` per request (true = hanya transaksi ini)
5. **Pencadangan**: PITR (point-in-time recovery) + retensi 30 hari; backup tiap 6 jam
6. **Constraint pelengkap (aplikasi)**: Zod schema di client/server menduplikasi validasi DB — DB sebagai lapisan terakhir, bukan satu-satunya
7. **Timestamps**: semua `TIMESTAMPTZ` (UTC di DB); zona waktu `Asia/Jakarta` dihandle lapisan presentasi
8. **Enkripsi**: data at-rest AES-256 (disk/PG data dir), TLS 1.3 in-transit

---

## 13. Mapping Modul → Tabel

| Modul (PRD §8) | Tabel Utama | Endpoint (API) |
|----------------|-------------|----------------|
| Dashboard | `accounts` + `v_balance_sheet`, `v_income_statement`, `journals` | `/dashboard/*` |
| Chart of Accounts | `accounts` | `/accounts` |
| Jurnal | `journals`, `journal_lines`, `attachments`, `journal_sequences`, `audit_logs` | `/journals` |
| Buku Besar | `v_general_ledger` | `/ledger/accounts/{id}` |
| Neraca Lajur | `v_trial_balance` | `/reports/trial-balance` |
| Laba Rugi | `v_income_statement` | `/reports/income-statement` |
| Neraca | `v_balance_sheet` | `/reports/balance-sheet` |
| Arus Kas | `cash_flow_mapping` + kueri arus kas | `/reports/cash-flow` |
| Periode Fiskal | `fiscal_periods` + `fn_close_period` | `/periods` |
| Multi-entitas & Role | `entities`, `entity_members`, `users`, `sessions` | `/entities`, `/users` |
| Export | `reports` (snapshot) | `/exports/*` |

---

---

## 14. Implementasi Endpoint API → SQL

Matriks berikut memetakan **setiap endpoint** di `API - Accounting.md` ke objek database (tabel/view/fungsi) yang mendukungnya.

| Endpoint | Method | Objek DB | SQL/Catatan kunci |
|----------|--------|----------|-------------------|
| `/auth/login` | POST | `users` | `SELECT * FROM users WHERE email = $1 AND is_active` + verifikasi hash; insert `sessions` |
| `/auth/refresh` | POST | `sessions` | Update `last_used_at`, cek `expires_at > now() AND revoked_at IS NULL` |
| `/auth/logout` | POST | `sessions` | `UPDATE sessions SET revoked_at = now()` |
| `/auth/me` | GET | `users`, `entity_members`, `permissions_for_role()` | Lihat §17 |
| `/auth/change-password` | POST | `users` | Update `password_hash`, revoke sessions lama |
| `/users` | GET/POST | `users` + `entity_members` | RLS admin via policy `member_own`; validasi role |
| `/entities` | GET/POST | `entities` | `SELECT * FROM entities` (via membership, bukan RLS tenant) |
| `/accounts` | GET | `accounts` + CTE rekursif | Tree: `WITH RECURSIVE` atas `parent_id`; filter `is_active`, `type`, `keyword` |
| `/accounts` | POST | `accounts` | `INSERT`; duplikat → `unique_violation` → 409 `ACCOUNT_CODE_EXISTS` |
| `/accounts/{id}` | PUT/DELETE | `accounts` | Guard sub-akun aktif & saldo di lapisan aplikasi; soft delete `is_active=false` |
| `/accounts/template` | POST | `accounts` + tabel `account_templates` (seed) | Insert massal dalam 1 transaksi |
| `/accounts/import` | POST | `accounts` | Validasi per baris; gagal → baris ditolak, sisanya masuk |
| `/journals` | GET | `journals` + `journal_lines` + agregat window | Filter `period_id/status/keyword`, pagination, `sum(...) OVER ()` untuk totals |
| `/journals` | POST | `generate_transaction_number()` + `journals` + `journal_lines` | Nomor di-generate di DB (BR-5); balance dijamin trigger DEFERRABLE |
| `/journals/{id}` | GET | `journals` + `journal_lines` + `audit_logs` + `attachments` | Join detail lengkap |
| `/journals/{id}` | PUT/DELETE | `journals` | Hanya `status='draft'`; guard `version` (If-Match) → 409 `DATA_CONFLICT` |
| `/journals/{id}/post` | POST | `app.post_journal()` | Validasi balance + periode terbuka + status |
| `/journals/{id}/reverse` | POST | `app.reverse_journal()` | Buat jurnal pembalik + update status |
| `/journals/{id}/submit` | POST | `journals` | `status='pending_approval'` + audit `create` |
| `/journals/{id}/approve` | POST | `journals` | `status='posted'` + `approved_by/at` (wajib role accountant/admin) |
| `/journals/{id}/reject` | POST | `journals` | Kembali `draft` + `rejection_reason` |
| `/journals/{id}/attachments` | POST | `attachments` | Insert + validasi ukuran/tipe via CHECK |
| `/journals/next-number` | GET | `peek_transaction_number()` | §15.2, tanpa increment (preview) |
| `/ledger/accounts/{id}` | GET | `v_general_ledger` | Filter `account_id + period`; running balance sudah ada di view |
| `/ledger` | GET | `v_general_ledger` (agregat) | Group by account + periode |
| `/reports/trial-balance` | GET | `v_trial_balance` | Filter `period_id` |
| `/reports/income-statement` | GET | `v_income_statement` | Filter `period_id`; `compareTo` → dua kueri + banding |
| `/reports/balance-sheet` | GET | `app.balance_sheet(p_as_of)` | §15.1 |
| `/reports/cash-flow` | GET | `cash_flow_mapping` + kueri arus kas | Mapping kategori → aktivitas |
| `/reports/{id}` | GET | `reports` | `data` JSONB snapshot |
| `/periods` | GET/POST | `fiscal_periods` | Unique `(entity_id, month, year)` |
| `/periods/{id}/close` | PATCH | `app.close_period()` | `DRAFT_ACTION_REQUIRED` bila ada draft |
| `/periods/current` | GET | `fiscal_periods WHERE is_active` | Partial unique index §5 |
| `/dashboard/summary` | GET | `app.dashboard_summary()` | §15.3 |
| `/dashboard/trend` | GET | `v_dashboard_trend` | §15.4 |
| `/dashboard/recent-journals` | GET | `journals` | `ORDER BY journal_date DESC LIMIT 5` |
| `/dashboard/alerts` | GET | `journals` + `fiscal_periods` | Query draft & periode belum ditutup (§15.5) |
| `/search` | GET | GIN pg_trgm | §16 |
| `/exports/*` | GET | `reports` + view terkait | Generate snapshot ke `reports` lalu stream file |

---

## 15. Query & Fungsi Tambahan untuk Endpoint Tertentu

### 15.1 Neraca per tanggal (parametrik, untuk `/reports/balance-sheet?asOf=`)

```sql
CREATE OR REPLACE FUNCTION app.balance_sheet(p_entity_id UUID, p_as_of DATE)
RETURNS TABLE (account_id UUID, code TEXT, name TEXT, type app.account_type,
               category TEXT, balance NUMERIC)
LANGUAGE sql STABLE AS $$
  SELECT a.id, a.code, a.name, a.type, a.category,
         sum(CASE WHEN a.normal_balance = 'debit' THEN jl.debit - jl.credit
                  ELSE jl.credit - jl.debit END)
  FROM app.accounts a
  LEFT JOIN app.journal_lines jl ON jl.account_id = a.id
  LEFT JOIN app.journals j ON j.id = jl.journal_id
                          AND j.status = 'posted' AND j.journal_date <= p_as_of
  WHERE a.entity_id = p_entity_id AND a.type IN ('asset', 'liability', 'equity')
  GROUP BY a.id, a.code, a.name, a.type, a.category;
$$;
-- SELECT * FROM app.balance_sheet(:entity, '2026-03-31');
```

### 15.2 Preview nomor bukti (untuk `/journals/next-number`)

```sql
-- Sama seperti generate_transaction_number, TANPA increment (STABLE).
CREATE OR REPLACE FUNCTION app.peek_transaction_number(
    p_entity_id UUID, p_period_id UUID, p_prefix TEXT
) RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT p_prefix || '-' ||
         to_char((SELECT start_date FROM app.fiscal_periods WHERE id = p_period_id), 'YYYY-MM') || '-' ||
         lpad((COALESCE(last_number, 0) + 1)::text, 4, '0')
  FROM app.journal_sequences
  WHERE entity_id = p_entity_id AND period_id = p_period_id AND prefix = p_prefix;
$$;
-- POST /journals memakai generate_transaction_number (increment atomic) sebagai kebenaran.
```

### 15.3 Ringkasan dashboard (`/dashboard/summary`)

```sql
-- Aset/Utang/Modal: kumulatif per tanggal akhir periode (neraca).
-- Laba Bruto: aktivitas periode berjalan (laba rugi).
SELECT
  (SELECT COALESCE(sum(balance), 0) FROM app.balance_sheet(:entity, :period_end)
    WHERE type = 'asset')     AS total_assets,
  (SELECT COALESCE(sum(balance), 0) FROM app.balance_sheet(:entity, :period_end)
    WHERE type = 'liability') AS total_liabilities,
  (SELECT COALESCE(sum(balance), 0) FROM app.balance_sheet(:entity, :period_end)
    WHERE type = 'equity')    AS total_equity,
  (SELECT COALESCE(sum(credit - debit), 0) FROM app.v_trial_balance
    WHERE period_id = :period AND type = 'revenue')
  - (SELECT COALESCE(sum(debit - credit), 0) FROM app.v_trial_balance
    WHERE period_id = :period AND type = 'expense') AS gross_profit;
-- Delta % vs periode sebelumnya: jalankan query sama untuk period_id sebelumnya, hitung di aplikasi.
```

### 15.4 Tren laba rugi bulanan (`/dashboard/trend`)

```sql
CREATE OR REPLACE VIEW app.v_dashboard_trend AS
SELECT
    j.entity_id,
    date_trunc('month', j.journal_date) AS month,
    sum(CASE WHEN a.type = 'revenue' THEN jl.credit - jl.debit ELSE 0 END) AS revenue,
    sum(CASE WHEN a.type = 'expense' THEN jl.debit - jl.credit ELSE 0 END) AS expenses
FROM app.journals j
JOIN app.journal_lines jl ON jl.journal_id = j.id
JOIN app.accounts a ON a.id = jl.account_id
WHERE j.status = 'posted'
GROUP BY j.entity_id, date_trunc('month', j.journal_date);
-- net_income = revenue - expenses (dihitung di aplikasi/query).
```

### 15.5 Peringatan (`/dashboard/alerts`)

```sql
-- Jurnal draft belum diposting
SELECT count(*) FROM app.journals
 WHERE entity_id = :entity AND period_id = :period AND status = 'draft';

-- Periode sebelumnya belum ditutup (end_date < hari ini DAN masih terbuka)
SELECT name FROM app.fiscal_periods
 WHERE entity_id = :entity AND end_date < CURRENT_DATE AND is_open
 ORDER BY end_date DESC LIMIT 3;

-- Jurnal draft tidak balance (validasi defensif)
SELECT j.id, j.transaction_number
FROM app.journals j
JOIN (SELECT journal_id, sum(debit) d, sum(credit) c
      FROM app.journal_lines GROUP BY journal_id) t ON t.journal_id = j.id
WHERE j.status = 'draft' AND t.d <> t.c;
```

---

## 16. Pencarian Global (`/search`) — pg_trgm

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_accounts_name_trgm
    ON app.accounts USING gin (name gin_trgm_ops);
CREATE INDEX idx_journals_desc_trgm
    ON app.journals USING gin (description gin_trgm_ops);
CREATE INDEX idx_journals_number_trgm
    ON app.journals USING gin (transaction_number gin_trgm_ops);

-- Query contoh (RLS otomatis membatasi ke entitas aktif)
SELECT 'journal' AS type, id, transaction_number AS title, description AS subtitle
  FROM app.journals
 WHERE transaction_number ILIKE '%' || :q || '%'
    OR description ILIKE '%' || :q || '%'
 UNION ALL
SELECT 'account', id, code, name
  FROM app.accounts
 WHERE code ILIKE '%' || :q || '%' OR name ILIKE '%' || :q || '%'
 ORDER BY type, title
 LIMIT 10;
-- Alternatif ranking: similarity(name, :q) > 0.2 ORDER BY similarity DESC.
```

---

## 17. Permission `/auth/me` (role → izin)

```sql
CREATE OR REPLACE FUNCTION app.permissions_for_role(p_role app.user_role)
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_role
    WHEN 'admin'      THEN ARRAY['account.write','journal.write','journal.approve',
                                'report.read','period.manage','user.manage']
    WHEN 'accountant' THEN ARRAY['account.write','journal.write','journal.approve','report.read']
    ELSE                   ARRAY['report.read']
  END;
$$;

-- Query /auth/me:
SELECT u.id, u.name, u.email, m.role,
       app.permissions_for_role(m.role) AS permissions,
       (SELECT id || '|' || name FROM app.fiscal_periods
         WHERE entity_id = m.entity_id AND is_active) AS active_period
FROM app.users u
JOIN app.entity_members m ON m.user_id = u.id AND m.is_default
WHERE u.id = app.current_user_id();
```

**Enforcement:** role viewer (read-only) ditambah policy SELECT-only di aplikasi; fungsi tulis (`post_journal`, `reverse_journal`, `close_period`) menerima `p_user_id` dan menolak jika role viewer di lapisan service layer.

---

## 18. Mapping Error API ↔ Exception Database

API mengembalikan kode error dari TRD; DB melemparkan exception yang dipetakan service layer ke HTTP:

| Kode API (HTTP) | Exception DB / Kondisi | Lokasi |
|-----------------|------------------------|--------|
| `VALIDATION_ERROR` (422) | CHECK constraint / NOT NULL violation (`23514`, `23502`) | Berbagai tabel |
| `ACCOUNT_CODE_EXISTS` (409) | `unique_violation` (23505) pada `(entity_id, code)` | `accounts` |
| `TRANSACTION_NUMBER_DUPLICATE` (409) | `unique_violation` (23505) pada `(entity_id, transaction_number)` | `journals` |
| `JOURNAL_UNBALANCED` (422) | `RAISE EXCEPTION 'JOURNAL_UNBALANCED...'` | `validate_journal_balance_for` |
| `JOURNAL_NO_LINES` (422) | `RAISE EXCEPTION 'JOURNAL_NO_LINES...'` | `validate_journal_balance_for` |
| `LINE_NEGATIVE_AMOUNT` (422) | CHECK `debit >= 0 AND credit >= 0` (23514) | `journal_lines` |
| `JOURNAL_ALREADY_POSTED` (409) | `INVALID_STATUS_TRANSITION` | `post_journal` |
| `ALREADY_REVERSED` (409) | `RAISE EXCEPTION 'ALREADY_REVERSED'` | `reverse_journal` |
| `PERIOD_CLOSED` (422) | `RAISE EXCEPTION 'PERIOD_CLOSED'` | `post_journal`, `reverse_journal` |
| `PERIOD_ALREADY_CLOSED` (409) | `RAISE EXCEPTION` saat `is_open = false` | `close_period` |
| `PERIOD_EXISTS` (409) | `unique_violation` (23505) pada `(entity_id, month, year)` | `fiscal_periods` |
| `DRAFT_ACTION_REQUIRED` (422) | `RAISE EXCEPTION 'DRAFT_ACTION_REQUIRED'` | `close_period` |
| `DATA_CONFLICT` (409) | UPDATE 0 baris karena `version` mismatch (If-Match) | `journals`, `accounts` |
| `ACCOUNT_HAS_CHILDREN` (409) | Guard aplikasi (subquery `parent_id`) | Service layer |
| `ACCOUNT_HAS_BALANCE` (409) | Guard aplikasi (cek saldo ≠ 0) | Service layer |
| `NOT_FOUND` (404) | `SELECT ... FOR UPDATE` 0 baris | Semua fungsi |
| `FILE_TOO_LARGE` / `UNSUPPORTED_FILE_TYPE` (422) | CHECK `size_bytes <= 5242880` / `mime_type IN (...)` | `attachments` |

**Pola implementasi di service layer:**
```sql
BEGIN
    PERFORM app.post_journal(:id, :user);
EXCEPTION
    WHEN raise_exception THEN
        -- baca SQLERRM, map ke kode API (JOURNAL_UNBALANCED, PERIOD_CLOSED, dll)
        RETURN jsonb_build_object('error', SQLERRM);
    WHEN unique_violation THEN
        -- map ke 409 sesuai constraint yang dilanggar
END;
```

---

*Skema ini mengimplementasikan aturan bisnis BR-1 s/d BR-14 (PRD Ver 3 §10), API contract (`API - Accounting.md`) endpoint-per-endpoint, strategi error (409/422), dan NFR keamanan (RLS, enkripsi, audit). Siap direview tim backend DBA sebelum migrasi pertama.*
