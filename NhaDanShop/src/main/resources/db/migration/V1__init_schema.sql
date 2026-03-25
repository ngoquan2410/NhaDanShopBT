CREATE TABLE roles (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(50)  NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id         BIGSERIAL    PRIMARY KEY,
    username   VARCHAR(100) NOT NULL UNIQUE,
    password   VARCHAR(255) NOT NULL,
    full_name  VARCHAR(150) NULL,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    role_id    BIGINT       NOT NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE categories (
    id          BIGSERIAL    PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
    id             BIGSERIAL      PRIMARY KEY,
    code           VARCHAR(50)    NOT NULL UNIQUE,
    name           VARCHAR(150)   NOT NULL,
    unit           VARCHAR(50)    NOT NULL DEFAULT 'goi',
    cost_price     DECIMAL(18,2)  NOT NULL DEFAULT 0,
    sell_price     DECIMAL(18,2)  NOT NULL DEFAULT 0,
    stock_quantity INT            NOT NULL DEFAULT 0,
    is_active      BOOLEAN        NOT NULL DEFAULT TRUE,
    category_id    BIGINT         NOT NULL,
    created_at     TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP      NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_products_category      FOREIGN KEY (category_id) REFERENCES categories(id),
    CONSTRAINT ck_products_cost_price    CHECK (cost_price >= 0),
    CONSTRAINT ck_products_sale_price    CHECK (sell_price >= 0),
    CONSTRAINT ck_products_stock_quantity CHECK (stock_quantity >= 0)
);

CREATE TABLE inventory_receipts (
    id            BIGSERIAL      PRIMARY KEY,
    receipt_no    VARCHAR(50)    NOT NULL UNIQUE,
    receipt_date  TIMESTAMP      NOT NULL DEFAULT NOW(),
    supplier_name VARCHAR(150)   NULL,
    note          VARCHAR(500)   NULL,
    total_amount  DECIMAL(18,2)  NOT NULL DEFAULT 0,
    created_by    BIGINT         NULL,
    created_at    TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP      NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_inventory_receipts_user FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT ck_inventory_receipts_total CHECK (total_amount >= 0)
);

CREATE TABLE inventory_receipt_items (
    id         BIGSERIAL      PRIMARY KEY,
    receipt_id BIGINT         NOT NULL,
    product_id BIGINT         NOT NULL,
    quantity   INT            NOT NULL,
    unit_cost  DECIMAL(18,2)  NOT NULL,
    line_total DECIMAL(18,2)  GENERATED ALWAYS AS (quantity * unit_cost) STORED,
    CONSTRAINT fk_inventory_items_receipt FOREIGN KEY (receipt_id) REFERENCES inventory_receipts(id) ON DELETE CASCADE,
    CONSTRAINT fk_inventory_items_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT ck_inventory_items_quantity  CHECK (quantity > 0),
    CONSTRAINT ck_inventory_items_unit_cost CHECK (unit_cost >= 0),
    CONSTRAINT uq_inventory_items UNIQUE (receipt_id, product_id)
);

CREATE TABLE sales_invoices (
    id            BIGSERIAL      PRIMARY KEY,
    invoice_no    VARCHAR(50)    NOT NULL UNIQUE,
    invoice_date  TIMESTAMP      NOT NULL DEFAULT NOW(),
    customer_name VARCHAR(150)   NULL,
    note          VARCHAR(500)   NULL,
    total_amount  DECIMAL(18,2)  NOT NULL DEFAULT 0,
    created_by    BIGINT         NULL,
    created_at    TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP      NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_sales_invoices_user FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT ck_sales_invoices_total CHECK (total_amount >= 0)
);

CREATE TABLE sales_invoice_items (
    id                  BIGSERIAL      PRIMARY KEY,
    invoice_id          BIGINT         NOT NULL,
    product_id          BIGINT         NOT NULL,
    quantity            INT            NOT NULL,
    unit_price          DECIMAL(18,2)  NOT NULL,
    unit_cost_snapshot  DECIMAL(18,2)  NOT NULL DEFAULT 0,
    line_total          DECIMAL(18,2)  GENERATED ALWAYS AS (quantity * unit_price) STORED,
    profit              DECIMAL(18,2)  GENERATED ALWAYS AS (quantity * (unit_price - unit_cost_snapshot)) STORED,
    CONSTRAINT fk_sales_items_invoice    FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
    CONSTRAINT fk_sales_items_product    FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT ck_sales_items_quantity         CHECK (quantity > 0),
    CONSTRAINT ck_sales_items_unit_price       CHECK (unit_price >= 0),
    CONSTRAINT ck_sales_items_unit_cost_snapshot CHECK (unit_cost_snapshot >= 0),
    CONSTRAINT uq_sales_items UNIQUE (invoice_id, product_id)
);

CREATE INDEX ix_products_category_id            ON products(category_id);
CREATE INDEX ix_inventory_receipts_receipt_date ON inventory_receipts(receipt_date);
CREATE INDEX ix_sales_invoices_invoice_date     ON sales_invoices(invoice_date);
CREATE INDEX ix_sales_items_product_id          ON sales_invoice_items(product_id);
CREATE INDEX ix_inventory_items_product_id      ON inventory_receipt_items(product_id);
