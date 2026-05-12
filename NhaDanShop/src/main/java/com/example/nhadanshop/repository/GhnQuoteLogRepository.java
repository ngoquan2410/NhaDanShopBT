package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.GhnQuoteLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GhnQuoteLogRepository extends JpaRepository<GhnQuoteLog, Long> {
    Page<GhnQuoteLog> findAllByOrderByCreatedAtDesc(Pageable pageable);

    @Query("""
            SELECT g FROM GhnQuoteLog g
            WHERE (:okFilter IS NULL OR g.ok = :okFilter)
              AND (:reason IS NULL OR :reason = '' OR g.reason = :reason)
              AND (:q IS NULL OR :q = ''
                   OR LOWER(COALESCE(g.provinceName, '')) LIKE LOWER(CONCAT('%', :q, '%'))
                   OR LOWER(COALESCE(g.districtName, '')) LIKE LOWER(CONCAT('%', :q, '%'))
                   OR LOWER(COALESCE(g.wardName, '')) LIKE LOWER(CONCAT('%', :q, '%'))
                   OR LOWER(COALESCE(g.orderCode, '')) LIKE LOWER(CONCAT('%', :q, '%'))
                   OR LOWER(COALESCE(g.reason, '')) LIKE LOWER(CONCAT('%', :q, '%'))
                   OR LOWER(COALESCE(g.message, '')) LIKE LOWER(CONCAT('%', :q, '%')))
            ORDER BY g.createdAt DESC
            """)
    Page<GhnQuoteLog> searchPage(
            @Param("okFilter") Boolean okFilter,
            @Param("reason") String reason,
            @Param("q") String q,
            Pageable pageable);
}
