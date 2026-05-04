-- Password reset tokens (email flow)
CREATE TABLE password_reset_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_reset_user ON password_reset_tokens (user_id);
CREATE INDEX idx_password_reset_hash ON password_reset_tokens (token_hash);

-- GHN quote attempts — persisted for admin diagnostics (replaces client-side Supabase reads)
CREATE TABLE ghn_quote_logs (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    province_name VARCHAR(200),
    district_name VARCHAR(200),
    ward_name VARCHAR(200),
    weight_grams INT,
    subtotal NUMERIC(18, 2),
    ok BOOLEAN NOT NULL,
    fee NUMERIC(18, 2),
    eta_min INT,
    eta_max INT,
    service_id INT,
    reason VARCHAR(64),
    message TEXT,
    latency_ms BIGINT,
    order_code VARCHAR(100)
);

CREATE INDEX idx_ghn_quote_logs_created ON ghn_quote_logs (created_at DESC);

-- Some environments mistakenly used BYTEA for recipe_code; normalize to VARCHAR for LOWER()/ILIKE queries.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'production_recipes'
          AND column_name = 'recipe_code'
          AND udt_name = 'bytea'
    ) THEN
        ALTER TABLE production_recipes
            ALTER COLUMN recipe_code TYPE varchar(80)
            USING convert_from(recipe_code, 'UTF8');
    END IF;
END $$;
