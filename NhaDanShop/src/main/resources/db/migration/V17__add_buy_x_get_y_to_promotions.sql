-- V17: thêm các cột BUY_X_GET_Y vào promotions
ALTER TABLE promotions
    ADD COLUMN IF NOT EXISTS buy_qty        INT  NULL,
    ADD COLUMN IF NOT EXISTS get_product_id BIGINT NULL
        CONSTRAINT fk_promo_get_product REFERENCES products(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS get_qty        INT  NULL;
