ALTER TABLE promotions
    ADD COLUMN IF NOT EXISTS min_order_scope VARCHAR(32) NOT NULL DEFAULT 'ELIGIBLE_ITEMS';

UPDATE promotions
SET min_order_scope = 'ELIGIBLE_ITEMS'
WHERE min_order_scope IS NULL OR BTRIM(min_order_scope) = '';
