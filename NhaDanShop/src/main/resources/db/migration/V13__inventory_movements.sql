CREATE TABLE IF NOT EXISTS inventory_movements (
    id          BIGSERIAL PRIMARY KEY,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    variant_id  BIGINT       NOT NULL
        REFERENCES product_variants(id),
    batch_id    BIGINT       NULL
        REFERENCES product_batches(id),
    qty_delta   INT          NOT NULL,
    source_type VARCHAR(50)  NOT NULL,
    source_id   VARCHAR(100) NOT NULL,
    note        TEXT         NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant_created_at
    ON inventory_movements (variant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_batch_created_at
    ON inventory_movements (batch_id, created_at);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_source
    ON inventory_movements (source_type, source_id);
