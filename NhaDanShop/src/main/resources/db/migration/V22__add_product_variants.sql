-- =========================================================
-- V22: Sprint 0 — Product Variants
--
-- Mục tiêu: 1 mã SP gốc (products) có thể có N biến thể đóng gói.
-- Ví dụ: Muối ABC → [ABC-HU100: hủ 100g, ABC-GOI50: gói 50g, ABC-KG: nguyên kg]
--
-- Thiết kế:
--   - product_variants: mỗi variant = 1 đơn vị giao dịch
--   - Mỗi variant có: mã riêng, giá riêng, tồn kho riêng, FEFO riêng
--   - product_id vẫn giữ (backward compat) — variant_id là "đơn vị giao dịch" mới
--   - is_default = TRUE → variant chính (1 SP chỉ có 1 default)
-- =========================================================

-- ── 1. Bảng product_variants ─────────────────────────────────────────────────
CREATE TABLE product_variants (
    id               BIGSERIAL       PRIMARY KEY,
    product_id       BIGINT          NOT NULL
                         REFERENCES products(id) ON DELETE CASCADE,

    -- Mã variant: bắt buộc, unique toàn hệ thống (dùng khi scan barcode/bán hàng)
    variant_code     VARCHAR(60)     NOT NULL UNIQUE,

    -- Tên hiển thị: "Muối Hủ 100g", "Muối Gói 50g"
    variant_name     VARCHAR(200)    NOT NULL,

    -- Đơn vị bán lẻ: "hủ", "gói", "bịch", "chai"...
    sell_unit        VARCHAR(20)     NOT NULL DEFAULT 'cai',

    -- Đơn vị nhập kho: "kg", "xâu", "bịch"...
    import_unit      VARCHAR(20)     NULL,

    -- Số ĐV bán lẻ / 1 ĐV nhập (VD: 1kg=10hủ → pieces_per_unit=10)
    pieces_per_unit  INT             NOT NULL DEFAULT 1
                         CONSTRAINT ck_pv_pieces CHECK (pieces_per_unit >= 1),

    -- Giá bán lẻ (đơn vị: sell_unit)
    sell_price       DECIMAL(18,2)   NOT NULL DEFAULT 0
                         CONSTRAINT ck_pv_sell_price CHECK (sell_price >= 0),

    -- Giá vốn hiện tại (cập nhật mỗi lần nhập kho — FIFO/FEFO weighted avg)
    cost_price       DECIMAL(18,2)   NOT NULL DEFAULT 0
                         CONSTRAINT ck_pv_cost_price CHECK (cost_price >= 0),

    -- Tồn kho (đơn vị: sell_unit)
    stock_qty        INT             NOT NULL DEFAULT 0
                         CONSTRAINT ck_pv_stock CHECK (stock_qty >= 0),

    -- Ngưỡng tồn kho tối thiểu — cảnh báo khi stock_qty < min_stock_qty
    min_stock_qty    INT             NOT NULL DEFAULT 5
                         CONSTRAINT ck_pv_min_stock CHECK (min_stock_qty >= 0),

    -- Số ngày còn sử dụng kể từ ngày nhập
    expiry_days      INT             NULL,

    is_active        BOOLEAN         NOT NULL DEFAULT TRUE,

    -- TRUE = variant chính (điền sẵn khi tạo phiếu nhập/bán)
    -- Mỗi SP chỉ có đúng 1 default (enforced bởi unique partial index bên dưới)
    is_default       BOOLEAN         NOT NULL DEFAULT FALSE,

    image_url        VARCHAR(500)    NULL,

    -- Ghi chú quy đổi: "1 kg = 10 hủ 100g"
    conversion_note  VARCHAR(100)    NULL,

    created_at       TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP       NOT NULL DEFAULT NOW()
);

-- Mỗi SP chỉ có tối đa 1 variant mặc định
CREATE UNIQUE INDEX uq_pv_default
    ON product_variants (product_id)
    WHERE is_default = TRUE;

-- Index tìm theo product_id (dùng nhiều nhất)
CREATE INDEX idx_pv_product_id
    ON product_variants (product_id, is_active);

-- ── 2. Thêm variant_id vào các bảng giao dịch ────────────────────────────────
-- Nullable để backward compat: record cũ giữ nguyên product_id, variant_id được backfill ở V23.
-- Sau khi backfill xong: variant_id NOT NULL (enforce ở application layer).

ALTER TABLE product_batches
    ADD COLUMN IF NOT EXISTS variant_id BIGINT NULL
        REFERENCES product_variants(id);

CREATE INDEX IF NOT EXISTS idx_pb_variant_id
    ON product_batches (variant_id, expiry_date, remaining_qty);

-- ── inventory_receipt_items ──────────────────────────────────────────────────
-- Bỏ constraint cũ UNIQUE(receipt_id, product_id) vì 1 phiếu có thể có
-- nhiều variant của cùng 1 SP (VD: nhập hủ và gói từ SP Muối ABC).
ALTER TABLE inventory_receipt_items
    DROP CONSTRAINT IF EXISTS uq_inventory_items;

ALTER TABLE inventory_receipt_items
    ADD COLUMN IF NOT EXISTS variant_id BIGINT NULL
        REFERENCES product_variants(id);

-- Constraint mới: 1 phiếu chỉ có 1 dòng/variant
ALTER TABLE inventory_receipt_items
    ADD CONSTRAINT uq_receipt_variant UNIQUE (receipt_id, variant_id)
    DEFERRABLE INITIALLY DEFERRED;

-- ── sales_invoice_items ──────────────────────────────────────────────────────
-- Tương tự: bỏ UNIQUE(invoice_id, product_id), thêm UNIQUE(invoice_id, variant_id)
ALTER TABLE sales_invoice_items
    DROP CONSTRAINT IF EXISTS uq_sales_items;

ALTER TABLE sales_invoice_items
    ADD COLUMN IF NOT EXISTS variant_id BIGINT NULL
        REFERENCES product_variants(id);

ALTER TABLE sales_invoice_items
    ADD CONSTRAINT uq_invoice_variant UNIQUE (invoice_id, variant_id)
    DEFERRABLE INITIALLY DEFERRED;

-- ── pending_order_items ──────────────────────────────────────────────────────
ALTER TABLE pending_order_items
    ADD COLUMN IF NOT EXISTS variant_id BIGINT NULL
        REFERENCES product_variants(id);

-- ── 3. Comments ──────────────────────────────────────────────────────────────
COMMENT ON TABLE product_variants IS
    'Biến thể đóng gói của sản phẩm. 1 SP gốc có thể có N variant: '
    'hủ 100g / gói 50g / kg nguyên. Mỗi variant = 1 đơn vị giao dịch '
    'với mã riêng, giá riêng, tồn kho riêng, FEFO riêng.';

COMMENT ON COLUMN product_variants.variant_code IS
    'Mã bán hàng thực tế. Dùng khi scan barcode, tra cứu nhanh. '
    'Với SP chỉ có 1 variant → variant_code = product.code.';

COMMENT ON COLUMN product_variants.is_default IS
    'TRUE = variant chính. Tự động chọn khi tạo phiếu nhập/bán '
    'mà không chỉ định variant cụ thể. Mỗi SP chỉ có 1 default.';
