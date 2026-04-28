-- Slice 6C: pending order line batch trace + reward flag + original price snapshot for zero-revenue lines

ALTER TABLE pending_order_items
    ADD COLUMN IF NOT EXISTS batch_id BIGINT NULL,
    ADD COLUMN IF NOT EXISTS reward_line BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS original_unit_price NUMERIC(18, 2) NULL;

CREATE UNIQUE INDEX uk_pending_orders_quote_public_id
    ON pending_orders (quote_public_id)
    WHERE quote_public_id IS NOT NULL;