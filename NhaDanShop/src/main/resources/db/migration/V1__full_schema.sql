-- =========================================================
-- FULL SCHEMA — NhaDanShop (V1 → V30 consolidated)
-- Ngày tổng hợp: 08/04/2026
--
-- Dùng để:
--   - Setup DB mới hoàn toàn (không cần chạy Flyway 30 file)
--   - Tham khảo thiết kế toàn bộ schema
--   - Seed test / staging environment
--
-- Thứ tự: Tables → Indexes → Constraints → Seed data
-- KHÔNG dùng file này song song với Flyway migration.
-- =========================================================

-- Bật extension nếu cần
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════════════════════════════════════════
-- PHẦN 1: BẢNG NỀN TẢNG (roles, users, categories)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE roles (
    id          BIGSERIAL    PRIMARY KEY,
    name        VARCHAR(50)  NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id           BIGSERIAL    PRIMARY KEY,
    username     VARCHAR(100) NOT NULL UNIQUE,
    password     VARCHAR(255) NOT NULL,
    full_name    VARCHAR(150) NULL,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    -- V12: TOTP 2FA
    totp_secret  VARCHAR(64)  NULL,
    totp_enabled BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- V3: junction table thay thế FK role_id trực tiếp
CREATE TABLE user_roles (
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    CONSTRAINT pk_user_roles PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE INDEX ix_user_roles_user_id ON user_roles(user_id);
CREATE INDEX ix_user_roles_role_id ON user_roles(role_id);

-- V12: refresh tokens
CREATE TABLE refresh_tokens (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    BIGINT      NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP   NOT NULL,
    revoked    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX ix_refresh_tokens_user_id    ON refresh_tokens(user_id);
CREATE INDEX ix_refresh_tokens_token_hash ON refresh_tokens(token_hash);

CREATE TABLE categories (
    id          BIGSERIAL    PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- PHẦN 2: SẢN PHẨM (products, variants, import_units, combos)
-- ══════════════════════════════════════════════════════════════════════════════

-- V1 + V19 (product_type) + V25 (drop deprecated cols) + V26 (description)
CREATE TABLE products (
    id           BIGSERIAL    PRIMARY KEY,
    code         VARCHAR(50)  NOT NULL UNIQUE,
    name         VARCHAR(150) NOT NULL,
    -- V19: phân biệt SP đơn và combo
    product_type VARCHAR(20)  NOT NULL DEFAULT 'SINGLE'
                     CONSTRAINT ck_product_type CHECK (product_type IN ('SINGLE', 'COMBO')),
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    category_id  BIGINT       NOT NULL
                     REFERENCES categories(id),
    -- V10: ảnh sản phẩm
    image_url    VARCHAR(500) NULL,
    -- V26: mô tả combo
    description  VARCHAR(1000) NULL,
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_products_category_id  ON products(category_id);
CREATE INDEX idx_products_type        ON products(product_type);
CREATE INDEX idx_products_type_active ON products(product_type, is_active);

-- V22: Product Variants — đơn vị giao dịch thực sự
CREATE TABLE product_variants (
    id              BIGSERIAL      PRIMARY KEY,
    product_id      BIGINT         NOT NULL
                        REFERENCES products(id) ON DELETE CASCADE,
    variant_code    VARCHAR(60)    NOT NULL UNIQUE,
    variant_name    VARCHAR(200)   NOT NULL,
    sell_unit       VARCHAR(20)    NOT NULL DEFAULT 'cai',
    import_unit     VARCHAR(20)    NULL,
    pieces_per_unit INT            NOT NULL DEFAULT 1
                        CONSTRAINT ck_pv_pieces CHECK (pieces_per_unit >= 1),
    sell_price      DECIMAL(18,2)  NOT NULL DEFAULT 0
                        CONSTRAINT ck_pv_sell_price CHECK (sell_price >= 0),
    cost_price      DECIMAL(18,2)  NOT NULL DEFAULT 0
                        CONSTRAINT ck_pv_cost_price CHECK (cost_price >= 0),
    stock_qty       INT            NOT NULL DEFAULT 0
                        CONSTRAINT ck_pv_stock CHECK (stock_qty >= 0),
    min_stock_qty   INT            NOT NULL DEFAULT 5
                        CONSTRAINT ck_pv_min_stock CHECK (min_stock_qty >= 0),
    expiry_days     INT            NULL,
    is_active       BOOLEAN        NOT NULL DEFAULT TRUE,
    is_default      BOOLEAN        NOT NULL DEFAULT FALSE,
    image_url       VARCHAR(500)   NULL,
    conversion_note VARCHAR(100)   NULL,
    created_at      TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP      NOT NULL DEFAULT NOW()
);

-- Mỗi SP chỉ có đúng 1 default variant
CREATE UNIQUE INDEX uq_pv_default
    ON product_variants (product_id)
    WHERE is_default = TRUE;

CREATE INDEX idx_pv_product_id
    ON product_variants (product_id, is_active);

-- V21: Đơn vị nhập kho đăng ký sẵn (gợi ý mặc định khi tạo phiếu nhập)
CREATE TABLE product_import_units (
    id              BIGSERIAL   PRIMARY KEY,
    product_id      BIGINT      NOT NULL
                        REFERENCES products(id) ON DELETE CASCADE,
    import_unit     VARCHAR(20) NOT NULL,
    sell_unit       VARCHAR(20) NOT NULL DEFAULT 'bich',
    pieces_per_unit INT         NOT NULL DEFAULT 1
                        CONSTRAINT ck_piu_pieces CHECK (pieces_per_unit >= 1),
    is_default      BOOLEAN     NOT NULL DEFAULT FALSE,
    note            VARCHAR(100) NULL,
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_piu_product_unit UNIQUE (product_id, import_unit)
);

CREATE UNIQUE INDEX uq_piu_default
    ON product_import_units (product_id)
    WHERE is_default = TRUE;

CREATE INDEX idx_piu_product_id ON product_import_units (product_id);

-- V19 + V26: Combo sản phẩm (theo mô hình KiotViet)
-- combo_product_id → products.id WHERE product_type='COMBO'
CREATE TABLE product_combo_items (
    id               BIGSERIAL PRIMARY KEY,
    combo_product_id BIGINT    NOT NULL
                         REFERENCES products(id) ON DELETE CASCADE,
    product_id       BIGINT    NOT NULL
                         REFERENCES products(id),
    quantity         INT       NOT NULL CHECK (quantity > 0),
    CONSTRAINT uq_combo_product UNIQUE (combo_product_id, product_id)
);

CREATE INDEX idx_pci_combo_product     ON product_combo_items (combo_product_id);
CREATE INDEX idx_pci_component_product ON product_combo_items (product_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- PHẦN 3: NHẬP KHO (inventory_receipts, inventory_receipt_items, batches)
-- ══════════════════════════════════════════════════════════════════════════════

-- V28: Nhà cung cấp
CREATE TABLE suppliers (
    id         BIGSERIAL    PRIMARY KEY,
    code       VARCHAR(50)  NOT NULL,
    name       VARCHAR(150) NOT NULL,
    phone      VARCHAR(20)  NULL,
    address    VARCHAR(300) NULL,
    tax_code   VARCHAR(30)  NULL,
    email      VARCHAR(100) NULL,
    note       VARCHAR(500) NULL,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_supplier_code ON suppliers (code);
CREATE INDEX idx_supplier_name       ON suppliers (name);
CREATE INDEX idx_supplier_active     ON suppliers (is_active) WHERE is_active = TRUE;

-- V1 + V14 (shipping/discount) + V18 (vat) + V28 (supplier_id)
CREATE TABLE inventory_receipts (
    id            BIGSERIAL      PRIMARY KEY,
    receipt_no    VARCHAR(50)    NOT NULL UNIQUE,
    receipt_date  TIMESTAMP      NOT NULL DEFAULT NOW(),
    supplier_name VARCHAR(150)   NULL,
    -- V28: FK nhà cung cấp
    supplier_id   BIGINT         NULL
                      REFERENCES suppliers(id) ON DELETE SET NULL,
    note          VARCHAR(500)   NULL,
    total_amount  DECIMAL(18,2)  NOT NULL DEFAULT 0
                      CONSTRAINT ck_inventory_receipts_total CHECK (total_amount >= 0),
    -- V14: phí vận chuyển
    shipping_fee  DECIMAL(18,2)  NOT NULL DEFAULT 0
                      CONSTRAINT ck_ir_shipping_fee CHECK (shipping_fee >= 0),
    -- V18: VAT tổng phiếu
    total_vat     DECIMAL(18,2)  NOT NULL DEFAULT 0,
    created_by    BIGINT         NULL
                      REFERENCES users(id),
    created_at    TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_inventory_receipts_receipt_date ON inventory_receipts(receipt_date);
CREATE INDEX idx_receipt_supplier
    ON inventory_receipts (supplier_id)
    WHERE supplier_id IS NOT NULL;

-- V1 + V14 (discount/shipping/final_cost) + V18 (vat) + V20 (snapshot) + V22 (variant) + V27 (expiry_override)
CREATE TABLE inventory_receipt_items (
    id                   BIGSERIAL      PRIMARY KEY,
    receipt_id           BIGINT         NOT NULL
                             REFERENCES inventory_receipts(id) ON DELETE CASCADE,
    product_id           BIGINT         NOT NULL
                             REFERENCES products(id),
    -- V22: variant
    variant_id           BIGINT         NULL
                             REFERENCES product_variants(id),
    quantity             INT            NOT NULL
                             CONSTRAINT ck_inventory_items_quantity CHECK (quantity > 0),
    unit_cost            DECIMAL(18,2)  NOT NULL
                             CONSTRAINT ck_inventory_items_unit_cost CHECK (unit_cost >= 0),
    -- V14: chiết khấu % từ NCC
    discount_percent     DECIMAL(5,2)   NOT NULL DEFAULT 0
                             CONSTRAINT ck_iri_discount CHECK (discount_percent >= 0 AND discount_percent <= 100),
    discounted_cost      DECIMAL(18,2)  NOT NULL DEFAULT 0,
    -- V14: phí ship phân bổ
    shipping_allocated   DECIMAL(18,2)  NOT NULL DEFAULT 0,
    -- V18: VAT
    vat_percent          DECIMAL(5,2)   NOT NULL DEFAULT 0
                             CONSTRAINT ck_iri_vat CHECK (vat_percent >= 0 AND vat_percent <= 100),
    vat_allocated        DECIMAL(18,2)  NOT NULL DEFAULT 0,
    -- V14: giá vốn sau ship (trước VAT)
    final_cost           DECIMAL(18,2)  NOT NULL DEFAULT 0,
    -- V18: giá vốn sau VAT
    final_cost_with_vat  DECIMAL(18,2)  NOT NULL DEFAULT 0,
    -- V20: snapshot đơn vị nhập
    import_unit_used     VARCHAR(20)    NULL,
    pieces_used          INT            NOT NULL DEFAULT 1
                             CONSTRAINT ck_iri_pieces_used CHECK (pieces_used >= 1),
    retail_qty_added     INT            NOT NULL DEFAULT 0
                             CONSTRAINT ck_iri_retail_qty CHECK (retail_qty_added >= 0),
    -- V27: ghi đè ngày HSD thực tế từ bao bì
    expiry_date_override DATE           NULL,
    CONSTRAINT uq_receipt_variant UNIQUE (receipt_id, variant_id)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_iri_receipt_variant    ON inventory_receipt_items(receipt_id, variant_id);
CREATE INDEX ix_inventory_items_product ON inventory_receipt_items(product_id);
CREATE INDEX idx_iri_expiry_override
    ON inventory_receipt_items (expiry_date_override)
    WHERE expiry_date_override IS NOT NULL;

-- V9 + V22 (variant_id) + V25 (variant NOT NULL)
CREATE TABLE product_batches (
    id            BIGSERIAL      PRIMARY KEY,
    -- V25: product_id optional (variant là source of truth)
    product_id    BIGINT         NULL
                      REFERENCES products(id),
    -- V22: variant bắt buộc (enforce NOT NULL sau backfill)
    variant_id    BIGINT         NOT NULL
                      REFERENCES product_variants(id),
    receipt_id    BIGINT         NULL
                      REFERENCES inventory_receipts(id),
    batch_code    VARCHAR(80)    NOT NULL UNIQUE,
    mfg_date      DATE           NULL,
    expiry_date   DATE           NOT NULL,
    import_qty    INT            NOT NULL,
    remaining_qty INT            NOT NULL,
    cost_price    DECIMAL(18,2)  NOT NULL,
    created_at    TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pb_product_expiry ON product_batches (product_id, expiry_date, remaining_qty);
CREATE INDEX idx_pb_expiry_date    ON product_batches (expiry_date, remaining_qty);
CREATE INDEX idx_pb_variant_id     ON product_batches (variant_id, expiry_date, remaining_qty);

-- ══════════════════════════════════════════════════════════════════════════════
-- PHẦN 4: KHUYẾN MÃI (promotions)
-- ══════════════════════════════════════════════════════════════════════════════

-- V14 + V17 (buy_x_get_y) + V18 (vat/quantity_gift)
CREATE TABLE promotions (
    id              BIGSERIAL      PRIMARY KEY,
    name            VARCHAR(200)   NOT NULL,
    description     VARCHAR(1000)  NULL,
    type            VARCHAR(50)    NOT NULL
                        CONSTRAINT ck_promotions_type
                            CHECK (type IN ('PERCENT_DISCOUNT','FIXED_DISCOUNT','BUY_X_GET_Y','FREE_SHIPPING','QUANTITY_GIFT')),
    discount_value  DECIMAL(18,2)  NOT NULL DEFAULT 0
                        CONSTRAINT ck_promotions_discount_value CHECK (discount_value >= 0),
    min_order_value DECIMAL(18,2)  NOT NULL DEFAULT 0,
    max_discount    DECIMAL(18,2)  NULL,
    start_date      TIMESTAMP      NOT NULL,
    end_date        TIMESTAMP      NOT NULL,
    is_active       BOOLEAN        NOT NULL DEFAULT TRUE,
    applies_to      VARCHAR(20)    NOT NULL DEFAULT 'ALL',
    -- V17: BUY_X_GET_Y
    buy_qty         INT            NULL,
    get_product_id  BIGINT         NULL
                        REFERENCES products(id) ON DELETE SET NULL,
    get_qty         INT            NULL,
    -- V18: QUANTITY_GIFT
    min_buy_qty     INT            NULL,
    max_buy_qty     INT            NULL,
    created_at      TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP      NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_promotions_dates CHECK (end_date > start_date)
);

CREATE INDEX idx_promotions_active_dates ON promotions(is_active, start_date, end_date);

CREATE TABLE promotion_categories (
    promotion_id BIGINT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    category_id  BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (promotion_id, category_id)
);

CREATE TABLE promotion_products (
    promotion_id BIGINT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    product_id   BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    PRIMARY KEY (promotion_id, product_id)
);

-- ══════════════════════════════════════════════════════════════════════════════
-- PHẦN 5: KHÁCH HÀNG (Sprint 2)
-- ══════════════════════════════════════════════════════════════════════════════

-- V30: Khách hàng
CREATE TABLE customers (
    id             BIGSERIAL      PRIMARY KEY,
    code           VARCHAR(50)    NOT NULL,
    name           VARCHAR(150)   NOT NULL,
    phone          VARCHAR(20)    NULL,
    address        VARCHAR(300)   NULL,
    email          VARCHAR(100)   NULL,
    customer_group VARCHAR(30)    NOT NULL DEFAULT 'RETAIL',
    total_spend    DECIMAL(18,2)  NOT NULL DEFAULT 0,
    debt           DECIMAL(18,2)  NOT NULL DEFAULT 0,
    note           VARCHAR(500)   NULL,
    is_active      BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_customer_code ON customers (code);
CREATE INDEX idx_customer_phone      ON customers (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_customer_name       ON customers (name);
CREATE INDEX idx_customer_group      ON customers (customer_group);
CREATE INDEX idx_customer_active     ON customers (is_active) WHERE is_active = TRUE;

-- ══════════════════════════════════════════════════════════════════════════════
-- PHẦN 6: BÁN HÀNG (sales_invoices, sales_invoice_items, pending_orders)
-- ══════════════════════════════════════════════════════════════════════════════

-- V1 + V15 (promotion) + V16 (discount) + V30 (customer_id)
CREATE TABLE sales_invoices (
    id             BIGSERIAL      PRIMARY KEY,
    invoice_no     VARCHAR(50)    NOT NULL UNIQUE,
    invoice_date   TIMESTAMP      NOT NULL DEFAULT NOW(),
    customer_name  VARCHAR(150)   NULL,
    -- V30: FK khách hàng (NULL = khách vãng lai)
    customer_id    BIGINT         NULL
                       REFERENCES customers(id) ON DELETE SET NULL,
    note           VARCHAR(500)   NULL,
    total_amount   DECIMAL(18,2)  NOT NULL DEFAULT 0
                       CONSTRAINT ck_sales_invoices_total CHECK (total_amount >= 0),
    -- V15: khuyến mãi
    promotion_id   BIGINT         NULL
                       CONSTRAINT fk_si_promotion REFERENCES promotions(id) ON DELETE SET NULL,
    promotion_name VARCHAR(200)   NULL,
    discount_amount DECIMAL(18,2) NOT NULL DEFAULT 0
                        CONSTRAINT ck_si_discount_amount CHECK (discount_amount >= 0),
    created_by     BIGINT         NULL
                       REFERENCES users(id),
    created_at     TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_sales_invoices_invoice_date ON sales_invoices(invoice_date);
CREATE INDEX idx_invoice_customer
    ON sales_invoices (customer_id)
    WHERE customer_id IS NOT NULL;

-- V1 + V16 (line_discount) + V22 (variant) + V25 (drop uq) + V26 (combo_source)
CREATE TABLE sales_invoice_items (
    id                   BIGSERIAL      PRIMARY KEY,
    invoice_id           BIGINT         NOT NULL
                             REFERENCES sales_invoices(id) ON DELETE CASCADE,
    product_id           BIGINT         NOT NULL
                             REFERENCES products(id),
    -- V22: variant
    variant_id           BIGINT         NULL
                             REFERENCES product_variants(id),
    quantity             INT            NOT NULL
                             CONSTRAINT ck_sales_items_quantity CHECK (quantity > 0),
    -- V16: giá gốc trước CK dòng
    original_unit_price  DECIMAL(18,2)  NOT NULL DEFAULT 0,
    -- V16: chiết khấu dòng %
    line_discount_percent DECIMAL(5,2)  NOT NULL DEFAULT 0
                              CONSTRAINT ck_sii_line_discount
                                  CHECK (line_discount_percent >= 0 AND line_discount_percent <= 100),
    unit_price           DECIMAL(18,2)  NOT NULL
                             CONSTRAINT ck_sales_items_unit_price CHECK (unit_price >= 0),
    unit_cost_snapshot   DECIMAL(18,2)  NOT NULL DEFAULT 0
                             CONSTRAINT ck_sales_items_unit_cost_snapshot CHECK (unit_cost_snapshot >= 0),
    line_total           DECIMAL(18,2)  GENERATED ALWAYS AS (quantity * unit_price) STORED,
    profit               DECIMAL(18,2)  GENERATED ALWAYS AS (quantity * (unit_price - unit_cost_snapshot)) STORED,
    -- V26: tracking combo (NULL = bán lẻ thường)
    combo_source_id      BIGINT         NULL
                             REFERENCES products(id) ON DELETE SET NULL,
    combo_unit_price     DECIMAL(18,2)  NULL
);

CREATE INDEX ix_sales_items_product_id ON sales_invoice_items(product_id);
CREATE INDEX idx_sii_invoice_variant   ON sales_invoice_items (invoice_id, variant_id);
CREATE INDEX idx_sii_combo_source
    ON sales_invoice_items (combo_source_id)
    WHERE combo_source_id IS NOT NULL;

-- V11 + V22 (variant_id)
CREATE TABLE pending_orders (
    id             BIGSERIAL      PRIMARY KEY,
    order_no       VARCHAR(50)    NOT NULL UNIQUE,
    customer_name  VARCHAR(150)   NULL,
    note           VARCHAR(500)   NULL,
    payment_method VARCHAR(20)    NOT NULL,
    status         VARCHAR(20)    NOT NULL DEFAULT 'PENDING',
    cancel_reason  VARCHAR(255)   NULL,
    total_amount   DECIMAL(18,2)  NOT NULL DEFAULT 0,
    expires_at     TIMESTAMP      NOT NULL,
    invoice_id     BIGINT         NULL
                       REFERENCES sales_invoices(id),
    created_by     BIGINT         NULL
                       REFERENCES users(id),
    created_at     TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE TABLE pending_order_items (
    id               BIGSERIAL      PRIMARY KEY,
    pending_order_id BIGINT         NOT NULL
                         REFERENCES pending_orders(id) ON DELETE CASCADE,
    product_id       BIGINT         NOT NULL
                         REFERENCES products(id),
    -- V22: variant
    variant_id       BIGINT         NULL
                         REFERENCES product_variants(id),
    quantity         INT            NOT NULL,
    unit_price       DECIMAL(18,2)  NOT NULL
);

-- ══════════════════════════════════════════════════════════════════════════════
-- PHẦN 7: KIỂM KÊ / ĐIỀU CHỈNH TỒN KHO (Sprint 1)
-- ══════════════════════════════════════════════════════════════════════════════

-- V29: Phiếu điều chỉnh tồn kho
CREATE TABLE stock_adjustments (
    id           BIGSERIAL    PRIMARY KEY,
    adj_no       VARCHAR(50)  NOT NULL UNIQUE,
    adj_date     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    reason       VARCHAR(50)  NOT NULL,   -- EXPIRED|DAMAGED|LOST|STOCKTAKE|OTHER
    note         VARCHAR(500) NULL,
    status       VARCHAR(20)  NOT NULL DEFAULT 'DRAFT',  -- DRAFT|CONFIRMED
    created_by   BIGINT       NULL REFERENCES users(id) ON DELETE SET NULL,
    confirmed_by BIGINT       NULL REFERENCES users(id) ON DELETE SET NULL,
    confirmed_at TIMESTAMPTZ  NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sa_status   ON stock_adjustments (status);
CREATE INDEX idx_sa_adj_date ON stock_adjustments (adj_date DESC);

CREATE TABLE stock_adjustment_items (
    id            BIGSERIAL PRIMARY KEY,
    adjustment_id BIGINT    NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
    variant_id    BIGINT    NOT NULL REFERENCES product_variants(id),
    system_qty    INTEGER   NOT NULL,
    actual_qty    INTEGER   NOT NULL,
    diff_qty      INTEGER   GENERATED ALWAYS AS (actual_qty - system_qty) STORED,
    note          VARCHAR(200) NULL
);

CREATE INDEX idx_sai_adjustment ON stock_adjustment_items (adjustment_id);
CREATE INDEX idx_sai_variant    ON stock_adjustment_items (variant_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- PHẦN 8: SEED DATA (roles, admin user, categories)
-- ══════════════════════════════════════════════════════════════════════════════

-- V2: Roles
INSERT INTO roles(name, description) VALUES
    ('ROLE_ADMIN', 'Administrator'),
    ('ROLE_USER',  'Normal user');

-- V5 (hash cuối cùng đã verify): admin / admin123
INSERT INTO users(username, password, full_name, is_active, totp_enabled)
VALUES (
    'admin',
    '$2a$10$BHRoYv9VYEPCX8rTQKbbUuoLCDSo0YoxXfUSeqPXRGr3PCdo6Oh9a',
    'Administrator',
    TRUE,
    FALSE
);

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u CROSS JOIN roles r
WHERE u.username = 'admin' AND r.name = 'ROLE_ADMIN';

-- V3: user / user123
INSERT INTO users(username, password, full_name, is_active, totp_enabled)
VALUES (
    'user',
    '$2a$10$OLzwARbxuyxyJKbcjuErJOzXyjhHmvQNrL6z/K.3vd5Sv4R1bOx3S',
    'Normal User',
    TRUE,
    FALSE
);

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u CROSS JOIN roles r
WHERE u.username = 'user' AND r.name = 'ROLE_USER';

-- V13: dummy users (password: user123)
INSERT INTO users(username, password, full_name, is_active, totp_enabled) VALUES
    ('nguyen_van_a', '$2a$10$OLzwARbxuyxyJKbcjuErJOzXyjhHmvQNrL6z/K.3vd5Sv4R1bOx3S', 'Nguyễn Văn A', TRUE, FALSE),
    ('tran_thi_b',   '$2a$10$OLzwARbxuyxyJKbcjuErJOzXyjhHmvQNrL6z/K.3vd5Sv4R1bOx3S', 'Trần Thị B',   TRUE, FALSE),
    ('le_van_c',     '$2a$10$OLzwARbxuyxyJKbcjuErJOzXyjhHmvQNrL6z/K.3vd5Sv4R1bOx3S', 'Lê Văn C',     TRUE, FALSE);

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u CROSS JOIN roles r
WHERE u.username IN ('nguyen_van_a','tran_thi_b','le_van_c') AND r.name = 'ROLE_USER';

-- V13: user có TOTP demo (user_totp / user123 + secret JBSWY3DPEHPK3PXP)
INSERT INTO users(username, password, full_name, is_active, totp_secret, totp_enabled)
VALUES (
    'user_totp',
    '$2a$10$OLzwARbxuyxyJKbcjuErJOzXyjhHmvQNrL6z/K.3vd5Sv4R1bOx3S',
    'User Demo TOTP',
    TRUE,
    'JBSWY3DPEHPK3PXP',
    TRUE
);

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u CROSS JOIN roles r
WHERE u.username = 'user_totp' AND r.name = 'ROLE_USER';

-- V13: admin có TOTP demo (admin_totp / admin123 + secret JBSWY3DPEHPK3PXQ)
INSERT INTO users(username, password, full_name, is_active, totp_secret, totp_enabled)
VALUES (
    'admin_totp',
    '$2a$10$BHRoYv9VYEPCX8rTQKbbUuoLCDSo0YoxXfUSeqPXRGr3PCdo6Oh9a',
    'Admin Demo TOTP',
    TRUE,
    'JBSWY3DPEHPK3PXQ',
    TRUE
);

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u CROSS JOIN roles r
WHERE u.username = 'admin_totp' AND r.name = 'ROLE_ADMIN';

-- V8: Danh mục mặc định
INSERT INTO categories (name, description, is_active) VALUES
    ('Bánh Tráng', 'Tổng hợp tất cả các loại Bánh Tráng.', TRUE),
    ('Muối',       'Tổng hợp tất cả các loại Muối.',       TRUE),
    ('Cơm Cháy',   'Tổng hợp tất cả các loại Cơm Cháy.',   TRUE);

-- ══════════════════════════════════════════════════════════════════════════════
-- PHẦN 9: COMMENTS TỔNG HỢP
-- ══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE customers                        IS 'Danh mục khách hàng — Sprint 2';
COMMENT ON COLUMN customers.code                  IS 'Mã KH: KH001, KH002... (unique)';
COMMENT ON COLUMN customers.customer_group        IS 'RETAIL=Khách lẻ | WHOLESALE=Bán sỉ | VIP=Khách VIP';
COMMENT ON COLUMN customers.total_spend           IS 'Tổng tiền đã mua (tích lũy tự động khi tạo HĐ)';
COMMENT ON COLUMN customers.debt                  IS 'Công nợ — dự phòng Sprint 3';

COMMENT ON TABLE suppliers                        IS 'Danh mục nhà cung cấp — Sprint 1';
COMMENT ON COLUMN suppliers.code                  IS 'Mã NCC: NCC001... (unique)';
COMMENT ON COLUMN suppliers.tax_code              IS 'Mã số thuế doanh nghiệp';

COMMENT ON TABLE product_variants                 IS 'Biến thể đóng gói của SP. 1 SP → N variants, mỗi variant = 1 đơn vị GD độc lập.';
COMMENT ON COLUMN product_variants.is_default     IS 'TRUE = variant chính. Tự động chọn khi không chỉ định variantId. Mỗi SP chỉ có 1 default.';
COMMENT ON COLUMN product_variants.variant_code   IS 'Mã bán hàng (scan barcode). Với SP 1 variant → variant_code = product.code.';

COMMENT ON TABLE product_import_units             IS 'Đơn vị nhập đăng ký sẵn. Là GỢI Ý mặc định — source of truth thực sự là inventory_receipt_items.pieces_used (snapshot bất biến).';

COMMENT ON COLUMN inventory_receipt_items.import_unit_used     IS 'Snapshot ĐV nhập tại thời điểm tạo phiếu. Bất biến.';
COMMENT ON COLUMN inventory_receipt_items.pieces_used          IS 'Snapshot số ĐV bán lẻ / 1 ĐV nhập. Bất biến.';
COMMENT ON COLUMN inventory_receipt_items.retail_qty_added     IS 'Số ĐV bán lẻ đã cộng tồn = quantity × pieces_used. Bất biến.';
COMMENT ON COLUMN inventory_receipt_items.expiry_date_override IS 'Ngày HSD thực tế ghi đè (Sprint 1). NULL → tự tính từ variant.expiry_days.';

COMMENT ON COLUMN sales_invoices.customer_id      IS 'FK → customers. NULL = khách vãng lai.';
COMMENT ON COLUMN sales_invoices.customer_name    IS 'Snapshot tên KH tại thời điểm bán — bất biến.';

COMMENT ON COLUMN sales_invoice_items.combo_source_id  IS 'NULL = bán lẻ thường; NOT NULL = item được khai triển từ combo này (KiotViet model).';
COMMENT ON COLUMN sales_invoice_items.combo_unit_price IS 'Snapshot giá combo tại thời điểm bán.';

COMMENT ON TABLE stock_adjustments                IS 'Phiếu điều chỉnh tồn kho (kiểm kê) — Sprint 1';
COMMENT ON COLUMN stock_adjustments.reason        IS 'EXPIRED|DAMAGED|LOST|STOCKTAKE|OTHER';
COMMENT ON COLUMN stock_adjustments.status        IS 'DRAFT=Chưa xác nhận | CONFIRMED=Đã xác nhận (tồn kho đã thay đổi)';
COMMENT ON COLUMN stock_adjustment_items.system_qty IS 'Snapshot tồn hệ thống lúc tạo phiếu — bất biến';
COMMENT ON COLUMN stock_adjustment_items.actual_qty IS 'Số thực tế kiểm kê';
COMMENT ON COLUMN stock_adjustment_items.diff_qty   IS 'actual - system (dương=tăng, âm=giảm)';

-- ══════════════════════════════════════════════════════════════════════════════
-- ĐỂ SỬ DỤNG VỚI FLYWAY (optional):
-- Nếu muốn dùng file này thay thế toàn bộ V1-V30 trong Flyway:
--   1. Xóa tất cả V1__*.sql ... V30__*.sql khỏi db/migration/
--   2. Đặt file này thành V1__full_schema.sql
--   3. Xóa bảng flyway_schema_history nếu đang reset DB mới
-- ══════════════════════════════════════════════════════════════════════════════
