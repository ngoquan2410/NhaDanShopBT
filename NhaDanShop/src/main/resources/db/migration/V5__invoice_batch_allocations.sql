-- V5: Immutable ledger mapping invoice item deductions to concrete batches

CREATE TABLE IF NOT EXISTS sales_invoice_item_batch_allocations (
    id              BIGSERIAL PRIMARY KEY,
    invoice_item_id BIGINT    NOT NULL
        REFERENCES sales_invoice_items(id) ON DELETE CASCADE,
    batch_id        BIGINT    NOT NULL
        REFERENCES product_batches(id),
    deducted_qty    INT       NOT NULL
        CONSTRAINT ck_siiba_deducted_qty CHECK (deducted_qty > 0),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_siiba_invoice_item
    ON sales_invoice_item_batch_allocations (invoice_item_id);

CREATE INDEX IF NOT EXISTS idx_siiba_batch
    ON sales_invoice_item_batch_allocations (batch_id);
