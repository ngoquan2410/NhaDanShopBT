-- V19: Refactor Combo → Product(productType=COMBO) theo kiểu KiotViet
--
-- Chiến lược:
--   1. Thêm cột product_type vào products
--   2. Đổi product_combo_items.combo_id → combo_product_id FK → products.id
--   3. Migrate dữ liệu từ product_combos → products (type=COMBO)
--   4. Drop bảng product_combos cũ

-- ── Step 1: Thêm product_type vào products ────────────────────────────────
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS product_type VARCHAR(20) NOT NULL DEFAULT 'SINGLE'
        CONSTRAINT ck_product_type CHECK (product_type IN ('SINGLE', 'COMBO'));

-- ── Step 2: Đổi FK trong product_combo_items ──────────────────────────────
-- Đổi tên cột combo_id → combo_product_id, FK trỏ về products thay vì product_combos

-- Bước 2a: Thêm cột mới combo_product_id
ALTER TABLE product_combo_items
    ADD COLUMN IF NOT EXISTS combo_product_id BIGINT;

-- Bước 2b: Migrate dữ liệu: tạo product mới cho mỗi combo cũ
-- Chèn combo cũ vào bảng products với type=COMBO
INSERT INTO products (code, name, sell_price, cost_price, stock_quantity,
                      is_active, product_type, created_at, updated_at,
                      category_id, unit)
SELECT
    pc.code,
    pc.name,
    pc.sell_price,
    0::DECIMAL(18,2)   AS cost_price,   -- giá vốn combo tính dynamic
    0                  AS stock_quantity, -- combo virtual stock
    pc.active          AS is_active,
    'COMBO'            AS product_type,
    pc.created_at,
    pc.updated_at,
    -- Lấy category từ SP đầu tiên trong combo (fallback = category 1)
    COALESCE(
        (SELECT p.category_id
         FROM product_combo_items pci
         JOIN products p ON p.id = pci.product_id
         WHERE pci.combo_id = pc.id
         LIMIT 1),
        (SELECT id FROM categories ORDER BY id LIMIT 1)
    )                  AS category_id,
    'combo'            AS unit
FROM product_combos pc;

-- Bước 2c: Update combo_product_id trong product_combo_items trỏ về product mới
UPDATE product_combo_items pci
SET combo_product_id = (
    SELECT p.id
    FROM products p
    JOIN product_combos pc ON pc.code = p.code AND p.product_type = 'COMBO'
    WHERE pc.id = pci.combo_id
)
WHERE combo_product_id IS NULL;

-- Bước 2d: Bỏ FK cũ + cột cũ, đặt FK mới
ALTER TABLE product_combo_items
    DROP CONSTRAINT IF EXISTS product_combo_items_combo_id_fkey,
    DROP CONSTRAINT IF EXISTS uq_combo_product;

ALTER TABLE product_combo_items
    DROP COLUMN IF EXISTS combo_id;

ALTER TABLE product_combo_items
    ALTER COLUMN combo_product_id SET NOT NULL;

ALTER TABLE product_combo_items
    ADD CONSTRAINT fk_pci_combo_product
        FOREIGN KEY (combo_product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE product_combo_items
    ADD CONSTRAINT uq_combo_product
        UNIQUE (combo_product_id, product_id);

-- ── Step 3: Drop bảng cũ ──────────────────────────────────────────────────
DROP TABLE IF EXISTS product_combos;

-- ── Step 4: Index ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_type ON products(product_type);
