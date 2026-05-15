package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.PaymentEvent;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentEventRepository extends JpaRepository<PaymentEvent, Long>, JpaSpecificationExecutor<PaymentEvent> {

    Optional<PaymentEvent> findByProviderAndProviderTxId(String provider, String providerTxId);

    List<PaymentEvent> findAllByOrderByCreatedAtDesc(Pageable pageable);

    List<PaymentEvent> findByStatusOrderByCreatedAtDesc(PaymentEvent.Status status, Pageable pageable);

    @Query("""
            SELECT e
            FROM PaymentEvent e
            WHERE e.linkedPendingOrder IS NULL
              AND e.status <> com.example.nhadanshop.entity.PaymentEvent.Status.IGNORED
            ORDER BY e.createdAt DESC
            """)
    List<PaymentEvent> findWorklistUnmatched(Pageable pageable);

    @Query("""
            SELECT COUNT(e)
            FROM PaymentEvent e
            WHERE e.linkedPendingOrder IS NULL
              AND e.status <> com.example.nhadanshop.entity.PaymentEvent.Status.IGNORED
            """)
    long countWorklistUnmatched();

    @Query("""
            SELECT e
            FROM PaymentEvent e
            WHERE UPPER(COALESCE(e.matchedCode, '')) = UPPER(:orderCode)
               OR UPPER(COALESCE(e.linkedOrderCode, '')) = UPPER(:orderCode)
            ORDER BY e.createdAt DESC
            """)
    List<PaymentEvent> findByOrderCode(@Param("orderCode") String orderCode, Pageable pageable);

    Optional<PaymentEvent> findFirstByLinkedPendingOrder_IdOrderByLinkedAtDesc(Long linkedPendingOrderId);

    List<PaymentEvent> findByLinkedPendingOrder_IdInAndStatus(
            Collection<Long> orderIds,
            PaymentEvent.Status status);

    /**
     * One-query aggregate of LINKED bank evidence per pending order: returns
     * {@code Object[]{ orderId(Long), sumAmount(BigDecimal), count(Long) }} grouped by order.
     * Orders without any LINKED row simply do not appear — callers must default to (0, 0).
     */
    @Query("""
            SELECT e.linkedPendingOrder.id,
                   COALESCE(SUM(e.amount), 0),
                   COUNT(e)
            FROM PaymentEvent e
            WHERE e.linkedPendingOrder.id IN :orderIds
              AND e.status = com.example.nhadanshop.entity.PaymentEvent.Status.LINKED
            GROUP BY e.linkedPendingOrder.id
            """)
    List<Object[]> aggregateLinkedByOrderIds(@Param("orderIds") Collection<Long> orderIds);
}
