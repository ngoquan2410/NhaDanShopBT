-- =========================================================
-- V25: Sprint 0 — Fix 5 lỗi thiết kế DB từ DB_DESIGN_REVIEW
-- Ngày: 04/04/2026
-- =========================================================

-- ── Fix #1: DROP deprecated columns trong products ────────────────────────────
-- product_variants là master duy nhất cho giá, tồn, đơn vị, HSD.
-- Giữ lại: id, code, name, unit (legacy fallback), category_id, product_type,
--          image_url, is_active, created_at, updated_at
ALTER TABLE products
    DROP COLUMN IF EXISTS sell_price,
    DROP COLUMN IF EXISTS cost_price,
    DROP COLUMN IF EXISTS stock_quantity,
    DROP COLUMN IF EXISTS sell_unit,
    DROP COLUMN IF EXISTS import_unit,
    DROP COLUMN IF EXISTS pieces_per_import_unit,
    DROP COLUMN IF EXISTS conversion_note,
    DROP COLUMN IF EXISTS expiry_days,
    DROP COLUMN IF EXISTS unit;

-- ── Fix #2: Validate namespace variant_code vs product.code ──────────────────
-- Enforce ở application layer: ProductVariantService.validateVariantCodeNamespace()
-- Convention: variant_code phải khác product.code của mọi SP khác.

-- ── Fix #3: Bỏ UNIQUE constraint quá cứng trên sales_invoice_items ───────────
ALTER TABLE sales_invoice_items DROP CONSTRAINT IF EXISTS uq_invoice_variant;
CREATE INDEX IF NOT EXISTS idx_sii_invoice_variant
    ON sales_invoice_items (invoice_id, variant_id);

-- ── Fix #4: Enforce variant_id NOT NULL trong product_batches ─────────────────
UPDATE product_batches pb
SET variant_id = (
    SELECT pv.id FROM product_variants pv
    WHERE pv.product_id = pb.product_id AND pv.is_default = TRUE
    LIMIT 1
)
WHERE pb.variant_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM product_batches WHERE variant_id IS NULL) THEN
        ALTER TABLE product_batches ALTER COLUMN variant_id SET NOT NULL;
        RAISE NOTICE 'V25: product_batches.variant_id SET NOT NULL OK.';
    ELSE
        RAISE WARNING 'V25: Còn batch chưa có variant_id — kiểm tra V23/V24.';
    END IF;
END $$;

ALTER TABLE product_batches ALTER COLUMN product_id DROP NOT NULL;

-- ── Fix #5: Tạo default variant cho COMBO products chưa có variant ────────────
-- Lưu ý: Fix #1 đã DROP sell_price/cost_price/stock_quantity/sell_unit/import_unit
--        khỏi products → dùng giá trị mặc định cho COMBO variants
INSERT INTO product_variants (
    product_id, variant_code, variant_name,
    sell_unit, import_unit, pieces_per_unit,
    sell_price, cost_price, stock_qty,
    min_stock_qty, expiry_days,
    is_active, is_default,
    image_url, conversion_note,
    created_at, updated_at
)
SELECT
    p.id,
    p.code,
    p.name,
    'combo',
    NULL,
    1,
    0,
    0,
    0,
    5,
    NULL,
    p.is_active,
    TRUE,
    p.image_url,
    NULL,
    NOW(),
    NOW()
FROM products p
WHERE p.product_type = 'COMBO'
  AND NOT EXISTS (
      SELECT 1 FROM product_variants pv
      WHERE pv.product_id = p.id AND pv.is_default = TRUE
  )
ON CONFLICT (variant_code) DO NOTHING;

-- ── Verify ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_batches_null  INT;
    v_combos_novar  INT;
    v_inv_null      INT;
BEGIN
    SELECT COUNT(*) INTO v_batches_null  FROM product_batches      WHERE variant_id IS NULL;
    SELECT COUNT(*) INTO v_combos_novar  FROM products p
        WHERE p.product_type = 'COMBO'
          AND NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id);
    SELECT COUNT(*) INTO v_inv_null      FROM sales_invoice_items  WHERE variant_id IS NULL;
    RAISE NOTICE 'V25 Verify: batches_null=%, combos_no_variant=%, invoice_items_null=%',
        v_batches_null, v_combos_novar, v_inv_null;
END $$;
