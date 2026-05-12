package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import com.example.nhadanshop.entity.Product.ProductType;

@Repository
public interface ProductRepository extends JpaRepository<Product, Long> {
    long countByCategoryId(Long categoryId);

    List<Product> findByActiveTrue();
    Page<Product> findByCategoryIdAndActiveTrue(Long categoryId, Pageable pageable);
    Optional<Product> findByCode(String code);

    List<Product> findByCodeIn(Collection<String> codes);

    boolean existsByCode(String code);
    boolean existsByCodeAndIdNot(String code, Long id);

    Optional<Product> findByNameIgnoreCase(String name);

    boolean existsByNameIgnoreCaseAndCategoryId(String name, Long categoryId);

    /**
     * Keys for duplicate-name-in-category checks during Excel import prescan.
     * Returns rows: [0] = category id, [1] = LOWER(TRIM(name)).
     */
    @Query("""
            SELECT p.category.id, LOWER(TRIM(BOTH FROM p.name))
            FROM Product p
            WHERE p.category.id IN :catIds
            """)
    List<Object[]> findCategoryIdAndNameLowerKeysByCategoryIdIn(@Param("catIds") Collection<Long> catIds);

    List<Product> findByNameContainingIgnoreCase(String name);

    @Query("SELECT p.code FROM Product p WHERE p.category.id = :categoryId")
    List<String> findAllCodesByCategoryId(@Param("categoryId") Long categoryId);

    /**
     * Max numeric suffix for product codes in a category matching {@code prefix + digits} (case-insensitive prefix).
     * {@code startIndex} must be {@code prefix.length() + 1} (1-based SUBSTRING).
     */
    @Query(value = """
            SELECT MAX(CAST(SUBSTRING(p.code, :startIndex) AS INTEGER))
            FROM products p
            WHERE p.category_id = :categoryId
              AND LENGTH(p.code) >= :startIndex
              AND UPPER(SUBSTRING(p.code, 1, :prefixLen)) = UPPER(:prefix)
              AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                    SUBSTRING(p.code, :startIndex), '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '') = ''
            """, nativeQuery = true)
    Integer findMaxNumericSuffixForCategoryPrefix(
            @Param("categoryId") Long categoryId,
            @Param("prefix") String prefix,
            @Param("prefixLen") int prefixLen,
            @Param("startIndex") int startIndex);

    /**
     * Max numeric suffix for {@code COMBO###} across all combo rows (active or not), matching prior codegen scope.
     */
    @Query(value = """
            SELECT MAX(CAST(SUBSTRING(p.code, 6) AS INTEGER))
            FROM products p
            WHERE p.product_type = 'COMBO'
              AND LENGTH(p.code) > 5
              AND UPPER(SUBSTRING(p.code, 1, 5)) = 'COMBO'
              AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                    SUBSTRING(p.code, 6), '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '') = ''
            """, nativeQuery = true)
    Integer findMaxComboAutoNumericSuffix();

    // ── Combo queries (KiotViet model) ────────────────────────────────────
    /** Tất cả combo (productType=COMBO) */
    List<Product> findByProductTypeAndActiveTrue(ProductType productType);

    /** Tất cả combo kể cả inactive (admin) */
    List<Product> findByProductTypeOrderByNameAsc(ProductType productType);

    /** Chỉ SINGLE products đang hoạt động (dùng cho hóa đơn, nhập kho) */
    @Query("SELECT p FROM Product p WHERE p.active = true AND p.productType = 'SINGLE' ORDER BY p.name")
    List<Product> findActiveSingleProducts();

    /**
     * True if the combo product ID appears anywhere transactional/historical (defensive, excludes ProductComboItem definition rows).
     * Used to decide hard-delete vs archive on DELETE /api/combos/{id}.
     */
    @Query("""
            SELECT (
              EXISTS (SELECT 1 FROM SalesInvoiceItem s WHERE s.comboSourceId = :comboId)
              OR EXISTS (SELECT 1 FROM SalesInvoiceItem s2 WHERE s2.product.id = :comboId)
              OR EXISTS (SELECT 1 FROM SalesInvoiceItem s3 WHERE s3.variant IS NOT NULL AND s3.variant.product.id = :comboId)
              OR EXISTS (SELECT 1 FROM PendingOrderItem p WHERE p.product.id = :comboId)
              OR EXISTS (SELECT 1 FROM PendingOrderItem p2 WHERE p2.variant IS NOT NULL AND p2.variant.product.id = :comboId)
              OR EXISTS (SELECT 1 FROM ProductBatch b WHERE b.variant IS NOT NULL AND b.variant.product.id = :comboId)
              OR EXISTS (SELECT 1 FROM ProductBatch b2 WHERE b2.product IS NOT NULL AND b2.product.id = :comboId)
              OR EXISTS (SELECT 1 FROM InventoryReceiptItem r WHERE r.variant IS NOT NULL AND r.variant.product.id = :comboId)
              OR EXISTS (SELECT 1 FROM InventoryReceiptItem r2 WHERE r2.product.id = :comboId)
              OR EXISTS (SELECT 1 FROM StockAdjustmentItem a WHERE a.variant.product.id = :comboId)
              OR EXISTS (SELECT 1 FROM InventoryMovement m WHERE m.variant.product.id = :comboId)
            )
            """)
    boolean isComboStructurallyUsed(@Param("comboId") Long comboId);

