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
     * Kiểm tra sản phẩm đã có ít nhất 1 lô hàng nào chưa (kể cả lô hết hàng).
     * Dùng để quyết định có an toàn cập nhật importUnit/pieces không.
     */
    boolean existsByProductId(Long productId);

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

    // ── Variant-based queries (Sprint 0) ──────────────────────────────────────

    /** Lô theo variant còn hàng, sắp xếp FEFO */
    List<ProductBatch> findByVariantIdAndRemainingQtyGreaterThanOrderByExpiryDateAsc(
            Long variantId, int minQty);

    /** Tổng tồn kho theo lô của 1 variant */
    @Query("""
            SELECT COALESCE(SUM(b.remainingQty), 0)
            FROM ProductBatch b
            WHERE b.variant.id = :variantId
              AND b.remainingQty > 0
            """)
    int sumRemainingQtyByVariantId(@Param("variantId") Long variantId);

    /** Kiểm tra variant đã có lô nào chưa */
    boolean existsByVariantId(Long variantId);

    /**
     * FEFO với PESSIMISTIC WRITE LOCK theo variant_id.
     * Ưu tiên dùng khi variant_id có giá trị.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT b FROM ProductBatch b
            WHERE b.variant.id = :variantId
              AND b.remainingQty > 0
            ORDER BY b.expiryDate ASC
            """)
    List<ProductBatch> findByVariantIdForUpdateFEFO(@Param("variantId") Long variantId);

    /** Lô của 1 phiếu nhập + 1 variant cụ thể (dùng khi cập nhật finalCost sau phân bổ ship) */
    @Query("""
            SELECT b FROM ProductBatch b
            WHERE b.receipt.id = :receiptId
              AND b.variant.id = :variantId
            """)
    List<ProductBatch> findByReceiptIdAndVariantId(
            @Param("receiptId") Long receiptId, @Param("variantId") Long variantId);

    /**
     * Giá trị tồn kho theo lô cho tất cả variants:
     * [variantId, SUM(remainingQty * costPrice)]
     */
    @Query("""
            SELECT b.variant.id, SUM(b.remainingQty * b.costPrice)
            FROM ProductBatch b
            WHERE b.variant IS NOT NULL
              AND b.remainingQty > 0
            GROUP BY b.variant.id
            """)
    List<Object[]> sumBatchValueByVariant();
}
