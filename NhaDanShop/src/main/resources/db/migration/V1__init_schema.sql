CREATE TABLE roles (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(50) NOT NULL UNIQUE,
    description NVARCHAR(255) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

CREATE TABLE users (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(100) NOT NULL UNIQUE,
    password NVARCHAR(255) NOT NULL,
    full_name NVARCHAR(150) NULL,
    is_active BIT NOT NULL DEFAULT 1,
    role_id BIGINT NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE categories (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL UNIQUE,
    description NVARCHAR(255) NULL,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

CREATE TABLE products (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    code NVARCHAR(50) NOT NULL UNIQUE,
    name NVARCHAR(150) NOT NULL,
    unit NVARCHAR(50) NOT NULL DEFAULT N'goi',
    cost_price DECIMAL(18,2) NOT NULL DEFAULT 0,
    sell_price DECIMAL(18,2) NOT NULL DEFAULT 0,
    stock_quantity INT NOT NULL DEFAULT 0,
    is_active BIT NOT NULL DEFAULT 1,
    category_id BIGINT NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id),
    CONSTRAINT ck_products_cost_price CHECK (cost_price >= 0),
    CONSTRAINT ck_products_sale_price CHECK (sell_price >= 0),
    CONSTRAINT ck_products_stock_quantity CHECK (stock_quantity >= 0)
);

CREATE TABLE inventory_receipts (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    receipt_no NVARCHAR(50) NOT NULL UNIQUE,
    receipt_date DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    supplier_name NVARCHAR(150) NULL,
    note NVARCHAR(500) NULL,
    total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    created_by BIGINT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT fk_inventory_receipts_user FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT ck_inventory_receipts_total CHECK (total_amount >= 0)
);

CREATE TABLE inventory_receipt_items (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    receipt_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    quantity INT NOT NULL,
    unit_cost DECIMAL(18,2) NOT NULL,
    line_total AS (quantity * unit_cost) PERSISTED,
    CONSTRAINT fk_inventory_items_receipt FOREIGN KEY (receipt_id) REFERENCES inventory_receipts(id) ON DELETE CASCADE,
    CONSTRAINT fk_inventory_items_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT ck_inventory_items_quantity CHECK (quantity > 0),
    CONSTRAINT ck_inventory_items_unit_cost CHECK (unit_cost >= 0),
    CONSTRAINT uq_inventory_items UNIQUE (receipt_id, product_id)
);

CREATE TABLE sales_invoices (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    invoice_no NVARCHAR(50) NOT NULL UNIQUE,
    invoice_date DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    customer_name NVARCHAR(150) NULL,
    note NVARCHAR(500) NULL,
    total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    created_by BIGINT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT fk_sales_invoices_user FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT ck_sales_invoices_total CHECK (total_amount >= 0)
);

CREATE TABLE sales_invoice_items (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    invoice_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(18,2) NOT NULL,
    unit_cost_snapshot DECIMAL(18,2) NOT NULL DEFAULT 0,
    line_total AS (quantity * unit_price) PERSISTED,
    profit AS (quantity * (unit_price - unit_cost_snapshot)) PERSISTED,
    CONSTRAINT fk_sales_items_invoice FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
    CONSTRAINT fk_sales_items_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT ck_sales_items_quantity CHECK (quantity > 0),
    CONSTRAINT ck_sales_items_unit_price CHECK (unit_price >= 0),
    CONSTRAINT ck_sales_items_unit_cost_snapshot CHECK (unit_cost_snapshot >= 0),
    CONSTRAINT uq_sales_items UNIQUE (invoice_id, product_id)
);

CREATE INDEX ix_products_category_id ON products(category_id);
CREATE INDEX ix_inventory_receipts_receipt_date ON inventory_receipts(receipt_date);
CREATE INDEX ix_sales_invoices_invoice_date ON sales_invoices(invoice_date);
CREATE INDEX ix_sales_items_product_id ON sales_invoice_items(product_id);
CREATE INDEX ix_inventory_items_product_id ON inventory_receipt_items(product_id);