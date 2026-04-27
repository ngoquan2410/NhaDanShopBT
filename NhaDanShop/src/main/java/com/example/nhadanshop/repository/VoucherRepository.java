package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.Voucher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface VoucherRepository extends JpaRepository<Voucher, Long> {

    @Query("SELECT v FROM Voucher v WHERE LOWER(v.code) = LOWER(:code)")
    Optional<Voucher> findByCodeIgnoreCase(@Param("code") String code);

    Page<Voucher> findAllByOrderByCreatedAtDesc(Pageable pageable);

    @Query("SELECT v FROM Voucher v WHERE v.active = true ORDER BY v.code ASC")
    List<Voucher> findByActiveTrueOrderByCodeAsc();

    @Query(value = """
            SELECT (EXISTS(
                SELECT 1 FROM pending_orders po
                WHERE po.voucher_snapshot_json IS NOT NULL
                AND (po.voucher_snapshot_json::jsonb->>'code') IS NOT NULL
                AND LOWER(TRIM((po.voucher_snapshot_json::jsonb->>'code'))) = LOWER(TRIM(CAST(:code AS text)))
            ) OR EXISTS(
                SELECT 1 FROM sales_invoices i
                WHERE i.voucher_snapshot_json IS NOT NULL
                AND (i.voucher_snapshot_json::jsonb->>'code') IS NOT NULL
                AND LOWER(TRIM((i.voucher_snapshot_json::jsonb->>'code'))) = LOWER(TRIM(CAST(:code AS text)))
            ))
            """, nativeQuery = true)
    boolean isVoucherCodeUsedInAnySnapshot(@Param("code") String code);
}
