-- Phase 5B: read-path / reporting indexes (PostgreSQL).
-- Local-first migration; no CONCURRENTLY (Flyway runs in transaction).
-- Literals verified: sales_invoices.status = COMPLETED|CANCELLED (@Enumerated STRING);
-- inventory_receipts.status = confirmed|voided (V17); pending_orders.status = enum name (STRING).

-- ─── pending_orders: admin list/count (status + sort created_at) ───────────
CREATE INDEX IF NOT EXISTS idx_pending_orders_status_created_at
    ON pending_orders (status, created_at DESC);

-- Scheduler / expiry sweep: findByStatusAndExpiresAtBefore
CREATE INDEX IF NOT EXISTS idx_pending_orders_status_expires_at
    ON pending_orders (status, expires_at);

-- ─── pending_order_items: FK child for hydrate/joins ───────────────────────
CREATE INDEX IF NOT EXISTS idx_pending_order_items_pending_order_id
    ON pending_order_items (pending_order_id);

-- ─── sales_invoices: COMPLETED-scoped partial indexes (customer stats, reports) ─
CREATE INDEX IF NOT EXISTS idx_sales_invoices_completed_customer_phone
    ON sales_invoices (customer_phone)
    WHERE status = 'COMPLETED' AND customer_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_invoices_completed_customer_id
    ON sales_invoices (customer_id)
    WHERE status = 'COMPLETED' AND customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_invoices_completed_invoice_date
    ON sales_invoices (invoice_date DESC)
    WHERE status = 'COMPLETED';

-- ─── product_batches: receipt listing / void paths; sellable predicate ───────
CREATE INDEX IF NOT EXISTS idx_product_batches_receipt_id
    ON product_batches (receipt_id)
    WHERE receipt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_batches_receipt_expiry
    ON product_batches (receipt_id, expiry_date)
    WHERE receipt_id IS NOT NULL;

-- Overlaps idx_pb_variant_id (variant_id, expiry_date, remaining_qty) but adds leading status for sellable queries.
CREATE INDEX IF NOT EXISTS idx_product_batches_variant_status_expiry_remaining
    ON product_batches (variant_id, status, expiry_date, remaining_qty);

-- ─── inventory_receipts: confirmed/voided reporting by date ───────────────
CREATE INDEX IF NOT EXISTS idx_inventory_receipts_status_receipt_date
    ON inventory_receipts (status, receipt_date DESC);

-- ─── products: category-scoped code / Phase 6 MAX suffix narrow scan ────────
CREATE INDEX IF NOT EXISTS idx_products_category_code
    ON products (category_id, code);
