ALTER TABLE production_order_components
    ADD COLUMN IF NOT EXISTS product_name_snapshot VARCHAR(255),
    ADD COLUMN IF NOT EXISTS variant_name_snapshot VARCHAR(255),
    ADD COLUMN IF NOT EXISTS variant_code_snapshot VARCHAR(100);

ALTER TABLE production_order_allocations
    ADD COLUMN IF NOT EXISTS total_cost_snapshot NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS batch_code_snapshot VARCHAR(80),
    ADD COLUMN IF NOT EXISTS allocation_index INTEGER;
