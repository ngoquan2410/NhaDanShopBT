-- Slice 6C: backend sales quotes for unified commercial invoice contract

CREATE TABLE sales_quotes (
    id BIGSERIAL PRIMARY KEY,
    public_id VARCHAR(36) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP NULL,
    consumed_invoice_id BIGINT NULL,
    payload_json TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_sales_quotes_public_id UNIQUE (public_id),
    CONSTRAINT fk_sales_quotes_consumed_invoice FOREIGN KEY (consumed_invoice_id)
        REFERENCES sales_invoices(id) ON DELETE SET NULL
);

CREATE INDEX idx_sales_quotes_expires ON sales_quotes(expires_at);

ALTER TABLE pending_orders ADD COLUMN quote_public_id VARCHAR(36) NULL;
