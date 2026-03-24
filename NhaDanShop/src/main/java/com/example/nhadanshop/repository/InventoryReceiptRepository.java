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
            SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_no, LEN(:prefix) + 1, 10) AS INT)), 0)
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
     * Quy ước atomic (không chia, pieces=1): bịch, hộp, chai
     * Quy ước gộp   (nhân pieces):          kg, xâu, 5 xâu...
     *
     * Trả về Object[]: [productId, totalRetailQty]
     */
    @Query("""
            SELECT item.product.id,
                   COALESCE(SUM(item.quantity *
                       CASE
                           WHEN LOWER(item.product.importUnit) IN
                               ('bich','bịch','hop','hộp','chai')
                           THEN 1
                           WHEN item.product.piecesPerImportUnit IS NOT NULL
                                AND item.product.piecesPerImportUnit > 1
                           THEN item.product.piecesPerImportUnit
                           ELSE 1
                       END), 0)
            FROM InventoryReceiptItem item
            WHERE item.receipt.receiptDate BETWEEN :from AND :to
            GROUP BY item.product.id
            """)
    List<Object[]> sumReceivedQtyByProductBetween(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);
}
