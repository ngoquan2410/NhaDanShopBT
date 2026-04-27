-- Optional lot target for stock adjustment lines (e.g. drain wrong-expiry batch before re-receipt).
ALTER TABLE stock_adjustment_items
    ADD COLUMN source_batch_id BIGINT NULL
        REFERENCES product_batches(id);
