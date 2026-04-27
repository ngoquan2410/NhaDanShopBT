-- V18: ProductBatch.status metadata column (Slice 1, additive only).
--
-- Scope:
--   * Add product_batches.status as metadata only.
--   * Backfill from existing receipt void state and remaining_qty.
--
-- Non-goals (intentionally NOT changed by this migration):
--   * Does NOT mutate remaining_qty.
--   * Does NOT mutate ProductVariant.stockQty.
--   * Does NOT change FEFO / projection / reporting predicates.
--   * Does NOT touch InventoryMovement ledger.
--   * Does NOT introduce sellableQty.

-- ─── Pre-flight stop condition ─────────────────────────────────────────────
-- Voided receipts must already have zeroed remaining_qty on their batches
-- (the void path in InventoryReceiptService deducts remaining_qty to zero).
-- If any voided-receipt batch still holds stock, abort the migration:
-- this slice must not silently absorb a data drift. Reconciliation must
-- happen via a stock adjustment, not a backfill.
DO $$
DECLARE
    bad_count INT;
BEGIN
    SELECT COUNT(*)
      INTO bad_count
      FROM product_batches pb
      JOIN inventory_receipts ir ON ir.id = pb.receipt_id
     WHERE ir.status = 'voided'
       AND pb.remaining_qty > 0;
    IF bad_count > 0 THEN
        RAISE EXCEPTION
            'V18 aborted: % batch(es) linked to voided receipts still have remaining_qty > 0. Reconcile via stock adjustment before re-running. This migration must not mutate stock quantities.',
            bad_count;
    END IF;
END $$;

-- ─── Add column with safe default ──────────────────────────────────────────
-- Existing rows are filled with 'active' by the DEFAULT clause (PG fast path).
ALTER TABLE product_batches
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active';

-- ─── Allowed values constraint (idempotent) ────────────────────────────────
ALTER TABLE product_batches
    DROP CONSTRAINT IF EXISTS chk_product_batches_status;

ALTER TABLE product_batches
    ADD CONSTRAINT chk_product_batches_status
    CHECK (status IN ('active', 'depleted', 'voided', 'blocked', 'archived'));

-- ─── Backfill ──────────────────────────────────────────────────────────────
-- 1) Batches linked to a voided receipt → 'voided'.
UPDATE product_batches AS pb
   SET status = 'voided'
  FROM inventory_receipts AS ir
 WHERE ir.id = pb.receipt_id
   AND ir.status = 'voided'
   AND pb.status <> 'voided';

-- 2) Remaining (still 'active') with remaining_qty = 0 → 'depleted'.
--    Includes batches without a receipt (receipt_id IS NULL): the rule is
--    purely driven by remaining_qty when no voided link applies.
UPDATE product_batches
   SET status = 'depleted'
 WHERE remaining_qty = 0
   AND status = 'active';

-- 3) All other rows keep the default 'active' (remaining_qty > 0 and not voided).
