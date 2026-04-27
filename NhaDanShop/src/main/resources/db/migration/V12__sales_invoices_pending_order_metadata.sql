ALTER TABLE sales_invoices
    ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(30),
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20),
    ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) NOT NULL DEFAULT 'POS',
    ADD COLUMN IF NOT EXISTS pending_order_id BIGINT,
    ADD COLUMN IF NOT EXISTS shipping_address_json TEXT,
    ADD COLUMN IF NOT EXISTS gift_lines_snapshot_json TEXT,
    ADD COLUMN IF NOT EXISTS promotion_snapshot_json TEXT,
    ADD COLUMN IF NOT EXISTS voucher_snapshot_json TEXT,
    ADD COLUMN IF NOT EXISTS shipping_quote_snapshot_json TEXT,
    ADD COLUMN IF NOT EXISTS pricing_breakdown_snapshot_json TEXT,
    ADD COLUMN IF NOT EXISTS vat_percent DECIMAL(5,2) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_invoices_pending_order_id
    ON sales_invoices (pending_order_id)
    WHERE pending_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_invoices_source_type
    ON sales_invoices (source_type);
