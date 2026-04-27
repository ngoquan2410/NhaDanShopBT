-- CRIT-008: dedupe client retries for mutating POS endpoints (Idempotency-Key header)
CREATE TABLE idempotency_keys (
    id              BIGSERIAL PRIMARY KEY,
    user_ref        VARCHAR(150) NOT NULL,
    scope           VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    status          VARCHAR(20)  NOT NULL,
    http_status     INT,
    response_json   TEXT,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_idempotency_user_scope_key UNIQUE (user_ref, scope, idempotency_key),
    CONSTRAINT chk_idempotency_status CHECK (status IN ('IN_FLIGHT', 'COMPLETED'))
);

CREATE INDEX idx_idempotency_keys_created ON idempotency_keys (created_at);
