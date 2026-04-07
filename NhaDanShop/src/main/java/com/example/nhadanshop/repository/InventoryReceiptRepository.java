package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.InventoryReceipt;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface InventoryReceiptRepository extends JpaRepository<InventoryReceipt, Long> {

    Optional<InventoryReceipt> findByReceiptNo(String receiptNo);

    /**
     * Lấy số thứ tự lớn nhất của receipt_no theo ngày, ví dụ prefix = "RCP-20260321-"
     * Trả về max sequence (phần số cuối) hoặc 0 nếu chưa có.
     */
    @Query(value = """
            SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_no, LENGTH(:prefix) + 1, 10) AS INT)), 0)
            FROM inventory_receipts
            WHERE receipt_no LIKE :prefixPattern
            """, nativeQuery = true)
    int findMaxSeqForPrefix(@Param("prefix") String prefix, @Param("prefixPattern") String prefixPattern);

    Page<InventoryReceipt> findByReceiptDateBetweenOrderByReceiptDateDesc(
            LocalDateTime from, LocalDateTime to, Pageable pageable);

    Page<InventoryReceipt> findAllByOrderByReceiptDateDesc(Pageable pageable);

    /**
     * Tổng số lượng nhập kho đã quy đổi sang đơn vị BÁN LẺ.
     *
     * [BƯỚC 1 FIX] Dùng item.piecesUsed (snapshot bất biến) thay vì
     * product.piecesPerImportUnit (có thể thay đổi theo thời gian).
     *
     * Logic: pieces_used <= 1 = ATOMIC → qty bán lẻ = qty nhập
     *        pieces_used > 1  = GOP   → qty bán lẻ = qty nhập × pieces_used
     *
     * Trả về Object[]: [productId, totalRetailQty]
     */
    @Query("""
            SELECT item.product.id,
                   COALESCE(SUM(
                       CASE
                           WHEN item.piecesUsed IS NULL OR item.piecesUsed <= 1
                           THEN item.quantity
                           ELSE item.quantity * item.piecesUsed
                       END
                   ), 0)
            FROM InventoryReceiptItem item
            WHERE item.receipt.receiptDate BETWEEN :from AND :to
            GROUP BY item.product.id
            """)
    List<Object[]> sumReceivedQtyByProductBetween(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    /**
     * [Sprint 0] Tổng số lượng nhập kho theo VARIANT trong kỳ (đã quy đổi sang bán lẻ).
     * Trả về Object[]: [variantId, totalRetailQty]
     */
    @Query("""
            SELECT item.variant.id,
                   COALESCE(SUM(
                       CASE
                           WHEN item.piecesUsed IS NULL OR item.piecesUsed <= 1
                           THEN item.quantity
                           ELSE item.quantity * item.piecesUsed
                       END
                   ), 0)
            FROM InventoryReceiptItem item
            WHERE item.variant IS NOT NULL
              AND item.receipt.receiptDate BETWEEN :from AND :to
            GROUP BY item.variant.id
            """)
    List<Object[]> sumReceivedQtyByVariantBetween(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    /**
     * [Fix OpeningStock] Tổng số lượng nhập kho theo VARIANT từ một mốc thời gian trở đi
     * (không giới hạn trên = toàn bộ lịch sử từ fromDt đến nay).
     * Dùng để tính ngược tồn đầu kỳ:
     *   openingStock = currentStock - recvAfter(fromDt) + soldAfter(fromDt)
     * Trả về Object[]: [variantId, totalRetailQty]
     */
    @Query("""
            SELECT item.variant.id,
                   COALESCE(SUM(
                       CASE
                           WHEN item.piecesUsed IS NULL OR item.piecesUsed <= 1
                           THEN item.quantity
                           ELSE item.quantity * item.piecesUsed
                       END
                   ), 0)
            FROM InventoryReceiptItem item
            WHERE item.variant IS NOT NULL
              AND item.receipt.receiptDate >= :from
            GROUP BY item.variant.id
            """)
    List<Object[]> sumReceivedQtyByVariantAfter(
            @Param("from") LocalDateTime from);
}
