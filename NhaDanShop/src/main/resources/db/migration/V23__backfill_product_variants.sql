-- =========================================================
-- V23: Sprint 0 — Backfill product_variants từ products hiện có
--
-- Chiến lược backward compat:
--   1. Mỗi SINGLE product → tạo 1 default variant (variant_code = product.code)
--   2. Backfill variant_id vào 4 bảng giao dịch hiện có
--   3. COMBO product: không tạo variant (combo xử lý riêng ở Sprint sau)
-- =========================================================

-- ── Step 1: Tạo default variant cho từng SINGLE product ──────────────────────
INSERT INTO product_variants (
    product_id,
    variant_code,
    variant_name,
    sell_unit,
    import_unit,
    pieces_per_unit,
    sell_price,
    cost_price,
    stock_qty,
    min_stock_qty,
    expiry_days,
    is_active,
    is_default,
    image_url,
    conversion_note,
    created_at,
    updated_at
)
SELECT
    p.id,
    p.code,                                          -- variant_code = product.code
    p.name,                                          -- variant_name = product.name
    COALESCE(p.sell_unit, p.unit, 'cai'),            -- sell_unit
    p.import_unit,                                   -- import_unit
    COALESCE(p.pieces_per_import_unit, 1),           -- pieces_per_unit
    p.sell_price,
    p.cost_price,
    p.stock_quantity,
    5,                                               -- min_stock_qty default = 5
    p.expiry_days,
    p.is_active,
    TRUE,                                            -- is_default = TRUE
    p.image_url,
    p.conversion_note,
    p.created_at,
    p.updated_at
FROM products p
WHERE p.product_type = 'SINGLE'
ON CONFLICT (variant_code) DO NOTHING;              -- idempotent

-- ── Step 2: Backfill variant_id trong product_batches ────────────────────────
UPDATE product_batches pb
SET variant_id = (
    SELECT pv.id
    FROM product_variants pv
    WHERE pv.product_id = pb.product_id
      AND pv.is_default = TRUE
    LIMIT 1
)
WHERE pb.variant_id IS NULL;

-- ── Step 3: Backfill variant_id trong inventory_receipt_items ────────────────
UPDATE inventory_receipt_items iri
SET variant_id = (
    SELECT pv.id
    FROM product_variants pv
    WHERE pv.product_id = iri.product_id
      AND pv.is_default = TRUE
    LIMIT 1
)
WHERE iri.variant_id IS NULL;

-- ── Step 4: Backfill variant_id trong sales_invoice_items ────────────────────
UPDATE sales_invoice_items sii
SET variant_id = (
    SELECT pv.id
    FROM product_variants pv
    WHERE pv.product_id = sii.product_id
      AND pv.is_default = TRUE
    LIMIT 1
)
WHERE sii.variant_id IS NULL;

-- ── Step 5: Backfill variant_id trong pending_order_items ────────────────────
UPDATE pending_order_items poi
SET variant_id = (
    SELECT pv.id
    FROM product_variants pv
    WHERE pv.product_id = poi.product_id
      AND pv.is_default = TRUE
    LIMIT 1
)
WHERE poi.variant_id IS NULL;

-- ── Step 6: Verify ────────────────────────────────────────────────────────────
-- Kiểm tra không có orphan (có thể xem kết quả bằng cách chạy manual)
-- SELECT COUNT(*) FROM product_batches WHERE variant_id IS NULL;
-- SELECT COUNT(*) FROM inventory_receipt_items WHERE variant_id IS NULL;
-- SELECT COUNT(*) FROM sales_invoice_items WHERE variant_id IS NULL;
-- SELECT COUNT(*) FROM pending_order_items WHERE variant_id IS NULL;
