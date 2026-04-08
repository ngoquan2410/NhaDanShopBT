-- =========================================================
-- V28: Sprint 1 — Supplier Management (Quản lý Nhà cung cấp)
-- Ngày: 07/04/2026
--
-- Tách supplier ra bảng riêng để:
--   1. CRUD NCC với đầy đủ thông tin (SĐT, địa chỉ, MST)
--   2. Phiếu nhập kho FK → supplier_id (tra cứu lịch sử)
--   3. Giữ supplier_name trong inventory_receipts làm snapshot
-- =========================================================

-- ── 1. Bảng suppliers ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
    id          BIGSERIAL       PRIMARY KEY,
    code        VARCHAR(50)     NOT NULL,
    name        VARCHAR(150)    NOT NULL,
    phone       VARCHAR(20),
    address     VARCHAR(300),
    tax_code    VARCHAR(30),
    email       VARCHAR(100),
    note        VARCHAR(500),
    is_active   BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_code
    ON suppliers (code);

CREATE INDEX IF NOT EXISTS idx_supplier_name
    ON suppliers (name);

CREATE INDEX IF NOT EXISTS idx_supplier_active
    ON suppliers (is_active) WHERE is_active = TRUE;

COMMENT ON TABLE suppliers IS 'Danh mục nhà cung cấp';
COMMENT ON COLUMN suppliers.code IS 'Mã NCC: NCC001, NCC002... (unique)';
COMMENT ON COLUMN suppliers.tax_code IS 'Mã số thuế doanh nghiệp';

-- ── 2. FK supplier_id vào inventory_receipts ─────────────────────────────────
-- Giữ nguyên supplier_name làm snapshot (không xóa)
-- supplier_id = FK để tra cứu/filter theo NCC
ALTER TABLE inventory_receipts
    ADD COLUMN IF NOT EXISTS supplier_id BIGINT
        REFERENCES suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_receipt_supplier
    ON inventory_receipts (supplier_id)
    WHERE supplier_id IS NOT NULL;

COMMENT ON COLUMN inventory_receipts.supplier_id IS
    'FK → suppliers.id. NULL với phiếu cũ hoặc NCC chưa có trong danh mục.';
COMMENT ON COLUMN inventory_receipts.supplier_name IS
    'Snapshot tên NCC tại thời điểm nhập — bất biến dù NCC đổi tên sau.';

-- ── 3. Seed một số NCC mẫu (có thể bỏ qua nếu không cần) ───────────────────
-- INSERT INTO suppliers (code, name, phone, note) VALUES
--     ('NCC001', 'Nhà Cung Cấp Mẫu A', '0901234567', 'NCC mẫu'),
--     ('NCC002', 'Nhà Cung Cấp Mẫu B', '0912345678', 'NCC mẫu')
-- ON CONFLICT (code) DO NOTHING;
