ALTER TABLE pending_orders
    ADD COLUMN IF NOT EXISTS customer_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(30),
    ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100),
    ADD COLUMN IF NOT EXISTS shipping_address_json TEXT,
    ADD COLUMN IF NOT EXISTS gift_lines_snapshot_json TEXT,
    ADD COLUMN IF NOT EXISTS promotion_snapshot_json TEXT,
    ADD COLUMN IF NOT EXISTS voucher_snapshot_json TEXT,
    ADD COLUMN IF NOT EXISTS shipping_quote_snapshot_json TEXT,
    ADD COLUMN IF NOT EXISTS pricing_breakdown_snapshot_json TEXT;

UPDATE pending_orders
SET payment_reference = order_no
WHERE payment_reference IS NULL;

UPDATE pending_orders
SET status = 'PENDING_PAYMENT'
WHERE status = 'PENDING';

ALTER TABLE pending_orders
    ALTER COLUMN status SET DEFAULT 'PENDING_PAYMENT';

ALTER TABLE pending_order_items
    ADD COLUMN IF NOT EXISTS line_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS product_name_snapshot VARCHAR(255),
    ADD COLUMN IF NOT EXISTS variant_name_snapshot VARCHAR(255),
    ADD COLUMN IF NOT EXISTS line_subtotal DECIMAL(18,2);

UPDATE pending_order_items i
SET line_id = COALESCE(i.line_id, 'poi-' || i.id::text),
    line_subtotal = COALESCE(i.line_subtotal, COALESCE(i.unit_price, 0) * i.quantity),
    product_name_snapshot = COALESCE(
            i.product_name_snapshot,
            (SELECT p.name FROM products p WHERE p.id = i.product_id)
    ),
    variant_name_snapshot = COALESCE(
            i.variant_name_snapshot,
            (SELECT v.variant_name FROM product_variants v WHERE v.id = i.variant_id)
    );

ALTER TABLE pending_order_items
    ALTER COLUMN line_subtotal SET NOT NULL;
