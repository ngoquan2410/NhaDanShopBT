-- =========================================================
-- V21: Bước 2 — Bảng product_import_units (UX mặc định)
--
-- Mục đích: Lưu các quy tắc quy đổi đã đăng ký sẵn cho từng SP.
--   → Dùng để TỰ ĐỘNG ĐIỀN vào form khi admin tạo phiếu nhập.
--   → Khi nhập "xâu" trong form/Excel, lookup bảng này → pieces=7.
--   → Admin vẫn có thể SỬA pieces trước khi submit.
--   → Giá trị thực tế được lưu vào snapshot (V20), KHÔNG phụ thuộc bảng này.
--
-- Thiết kế:
--   - 1 SP có thể có nhiều đơn vị: kg=10, xâu=7, bịch=1
--   - Mỗi cặp (product_id, import_unit) là UNIQUE
--   - Mỗi SP có đúng 1 is_default=TRUE (unique partial index)
--   - pieces_per_unit là GỢI Ý mặc định, không phải immutable rule
-- =========================================================

CREATE TABLE IF NOT EXISTS product_import_units (
    id              BIGSERIAL       PRIMARY KEY,
    product_id      BIGINT          NOT NULL
                        REFERENCES products(id) ON DELETE CASCADE,
    import_unit     VARCHAR(20)     NOT NULL,
    sell_unit       VARCHAR(20)     NOT NULL DEFAULT 'bich',
    pieces_per_unit INT             NOT NULL DEFAULT 1
                        CONSTRAINT ck_piu_pieces CHECK (pieces_per_unit >= 1),
    is_default      BOOLEAN         NOT NULL DEFAULT FALSE,
    note            VARCHAR(100)    NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP       NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_piu_product_unit UNIQUE (product_id, import_unit)
);

-- Mỗi SP chỉ có tối đa 1 đơn vị mặc định
CREATE UNIQUE INDEX IF NOT EXISTS uq_piu_default
    ON product_import_units (product_id)
    WHERE is_default = TRUE;

-- Index lookup nhanh theo SP
CREATE INDEX IF NOT EXISTS idx_piu_product_id
    ON product_import_units (product_id);

-- ── Backfill từ products.import_unit hiện có ──────────────────────────────
-- Migrate dữ liệu cũ: mỗi SP có import_unit → tạo 1 dòng is_default=TRUE
INSERT INTO product_import_units
    (product_id, import_unit, sell_unit, pieces_per_unit, is_default, note)
SELECT
    p.id,
    COALESCE(p.import_unit, p.sell_unit, p.unit, 'bich'),
    COALESCE(p.sell_unit, p.unit, 'bich'),
    COALESCE(
        CASE
            WHEN LOWER(p.import_unit) IN
                ('bich','bịch','hop','hộp','chai','goi','gói','hu','hũ','lon','lọn','tui','túi')
            THEN 1
            ELSE COALESCE(p.pieces_per_import_unit, 1)
        END, 1),
    TRUE,
    p.conversion_note
FROM products p
WHERE p.product_type = 'SINGLE'
ON CONFLICT (product_id, import_unit) DO NOTHING;

COMMENT ON TABLE product_import_units IS
    'Đơn vị nhập kho đã đăng ký cho từng SP. Dùng làm gợi ý mặc định khi tạo phiếu nhập. Source of truth thực sự nằm ở inventory_receipt_items.pieces_used (snapshot bất biến).';
COMMENT ON COLUMN product_import_units.pieces_per_unit IS
    'Gợi ý số ĐV bán lẻ / 1 ĐV nhập. Có thể cập nhật khi NCC đổi đóng gói. Việc cập nhật chỉ ảnh hưởng phiếu nhập MỚI, không ảnh hưởng lịch sử (nhờ snapshot ở V20).';
COMMENT ON COLUMN product_import_units.is_default IS
    'TRUE = đơn vị nhập chính (điền sẵn vào form). Mỗi SP chỉ có 1 default (unique partial index).';
