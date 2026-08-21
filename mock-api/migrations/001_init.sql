-- ============================================================
-- Migration 001: Initial Schema
-- Appsheet Accounting Journal — PostgreSQL 16+
-- Berdasarkan: Database Schema - Accounting.md
-- ============================================================

-- ===== Extensions =====
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- email case-insensitive

-- ===== Schema =====
CREATE SCHEMA IF NOT EXISTS app;

-- ===== Enums =====
CREATE TYPE app.account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
CREATE TYPE app.normal_balance AS ENUM ('debit', 'credit');
CREATE TYPE app.journal_status AS ENUM ('draft', 'posted', 'reversed', 'pending_approval');
CREATE TYPE app.user_role AS ENUM ('admin', 'accountant', 'viewer');
CREATE TYPE app.audit_action AS ENUM ('create', 'update', 'post', 'reverse', 'approve', 'reject', 'delete');
CREATE TYPE app.report_type AS ENUM ('balance-sheet', 'income-statement', 'cash-flow', 'trial-balance');

-- ============================================================
-- 1. MASTER & KEAMANAN
-- ============================================================

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

-- ===== Keanggotaan entitas + role =====
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
    refresh_token_hash TEXT NOT NULL UNIQUE,
    expires_at         TIMESTAMPTZ NOT NULL,
    revoked_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at       TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user ON app.sessions (user_id) WHERE revoked_at IS NULL;

-- ============================================================
-- 2. PERIODE FISKAL & CHART OF ACCOUNTS
-- ============================================================

-- ===== Periode fiskal =====
CREATE TABLE app.fiscal_periods (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id          UUID NOT NULL REFERENCES app.entities(id) ON DELETE CASCADE,
    name               TEXT NOT NULL,
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

-- Satu periode aktif per entitas
CREATE UNIQUE INDEX uq_one_active_period
    ON app.fiscal_periods (entity_id) WHERE is_active;

CREATE INDEX idx_fiscal_periods_entity
    ON app.fiscal_periods (entity_id, start_date);

-- ===== Chart of Accounts (hierarki tree) =====
CREATE TABLE app.accounts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id      UUID NOT NULL REFERENCES app.entities(id) ON DELETE CASCADE,
    code           TEXT NOT NULL CHECK (code ~ '^[0-9]+-[0-9]+$'),
    name           TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
    type           app.account_type NOT NULL,
    category       TEXT NOT NULL,
    normal_balance app.normal_balance NOT NULL,
    parent_id      UUID REFERENCES app.accounts(id) ON DELETE RESTRICT,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    description    TEXT,
    version        INT NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (entity_id, code)
);

CREATE INDEX idx_accounts_entity_tree ON app.accounts (entity_id, parent_id);
CREATE INDEX idx_accounts_entity_type ON app.accounts (entity_id, type);

-- ============================================================
-- 3. JURNAL, BARIS, LAMPIRAN, AUDIT
-- ============================================================

-- ===== Jurnal =====
CREATE TABLE app.journals (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id          UUID NOT NULL REFERENCES app.entities(id) ON DELETE CASCADE,
    period_id          UUID NOT NULL REFERENCES app.fiscal_periods(id),
    transaction_number TEXT NOT NULL,
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
    version            INT NOT NULL DEFAULT 0,
    UNIQUE (entity_id, transaction_number),
    CHECK (journal_date >= '2000-01-01')
);

CREATE INDEX idx_journals_entity_date  ON app.journals (entity_id, journal_date DESC);
CREATE INDEX idx_journals_entity_status ON app.journals (entity_id, status);
CREATE INDEX idx_journals_period       ON app.journals (period_id);

-- ===== Baris jurnal (= entri buku besar) =====
CREATE TABLE app.journal_lines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id  UUID NOT NULL REFERENCES app.journals(id) ON DELETE CASCADE,
    account_id  UUID NOT NULL REFERENCES app.accounts(id),
    debit       NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit      NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    description TEXT,
    CHECK ((debit > 0) <> (credit > 0)),
    CHECK (debit + credit > 0)
);

CREATE INDEX idx_journal_lines_journal ON app.journal_lines (journal_id);
CREATE INDEX idx_journal_lines_account ON app.journal_lines (account_id);

-- ===== Lampiran bukti =====
CREATE TABLE app.attachments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id  UUID NOT NULL REFERENCES app.journals(id) ON DELETE CASCADE,
    entity_id   UUID NOT NULL REFERENCES app.entities(id) ON DELETE CASCADE,
    file_name   TEXT NOT NULL,
    mime_type   TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf')),
    size_bytes  BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
    storage_key TEXT NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES app.users(id),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attachments_journal ON app.attachments (journal_id);

-- ===== Audit trail =====
CREATE TABLE app.audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    entity_id   UUID,
    journal_id  UUID,
    account_id  UUID,
    user_id     UUID,
    action      app.audit_action NOT NULL,
    changes     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_entity_time ON app.audit_logs (entity_id, created_at DESC);
