-- =========================================================
-- V7: Thêm thông tin đơn vị nhập/bán lẻ vào bảng products
-- Hỗ trợ bán lẻ: 1 kg = 10 bịch, 1 xâu = 5-10 bịch
-- =========================================================

-- Đơn vị nhập kho (kg, xâu, hộp, bịch, chai...)
ALTER TABLE products ADD import_unit VARCHAR(20) NULL;

-- Đơn vị bán lẻ (bịch, gói, chai...)
ALTER TABLE products ADD sell_unit VARCHAR(20) NULL;

-- Số đơn vị bán lẻ / 1 đơn vị nhập (VD: 1 kg = 10 bịch → pieces_per_import_unit = 10)
-- NULL hoặc 1 = không cần quy đổi (bán nguyên)
ALTER TABLE products ADD pieces_per_import_unit INT NULL DEFAULT 1;

-- Ghi chú quy đổi (VD: "1 xâu = 7 bịch", "1 kg = 10 gói")
ALTER TABLE products ADD conversion_note VARCHAR(100) NULL;
