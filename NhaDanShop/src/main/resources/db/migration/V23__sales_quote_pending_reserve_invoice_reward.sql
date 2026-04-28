-- Slice 6C: quote reserved by pending order before invoice; invoice line reward flag

ALTER TABLE sales_quotes
    ADD COLUMN consumed_pending_order_id BIGINT NULL
        CONSTRAINT fk_sales_quotes_consumed_pending_order REFERENCES pending_orders (id);

CREATE INDEX idx_sales_quotes_consumed_pending_order ON sales_quotes (consumed_pending_order_id);

ALTER TABLE sales_invoice_items
    ADD COLUMN reward_line BOOLEAN NOT NULL DEFAULT FALSE;