CREATE INDEX idx_audit_journal     ON app.audit_logs (journal_id);

-- ============================================================
-- 4. SEQUENCE NOMOR BUKTI & LAPORAN
-- ============================================================

-- ===== Sequence nomor bukti (atomic, tanpa race condition) =====
CREATE TABLE app.journal_sequences (
    entity_id    UUID NOT NULL REFERENCES app.entities(id) ON DELETE CASCADE,
    period_id    UUID NOT NULL REFERENCES app.fiscal_periods(id) ON DELETE CASCADE,
    prefix       TEXT NOT NULL CHECK (prefix ~ '^[A-Z]{3}$'),
    last_number  INT NOT NULL DEFAULT 0 CHECK (last_number >= 0),
    PRIMARY KEY (entity_id, period_id, prefix)
);

-- ===== Laporan tersimpan (snapshot) =====
CREATE TABLE app.reports (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id    UUID NOT NULL REFERENCES app.entities(id) ON DELETE CASCADE,
    type         app.report_type NOT NULL,
    period_start DATE,
    period_end   DATE,
    as_of        DATE,
    data         JSONB NOT NULL,
    currency     CHAR(3) NOT NULL DEFAULT 'IDR',
    created_by   UUID REFERENCES app.users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_entity ON app.reports (entity_id, created_at DESC);

-- ===== Cash flow mapping =====
CREATE TABLE app.cash_flow_mapping (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id    UUID NOT NULL REFERENCES app.entities(id) ON DELETE CASCADE,
    category     TEXT NOT NULL,
    activity     TEXT NOT NULL CHECK (activity IN ('operating', 'investing', 'financing')),
    UNIQUE (entity_id, category)
);

-- ============================================================
-- 5. VIEWS — BUKU BESAR & LAPORAN
-- ============================================================

-- ===== Buku besar: saldo berjalan per akun =====
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

-- ===== Neraca lajur per periode =====
CREATE OR REPLACE VIEW app.v_trial_balance AS
SELECT
    j.entity_id,
    j.period_id,
    jl.account_id,
    a.code,
    a.name,
    a.type,
    a.normal_balance,
    sum(jl.debit)  AS debit,
    sum(jl.credit) AS credit
FROM app.journal_lines jl
JOIN app.journals j ON j.id = jl.journal_id
JOIN app.accounts a ON a.id = jl.account_id
WHERE j.status = 'posted'
GROUP BY j.entity_id, j.period_id, jl.account_id, a.code, a.name, a.type, a.normal_balance;

-- ===== Laba rugi per periode =====
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

-- ===== Neraca per tanggal =====
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

-- ===== Tren laba rugi bulanan =====
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

-- ============================================================
-- 6. FUNGSI & TRIGGER
-- ============================================================

-- ===== updated_at otomatis =====
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

-- ===== Helper: entity/user aktif dari session =====
CREATE OR REPLACE FUNCTION app.current_entity_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE AS
$$
    SELECT NULLIF(current_setting('app.entity_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE AS
$$
    SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

-- ===== Validasi balance jurnal =====
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

-- ===== Generate nomor bukti (atomic) =====
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

-- ===== Preview nomor bukti (tanpa increment) =====
CREATE OR REPLACE FUNCTION app.peek_transaction_number(
    p_entity_id UUID, p_period_id UUID, p_prefix TEXT
) RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT p_prefix || '-' ||
         to_char((SELECT start_date FROM app.fiscal_periods WHERE id = p_period_id), 'YYYY-MM') || '-' ||
         lpad((COALESCE(last_number, 0) + 1)::text, 4, '0')
  FROM app.journal_sequences
  WHERE entity_id = p_entity_id AND period_id = p_period_id AND prefix = p_prefix;
$$;

-- ===== Posting (draft → posted) =====
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

-- ===== Reverse (jurnal pembalik otomatis) =====
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

-- ===== Tutup periode =====
CREATE OR REPLACE FUNCTION app.close_period(p_period_id UUID, p_draft_action TEXT, p_user_id UUID)
    RETURNS app.fiscal_periods LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
    v_period   app.fiscal_periods;
    v_drafts   INT;
    r          RECORD;
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

-- ===== Permissions per role =====
CREATE OR REPLACE FUNCTION app.permissions_for_role(p_role app.user_role)
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_role
    WHEN 'admin'      THEN ARRAY['account.write','journal.write','journal.approve',
                                'report.read','period.manage','user.manage']
    WHEN 'accountant' THEN ARRAY['account.write','journal.write','journal.approve','report.read']
    ELSE                   ARRAY['report.read']
  END;
$$;

-- ===== Neraca per tanggal (parametrik) =====
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

-- ============================================================
-- 7. ROW-LEVEL SECURITY (Isolasi Multi-Tenant)
-- ============================================================

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

ALTER TABLE app.cash_flow_mapping ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cash_flow ON app.cash_flow_mapping
    USING (entity_id = app.current_entity_id())
    WITH CHECK (entity_id = app.current_entity_id());

ALTER TABLE app.entity_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_own ON app.entity_members
    USING (user_id = app.current_user_id() OR app.current_user_id() IN (
        SELECT m.user_id FROM app.entity_members m
        WHERE m.entity_id = entity_id AND m.role = 'admin'));

-- ============================================================
-- 8. SEED DATA — Demo
-- ============================================================

-- Entitas demo
INSERT INTO app.entities (id, name, currency, fiscal_month, fiscal_day)
VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'PT. Kreasi Inovasi Estetika', 'IDR', 1, 1);

-- User demo
INSERT INTO app.users (id, email, name, password_hash, is_active)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rina@estetikakreasi.co.id', 'Rina Wijaya', NULL, true),
  ('22222222-2222-2222-2222-222222222222', 'dimas@estetikakreasi.co.id', 'Dimas Prasetyo', NULL, true),
  ('33333333-3333-3333-3333-333333333333', 'budi@estetikakreasi.co.id', 'Budi Santoso', NULL, true);

-- Keanggotaan entitas
INSERT INTO app.entity_members (entity_id, user_id, role, is_default)
VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '11111111-1111-1111-1111-111111111111', 'admin', true),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '22222222-2222-2222-2222-222222222222', 'accountant', true),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '33333333-3333-3333-3333-333333333333', 'viewer', true);

