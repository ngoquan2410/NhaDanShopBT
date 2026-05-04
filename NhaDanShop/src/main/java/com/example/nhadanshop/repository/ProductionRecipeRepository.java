package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.ProductionRecipe;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ProductionRecipeRepository extends JpaRepository<ProductionRecipe, Long> {

    @Query("SELECT CASE WHEN COUNT(r) > 0 THEN true ELSE false END FROM ProductionRecipe r WHERE LOWER(r.recipeCode) = LOWER(:recipeCode)")
    boolean existsByRecipeCodeIgnoreCase(@Param("recipeCode") String recipeCode);

    @Query("SELECT r FROM ProductionRecipe r WHERE LOWER(r.recipeCode) = LOWER(:recipeCode)")
    Optional<ProductionRecipe> findByRecipeCodeIgnoreCase(@Param("recipeCode") String recipeCode);

    Page<ProductionRecipe> findByArchived(boolean archived, Pageable pageable);

    Page<ProductionRecipe> findByArchivedFalseAndActiveFalse(Pageable pageable);

    /**
     * Combined list filter — {@code bucket} values: ARC, INACTIVE, ACTIVE_ONLY, NON_ARCHIVED, ALL.
     * Text search is a separate query so Hibernate/PostgreSQL never plans {@code LOWER(CONCAT('%', :q, '%'))} with {@code :q = null} (that can infer {@code bytea} and fail).
     */
    @Query("""
            SELECT r FROM ProductionRecipe r
            WHERE (
                (:bucket = 'ARC' AND r.archived = true)
                OR (:bucket = 'INACTIVE' AND r.archived = false AND r.active = false)
                OR (:bucket = 'ACTIVE_ONLY' AND r.archived = false AND r.active = true)
                OR (:bucket = 'NON_ARCHIVED' AND r.archived = false)
                OR (:bucket = 'ALL')
            )
            AND (:outputVariantId IS NULL OR r.outputVariant.id = :outputVariantId)
            """)
    Page<ProductionRecipe> searchByBucketWithoutText(
            @Param("bucket") String bucket,
            @Param("outputVariantId") Long outputVariantId,
            Pageable pageable);

    @Query("""
            SELECT r FROM ProductionRecipe r
            WHERE (
                (:bucket = 'ARC' AND r.archived = true)
                OR (:bucket = 'INACTIVE' AND r.archived = false AND r.active = false)
                OR (:bucket = 'ACTIVE_ONLY' AND r.archived = false AND r.active = true)
                OR (:bucket = 'NON_ARCHIVED' AND r.archived = false)
                OR (:bucket = 'ALL')
            )
            AND (:outputVariantId IS NULL OR r.outputVariant.id = :outputVariantId)
            AND (
                LOWER(r.recipeCode) LIKE LOWER(CONCAT('%', :q, '%'))
                OR LOWER(r.name) LIKE LOWER(CONCAT('%', :q, '%'))
            )
            """)
    Page<ProductionRecipe> searchByBucketWithText(
            @Param("bucket") String bucket,
            @Param("outputVariantId") Long outputVariantId,
            @Param("q") String q,
            Pageable pageable);
}
