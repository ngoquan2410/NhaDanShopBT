-- V11: Tạo bảng pending_orders và pending_order_items cho tính năng đặt hàng online

CREATE TABLE pending_orders (
    id             BIGSERIAL      PRIMARY KEY,
    order_no       VARCHAR(50)    NOT NULL UNIQUE,
    customer_name  VARCHAR(150)   NULL,
    note           VARCHAR(500)   NULL,
    payment_method VARCHAR(20)    NOT NULL,
    status         VARCHAR(20)    NOT NULL DEFAULT 'PENDING',  -- PENDING | CONFIRMED | CANCELLED
    cancel_reason  VARCHAR(255)   NULL,
    total_amount   DECIMAL(18,2)  NOT NULL DEFAULT 0,
    expires_at     TIMESTAMP      NOT NULL,
    invoice_id     BIGINT         NULL,
    created_by     BIGINT         NULL,
    created_at     TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP      NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_pending_orders_user    FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_pending_orders_invoice FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id)
);

CREATE TABLE pending_order_items (
    id               BIGSERIAL      PRIMARY KEY,
    pending_order_id BIGINT         NOT NULL,
    product_id       BIGINT         NOT NULL,
    quantity         INT            NOT NULL,
    unit_price       DECIMAL(18,2)  NOT NULL,
    CONSTRAINT fk_poi_order   FOREIGN KEY (pending_order_id) REFERENCES pending_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_poi_product FOREIGN KEY (product_id)       REFERENCES products(id)
);
