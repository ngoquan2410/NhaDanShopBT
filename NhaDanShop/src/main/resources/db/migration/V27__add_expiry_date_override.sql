-- =========================================================
-- V27: Sprint 1 — ExpiryDate Override khi nhập kho
-- Ngày: 07/04/2026
--
-- Cho phép admin ghi đè ngày HSD thực tế in trên bao bì
-- thay vì tự tính importDate + variant.expiryDays.
-- Đảm bảo FEFO hoạt động đúng với ngày thực tế của lô hàng.
-- =========================================================

-- ── Thêm cột vào inventory_receipt_items ─────────────────────────────────────
ALTER TABLE inventory_receipt_items
    ADD COLUMN IF NOT EXISTS expiry_date_override DATE NULL;

COMMENT ON COLUMN inventory_receipt_items.expiry_date_override IS
    'Ngày HSD thực tế ghi đè (do admin nhập từ bao bì). '
    'NULL → tự tính: importDate + variant.expiryDays. '
    'Nếu có → productBatch.expiry_date dùng giá trị này.';

-- Index để query batch sắp hết hạn theo ngày ghi đè
CREATE INDEX IF NOT EXISTS idx_iri_expiry_override
    ON inventory_receipt_items (expiry_date_override)
    WHERE expiry_date_override IS NOT NULL;
