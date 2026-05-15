-- BUY_X_GET_Y per-product buy quantities + repeatable flag for gift/BXY stacking rules.

CREATE TABLE promotion_buy_items (
    id              BIGSERIAL PRIMARY KEY,
    promotion_id    BIGINT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    product_id      BIGINT NOT NULL REFERENCES products(id),
    buy_qty         INTEGER NOT NULL CHECK (buy_qty > 0),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_promotion_buy_items_promo_product UNIQUE (promotion_id, product_id)
);

CREATE INDEX idx_promotion_buy_items_promotion ON promotion_buy_items(promotion_id);

-- Backfill: each linked product on BUY_X_GET_Y gets buy_qty from promotions.buy_qty (fallback 1).
INSERT INTO promotion_buy_items (promotion_id, product_id, buy_qty, sort_order, created_at, updated_at)
SELECT pp.promotion_id,
       pp.product_id,
       GREATEST(COALESCE(p.buy_qty, 1), 1),
       ROW_NUMBER() OVER (PARTITION BY pp.promotion_id ORDER BY pp.product_id) - 1,
       NOW(),
       NOW()
FROM promotion_products pp
JOIN promotions p ON p.id = pp.promotion_id
WHERE p.type = 'BUY_X_GET_Y';

ALTER TABLE promotions ADD COLUMN IF NOT EXISTS repeatable BOOLEAN NOT NULL DEFAULT TRUE;
