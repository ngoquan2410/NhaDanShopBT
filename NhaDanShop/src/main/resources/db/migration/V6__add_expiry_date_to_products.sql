-- =========================================================
-- V6: Thêm cột expiry_days (hạn sử dụng - số ngày) vào bảng products
-- Nullable vì sản phẩm cũ chưa có thông tin hạn sử dụng
-- =========================================================

ALTER TABLE products
    ADD expiry_days INT NULL;
