package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.StockAdjustment;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface StockAdjustmentRepository extends JpaRepository<StockAdjustment, Long> {

    Page<StockAdjustment> findAllByOrderByAdjDateDesc(Pageable pageable);

    @Query("""
            SELECT a.id FROM StockAdjustment a
            ORDER BY a.adjDate DESC, a.id DESC
            """)
    Page<Long> findIdsByOrderByAdjDateDescIdDesc(Pageable pageable);

    @EntityGraph(attributePaths = {
            "items",
            "items.variant",
            "items.variant.product",
            "items.sourceBatch",
            "createdBy",
            "confirmedBy",
            "reversalAdjustment",
            "reversesOriginal"
    })
    @Query("SELECT DISTINCT a FROM StockAdjustment a WHERE a.id IN :ids")
    List<StockAdjustment> findAllByIdInWithDetails(@Param("ids") Collection<Long> ids);

    @Query("SELECT MAX(CAST(SUBSTRING(a.adjNo, LENGTH(:prefix)+1) AS int)) " +
           "FROM StockAdjustment a WHERE a.adjNo LIKE :pattern")
    Integer findMaxSeqForPrefix(@Param("prefix") String prefix,
                                @Param("pattern") String pattern);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM StockAdjustment a WHERE a.id = :id")
    Optional<StockAdjustment> findByIdForUpdate(@Param("id") Long id);
}
