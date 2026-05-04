package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.ProductionOrder;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface ProductionOrderRepository extends JpaRepository<ProductionOrder, Long> {

    @Query(value = """
            SELECT COALESCE(MAX(CAST(SUBSTRING(order_no, LENGTH(:prefix) + 1, 10) AS INT)), 0)
            FROM production_orders
            WHERE order_no LIKE :prefixPattern
            """, nativeQuery = true)
    int findMaxSeqForPrefix(@Param("prefix") String prefix, @Param("prefixPattern") String prefixPattern);

    Page<ProductionOrder> findAllByOrderByCreatedAtDesc(Pageable pageable);

    Page<ProductionOrder> findByStatusOrderByCreatedAtDesc(String status, Pageable pageable);

    Page<ProductionOrder> findByRecipe_IdOrderByCreatedAtDesc(Long recipeId, Pageable pageable);

    Page<ProductionOrder> findByOutputVariant_IdOrderByCreatedAtDesc(Long outputVariantId, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT o FROM ProductionOrder o WHERE o.id = :id")
    Optional<ProductionOrder> findByIdForUpdate(@Param("id") Long id);

    @Query(value = """
            SELECT o FROM ProductionOrder o
            LEFT JOIN o.recipe recipe
            WHERE (:status IS NULL OR o.status = :status)
            AND (:recipeId IS NULL OR recipe.id = :recipeId)
            AND (:outputVariantId IS NULL OR o.outputVariant.id = :outputVariantId)
            AND o.createdAt >= :dateFrom
            AND o.createdAt <= :dateTo
            """,
            countQuery = """
                    SELECT COUNT(o) FROM ProductionOrder o
                    LEFT JOIN o.recipe recipe
                    WHERE (:status IS NULL OR o.status = :status)
                    AND (:recipeId IS NULL OR recipe.id = :recipeId)
                    AND (:outputVariantId IS NULL OR o.outputVariant.id = :outputVariantId)
                    AND o.createdAt >= :dateFrom
                    AND o.createdAt <= :dateTo
                    """)
    Page<ProductionOrder> searchOrdersWithoutText(
            @Param("status") String status,
            @Param("recipeId") Long recipeId,
            @Param("outputVariantId") Long outputVariantId,
            @Param("dateFrom") LocalDateTime dateFrom,
            @Param("dateTo") LocalDateTime dateTo,
            Pageable pageable);

    @Query(value = """
            SELECT o FROM ProductionOrder o
            LEFT JOIN o.recipe recipe
            WHERE (:status IS NULL OR o.status = :status)
            AND (:recipeId IS NULL OR recipe.id = :recipeId)
            AND (:outputVariantId IS NULL OR o.outputVariant.id = :outputVariantId)
            AND o.createdAt >= :dateFrom
            AND o.createdAt <= :dateTo
            AND (
                 LOWER(o.orderNo) LIKE LOWER(CONCAT('%', :q, '%'))
                 OR LOWER(recipe.recipeCode) LIKE LOWER(CONCAT('%', :q, '%'))
                 OR LOWER(recipe.name) LIKE LOWER(CONCAT('%', :q, '%'))
            )
            """,
            countQuery = """
                    SELECT COUNT(o) FROM ProductionOrder o
                    LEFT JOIN o.recipe recipe
                    WHERE (:status IS NULL OR o.status = :status)
                    AND (:recipeId IS NULL OR recipe.id = :recipeId)
                    AND (:outputVariantId IS NULL OR o.outputVariant.id = :outputVariantId)
                    AND o.createdAt >= :dateFrom
                    AND o.createdAt <= :dateTo
                    AND (
                         LOWER(o.orderNo) LIKE LOWER(CONCAT('%', :q, '%'))
                         OR LOWER(recipe.recipeCode) LIKE LOWER(CONCAT('%', :q, '%'))
                         OR LOWER(recipe.name) LIKE LOWER(CONCAT('%', :q, '%'))
                    )
                    """)
    Page<ProductionOrder> searchOrdersWithText(
            @Param("status") String status,
            @Param("recipeId") Long recipeId,
            @Param("outputVariantId") Long outputVariantId,
            @Param("dateFrom") LocalDateTime dateFrom,
            @Param("dateTo") LocalDateTime dateTo,
            @Param("q") String q,
            Pageable pageable);
}
