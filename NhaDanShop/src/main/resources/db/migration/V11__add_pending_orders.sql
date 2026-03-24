-- V11: Tạo bảng pending_orders và pending_order_items cho tính năng đặt hàng online

CREATE TABLE pending_orders (
    id            BIGINT IDENTITY(1,1) PRIMARY KEY,
    order_no      NVARCHAR(50)   NOT NULL UNIQUE,
    customer_name NVARCHAR(150)  NULL,
    note          NVARCHAR(500)  NULL,
    payment_method NVARCHAR(20)  NOT NULL,
    status        NVARCHAR(20)   NOT NULL DEFAULT 'PENDING',  -- PENDING | CONFIRMED | CANCELLED
    cancel_reason NVARCHAR(255)  NULL,
    total_amount  DECIMAL(18,2)  NOT NULL DEFAULT 0,
    expires_at    DATETIME2      NOT NULL,
    invoice_id    BIGINT         NULL,
    created_by    BIGINT         NULL,
    created_at    DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
    updated_at    DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT fk_pending_orders_user    FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_pending_orders_invoice FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id)
);

CREATE TABLE pending_order_items (
    id               BIGINT IDENTITY(1,1) PRIMARY KEY,
    pending_order_id BIGINT        NOT NULL,
    product_id       BIGINT        NOT NULL,
    quantity         INT           NOT NULL,
    unit_price       DECIMAL(18,2) NOT NULL,
    CONSTRAINT fk_poi_order   FOREIGN KEY (pending_order_id) REFERENCES pending_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_poi_product FOREIGN KEY (product_id)       REFERENCES products(id)
);
