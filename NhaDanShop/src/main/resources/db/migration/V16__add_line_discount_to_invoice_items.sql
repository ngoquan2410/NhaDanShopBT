-- V16: thêm chiết khấu % dòng và giá gốc vào sales_invoice_items
ALTER TABLE sales_invoice_items
    ADD COLUMN IF NOT EXISTS original_unit_price   DECIMAL(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS line_discount_percent DECIMAL(5,2)  NOT NULL DEFAULT 0
        CONSTRAINT ck_sii_line_discount CHECK (line_discount_percent >= 0 AND line_discount_percent <= 100);

-- Backfill: original_unit_price = unit_price (data cũ không có CK dòng)
UPDATE sales_invoice_items
SET original_unit_price = unit_price
WHERE original_unit_price = 0;
