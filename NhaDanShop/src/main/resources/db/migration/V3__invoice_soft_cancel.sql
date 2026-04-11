-- V3: Soft Cancel hóa đơn — thêm status + audit fields
-- Không xóa vật lý, chỉ đánh dấu CANCELLED

ALTER TABLE sales_invoices
    ADD COLUMN IF NOT EXISTS status         VARCHAR(20)  NOT NULL DEFAULT 'COMPLETED',
    ADD COLUMN IF NOT EXISTS cancelled_at   TIMESTAMP,
    ADD COLUMN IF NOT EXISTS cancelled_by   VARCHAR(100),
    ADD COLUMN IF NOT EXISTS cancel_reason  VARCHAR(500);

-- Index để filter nhanh theo status
CREATE INDEX IF NOT EXISTS idx_si_status ON sales_invoices(status);

-- Tất cả hóa đơn cũ mặc định COMPLETED
UPDATE sales_invoices SET status = 'COMPLETED' WHERE status IS NULL;
