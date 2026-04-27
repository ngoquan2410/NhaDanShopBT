-- Stock adjustment reversal linkage + per-batch allocation trace (Phase 5).
-- Additive only; no backfill.

ALTER TABLE stock_adjustments
    ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS reversed_by VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS reversal_reason TEXT NULL,
    ADD COLUMN IF NOT EXISTS reversal_adjustment_id BIGINT NULL
        REFERENCES stock_adjustments (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reverses_adjustment_id BIGINT NULL
        REFERENCES stock_adjustments (id) ON DELETE SET NULL;

-- Only one child reversal document may point to a given original.
CREATE UNIQUE INDEX uq_stock_adjustments_reverses
    ON stock_adjustments (reverses_adjustment_id)
    WHERE reverses_adjustment_id IS NOT NULL;

ALTER TABLE stock_adjustments
    ADD CONSTRAINT ck_stock_adjustments_reverses_not_self
        CHECK (reverses_adjustment_id IS NULL OR reverses_adjustment_id <> id);

CREATE TABLE stock_adjustment_item_batch_allocations (
    id                 BIGSERIAL PRIMARY KEY,
    adjustment_item_id BIGINT      NOT NULL
        REFERENCES stock_adjustment_items (id) ON DELETE CASCADE,
    batch_id           BIGINT      NOT NULL
        REFERENCES product_batches (id),
    qty_delta          INT         NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_saiba_item ON stock_adjustment_item_batch_allocations (adjustment_item_id);
CREATE INDEX idx_saiba_batch ON stock_adjustment_item_batch_allocations (batch_id);