-- Periode fiskal
INSERT INTO app.fiscal_periods (entity_id, name, month, year, start_date, end_date, is_open, is_active)
VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Januari 2026', 1, 2026, '2026-01-01', '2026-01-31', false, false),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Februari 2026', 2, 2026, '2026-02-01', '2026-02-28', false, false),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Maret 2026', 3, 2026, '2026-03-01', '2026-03-31', true, true);

-- Template COA PSAK UKM
INSERT INTO app.accounts (entity_id, code, name, type, category, normal_balance) VALUES
  -- Aset
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '1-1100', 'Kas', 'asset', 'Kas & Bank', 'debit'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '1-1200', 'Bank BCA', 'asset', 'Kas & Bank', 'debit'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '1-1300', 'Bank Mandiri', 'asset', 'Kas & Bank', 'debit'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '1-2100', 'Piutang Usaha', 'asset', 'Piutang', 'debit'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '1-2200', 'Piutang Pegawai', 'asset', 'Piutang', 'debit'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '1-3100', 'Persediaan Barang', 'asset', 'Persediaan', 'debit'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '1-4100', 'Peralatan Kantor', 'asset', 'Aktiva Tetap', 'debit'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '1-4200', 'Akumulasi Depresiasi Peralatan', 'asset', 'Aktiva Tetap', 'credit'),
  -- Utang
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '2-1100', 'Utang Usaha', 'liability', 'Utang Lancar', 'credit'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '2-1200', 'Utang Gaji', 'liability', 'Utang Lancar', 'credit'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '2-1300', 'Utang Pajak', 'liability', 'Utang Lancar', 'credit'),
  -- Modal
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '3-1100', 'Modal Disetor', 'equity', 'Modal', 'credit'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '3-1200', 'Laba Ditahan', 'equity', 'Modal', 'credit'),
  -- Pendapatan
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '4-1100', 'Pendapatan Jasa', 'revenue', 'Pendapatan', 'credit'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '4-1200', 'Pendapatan Produk', 'revenue', 'Pendapatan', 'credit'),
  -- Beban
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '5-1100', 'Beban Gaji', 'expense', 'Beban Operasional', 'debit'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '5-1200', 'Beban Sewa', 'expense', 'Beban Operasional', 'debit'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '5-1300', 'Beban Listrik & Air', 'expense', 'Beban Operasional', 'debit'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '5-1400', 'Beban Depresiasi', 'expense', 'Beban Operasional', 'debit');

-- Cash flow mapping
INSERT INTO app.cash_flow_mapping (entity_id, category, activity) VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Kas & Bank', 'operating'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Piutang', 'operating'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Persediaan', 'operating'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Utang Lancar', 'operating'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Aktiva Tetap', 'investing'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Modal', 'financing');

-- ============================================================
-- SETTINGS (key-value untuk persist config di PostgreSQL)
-- ============================================================

CREATE TABLE IF NOT EXISTS app.settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default dbConfig jika belum ada
INSERT INTO app.settings (key, value)
VALUES ('dbConfig', '{"storageMode":"postgresql","tables":{"accounts":"accounts","journals":"journals","journalLines":"journal_lines","periods":"periods","users":"users","entities":"entities","sessions":"sessions","attachments":"attachments"}}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- SELESAI
-- ============================================================