    /**
     * True if the product is referenced in history, promotions, or catalog structure
     * (so hard delete would be unsafe). Used for DELETE /api/products/{id}.
     */
    @Query("""
            SELECT (
              EXISTS (SELECT 1 FROM SalesInvoiceItem s WHERE s.product.id = :productId)
              OR EXISTS (SELECT 1 FROM SalesInvoiceItem s2 WHERE s2.variant IS NOT NULL AND s2.variant.product.id = :productId)
              OR EXISTS (SELECT 1 FROM PendingOrderItem p WHERE p.product.id = :productId)
              OR EXISTS (SELECT 1 FROM PendingOrderItem p2 WHERE p2.variant IS NOT NULL AND p2.variant.product.id = :productId)
              OR EXISTS (SELECT 1 FROM ProductBatch b WHERE b.product IS NOT NULL AND b.product.id = :productId)
              OR EXISTS (SELECT 1 FROM ProductBatch b2 WHERE b2.variant IS NOT NULL AND b2.variant.product.id = :productId)
              OR EXISTS (SELECT 1 FROM InventoryReceiptItem r WHERE r.product IS NOT NULL AND r.product.id = :productId)
              OR EXISTS (SELECT 1 FROM InventoryReceiptItem r2 WHERE r2.variant IS NOT NULL AND r2.variant.product.id = :productId)
              OR EXISTS (SELECT 1 FROM StockAdjustmentItem a WHERE a.variant IS NOT NULL AND a.variant.product.id = :productId)
              OR EXISTS (SELECT 1 FROM InventoryMovement m WHERE m.variant IS NOT NULL AND m.variant.product.id = :productId)
              OR EXISTS (SELECT 1 FROM ProductComboItem c WHERE c.product.id = :productId)
              OR EXISTS (SELECT 1 FROM ProductComboItem c2 WHERE c2.comboProduct.id = :productId)
            )
            """)
    boolean isProductStructurallyUsedCore(@Param("productId") Long productId);

    /**
     * Paginated product search. Matches product name/code and, via EXISTS, variant
     * code/name. When {@code restrictVariantMatchToActiveSellable} is true (anonymous /
     * customer storefront), only {@code active} and sellable variants participate in
     * the EXISTS branch. When false (ROLE_ADMIN or ROLE_STAFF — set by controller),
     * any variant row may match, so admin pickers can find products by inactive or
     * non-sellable SKU text without widening product active/includeInactive rules.
     */
    @Query(
            value = """
                    SELECT p FROM Product p
                    WHERE (:includeInactive = true OR p.active = true)
                      AND (:categoryId IS NULL OR p.category.id = :categoryId)
                      AND (:productType IS NULL OR p.productType = :productType)
                      AND (:restrictVariantMatchToActiveSellable = false
                           OR EXISTS (SELECT 1 FROM ProductVariant vv
                                      WHERE vv.product.id = p.id
                                        AND vv.active = true
                                        AND (vv.isSellable IS NULL OR vv.isSellable = true)))
                      AND (COALESCE(:search, '') = ''
                           OR LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%'))
                           OR LOWER(p.code) LIKE LOWER(CONCAT('%', :search, '%'))
                           OR EXISTS (SELECT 1 FROM ProductVariant v
                                      WHERE v.product.id = p.id
                                        AND (:restrictVariantMatchToActiveSellable = false
                                             OR (v.active = true
                                                 AND (v.isSellable IS NULL OR v.isSellable = true)))
                                        AND (LOWER(v.variantCode) LIKE LOWER(CONCAT('%', :search, '%'))
                                             OR LOWER(v.variantName) LIKE LOWER(CONCAT('%', :search, '%')))))
                    """,
            countQuery = """
                    SELECT count(p) FROM Product p
                    WHERE (:includeInactive = true OR p.active = true)
                      AND (:categoryId IS NULL OR p.category.id = :categoryId)
                      AND (:productType IS NULL OR p.productType = :productType)
                      AND (:restrictVariantMatchToActiveSellable = false
                           OR EXISTS (SELECT 1 FROM ProductVariant vv
                                      WHERE vv.product.id = p.id
                                        AND vv.active = true
                                        AND (vv.isSellable IS NULL OR vv.isSellable = true)))
                      AND (COALESCE(:search, '') = ''
                           OR LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%'))
                           OR LOWER(p.code) LIKE LOWER(CONCAT('%', :search, '%'))
                           OR EXISTS (SELECT 1 FROM ProductVariant v
                                      WHERE v.product.id = p.id
                                        AND (:restrictVariantMatchToActiveSellable = false
                                             OR (v.active = true
                                                 AND (v.isSellable IS NULL OR v.isSellable = true)))
                                        AND (LOWER(v.variantCode) LIKE LOWER(CONCAT('%', :search, '%'))
                                             OR LOWER(v.variantName) LIKE LOWER(CONCAT('%', :search, '%')))))
                    """)
    Page<Product> searchProducts(
            @Param("search") String search,
            @Param("categoryId") Long categoryId,
            @Param("includeInactive") boolean includeInactive,
            @Param("productType") ProductType productType,
            @Param("restrictVariantMatchToActiveSellable") boolean restrictVariantMatchToActiveSellable,
            Pageable pageable);
}