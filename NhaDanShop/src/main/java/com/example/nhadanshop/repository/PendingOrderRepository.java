package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.PendingOrder;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface PendingOrderRepository extends JpaRepository<PendingOrder, Long> {

    /** Admin: lấy tất cả đơn, mới nhất trước */
    List<PendingOrder> findAllByOrderByCreatedAtDesc();

    Page<PendingOrder> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /** Scheduler: tìm đơn PENDING đã quá hạn để tự hủy */
    List<PendingOrder> findByStatusAndExpiresAtBefore(PendingOrder.Status status, LocalDateTime now);

    Optional<PendingOrder> findByOrderNo(String orderNo);

    @Query("""
            SELECT p
            FROM PendingOrder p
            WHERE UPPER(p.orderNo) = UPPER(:code)
               OR UPPER(COALESCE(p.paymentReference, '')) = UPPER(:code)
            """)
    Optional<PendingOrder> findByOrderCodeOrPaymentReference(@Param("code") String code);

    /**
     * Tổng qty đang bị giữ bởi PENDING orders, group by productId.
     * Trả về Object[]{productId (Long), totalQty (Long)}
     */
    @Query("""
            SELECT i.product.id, COALESCE(SUM(i.quantity), 0)
            FROM PendingOrderItem i
            WHERE i.pendingOrder.status = 'PENDING'
              AND i.pendingOrder.expiresAt > :now
            GROUP BY i.product.id
            """)
    List<Object[]> sumPendingQtyByProduct(@Param("now") LocalDateTime now);

    @Query(value = """
            SELECT EXISTS (
                SELECT 1 FROM pending_orders po
                WHERE po.promotion_snapshot_json IS NOT NULL
                AND (
                    (po.promotion_snapshot_json::jsonb->>'promotionId') = CAST(:id AS text)
                    OR EXISTS (
                        SELECT 1 FROM jsonb_array_elements(
                            COALESCE(po.promotion_snapshot_json::jsonb->'giftLines', '[]'::jsonb)
                        ) g
                        WHERE (g->>'promotionId') = CAST(:id AS text)
                    )
                )
            )
            """, nativeQuery = true)
    boolean existsReferenceToPromotionInPendingSnapshots(@Param("id") long id);
}
