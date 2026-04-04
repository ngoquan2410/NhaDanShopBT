-- =========================================================
-- V20: Bước 1 — Snapshot đơn vị nhập thực tế vào từng dòng phiếu nhập
--
-- Vấn đề: product.import_unit + product.pieces_per_import_unit là giá trị
--   MẶC ĐỊNH — chỉ 1 cặp cho toàn bộ lịch sử. Nếu 1 SP được nhập lúc thì
--   kg (10 bịch/kg), lúc xâu (7 bịch/xâu) thì hệ thống tính sai.
--
-- Giải pháp: Lưu snapshot (import_unit_used, pieces_used) vào từng dòng
--   inventory_receipt_items tại thời điểm tạo phiếu. Đây là source of truth
--   cho mọi tính toán tồn kho và giá vốn. Không bao giờ sửa sau khi tạo.
-- =========================================================

ALTER TABLE inventory_receipt_items
    ADD COLUMN IF NOT EXISTS import_unit_used VARCHAR(20)  NULL,
    ADD COLUMN IF NOT EXISTS pieces_used      INT          NOT NULL DEFAULT 1
        CONSTRAINT ck_iri_pieces_used CHECK (pieces_used >= 1),
    ADD COLUMN IF NOT EXISTS retail_qty_added INT          NOT NULL DEFAULT 0
        CONSTRAINT ck_iri_retail_qty CHECK (retail_qty_added >= 0);

-- Backfill từ product (best-effort cho dữ liệu lịch sử)
UPDATE inventory_receipt_items iri
SET
    import_unit_used = p.import_unit,
    pieces_used      = COALESCE(
        CASE
            -- Nếu import_unit là ATOMIC → pieces = 1
            WHEN LOWER(p.import_unit) IN ('bich','bịch','hop','hộp','chai','goi','gói','hu','hũ','lon','lọn','tui','túi') THEN 1
            ELSE COALESCE(p.pieces_per_import_unit, 1)
        END, 1),
    retail_qty_added = iri.quantity * COALESCE(
        CASE
            WHEN LOWER(p.import_unit) IN ('bich','bịch','hop','hộp','chai','goi','gói','hu','hũ','lon','lọn','tui','túi') THEN 1
            ELSE COALESCE(p.pieces_per_import_unit, 1)
        END, 1)
FROM products p
WHERE iri.product_id = p.id;

-- Fallback cho rows không join được
UPDATE inventory_receipt_items
SET import_unit_used = 'bich',
    pieces_used      = 1,
    retail_qty_added = quantity
WHERE import_unit_used IS NULL;

COMMENT ON COLUMN inventory_receipt_items.import_unit_used IS
    'Snapshot ĐV nhập thực tế của dòng này (kg/xâu/bịch...). Bất biến sau khi tạo.';
COMMENT ON COLUMN inventory_receipt_items.pieces_used IS
    'Snapshot số ĐV bán lẻ / 1 ĐV nhập thực tế. VD: 1kg=10bịch→10, 1xâu=7bịch→7, ATOMIC=1. Bất biến.';
COMMENT ON COLUMN inventory_receipt_items.retail_qty_added IS
    'Số ĐV bán lẻ thực tế đã cộng vào tồn kho = quantity × pieces_used. Bất biến sau khi tạo.';
