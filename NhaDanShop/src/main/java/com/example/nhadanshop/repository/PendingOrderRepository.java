package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.PendingOrder;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface PendingOrderRepository extends JpaRepository<PendingOrder, Long>, JpaSpecificationExecutor<PendingOrder> {

    /** Admin: lấy tất cả đơn, mới nhất trước */
    List<PendingOrder> findAllByOrderByCreatedAtDesc();

    Page<PendingOrder> findAllByOrderByCreatedAtDesc(Pageable pageable);

    List<PendingOrder> findByCustomerIdAndStatusInAndExpiresAtAfterOrderByCreatedAtDesc(
            String customerId,
            Collection<PendingOrder.Status> statuses,
            LocalDateTime now);

    /** Scheduler: tìm đơn PENDING đã quá hạn để tự hủy */
    List<PendingOrder> findByStatusAndExpiresAtBefore(PendingOrder.Status status, LocalDateTime now);

    Optional<PendingOrder> findByOrderNo(String orderNo);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM PendingOrder p WHERE p.id = :id")
    Optional<PendingOrder> findByIdForUpdate(@Param("id") Long id);

    /**
     * Batch-hydrate pending orders for list views: items (+ lazy batch), createdBy.
     * Does not touch {@link PendingOrder#getInvoice()} — avoids loading sales invoice lines/allocations.
     */
    @EntityGraph(attributePaths = {
            "items",
            "items.batch",
            "createdBy"
    })
    @Query("SELECT DISTINCT p FROM PendingOrder p WHERE p.id IN :ids")
    List<PendingOrder> findAllByIdInForListHydrate(@Param("ids") Collection<Long> ids);

    @Query("""
            SELECT p
            FROM PendingOrder p
            WHERE UPPER(p.orderNo) = UPPER(:code)
               OR UPPER(COALESCE(p.paymentReference, '')) = UPPER(:code)
            """)
    Optional<PendingOrder> findByOrderCodeOrPaymentReference(@Param("code") String code);

    @Query("""
            SELECT p
            FROM PendingOrder p
            WHERE p.status IN :statuses
              AND p.invoice IS NULL
              AND p.expiresAt > :now
              AND (:search IS NULL OR :search = ''
                   OR UPPER(p.orderNo) LIKE UPPER(CONCAT('%', :search, '%'))
                   OR UPPER(COALESCE(p.paymentReference, '')) LIKE UPPER(CONCAT('%', :search, '%'))
                   OR UPPER(COALESCE(p.customerName, '')) LIKE UPPER(CONCAT('%', :search, '%'))
                   OR UPPER(COALESCE(p.customerPhone, '')) LIKE UPPER(CONCAT('%', :search, '%')))
            """)
    Page<PendingOrder> findLinkableCandidates(
            @Param("statuses") Collection<PendingOrder.Status> statuses,
            @Param("now") LocalDateTime now,
            @Param("search") String search,
            Pageable pageable);

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
