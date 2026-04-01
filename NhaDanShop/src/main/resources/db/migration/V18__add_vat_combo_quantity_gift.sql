-- V18: Thêm VAT vào phiếu nhập, bảng combo, và loại KM QUANTITY_GIFT

-- 1. Thêm VAT vào inventory_receipt_items
ALTER TABLE inventory_receipt_items
    ADD COLUMN IF NOT EXISTS vat_percent       DECIMAL(5,2) NOT NULL DEFAULT 0
        CONSTRAINT ck_iri_vat CHECK (vat_percent >= 0 AND vat_percent <= 100),
    ADD COLUMN IF NOT EXISTS vat_allocated     DECIMAL(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS final_cost_with_vat DECIMAL(18,2) NOT NULL DEFAULT 0;

-- Thêm tổng VAT vào header phiếu nhập
ALTER TABLE inventory_receipts
    ADD COLUMN IF NOT EXISTS total_vat DECIMAL(18,2) NOT NULL DEFAULT 0;

-- Backfill final_cost_with_vat = final_cost (data cũ không có VAT)
UPDATE inventory_receipt_items SET final_cost_with_vat = final_cost WHERE final_cost_with_vat = 0;

-- 2. Bảng combo sản phẩm
CREATE TABLE IF NOT EXISTS product_combos (
    id            BIGSERIAL PRIMARY KEY,
    code          VARCHAR(50)  NOT NULL UNIQUE,
    name          VARCHAR(200) NOT NULL,
    description   VARCHAR(1000),
    sell_price    DECIMAL(18,2) NOT NULL DEFAULT 0,
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Chi tiết combo (các thành phần)
CREATE TABLE IF NOT EXISTS product_combo_items (
    id          BIGSERIAL PRIMARY KEY,
    combo_id    BIGINT NOT NULL REFERENCES product_combos(id) ON DELETE CASCADE,
    product_id  BIGINT NOT NULL REFERENCES products(id),
    quantity    INT    NOT NULL CHECK (quantity > 0),
    UNIQUE (combo_id, product_id)
);

-- 4. Thêm loại KM QUANTITY_GIFT vào promotions
--    minBuyQty  = số lượng tối thiểu cần mua
--    maxBuyQty  = số lượng tối đa được tặng (NULL = không giới hạn)
--    (tái dùng get_product_id, get_qty từ V17)
ALTER TABLE promotions
    ADD COLUMN IF NOT EXISTS min_buy_qty INT NULL,
    ADD COLUMN IF NOT EXISTS max_buy_qty INT NULL;

COMMENT ON COLUMN promotions.min_buy_qty IS 'QUANTITY_GIFT: mua tối thiểu N sản phẩm thì được tặng';
COMMENT ON COLUMN promotions.max_buy_qty IS 'QUANTITY_GIFT: giới hạn tặng tối đa M lần (NULL = không giới hạn)';
