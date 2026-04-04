-- =========================================================
-- V24: Cleanup orphan variants bị insert sai product_id
--
-- Vấn đề: Khi import Excel, do Hibernate chưa flush ID mới,
-- variant của SP BT002 bị gán nhầm product_id = 1 (BT001).
--
-- Fix:
--   1. Xóa các variant có variant_code trùng với product.code
--      nhưng product_id SAI (tức là variant_code thuộc SP khác)
--   2. Đảm bảo mỗi SP đã tồn tại đều có đúng 1 default variant
--      với variant_code = product.code và product_id đúng
-- =========================================================

-- Step 1: Xóa orphan variants — variant_code tồn tại trong products
-- nhưng product_id không khớp với products.id của mã đó
DELETE FROM product_variants pv
WHERE EXISTS (
    SELECT 1 FROM products p
    WHERE p.code = pv.variant_code
      AND p.id <> pv.product_id
);

-- Step 2: Backfill lại — tạo default variant đúng cho mỗi SP chưa có
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
    COALESCE(p.sell_unit, p.unit, 'cai'),
    p.import_unit,
    COALESCE(p.pieces_per_import_unit, 1),
    COALESCE(p.sell_price, 0),
    COALESCE(p.cost_price, 0),
    COALESCE(p.stock_quantity, 0),
    5,
    p.expiry_days,
    p.is_active,
    TRUE,
    p.image_url,
    p.conversion_note,
    NOW(),
    NOW()
FROM products p
WHERE p.product_type = 'SINGLE'
  AND NOT EXISTS (
      SELECT 1 FROM product_variants pv2
      WHERE pv2.product_id = p.id
        AND pv2.is_default = TRUE
  )
ON CONFLICT (variant_code) DO NOTHING;

-- Step 3: Đảm bảo không có 2 default variants cho cùng 1 SP
-- (giữ lại cái có id nhỏ nhất, bỏ default các cái còn lại)
UPDATE product_variants pv
SET is_default = FALSE
WHERE is_default = TRUE
  AND id NOT IN (
      SELECT MIN(id)
      FROM product_variants
      WHERE is_default = TRUE
      GROUP BY product_id
  );
