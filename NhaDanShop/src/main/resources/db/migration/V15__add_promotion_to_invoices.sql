-- V15: Add promotion tracking to sales_invoices
ALTER TABLE sales_invoices
    ADD COLUMN IF NOT EXISTS promotion_id     BIGINT        NULL
        CONSTRAINT fk_si_promotion REFERENCES promotions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS promotion_name   VARCHAR(200)  NULL,
    ADD COLUMN IF NOT EXISTS discount_amount  DECIMAL(18,2) NOT NULL DEFAULT 0
        CONSTRAINT ck_si_discount_amount CHECK (discount_amount >= 0);
