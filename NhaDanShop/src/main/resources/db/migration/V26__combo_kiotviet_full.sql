-- =========================================================
-- V26: Hoàn thiện Combo theo mô hình KiotViet
-- Ngày: 07/04/2026
--
-- Thay đổi:
--   1. Thêm combo_source_id vào sales_invoice_items
--      → Track một HĐ item là "khai triển từ combo nào"
--   2. Thêm index hỗ trợ query combo trong báo cáo
--   3. Đảm bảo constraint product_combo_items đúng chuẩn
-- =========================================================

-- ── 1. Thêm cột combo_source_id vào sales_invoice_items ─────────────────────
-- Khi bán combo X gồm (SP-A x2, SP-B x1):
--   → Tạo 2 invoice_items: SP-A qty=2, SP-B qty=1
--   → Cả 2 đều có combo_source_id = products.id của combo X
--   → Dùng để: gom lại hiển thị "combo" trên HĐ, báo cáo doanh thu theo combo
ALTER TABLE sales_invoice_items
    ADD COLUMN IF NOT EXISTS combo_source_id BIGINT NULL
        REFERENCES products(id) ON DELETE SET NULL;

COMMENT ON COLUMN sales_invoice_items.combo_source_id
    IS 'NULL = bán lẻ; NOT NULL = item này được khai triển từ combo có ID này';

-- Index để tra cứu nhanh "HĐ nào chứa combo X"
CREATE INDEX IF NOT EXISTS idx_sii_combo_source
    ON sales_invoice_items (combo_source_id)
    WHERE combo_source_id IS NOT NULL;

-- ── 2. Thêm cột combo_sell_price snapshot ───────────────────────────────────
-- Lưu giá bán combo tại thời điểm giao dịch (giá combo có thể thay đổi sau này)
ALTER TABLE sales_invoice_items
    ADD COLUMN IF NOT EXISTS combo_unit_price DECIMAL(18,2) NULL;

COMMENT ON COLUMN sales_invoice_items.combo_unit_price
    IS 'Giá bán của combo tại thời điểm bán (snapshot, chỉ có khi combo_source_id IS NOT NULL)';

-- ── 3. Index hỗ trợ tìm combo theo product_type ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_type_active
    ON products (product_type, is_active);

-- ── 4. Đảm bảo product_combo_items có đủ index ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pci_combo_product
    ON product_combo_items (combo_product_id);

CREATE INDEX IF NOT EXISTS idx_pci_component_product
    ON product_combo_items (product_id);

-- ── 5. Thêm cột description cho combo (optional) ────────────────────────────
-- Cho phép admin ghi mô tả/ghi chú về combo
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'description'
    ) THEN
        ALTER TABLE products ADD COLUMN description VARCHAR(1000) NULL;
        COMMENT ON COLUMN products.description
            IS 'Mô tả sản phẩm/combo (tuỳ chọn)';
    END IF;
END $$;
