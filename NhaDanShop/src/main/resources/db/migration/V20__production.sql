-- Slice 6: Production recipes + completed-on-create production orders.

CREATE TABLE production_recipes (
    id BIGSERIAL PRIMARY KEY,
    recipe_code VARCHAR(80) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    output_product_id BIGINT NOT NULL REFERENCES products (id),
    output_variant_id BIGINT NOT NULL REFERENCES product_variants (id),
    output_qty INT NOT NULL CHECK (output_qty > 0),
    output_must_be_sellable BOOLEAN NOT NULL DEFAULT TRUE,
    overhead_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX idx_production_recipes_output_variant ON production_recipes (output_variant_id);
CREATE INDEX idx_production_recipes_archived ON production_recipes (archived);

CREATE TABLE production_recipe_components (
    id BIGSERIAL PRIMARY KEY,
    recipe_id BIGINT NOT NULL REFERENCES production_recipes (id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products (id),
    variant_id BIGINT NOT NULL REFERENCES product_variants (id),
    qty_per_output INT NOT NULL CHECK (qty_per_output > 0),
    unit VARCHAR(32) NOT NULL DEFAULT 'unit',
    sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_recipe_components_recipe ON production_recipe_components (recipe_id);
CREATE INDEX idx_recipe_components_variant ON production_recipe_components (variant_id);

CREATE TABLE production_orders (
    id BIGSERIAL PRIMARY KEY,
    order_no VARCHAR(50) NOT NULL UNIQUE,
    recipe_id BIGINT REFERENCES production_recipes (id),
    status VARCHAR(20) NOT NULL CHECK (status IN ('completed', 'voided')),
    output_product_id BIGINT NOT NULL REFERENCES products (id),
    output_variant_id BIGINT NOT NULL REFERENCES product_variants (id),
    output_qty INT NOT NULL CHECK (output_qty > 0),
    output_must_be_sellable BOOLEAN NOT NULL,
    overhead_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
    recipe_snapshot_json TEXT NOT NULL,
    output_batch_id BIGINT REFERENCES product_batches (id),
    output_unit_cost NUMERIC(18, 2) NOT NULL,
    output_expiry_date DATE NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    voided_at TIMESTAMPTZ,
    void_reason TEXT
);

CREATE INDEX idx_production_orders_status ON production_orders (status);
CREATE INDEX idx_production_orders_recipe ON production_orders (recipe_id);
CREATE INDEX idx_production_orders_created ON production_orders (created_at DESC);

CREATE TABLE production_order_components (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES production_orders (id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL,
    variant_id BIGINT NOT NULL,
    required_qty INT NOT NULL CHECK (required_qty > 0),
    consumed_qty INT NOT NULL CHECK (consumed_qty > 0),
    unit VARCHAR(32) NOT NULL DEFAULT 'unit'
);

CREATE INDEX idx_po_components_order ON production_order_components (order_id);

CREATE TABLE production_order_allocations (
    id BIGSERIAL PRIMARY KEY,
    order_component_id BIGINT NOT NULL REFERENCES production_order_components (id) ON DELETE CASCADE,
    batch_id BIGINT NOT NULL REFERENCES product_batches (id),
    qty INT NOT NULL CHECK (qty > 0),
    unit_cost NUMERIC(18, 2) NOT NULL,
    expiry_date DATE
);

CREATE INDEX idx_po_alloc_batch ON production_order_allocations (batch_id);

ALTER TABLE product_batches
    ADD COLUMN IF NOT EXISTS production_order_id BIGINT REFERENCES production_orders (id);

CREATE INDEX idx_product_batches_production_order ON product_batches (production_order_id);
