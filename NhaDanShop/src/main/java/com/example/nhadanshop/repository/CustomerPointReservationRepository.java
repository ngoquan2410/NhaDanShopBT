package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.CustomerPointReservation;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface CustomerPointReservationRepository extends JpaRepository<CustomerPointReservation, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM CustomerPointReservation r WHERE r.pendingOrder.id = :pendingOrderId")
    Optional<CustomerPointReservation> findByPendingOrderIdForUpdate(@Param("pendingOrderId") Long pendingOrderId);

    Optional<CustomerPointReservation> findByPendingOrderId(Long pendingOrderId);

    List<CustomerPointReservation> findByStatusAndExpiresAtBefore(CustomerPointReservation.Status status, LocalDateTime before);
}
