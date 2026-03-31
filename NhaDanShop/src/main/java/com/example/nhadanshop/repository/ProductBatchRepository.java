package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.InventoryReceipt;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface ProductBatchRepository extends JpaRepository<ProductBatch, Long> {

    List<ProductBatch> findByProductIdAndRemainingQtyGreaterThanOrderByExpiryDateAsc(
            Long productId, int minQty);

    List<ProductBatch> findByProductIdOrderByExpiryDateAsc(Long productId);

    List<ProductBatch> findByReceiptIdOrderByExpiryDateAsc(Long receiptId);

    /** Lô thuộc 1 phiếu nhập cụ thể VÀ 1 sản phẩm cụ thể (dùng khi cập nhật finalCost sau phân bổ ship) */
    List<ProductBatch> findByReceiptAndProduct(InventoryReceipt receipt, Product product);

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

    /**
     * FEFO với PESSIMISTIC WRITE LOCK (SELECT ... FOR UPDATE).
     * Dùng khi deduct stock để tránh race condition.
     * Chỉ 1 transaction được đọc+sửa tại 1 thời điểm.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT b FROM ProductBatch b
            WHERE b.product.id = :productId
              AND b.remainingQty > 0
            ORDER BY b.expiryDate ASC
            """)
    List<ProductBatch> findByProductIdForUpdateFEFO(@Param("productId") Long productId);
}
