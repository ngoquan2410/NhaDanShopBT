package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.ProductBatch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface ProductBatchRepository extends JpaRepository<ProductBatch, Long> {

    /**
     * FEFO: Lấy các lô còn hàng của 1 sản phẩm,
     * sắp xếp theo expiryDate tăng dần (hết hạn sớm → bán trước).
     */
    List<ProductBatch> findByProductIdAndRemainingQtyGreaterThanOrderByExpiryDateAsc(
            Long productId, int minQty);

    /**
     * Tất cả lô của 1 sản phẩm (bao gồm đã hết hàng), mới nhất trước.
     */
    List<ProductBatch> findByProductIdOrderByExpiryDateAsc(Long productId);

    /**
     * Lô thuộc 1 phiếu nhập kho cụ thể.
     */
    List<ProductBatch> findByReceiptIdOrderByExpiryDateAsc(Long receiptId);

    /**
     * Cảnh báo sắp hết hạn: lô còn hàng AND expiryDate <= ngưỡng,
     * sắp xếp gần hết hạn nhất lên đầu.
     */
    @Query("""
            SELECT b FROM ProductBatch b
            WHERE b.remainingQty > 0
              AND b.expiryDate <= :threshold
            ORDER BY b.expiryDate ASC
            """)
    List<ProductBatch> findExpiringBatches(@Param("threshold") LocalDate threshold);

    /**
     * Lô đã hết hạn mà vẫn còn hàng tồn (cần xử lý/tiêu hủy).
     */
    @Query("""
            SELECT b FROM ProductBatch b
            WHERE b.remainingQty > 0
              AND b.expiryDate < :today
            ORDER BY b.expiryDate ASC
            """)
    List<ProductBatch> findExpiredWithStock(@Param("today") LocalDate today);

    /**
     * Tổng tồn kho theo lô của 1 sản phẩm (kiểm tra khớp với product.stockQty).
     */
    @Query("""
            SELECT COALESCE(SUM(b.remainingQty), 0)
            FROM ProductBatch b
            WHERE b.product.id = :productId
              AND b.remainingQty > 0
            """)
    int sumRemainingQtyByProductId(@Param("productId") Long productId);

    /**
     * Kiểm tra batch_code đã tồn tại chưa.
     */
    boolean existsByBatchCode(String batchCode);
}
