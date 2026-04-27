-- First-class voucher catalog (soft-archive via is_active). Snapshots in pending_orders / sales_invoices
-- still store JSON only; used-reference checks scan JSON for matching codes.
CREATE TABLE IF NOT EXISTS vouchers (
    id              BIGSERIAL      PRIMARY KEY,
    code            VARCHAR(100)   NOT NULL,
    rule_summary    VARCHAR(500)   NULL,
    is_active       BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vouchers_code_lower ON vouchers (LOWER(code));
CREATE INDEX IF NOT EXISTS idx_vouchers_active ON vouchers (is_active) WHERE is_active = TRUE;
