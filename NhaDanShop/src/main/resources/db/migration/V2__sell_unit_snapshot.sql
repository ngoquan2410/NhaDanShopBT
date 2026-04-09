-- ============================================================
-- V2: Thêm sell_unit_snapshot vào inventory_receipt_items
--
-- Mục đích: snapshot đơn vị bán lẻ tại thời điểm nhập kho.
-- Bất biến sau khi tạo phiếu — audit trail vĩnh viễn.
-- Đặc biệt quan trọng khi dùng multi-variant (BT001-200G / BT001-500G):
--   nếu admin đổi sellUnit của variant sau này,
--   lịch sử phiếu nhập vẫn hiển thị đúng đơn vị lúc đó.
-- ============================================================

ALTER TABLE inventory_receipt_items
    ADD COLUMN IF NOT EXISTS sell_unit_snapshot VARCHAR(20) NULL;

COMMENT ON COLUMN inventory_receipt_items.sell_unit_snapshot
    IS 'Snapshot sellUnit của variant tại thời điểm nhập kho — bất biến. '
       'NULL cho records cũ trước V2 (backfill từ variant hiện tại).';

-- Backfill: lấy sellUnit hiện tại của variant để điền cho records cũ
UPDATE inventory_receipt_items iri
SET    sell_unit_snapshot = pv.sell_unit
FROM   product_variants pv
WHERE  pv.id = iri.variant_id
  AND  iri.sell_unit_snapshot IS NULL;
