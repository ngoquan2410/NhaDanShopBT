-- Slice 8: unified user/customer loyalty identity and point ledger
ALTER TABLE users ADD COLUMN customer_id BIGINT;
ALTER TABLE users ADD CONSTRAINT uk_users_customer_id UNIQUE (customer_id);
ALTER TABLE users ADD CONSTRAINT fk_users_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);

ALTER TABLE customers ADD COLUMN point_balance BIGINT NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN point_reserved BIGINT NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN lifetime_points_earned BIGINT NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN lifetime_points_redeemed BIGINT NOT NULL DEFAULT 0;

ALTER TABLE sales_invoice_items ADD COLUMN allocated_loyalty_discount DECIMAL(18, 2);
ALTER TABLE pending_order_items ADD COLUMN allocated_loyalty_discount DECIMAL(18, 2);
ALTER TABLE sales_invoices ADD COLUMN loyalty_discount_amount DECIMAL(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE sales_invoices ADD COLUMN loyalty_redeemed_points BIGINT NOT NULL DEFAULT 0;

CREATE TABLE loyalty_settings (
    id BIGINT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    earn_money_amount DECIMAL(18, 2) NOT NULL DEFAULT 1000,
    earn_points BIGINT NOT NULL DEFAULT 1,
    redeem_value_per_point DECIMAL(18, 2) NOT NULL DEFAULT 1,
    minimum_redeem_points BIGINT NOT NULL DEFAULT 1,
    max_redeem_percent DECIMAL(5, 2),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO loyalty_settings (id, enabled, earn_money_amount, earn_points, redeem_value_per_point, minimum_redeem_points, max_redeem_percent)
VALUES (1, TRUE, 1000, 1, 1, 1, NULL);

CREATE TABLE customer_point_reservations (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id),
    quote_public_id VARCHAR(36),
    pending_order_id BIGINT REFERENCES pending_orders(id),
    invoice_id BIGINT REFERENCES sales_invoices(id),
    points BIGINT NOT NULL CHECK (points > 0),
    discount_amount DECIMAL(18, 2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL,
    expires_at TIMESTAMP,
    reserved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    redeemed_at TIMESTAMP,
    released_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX ux_customer_point_reservation_active_pending
    ON customer_point_reservations (pending_order_id)
    WHERE status = 'RESERVED';

CREATE INDEX idx_customer_point_reservations_customer_status
    ON customer_point_reservations (customer_id, status);

CREATE TABLE customer_point_transactions (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id),
    invoice_id BIGINT REFERENCES sales_invoices(id),
    pending_order_id BIGINT REFERENCES pending_orders(id),
    reservation_id BIGINT REFERENCES customer_point_reservations(id),
    type VARCHAR(20) NOT NULL,
    points_delta BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    reserved_after BIGINT NOT NULL,
    money_base DECIMAL(18, 2),
    discount_amount DECIMAL(18, 2),
    reason VARCHAR(255),
    source VARCHAR(50),
    created_by_user_id BIGINT REFERENCES users(id),
    idempotency_key VARCHAR(160) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_point_transactions_customer_created
    ON customer_point_transactions (customer_id, created_at DESC);
