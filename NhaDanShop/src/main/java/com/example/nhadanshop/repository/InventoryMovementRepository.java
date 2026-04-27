package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.InventoryMovement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface InventoryMovementRepository extends JpaRepository<InventoryMovement, Long> {

    boolean existsBySourceTypeAndSourceId(String sourceType, String sourceId);

    /**
     * Match PostgreSQL {@code ON DELETE SET NULL} on {@code batch_id} so ledger rows remain when a batch
     * row is removed (e.g. full receipt hard-delete). Required for schema generation (H2 tests) that may
     * not create the same FK as Flyway.
     */
    @Modifying
    @Query("UPDATE InventoryMovement m SET m.batch = null WHERE m.batch.id = :batchId")
    int clearBatchReferenceByBatchId(@Param("batchId") long batchId);
}
