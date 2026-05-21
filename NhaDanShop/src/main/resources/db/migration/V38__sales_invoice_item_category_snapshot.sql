-- Persist invoice-line category snapshots for historical category reporting.
-- Existing rows are intentionally left NULL because current product.category may not be
-- reliable historical truth. Reporting must treat NULL snapshot rows as Unknown/Legacy Category
-- unless a separately approved reliable backfill is performed.
ALTER TABLE sales_invoice_items
    ADD COLUMN IF NOT EXISTS category_id_snapshot BIGINT,
    ADD COLUMN IF NOT EXISTS category_name_snapshot VARCHAR(150),
    ADD COLUMN IF NOT EXISTS category_code_snapshot VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_sii_category_snapshot
    ON sales_invoice_items (category_id_snapshot);
