package com.example.nhadanshop.repository;

import com.example.nhadanshop.dto.ProductVariantSearchResponse;
import com.example.nhadanshop.entity.ProductVariant;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface ProductVariantRepository extends JpaRepository<ProductVariant, Long> {

    /** Tất cả variants của 1 SP, default lên trước */
    List<ProductVariant> findByProductIdOrderByIsDefaultDescVariantCodeAsc(Long productId);

    /** Batch load variants for many products (order not guaranteed; sort per-product in service). */
    List<ProductVariant> findByProductIdIn(Collection<Long> productIds);

    @Query("""
            SELECT DISTINCT v FROM ProductVariant v
            JOIN FETCH v.product p
            WHERE p.id IN :productIds
            """)
    List<ProductVariant> findByProductIdInWithProduct(@Param("productIds") Collection<Long> productIds);

    /** Active variants of one product, same ordering as the full list (default first, then code). */
    List<ProductVariant> findByProductIdAndActiveTrueOrderByIsDefaultDescVariantCodeAsc(Long productId);

    /** Active + sellable (POS/storefront selection). */
    List<ProductVariant> findByProductIdAndActiveTrueAndIsSellableTrueOrderByIsDefaultDescVariantCodeAsc(Long productId);

    /** Lookup variant theo mã — dùng khi scan barcode hoặc import Excel */
    Optional<ProductVariant> findByVariantCode(String variantCode);
    Optional<ProductVariant> findByVariantCodeIgnoreCase(String variantCode);

    /** Bulk case-insensitive variant code match (Excel receipt prescan). */
    @Query("""
            SELECT v FROM ProductVariant v
            JOIN FETCH v.product p
            WHERE LOWER(v.variantCode) IN :lowers
            """)
    List<ProductVariant> findByVariantCodeLowerIn(@Param("lowers") Collection<String> loweredVariantCodes);

    /** All variants for products on sheet + combo components — order matches single-product query. */
    @Query("""
            SELECT v FROM ProductVariant v
            WHERE v.product.id IN :pids
            ORDER BY v.product.id ASC, v.isDefault DESC, v.variantCode ASC
            """)
    List<ProductVariant> findByProductIdsOrderedForReceiptExcel(@Param("pids") Collection<Long> pids);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT v FROM ProductVariant v WHERE v.id = :id")
    Optional<ProductVariant> findByIdForUpdate(@Param("id") Long id);

    /** Default variant của SP — tự động chọn khi không chỉ định variantId */
    Optional<ProductVariant> findByProductIdAndIsDefaultTrue(Long productId);

    /** Kiểm tra tồn tại */
    boolean existsByVariantCode(String variantCode);
    boolean existsByProductId(Long productId);

    /** Xóa tất cả variants của SP (dùng khi delete SP) */
    void deleteByProductId(Long productId);

    /** Bỏ default của tất cả variants hiện có của SP trước khi set default mới */
    @Modifying
    @Query("UPDATE ProductVariant v SET v.isDefault = FALSE WHERE v.product.id = :productId")
    void clearDefaultByProductId(@Param("productId") Long productId);

    /** Variants sắp hết hàng (stock_qty <= min_stock_qty) */
    @Query("SELECT v FROM ProductVariant v WHERE v.active = TRUE AND v.stockQty <= v.minStockQty")
    List<ProductVariant> findLowStockVariants();

    /**
     * [Fix Issue 1] Load TẤT CẢ active variants kèm FETCH JOIN product + category
     * để tránh LazyInitializationException khi gọi ngoài @Transactional.
     * Dùng bởi InventoryStockService.getStockReport().
     */
    @Query("""
            SELECT v FROM ProductVariant v
            JOIN FETCH v.product p
            LEFT JOIN FETCH p.category
            WHERE v.active = TRUE
              AND p.active = TRUE
            ORDER BY p.id ASC, v.isDefault DESC, v.variantCode ASC
            """)
    List<ProductVariant> findAllActiveWithProductAndCategory();

    @Query("""
            SELECT v FROM ProductVariant v
            JOIN FETCH v.product p
            LEFT JOIN FETCH p.category
            WHERE v.active = TRUE
              AND v.stockQty > 0
              AND p.active = TRUE
              AND p.productType = com.example.nhadanshop.entity.Product.ProductType.SINGLE
            ORDER BY v.id ASC
            """)
    List<ProductVariant> findAllActiveInStockWithProductAndCategory();

    /** Variants của 1 SP có mã tìm kiếm */
    @Query("SELECT v FROM ProductVariant v WHERE v.product.id = :productId AND LOWER(v.variantCode) LIKE LOWER(CONCAT('%', :q, '%'))")
    List<ProductVariant> searchByProductIdAndCode(@Param("productId") Long productId, @Param("q") String q);

    /**
     * Conservative "used variant" predicate for archive policy: any batch, transaction line,
     * pending order line, or inventory movement row referencing this variant.
     */
    @Query("""
            SELECT
              (EXISTS (SELECT 1 FROM ProductBatch b WHERE b.variant.id = :variantId)
              OR EXISTS (SELECT 1 FROM SalesInvoiceItem s WHERE s.variant.id = :variantId)
              OR EXISTS (SELECT 1 FROM InventoryReceiptItem r WHERE r.variant.id = :variantId)
              OR EXISTS (SELECT 1 FROM StockAdjustmentItem a WHERE a.variant.id = :variantId)
              OR EXISTS (SELECT 1 FROM PendingOrderItem p WHERE p.variant.id = :variantId)
              OR EXISTS (SELECT 1 FROM InventoryMovement m WHERE m.variant.id = :variantId))
            """)
    boolean isVariantStructurallyUsed(@Param("variantId") Long variantId);

    /**
     * Paginated variant rows for admin/staff transaction pickers. Filters apply before pagination.
     * One row per {@link ProductVariant} (no duplicates).
     */
    @Query(
            value = """
                    SELECT new com.example.nhadanshop.dto.ProductVariantSearchResponse(
                      v.id,
                      v.variantCode,
                      v.variantName,
                      p.id,
                      p.code,
                      p.name,
                      p.productType,
                      v.active,
                      v.isSellable,
                      v.sellUnit,
                      v.importUnit,
                      cat.id,
                      COALESCE(cat.name, ''),
                      v.stockQty,
                      v.sellPrice,
                      v.costPrice,
                      v.piecesPerUnit,
                      v.minStockQty,
                      v.expiryDays
                    )
                    FROM ProductVariant v
                    JOIN v.product p
                    LEFT JOIN p.category cat
                    WHERE p.active = TRUE
                      AND (
                        LOWER(v.variantCode) LIKE LOWER(CONCAT('%', :search, '%'))
                        OR LOWER(v.variantName) LIKE LOWER(CONCAT('%', :search, '%'))
                        OR LOWER(p.code) LIKE LOWER(CONCAT('%', :search, '%'))
                        OR LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%'))
                      )
                      AND (:activeOnly = FALSE OR v.active = TRUE)
                      AND (:sellableOnly = FALSE OR v.isSellable = TRUE)
                      AND (:singleProductOnly = FALSE OR p.productType = com.example.nhadanshop.entity.Product.ProductType.SINGLE)
                    ORDER BY p.code ASC, v.variantCode ASC
                    """,
            countQuery = """
                    SELECT COUNT(v)
                    FROM ProductVariant v
                    JOIN v.product p
                    WHERE p.active = TRUE
                      AND (
                        LOWER(v.variantCode) LIKE LOWER(CONCAT('%', :search, '%'))
                        OR LOWER(v.variantName) LIKE LOWER(CONCAT('%', :search, '%'))
                        OR LOWER(p.code) LIKE LOWER(CONCAT('%', :search, '%'))
                        OR LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%'))
                      )
                      AND (:activeOnly = FALSE OR v.active = TRUE)
                      AND (:sellableOnly = FALSE OR v.isSellable = TRUE)
                      AND (:singleProductOnly = FALSE OR p.productType = com.example.nhadanshop.entity.Product.ProductType.SINGLE)
                    """)
    Page<ProductVariantSearchResponse> searchVariantRows(
            @Param("search") String search,
            @Param("activeOnly") boolean activeOnly,
            @Param("sellableOnly") boolean sellableOnly,
            @Param("singleProductOnly") boolean singleProductOnly,
            Pageable pageable);
}
