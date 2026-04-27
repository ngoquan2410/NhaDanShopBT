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
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface ProductBatchRepository extends JpaRepository<ProductBatch, Long> {

    List<ProductBatch> findByProductIdAndRemainingQtyGreaterThanOrderByExpiryDateAsc(
            Long productId, int minQty);

    List<ProductBatch> findByProductIdOrderByExpiryDateAsc(Long productId);

    List<ProductBatch> findByReceiptIdOrderByExpiryDateAsc(Long receiptId);

    /**
     * For listing receipts: load all batches for many receipt ids in one query.
     */
    List<ProductBatch> findByReceipt_IdIn(Collection<Long> receiptIds);

    /**
     * Lô của phiếu nhập với khóa pessimistic — dùng khi xóa phiếu để kiểm tra “đã bán?” và rollback
     * trong cùng một chuỗi lock (CRIT-003).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT b FROM ProductBatch b
            WHERE b.receipt.id = :receiptId
            ORDER BY b.expiryDate ASC, b.id ASC
            """)
    List<ProductBatch> findByReceiptIdForUpdate(@Param("receiptId") Long receiptId);

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

    Optional<ProductBatch> findByBatchCode(String batchCode);

    /**
     * Kiểm tra sản phẩm đã có ít nhất 1 lô hàng nào chưa (kể cả lô hết hàng).
     * Dùng để quyết định có an toàn cập nhật importUnit/pieces không.
     */
    boolean existsByProductId(Long productId);

    /**
     * FEFO với PESSIMISTIC WRITE LOCK (SELECT ... FOR UPDATE).
     * Dùng khi deduct stock để tránh race condition.
     * Chỉ 1 transaction được đọc+sửa tại 1 thời điểm.
     * ⚠️ Chỉ lấy batch còn bán được (expiryDate >= CURRENT_DATE) theo policy.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT b FROM ProductBatch b
            WHERE b.product.id = :productId
              AND b.remainingQty > 0
              AND b.expiryDate >= CURRENT_DATE
            ORDER BY b.expiryDate ASC
            """)
    List<ProductBatch> findByProductIdForUpdateFEFO(@Param("productId") Long productId);

    // ── Variant-based queries (Sprint 0) ──────────────────────────────────────

    /** Lô theo variant còn hàng, sắp xếp FEFO */
    List<ProductBatch> findByVariantIdAndRemainingQtyGreaterThanOrderByExpiryDateAsc(
            Long variantId, int minQty);

    /**
     * Unsourced negative stock adjustment: current physical stock an admin may still deduct
     * (status {@code active} or {@code blocked}), excluding voided/depleted/archived.
     * Not the sales-sellable predicate; no expiry filter; no product/variant active filter.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT b FROM ProductBatch b
            WHERE b.variant.id = :variantId
              AND b.remainingQty > 0
              AND b.status IN ('active', 'blocked')
            ORDER BY b.expiryDate ASC, b.id ASC
            """)
    List<ProductBatch> findCurrentAdjustableByVariantIdForUpdate(@Param("variantId") Long variantId);

    /** Lô còn hàng cho nhiều variants, dùng cho projection read model. */
    @Query("""
            SELECT b FROM ProductBatch b
            LEFT JOIN FETCH b.receipt
            WHERE b.variant.id IN :variantIds
              AND b.remainingQty > 0
            ORDER BY b.variant.id ASC, b.expiryDate ASC, b.id ASC
            """)
    List<ProductBatch> findActiveBatchesByVariantIds(@Param("variantIds") List<Long> variantIds);

    /** Lô còn hàng của 1 variant, dùng cho projection read model. */
    @Query("""
            SELECT b FROM ProductBatch b
            LEFT JOIN FETCH b.receipt
            WHERE b.variant.id = :variantId
              AND b.remainingQty > 0
            ORDER BY b.expiryDate ASC, b.id ASC
            """)
    List<ProductBatch> findActiveBatchesByVariantId(@Param("variantId") Long variantId);

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
     * ⚠️ Chỉ lấy batch còn bán được (expiryDate >= CURRENT_DATE) theo policy.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT b FROM ProductBatch b
            WHERE b.variant.id = :variantId
              AND b.remainingQty > 0
              AND b.expiryDate >= CURRENT_DATE
            ORDER BY b.expiryDate ASC
            """)
    List<ProductBatch> findByVariantIdForUpdateFEFO(@Param("variantId") Long variantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT b FROM ProductBatch b
            WHERE b.variant.id = :variantId
            ORDER BY b.expiryDate ASC
            """)
    List<ProductBatch> findAllByVariantIdForUpdate(@Param("variantId") Long variantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT b FROM ProductBatch b
            WHERE b.id IN :batchIds
            """)
    List<ProductBatch> findAllByIdInForUpdate(@Param("batchIds") List<Long> batchIds);

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

    /**
     * Giá vốn bình quân theo variant từ batch CÒN HÀNG VÀ CÒN HẠN:
     * [variantId, avgCostPrice = SUM(remainingQty*costPrice)/SUM(remainingQty)]
     * Dùng để tính closingValue = closingStock * avgCostPrice (phụ thuộc kỳ báo cáo).
     * ⚠️ Chỉ tính batch còn bán được theo policy (expiryDate >= CURRENT_DATE).
     */
    @Query("""
            SELECT b.variant.id,
                   SUM(b.remainingQty * b.costPrice) / NULLIF(SUM(b.remainingQty), 0)
            FROM ProductBatch b
            WHERE b.variant IS NOT NULL
              AND b.remainingQty > 0
              AND b.expiryDate >= CURRENT_DATE
            GROUP BY b.variant.id
            """)
    List<Object[]> avgCostPriceByVariant();

    // ══ Slice 2: explicit predicates for future use only — do not wire callers here ═════════════

    /**
     * Current on-hand (positive physical remaining) for many variants; same predicate as
     * {@link #findActiveBatchesByVariantIds} (remaining &gt; 0, no expiry/status filter). Not used by
     * live projection in Slice 2 — projection still calls {@code findActiveBatches*}.
     */
    @Query("""
            SELECT b FROM ProductBatch b
            LEFT JOIN FETCH b.receipt
            WHERE b.variant.id IN :variantIds
              AND b.remainingQty > 0
            ORDER BY b.variant.id ASC, b.expiryDate ASC, b.id ASC
            """)
    List<ProductBatch> findCurrentOnHandBatchesByVariantIds(@Param("variantIds") List<Long> variantIds);

    /**
     * Current on-hand for one variant; same semantics as {@link #findActiveBatchesByVariantId}.
     */
    @Query("""
            SELECT b FROM ProductBatch b
            LEFT JOIN FETCH b.receipt
            WHERE b.variant.id = :variantId
              AND b.remainingQty > 0
            ORDER BY b.expiryDate ASC, b.id ASC
            """)
    List<ProductBatch> findCurrentOnHandBatchesByVariantId(@Param("variantId") Long variantId);

    /**
     * Sum of positive remaining for a variant; same as {@link #sumRemainingQtyByVariantId} with explicit naming.
     */
    @Query("""
            SELECT COALESCE(SUM(b.remainingQty), 0)
            FROM ProductBatch b
            WHERE b.variant.id = :variantId
              AND b.remainingQty > 0
            """)
    int sumCurrentRemainingQtyByVariantId(@Param("variantId") Long variantId);

    /**
     * Sum of remaining quantities that satisfy the unified <em>sellable</em> predicate (for reporting/tests later).
     * Not wired to {@code stockQty} or projection in Slice 2.
     */
    @Query("""
            SELECT COALESCE(SUM(b.remainingQty), 0)
            FROM ProductBatch b
            WHERE b.variant.id = :variantId
              AND b.remainingQty > 0
              AND b.status = 'active'
              AND b.expiryDate >= CURRENT_DATE
              AND b.variant.active = true
              AND b.variant.product.active = true
            """)
    int sumSellableRemainingQtyByVariantId(@Param("variantId") Long variantId);

    /**
     * Slice 4A: per-variant sellable sums for projection (read-only). One row per variant that has
     * at least one matching batch; variants with zero sellable stock are omitted (treat as 0).
     * Rows: [variantId, sumRemainingQty].
     */
    @Query("""
            SELECT b.variant.id, COALESCE(SUM(b.remainingQty), 0)
            FROM ProductBatch b
            WHERE b.variant.id IN :variantIds
              AND b.remainingQty > 0
              AND b.status = 'active'
              AND b.expiryDate >= CURRENT_DATE
              AND b.variant.active = true
              AND b.variant.product.active = true
            GROUP BY b.variant.id
            """)
    List<Object[]> sumSellableRemainingQtyByVariantIds(@Param("variantIds") List<Long> variantIds);

    /**
     * FEFO with pessimistic write lock: unified sellable predicate. Same ordering as
     * {@link #findByVariantIdForUpdateFEFO}. <strong>Slice 3:</strong> used by sales FEFO in
     * {@link com.example.nhadanshop.service.ProductBatchService#deductStockFEFOWithTraceByVariant}.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT b FROM ProductBatch b
            WHERE b.variant.id = :variantId
              AND b.remainingQty > 0
              AND b.status = 'active'
              AND b.expiryDate >= CURRENT_DATE
              AND b.variant.active = true
              AND b.variant.product.active = true
            ORDER BY b.expiryDate ASC, b.id ASC
            """)
    List<ProductBatch> findSellableByVariantIdForUpdateFefo(@Param("variantId") Long variantId);

    /**
     * Product-scoped FEFO lock query with sellable predicate; mirrors {@link #findByProductIdForUpdateFEFO}
     * structure. <strong>Slice 3:</strong> used when {@code variantId} is null in
     * {@link com.example.nhadanshop.service.ProductBatchService#deductStockFEFOWithTrace}.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT b FROM ProductBatch b
            WHERE b.product.id = :productId
              AND b.remainingQty > 0
              AND b.status = 'active'
              AND b.expiryDate >= CURRENT_DATE
              AND b.variant.active = true
              AND b.variant.product.active = true
            ORDER BY b.expiryDate ASC, b.id ASC
            """)
    List<ProductBatch> findSellableByProductIdForUpdateFefo(@Param("productId") Long productId);
}
