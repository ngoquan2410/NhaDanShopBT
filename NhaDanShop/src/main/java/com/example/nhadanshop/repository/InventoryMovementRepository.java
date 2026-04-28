package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.InventoryMovement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface InventoryMovementRepository extends JpaRepository<InventoryMovement, Long> {

    /** Net stock change from Slice 6 production ledger rows on/after {@code from} (signed qty_delta). */
    @Query("""
            SELECT m.variant.id, COALESCE(SUM(m.qtyDelta), 0)
            FROM InventoryMovement m
            WHERE m.createdAt >= :from
            AND m.sourceType IN ('production_consume', 'production_output', 'production_void_restore', 'production_void_output')
            GROUP BY m.variant.id
            """)
    List<Object[]> sumProductionQtyDeltaByVariantCreatedOnOrAfter(@Param("from") LocalDateTime from);

    /** Net stock change from production ledger rows with created_at in [{@code from}, {@code toInclusive}]. */
    @Query("""
            SELECT m.variant.id, COALESCE(SUM(m.qtyDelta), 0)
            FROM InventoryMovement m
            WHERE m.createdAt >= :from AND m.createdAt <= :toInclusive
            AND m.sourceType IN ('production_consume', 'production_output', 'production_void_restore', 'production_void_output')
            GROUP BY m.variant.id
            """)
    List<Object[]> sumProductionQtyDeltaByVariantBetweenInclusive(
            @Param("from") LocalDateTime from,
            @Param("toInclusive") LocalDateTime toInclusive);

    boolean existsBySourceTypeAndSourceId(String sourceType, String sourceId);

    /**
     * Match PostgreSQL {@code ON DELETE SET NULL} on {@code batch_id} so ledger rows remain when a batch
     * row is removed (e.g. full receipt hard-delete). Required for schema generation (H2 tests) that may
     * not create the same FK as Postgres Flyway FK.
     */
    @Modifying
    @Query("UPDATE InventoryMovement m SET m.batch = null WHERE m.batch.id = :batchId")
    int clearBatchReferenceByBatchId(@Param("batchId") long batchId);

    List<InventoryMovement> findBySourceIdStartingWithOrderByIdAsc(String prefix);
}
