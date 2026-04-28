package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.ProductionRecipe;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ProductionRecipeRepository extends JpaRepository<ProductionRecipe, Long> {

    boolean existsByRecipeCodeIgnoreCase(String recipeCode);

    Optional<ProductionRecipe> findByRecipeCodeIgnoreCase(String recipeCode);

    Page<ProductionRecipe> findByArchived(boolean archived, Pageable pageable);

    Page<ProductionRecipe> findByArchivedFalseAndActiveFalse(Pageable pageable);

    /**
     * Combined list filter — {@code bucket} values: ARC, INACTIVE, ACTIVE_ONLY, NON_ARCHIVED, ALL.
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
            AND (
                :q IS NULL
                OR LOWER(r.recipeCode) LIKE LOWER(CONCAT('%', :q, '%'))
                OR LOWER(r.name) LIKE LOWER(CONCAT('%', :q, '%'))
            )
            """)
    Page<ProductionRecipe> searchByBucket(
            @Param("bucket") String bucket,
            @Param("outputVariantId") Long outputVariantId,
            @Param("q") String q,
            Pageable pageable);
}
