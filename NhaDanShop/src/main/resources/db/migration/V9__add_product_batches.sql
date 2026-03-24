-- =========================================================
-- V9: Thêm bảng product_batches để theo dõi lô hàng
--
-- Mỗi lần nhập kho → tạo 1 lô (batch) với ngày hết hạn thực tế.
-- Khi bán hàng → trừ theo FEFO (First Expired First Out):
--   lô nào hết hạn sớm nhất được bán trước.
-- =========================================================

CREATE TABLE product_batches (
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,

    -- Sản phẩm thuộc lô này
    product_id      BIGINT       NOT NULL,

    -- Phiếu nhập kho tạo ra lô này (NULL = nhập thủ công/tồn kho ban đầu)
    receipt_id      BIGINT       NULL,

    -- Mã lô tự sinh: BATCH-{receiptNo}-{productCode}
    batch_code      NVARCHAR(80) NOT NULL,

    -- Ngày sản xuất (optional, do người dùng nhập)
    mfg_date        DATE         NULL,

    -- Ngày hết hạn thực tế = receiptDate + product.expiryDays
    expiry_date     DATE         NOT NULL,

    -- Số lượng nhập ban đầu (đơn vị bán lẻ)
    import_qty      INT          NOT NULL,

    -- Số lượng còn lại trong lô (đơn vị bán lẻ) - giảm dần khi bán
    remaining_qty   INT          NOT NULL,

    -- Giá vốn của lô này (có thể khác các lô trước)
    cost_price      DECIMAL(18,2) NOT NULL,

    created_at      DATETIME2    NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT fk_pb_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_pb_receipt FOREIGN KEY (receipt_id) REFERENCES inventory_receipts(id),
    CONSTRAINT uq_batch_code UNIQUE (batch_code)
);

-- Index tìm lô theo sản phẩm + ngày hết hạn (dùng trong FEFO query)
CREATE INDEX idx_pb_product_expiry
    ON product_batches (product_id, expiry_date, remaining_qty);

-- Index cảnh báo sắp hết hạn
CREATE INDEX idx_pb_expiry_date
    ON product_batches (expiry_date, remaining_qty);
