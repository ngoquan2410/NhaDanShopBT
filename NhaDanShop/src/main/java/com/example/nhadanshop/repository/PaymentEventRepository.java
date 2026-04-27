package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.PaymentEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentEventRepository extends JpaRepository<PaymentEvent, Long> {

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
}
