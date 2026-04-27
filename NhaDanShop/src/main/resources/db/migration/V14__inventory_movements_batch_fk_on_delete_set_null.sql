-- Allow product_batches rows to be deleted (e.g. receipt delete) while keeping ledger rows.
-- PostgreSQL default FK name for batch_id in V13 is inventory_movements_batch_id_fkey.
ALTER TABLE inventory_movements
    DROP CONSTRAINT IF EXISTS inventory_movements_batch_id_fkey;

ALTER TABLE inventory_movements
    ADD CONSTRAINT inventory_movements_batch_id_fkey
    FOREIGN KEY (batch_id) REFERENCES product_batches (id) ON DELETE SET NULL;
