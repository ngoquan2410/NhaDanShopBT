package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.ProductVariant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProductVariantRepository extends JpaRepository<ProductVariant, Long> {

    /** Tất cả variants của 1 SP, default lên trước */
    List<ProductVariant> findByProductIdOrderByIsDefaultDescVariantCodeAsc(Long productId);

    /** Tất cả active variants của 1 SP */
    List<ProductVariant> findByProductIdAndActiveTrue(Long productId);

    /** Lookup variant theo mã — dùng khi scan barcode hoặc import Excel */
    Optional<ProductVariant> findByVariantCode(String variantCode);
    Optional<ProductVariant> findByVariantCodeIgnoreCase(String variantCode);

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
            JOIN FETCH p.category
            WHERE v.active = TRUE
            ORDER BY p.id ASC, v.isDefault DESC, v.variantCode ASC
            """)
    List<ProductVariant> findAllActiveWithProductAndCategory();

    /** Variants của 1 SP có mã tìm kiếm */
    @Query("SELECT v FROM ProductVariant v WHERE v.product.id = :productId AND LOWER(v.variantCode) LIKE LOWER(CONCAT('%', :q, '%'))")
    List<ProductVariant> searchByProductIdAndCode(@Param("productId") Long productId, @Param("q") String q);
}
