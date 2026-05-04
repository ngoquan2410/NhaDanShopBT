package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.StockAdjustmentItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface StockAdjustmentItemRepository extends JpaRepository<StockAdjustmentItem, Long> {

    @Query("""
            SELECT i.variant.id, COALESCE(SUM(i.actualQty - i.systemQty), 0)
            FROM StockAdjustmentItem i
            WHERE i.adjustment.status = com.example.nhadanshop.entity.StockAdjustment.Status.CONFIRMED
              AND i.adjustment.confirmedAt >= :from
            GROUP BY i.variant.id
            """)
    List<Object[]> sumConfirmedDiffByVariantConfirmedOnOrAfter(@Param("from") LocalDateTime from);

    @Query("""
            SELECT i.variant.id, COALESCE(SUM(i.actualQty - i.systemQty), 0)
            FROM StockAdjustmentItem i
            WHERE i.adjustment.status = com.example.nhadanshop.entity.StockAdjustment.Status.CONFIRMED
              AND i.adjustment.confirmedAt >= :from
              AND i.adjustment.confirmedAt <= :toInclusive
            GROUP BY i.variant.id
            """)
    List<Object[]> sumConfirmedDiffByVariantBetweenInclusive(
            @Param("from") LocalDateTime from,
            @Param("toInclusive") LocalDateTime toInclusive);
}
