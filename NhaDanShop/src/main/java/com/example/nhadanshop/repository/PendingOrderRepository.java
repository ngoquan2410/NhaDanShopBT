package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.PendingOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Repository
public interface PendingOrderRepository extends JpaRepository<PendingOrder, Long> {

    /** Admin: lấy tất cả đơn, mới nhất trước */
    List<PendingOrder> findAllByOrderByCreatedAtDesc();

    /** Scheduler: tìm đơn PENDING đã quá hạn để tự hủy */
    List<PendingOrder> findByStatusAndExpiresAtBefore(PendingOrder.Status status, LocalDateTime now);

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
}
