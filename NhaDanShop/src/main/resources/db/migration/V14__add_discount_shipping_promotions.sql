-- ─────────────────────────────────────────────────────────────────────────────
-- V14: Thêm chiết khấu, phí vận chuyển vào phiếu nhập & quản lí khuyến mãi
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Thêm shipping_fee vào phiếu nhập
ALTER TABLE inventory_receipts
    ADD COLUMN IF NOT EXISTS shipping_fee DECIMAL(18,2) NOT NULL DEFAULT 0
        CONSTRAINT ck_ir_shipping_fee CHECK (shipping_fee >= 0);

-- 2. Thêm discount_percent và final_cost vào từng dòng nhập
ALTER TABLE inventory_receipt_items
    ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0
        CONSTRAINT ck_iri_discount CHECK (discount_percent >= 0 AND discount_percent <= 100),
    ADD COLUMN IF NOT EXISTS discounted_cost   DECIMAL(18,2) NOT NULL DEFAULT 0
        CONSTRAINT ck_iri_discounted_cost CHECK (discounted_cost >= 0),
    ADD COLUMN IF NOT EXISTS shipping_allocated DECIMAL(18,2) NOT NULL DEFAULT 0
        CONSTRAINT ck_iri_shipping_alloc CHECK (shipping_allocated >= 0),
    ADD COLUMN IF NOT EXISTS final_cost        DECIMAL(18,2) NOT NULL DEFAULT 0
        CONSTRAINT ck_iri_final_cost CHECK (final_cost >= 0);

-- 3. Bảng khuyến mãi (promotions)
CREATE TABLE IF NOT EXISTS promotions (
    id              BIGSERIAL      PRIMARY KEY,
    name            VARCHAR(200)   NOT NULL,
    description     VARCHAR(1000)  NULL,
    type            VARCHAR(50)    NOT NULL, -- PERCENT_DISCOUNT | FIXED_DISCOUNT | BUY_X_GET_Y | FREE_SHIPPING
    discount_value  DECIMAL(18,2)  NOT NULL DEFAULT 0,  -- % hoặc số tiền cố định
    min_order_value DECIMAL(18,2)  NOT NULL DEFAULT 0,  -- đơn hàng tối thiểu
    max_discount    DECIMAL(18,2)  NULL,                 -- giảm tối đa (null = không giới hạn)
    start_date      TIMESTAMP      NOT NULL,
    end_date        TIMESTAMP      NOT NULL,
    is_active       BOOLEAN        NOT NULL DEFAULT TRUE,
    applies_to      VARCHAR(20)    NOT NULL DEFAULT 'ALL', -- ALL | CATEGORY | PRODUCT
    created_at      TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP      NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_promotions_discount_value CHECK (discount_value >= 0),
    CONSTRAINT ck_promotions_dates CHECK (end_date > start_date),
    CONSTRAINT ck_promotions_type CHECK (type IN ('PERCENT_DISCOUNT','FIXED_DISCOUNT','BUY_X_GET_Y','FREE_SHIPPING'))
);

-- 4. Bảng liên kết khuyến mãi → danh mục / sản phẩm
CREATE TABLE IF NOT EXISTS promotion_categories (
    promotion_id BIGINT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    category_id  BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (promotion_id, category_id)
);

CREATE TABLE IF NOT EXISTS promotion_products (
    promotion_id BIGINT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    product_id   BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    PRIMARY KEY (promotion_id, product_id)
);

-- 5. Index hỗ trợ tìm khuyến mãi đang active theo ngày
CREATE INDEX IF NOT EXISTS idx_promotions_active_dates
    ON promotions(is_active, start_date, end_date);
