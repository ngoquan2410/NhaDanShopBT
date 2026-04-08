-- =========================================================
-- V29: Sprint 1 — Stock Adjustment (Phiếu điều chỉnh tồn kho)
-- Ngày: 07/04/2026
--
-- Cho phép admin điều chỉnh tồn kho khi kiểm kê phát hiện
-- sai lệch: hàng thất lạc, hư hỏng, hết hạn, đếm lại.
-- =========================================================

-- ── 1. Bảng phiếu điều chỉnh ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id           BIGSERIAL    PRIMARY KEY,
    adj_no       VARCHAR(50)  NOT NULL UNIQUE,      -- ADJ-20260407-00001
    adj_date     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    reason       VARCHAR(50)  NOT NULL,             -- EXPIRED/DAMAGED/LOST/STOCKTAKE/OTHER
    note         VARCHAR(500),
    status       VARCHAR(20)  NOT NULL DEFAULT 'DRAFT', -- DRAFT | CONFIRMED
    created_by   BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    confirmed_by BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    confirmed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sa_status   ON stock_adjustments (status);
CREATE INDEX IF NOT EXISTS idx_sa_adj_date ON stock_adjustments (adj_date DESC);

COMMENT ON TABLE stock_adjustments IS 'Phiếu điều chỉnh tồn kho (kiểm kê)';
COMMENT ON COLUMN stock_adjustments.reason IS
    'EXPIRED=Hết hạn sử dụng | DAMAGED=Hư hỏng | LOST=Thất lạc | STOCKTAKE=Kiểm kê | OTHER=Khác';
COMMENT ON COLUMN stock_adjustments.status IS
    'DRAFT=Chưa xác nhận (chưa ảnh hưởng tồn kho) | CONFIRMED=Đã xác nhận (tồn kho đã thay đổi)';

-- ── 2. Bảng chi tiết dòng điều chỉnh ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_adjustment_items (
    id              BIGSERIAL PRIMARY KEY,
    adjustment_id   BIGINT    NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
    variant_id      BIGINT    NOT NULL REFERENCES product_variants(id),
    system_qty      INTEGER   NOT NULL,   -- tồn kho hệ thống lúc tạo phiếu (snapshot)
    actual_qty      INTEGER   NOT NULL,   -- số lượng thực tế kiểm kê
    diff_qty        INTEGER   GENERATED ALWAYS AS (actual_qty - system_qty) STORED,
    note            VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_sai_adjustment ON stock_adjustment_items (adjustment_id);
CREATE INDEX IF NOT EXISTS idx_sai_variant    ON stock_adjustment_items (variant_id);

COMMENT ON COLUMN stock_adjustment_items.system_qty IS 'Snapshot tồn hệ thống lúc tạo phiếu — bất biến';
COMMENT ON COLUMN stock_adjustment_items.actual_qty IS 'Số thực tế kiểm kê do admin nhập';
COMMENT ON COLUMN stock_adjustment_items.diff_qty   IS 'actual - system (dương=nhập thêm, âm=xuất bỏ)';
