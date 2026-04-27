CREATE TABLE IF NOT EXISTS payment_events (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    provider_tx_id VARCHAR(120) NOT NULL,
    amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    transfer_content TEXT,
    matched_code VARCHAR(50),
    bank_account VARCHAR(100),
    bank_sub_acc VARCHAR(100),
    tx_time TIMESTAMP,
    linked_pending_order_id BIGINT REFERENCES pending_orders(id),
    linked_order_code VARCHAR(50),
    linked_at TIMESTAMP,
    linked_by VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'UNMATCHED',
    raw_payload TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_payment_events_provider_tx UNIQUE (provider, provider_tx_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_events_status_created
    ON payment_events (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_events_matched_code
    ON payment_events (matched_code);

CREATE INDEX IF NOT EXISTS idx_payment_events_linked_order_code
    ON payment_events (linked_order_code);
